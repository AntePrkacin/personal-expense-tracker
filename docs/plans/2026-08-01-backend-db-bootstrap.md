# Backend persistence bootstrap: Drizzle RC + Turso (new sync engine), database-per-user

## Context

The backend is the stock NestJS starter (one `GET /api/hello` endpoint, no DB, no validation, no exception filter, no config validation). The product is "Expensa", a personal expense tracker specified in `docs/project-management/` (data model in tech spec section 3, API surface in section 4).

Decisions made:

- **ORM: Drizzle, latest RC line** (`drizzle-orm@rc`, `drizzle-kit@rc`), pinned so the jump to stable v1 is trivial.
- **Driver: Turso's new engine, two modes behind one factory seam**:
  - Cloud mode: `@tursodatabase/sync` with driver `drizzle-orm/tursodatabase-sync`, connection `{ path, url, authToken, clientName }` (local file + sync to Turso Cloud). Per https://orm.drizzle.team/docs/sqlite/connect-turso-sync.
  - Local mode (CI, e2e, offline dev, auto-selected when `TURSO_*` env vars are absent): `@tursodatabase/database` with driver `drizzle-orm/tursodatabase/database`, plain local file. Per https://orm.drizzle.team/docs/sqlite/connect-turso-database.
  - Same engine and SQLite dialect in both, so one schema and one migrations folder per scope serves both modes.
- **Database-per-user**: each user gets their own Turso database. Two Turso Cloud groups already exist (user-created): **`decode-pet-admin`** holds the central DB, **`decode-pet-users`** holds all user DBs. A small **central DB** (user directory) is needed because identity must resolve by email before the per-user DB is known.
- **Token architecture** (docs-verified: creating DBs and minting tokens are control-plane operations accepting only the organization API token; group/DB tokens are data-plane):
  - `.env` holds: the **organization API token** (used ONLY by `TursoPlatformService` for create/delete/mint at registration time), the **central app.db token** (data plane), and **both group tokens** as documented break-glass/debug credentials the app itself doesn't use at runtime.
  - **Token expiry, MVP decision: every Turso token is created with Expires: NEVER** (the org API token in the dashboard, the central DB token, and every minted per-user token). Simplifies the MVP: no refresh logic anywhere; rotation is a manual ops action. **Per-user DB tokens are minted at provisioning** (non-expiring) and **stored in the central `users` table**; the backend connects to each user DB with that user's own token (narrow blast radius). Never returned by the API.
  - Short-lived scoped tokens for browser-direct sync arrive later with the auth feature (`mintUserDbToken(dbName, expiry)` documented on the service, not implemented now).
- **Central DB holds only crucial identity data** (email + DB pointer). Everything else about the user lives in their own DB as a single-row `profile` table. **Categories and transactions are OUT of this bootstrap**; they arrive with their features as normal migrations (user DBs run pending migrations on every open), and starter-category seeding moves to the onboarding feature.
- **Sync-ready schema** for future offline clients: **UUIDv7** text primary keys (time-ordered, better index locality, via the `uuid` package; client-generatable later), `created_at`/`updated_at` epoch-ms on every table, soft deletes via nullable `deleted_at`.
- Also fix architectural gaps: global ValidationPipe + DTOs, ConfigModule `validationSchema` (Joi), global exception filter. Swagger deferred (belongs with the OpenAPI-generated-types work).

Branch: `feat/backend-db-bootstrap` (currently identical to main). All work in `backend/` plus root `.gitignore`, `CLAUDE.md`, `README.md`, `mise.toml`.

## Design conventions (apply throughout)

- **Money**: integer cents columns (`*_cents`). API accepts major units; service converts with `Math.round(v * 100)`.
- **Datetime policy**: instants (`created_at`, `updated_at`, `deleted_at`) are `integer` epoch **milliseconds** via `{ mode: 'timestamp_ms' }`, set app-side with `.$defaultFn(() => new Date())` / `.$onUpdateFn` (unambiguous UTC, numeric comparison for future last-write-wins sync). Calendar dates (future transaction `date`) are `text` `YYYY-MM-DD`.
- **IDs**: `uuid` package `v7()` in a tiny `src/common/ids.ts` helper, so the generator is swappable and mockable.
- **Reads filter tombstones**: `isNull(deletedAt)`.
- **Global pipe/filter via `APP_PIPE`/`APP_FILTER` DI tokens in AppModule** (not `app.useGlobalPipes`) so the e2e suite, which boots AppModule directly, gets them for free.
- **RC verification duty (first implementation step)**: the `@tursodatabase/*` packages and their Drizzle drivers are new. Verify at install: exact driver import paths, the URL scheme the sync client expects (the Drizzle docs show `https://`, the Turso dashboard shows `turso://`, older libsql clients use `libsql://`; normalize the stored/env URLs to whatever the client accepts), whether a programmatic migrator exists for these drivers (`migrate()` equivalent of `drizzle-orm/libsql/migrator`), how sync is triggered on the sync client (auto interval vs explicit `sync()`/`pull()`/`push()`), and drizzle-kit studio credentials format. **Contingency if no migrator exists for these drivers**: a small `MigrationRunner` in `src/database/` that reads drizzle-kit's `meta/_journal.json` + SQL files and applies unapplied ones inside a transaction, tracked in a `__migrations` table; identical behavior in both modes.

## Steps

### 1. Dependencies and scripts (`backend/package.json`)

- `npm install drizzle-orm@rc @tursodatabase/sync @tursodatabase/database uuid class-validator class-transformer joi`
- `npm install -D drizzle-kit@rc`
- Scripts:
  - `db:generate:central` / `db:generate:user`: `drizzle-kit generate --config=drizzle.{central,user}.config.ts`
  - `db:generate`: both
  - `db:studio:central` / `db:studio:user` (studio inspects the local file, valid since it is a full copy)
- No runtime `db:migrate` scripts: migrations apply programmatically (required for N user DBs anyway).

### 2. Layout

```
backend/
  drizzle.central.config.ts / drizzle.user.config.ts   drizzle-kit configs
  drizzle/central/  drizzle/user/                       generated migrations (committed)
  databases/  (gitignored)                              central + users/expensa-user-<id> local db files
  src/config/env.validation.ts                          Joi schema
  src/common/ids.ts                                     UUIDv7 generator
  src/common/filters/all-exceptions.filter.ts (+spec)
  src/database/
    database.module.ts        @Global()
    database.constants.ts     APP_DB token; migration dir paths (process.cwd()-based)
    database.types.ts         AppDatabase / UserDatabase drizzle types
    turso-client.factory.ts   the one seam: cloud (sync) vs local (database) client creation
    turso-platform.service.ts (+spec)  Platform API: create/delete user DBs in decode-pet-users
    central/schema.ts         users (LoginLink lands here later)
    user/schema.ts            profile (categories, transactions, insights arrive later)
    user-database.service.ts (+spec)
  src/users/
    users.module.ts / users.controller.ts / users.service.ts (+spec)
    dto/create-user.dto.ts
  test/setup-e2e.ts           temp DATABASE_DIR + strip TURSO_* for all e2e
  test/users.e2e-spec.ts
```

Housekeeping: root `.gitignore` gets `backend/databases/`; `backend/tsconfig.build.json` excludes the two drizzle-kit configs.

### 3. drizzle-kit configs

`dialect: 'sqlite'`, `schema` at the scope's schema file, `out` at its migrations dir, `dbCredentials.url` pointing at the local file (central: `` `${process.env.DATABASE_DIR ?? './databases'}/app.db` ``; user: `USER_DB_URL ?? './databases/users/dev.db'`, studio-only). The fallback lives in the config itself: drizzle-kit reads raw `process.env` and never passes through the Joi schema, so without it the "runs with no .env" property breaks for the generate/studio scripts (`undefined/app.db`). Each `out` dir keeps its own journal; two schemas in one package is supported. Run `npm run db:generate` once and commit the `0000_*` migrations.

### 4. Schemas

**Central `users`** (`src/database/central/schema.ts`; file comment: LoginLink table lands here with the auth feature): `id` text PK (UUIDv7); `email` notNull + unique index (case-insensitivity via DTO normalization; Drizzle's builder can't express COLLATE NOCASE, comment it); `dbName` text notNull unique (Turso database name, `expensa-user-<id>` in **both** modes; one format so a row provisioned in local mode stays valid after switching to cloud, and so the name is always derivable from the id alone); `dbUrl` text nullable (the exact hostname/URL returned by the Platform create call, cloud mode only; hostnames are region-scoped, e.g. `jura-izkreny.aws-eu-west-1.turso.io`, so the URL can NOT be reconstructed from the name and must be persisted); `dbAuthToken` text nullable (that DB's minted data-plane token, cloud mode only; server-side secret, never serialized into API responses); `createdAt`/`updatedAt` notNull epoch-ms with `$defaultFn`/`$onUpdateFn`; `deletedAt` nullable. Nothing else: profile data deliberately lives in the user's own DB.

**User-DB `profile`** (`src/database/user/schema.ts`; file comment: categories/transactions/insights tables arrive with their features as later migrations): single-row table. `id` text PK = the user's central `users.id` (no second UUID for the same person; keeps the cross-DB correlation explicit and `findById` unambiguous); `firstName` notNull; `lastName` notNull; `currency` text notNull default `'USD'`; `monthlyBudgetCents` integer notNull; `monthStartDay` integer notNull default 1; the three timestamp columns.

### 5. Database infrastructure (`src/database/`)

**`turso-client.factory.ts`** (plain functions used by the central provider and `UserDatabaseService`):
- Cloud mode: build a `@tursodatabase/sync` client/drizzle instance with `{ path: <local file under DATABASE_DIR>, url: <libsql/https URL of the Turso DB>, authToken, clientName: 'expensa-backend' }`; trigger an initial sync after open, and schedule periodic sync every `TURSO_SYNC_INTERVAL_S` if the client doesn't do it natively (verify per RC duty).
- Local mode: `drizzle-orm/tursodatabase/database` over `new Database(<local file>)`.
- Mode detection: cloud iff `TURSO_ORG_TOKEN`, `TURSO_ORG`, `TURSO_CENTRAL_DB_URL`, `TURSO_CENTRAL_DB_TOKEN` are all set (Joi `.and()` enforces all-or-none; the two group tokens are optional break-glass entries the app never reads at runtime).
- Enable foreign-key enforcement on open (verify the new engine's default/PRAGMA support).

**`TursoPlatformService`**: thin `fetch` wrapper over `https://api.turso.tech/v1/organizations/{TURSO_ORG}` authenticating with `TURSO_ORG_TOKEN` (control plane; docs-verified as the only token type these endpoints accept), used only in cloud mode:
- `createUserDatabase(dbName)`: POST `/databases` `{ name, group: TURSO_USERS_GROUP }` → returns the created DB's `Hostname` (region-scoped, e.g. `<name>-<org>.aws-eu-west-1.turso.io`); the caller persists it as `dbUrl`.
- `mintDbToken(dbName)`: POST `/databases/{dbName}/auth/tokens?authorization=full-access&expiration=never` (explicit, per the MVP never-expires decision) → JWT for that one DB.
- `deleteUserDatabase(dbName)`: DELETE `/databases/{dbName}` (compensation path).
- Documented-but-not-implemented: `mintUserDbToken(dbName, expiry)` short-expiry variant for future browser-direct sync (arrives with auth).

**`APP_DB` async factory**: resolve `DATABASE_DIR`, `mkdirSync(recursive)`, client via factory (central Turso DB in `decode-pet-admin` using `TURSO_CENTRAL_DB_TOKEN`, or plain local file), `drizzle(..., { schema })`, then apply central migrations programmatically. Async factories resolve before listen, so the central DB is migrated before any consumer runs.

**`UserDatabaseService`**: `getUserDb(userId)` with a `Map` cache plus an `opening` in-flight-promise map (dedupes concurrent opens so migrations never run twice on one file). First open: strict UUID guard (path-traversal defense); look up `dbName` + `dbUrl` + `dbAuthToken` from the central row; client via factory (cloud: the stored `dbUrl` + the stored token; local: file only); idempotently apply user-scope migrations (creates new DBs, upgrades old ones on open). Also `provisionUserDb(userId)` (cloud: Platform create + `mintDbToken`, returns `{ dbName, dbUrl, dbAuthToken }`; local: `{ dbName: 'expensa-user-' + userId, dbUrl: null, dbAuthToken: null }`), `deleteUserDb(userId)` (close, evict, Platform delete in cloud mode, rm local files; derives `dbName` deterministically from the id and must NOT look it up in the central row, because the compensation path calls it when the central insert itself failed and no row exists), `closeAll()`. Comments: cache unbounded by design (LRU is future work); this service + the factory are the only places that know how a user DB is opened.

**`DatabaseModule`** is `@Global()`, exports `APP_DB` + `UserDatabaseService`, provides `TursoPlatformService` internally, implements `OnApplicationShutdown` (close central client, `closeAll()`).

### 6. Users module (proof of stack)

Scope note: `POST /api/users` and `GET /api/users/:id` appear nowhere in the tech spec's API surface (section 4 specifies `register(...)` carrying the onboarding category selection plus the magic-link flow, and a session-scoped `getProfile()`). These endpoints are temporary proof-of-stack scaffolding, unauthenticated until the auth feature lands, and are expected to be reshaped or replaced by it.

- `CreateUserDto`: firstName/lastName (`@IsString @IsNotEmpty @MaxLength(100)`), email (`@Transform` trim+lowercase, `@IsEmail`), currency optional (`@Length(3,3)`), monthlyBudget (`@IsNumber({maxDecimalPlaces:2}) @IsPositive`, major units), monthStartDay optional (`@IsInt @Min(1) @Max(28)`).
- `UsersController` (`@Controller('users')` → `/api/users`): `POST /` (201), `GET /:id` (`ParseUUIDPipe` with no `version` option, or `'7'` where supported; `version: '4'` would reject every UUIDv7 id).
- `UsersService` (constructor-injects `@Inject(APP_DB)` and `UserDatabaseService`):
  - `create`: duplicate-email check → 409 `ConflictException` (unique index as race backstop); `id = v7()`; `provisionUserDb(id)` (creates DB + mints its token in cloud mode); insert central row (`email`, `dbName`, `dbUrl`, `dbAuthToken`); `getUserDb(id)` (migrates → creates `profile` table); insert the single profile row. Response mapping strips `dbName`/`dbUrl`/`dbAuthToken`. **Compensation** (cross-DB, no single transaction possible): on any failure after provisioning, `deleteUserDb(id)` + hard-delete the central row (by id, a no-op if the insert never landed) + `Logger.error`; then, if the original failure was the unique-email constraint (a registration that lost the race), rethrow 409 `ConflictException` so the backstop actually surfaces as the documented 409 rather than a 500; anything else rethrows 500. A client retry converges with no orphans.
  - `findById`: central select (tombstone-filtered) → 404 if missing; then `getUserDb` + profile select; return merged `{ id, email, firstName, lastName, currency, monthlyBudget..., monthStartDay, createdAt }`. This one read proves the whole two-DB stack.

### 7. Architectural gaps

- `env.validation.ts` (Joi): `PORT` port default 3000; `FRONTEND_URL` uri default; `DATABASE_DIR` default `'./databases'`; `TURSO_ORG_TOKEN`, `TURSO_ORG`, `TURSO_CENTRAL_DB_URL`, `TURSO_CENTRAL_DB_TOKEN` optional + `.and(...)` all-or-none; `TURSO_ADMIN_GROUP_TOKEN`/`TURSO_USERS_GROUP_TOKEN` optional (break-glass, unused by code); `TURSO_USERS_GROUP` default `'decode-pet-users'`; `TURSO_SYNC_INTERVAL_S` number default 60. Wire as `validationSchema` in `ConfigModule.forRoot`. Defaults preserve the documented "runs with no .env at all" property (local mode).
- `AppModule` providers: `APP_PIPE` → `new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })`; `APP_FILTER` → `AllExceptionsFilter`.
- `AllExceptionsFilter` (`@Catch()`): HttpException → status + normalized response (keep class-validator message arrays); anything else → 500 generic + `Logger.error` of the real error (never leak internals). Uniform shape: `{ statusCode, message, error, timestamp, path }`.
- `main.ts`: single addition, `app.enableShutdownHooks()`.
- Swagger: deferred; belongs with the OpenAPI/generated-types work already tracked as a known wart.

### 8. Env template (`backend/.env.example`)

Append, in the existing commented style:

```
DATABASE_DIR=./databases             # local database/replica files (gitignored)

# Turso Cloud (new sync engine). Set the four required vars ALL or NONE.
# Without them the backend runs on plain local files (CI/e2e do this).
# Groups (already created in the dashboard): decode-pet-admin (central),
# decode-pet-users (one DB per user, created by the backend at registration).
# Central DB, one-time: turso db create expensa-app --group decode-pet-admin
# TURSO_ORG=                         # organization slug
# All tokens below are created with Expires: NEVER (MVP decision; rotate manually).
# TURSO_ORG_TOKEN=                   # organization API token (dashboard / turso auth api-tokens mint).
#                                    # Control plane only: create/delete user DBs, mint their tokens.
# TURSO_CENTRAL_DB_URL=              # turso db show expensa-app --url
# TURSO_CENTRAL_DB_TOKEN=            # turso db tokens create expensa-app
# Optional break-glass tokens for manual CLI/Studio access; the app never uses them:
# TURSO_ADMIN_GROUP_TOKEN=           # turso group tokens create decode-pet-admin
# TURSO_USERS_GROUP_TOKEN=           # turso group tokens create decode-pet-users
# TURSO_USERS_GROUP=decode-pet-users
# TURSO_SYNC_INTERVAL_S=60
```

### 9. Tests

- `test/setup-e2e.ts` (registered as `setupFiles` in `jest-e2e.json`): set `process.env.DATABASE_DIR = mkdtempSync(...)` and **delete all `TURSO_*` vars** so e2e always runs local mode, per worker, before any test code. Existing hello e2e keeps passing.
- `test/users.e2e-spec.ts` (boots AppModule, re-applies `setGlobalPrefix('api')`): 201 create (UUIDv7 `id`, lowercased email, merged profile fields correct); GET returns the same; 404 unknown UUID with the uniform error shape; 400 invalid email; 400 unknown extra field (proves `forbidNonWhitelisted`); 409 duplicate email. `afterAll`: `app.close()` + rm temp dir.
- Unit specs: `users.service.spec.ts` (mock `APP_DB` + `UserDatabaseService` via a fluent/thenable Drizzle chain mock helper; cases: create writes central row + profile and strips `dbName`/`dbAuthToken` from the response, duplicate → 409 with no provisioning, profile-write failure → compensation called, findById 404 and tombstone filtering), `user-database.service.spec.ts` (concurrent `getUserDb` same id → one migration run; invalid id rejects; cloud connections use the stored per-DB token; mock the turso packages), `turso-platform.service.spec.ts` (mock fetch: create-DB URL + group, mint-token URL + query params, org-token header, error propagation), `all-exceptions.filter.spec.ts`.
- Existing `app.controller.spec.ts` and `app.e2e-spec.ts` remain untouched and passing.

### 10. Docs and tooling

- `CLAUDE.md`: remove "A database" and "Config validation" from Not yet built; add a Persistence subsection under Architecture (Drizzle RC + Turso new engine, cloud/local dual mode, central DB in decode-pet-admin group + DB-per-user in decode-pet-users group, token strategy, migrations committed in `backend/drizzle/{central,user}` and applied at boot/first-open, `drizzle/` must be cwd-adjacent in prod); add the env vars to the env table; add `db:*` scripts to Common commands.
- `README.md`: same corrections + the one-time `turso` CLI setup commands (zero new steps for local-only dev thanks to defaults).
- `mise.toml`: optional `[tasks."db:generate"]` (dir backend, `npm run db:generate`).
- CI: **no changes needed**; e2e strips `TURSO_*` and writes only to tmpdir. Verify `@tursodatabase/database` native binding installs cleanly on ubuntu-latest (risk noted).

### 11. Commits (Conventional Commits enforced)

1. `feat(backend): add drizzle persistence with central and per-user turso databases` (deps, configs, schemas, generated migrations, client factory, database module/service, platform service, env validation, gitignore, tsconfig exclude)
2. `feat(backend): add users module with per-user db provisioning` (users module, DTO, ValidationPipe, exception filter, shutdown hooks, all tests)
3. `docs: document the persistence layer in CLAUDE.md and README` (+ mise task)

Note: branch name `feat/backend-db-bootstrap` lacks the documented `{type}/DEMO-{n}-{slug}` format; flagged, not renaming unprompted.

## Verification

1. First implementation step: the RC verification duty (driver import paths, migrator availability → contingency runner if absent, sync trigger mechanics, FK enforcement).
2. `cd backend && npm run lint && npm run build` (build is the typecheck gate).
3. `npm test` and `npm run test:e2e` (hello + users suites, temp DATABASE_DIR, local mode).
4. Manual smoke, local mode (no `TURSO_*`): `npm run start:dev`, then
   - `curl -X POST localhost:3000/api/users -H 'content-type: application/json' -d '{"firstName":"Marko","lastName":"Kovac","email":"Marko@Email.com","monthlyBudget":2000}'` → 201, email lowercased, central + user DB files exist under `databases/`.
   - `curl localhost:3000/api/users/<id>` → merged identity + profile. Repeat POST → 409. Bad body → 400 with the uniform shape.
   - `curl localhost:3000/api/hello` still works; frontend still renders the greeting.
5. Cloud smoke (Turso account, env filled): restart, POST a user → `expensa-user-<id>` appears in `turso db list` under decode-pet-users, GET works, local files present under `databases/`.

## Known risks (accepted)

- **New-stack maturity**: `@tursodatabase/sync` / `@tursodatabase/database` and their Drizzle RC drivers are the newest layer; migrator support unverified (contingency runner planned), sync trigger mechanics to verify, native bindings on CI to verify. RC APIs may rename before v1 (pinned via lockfile).
- **Tokens at rest and never-expiring tokens**: per-user DB tokens live in the central DB (server-side only, stripped from all API responses), and by MVP decision every Turso token (org, central, per-user) is minted with Expires: NEVER. Accepted trade-off: a leaked token never dies on its own; rotation via `turso db tokens invalidate` (and dashboard revocation for the org token) is the ops path, and short-lived mint-on-demand remains the future hardening path alongside browser-sync tokens.
- **Soft deletes deviate from the designed data rule**: the tech spec (DEL-3, CED-9) promises permanent deletion ("This can't be undone"), while every table carries a `deleted_at` tombstone for future sync. Deliberate: the tombstone is an implementation detail invisible through the API (reads filter it, nothing undeletes), and a physical purge policy is deferred until the sync design needs one.
- Unbounded connection cache (LRU later); no cross-process migration lock (single instance assumed); `drizzle/` must be cwd-adjacent in prod (future Dockerfile must COPY it); email case-insensitivity relies on DTO normalization; `Math.round(v*100)` assumes 2-decimal currencies; offline conflict/clock-skew policy deferred until an offline client exists.
