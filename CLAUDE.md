# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository. Everything
below is verified against the code, not aspirational.

`README.md` is the human-facing entry point: setup steps, commands, and troubleshooting.
This file is the reasoning behind them, so the two overlap deliberately but do not
duplicate. When something structural changes, check whether both need updating.

## What this is

**Decode Academy Demo**, a teaching boilerplate for academy final projects. A minimal
Next.js frontend talks to a NestJS backend over HTTP.

The two halves are each substantially built and **currently do not talk to each other at
all**. The backend has the whole passwordless access flow and transaction writes; the
frontend has the design system, the app shell and the four routed views. What is missing
between them is the session cookie (PET-52), which is what every frontend read has to be
authenticated with. PET-19 deleted the scaffold greeting page that fetched
`GET /api/hello`, which had been the only wire between them, so the shell renders real
screens with placeholder data. Restoring the connection is PET-52's plus PET-45's.

Because this is a starting point rather than a finished app, the "Not yet built"
section at the bottom is load-bearing. Read it before assuming a feature exists.

## Repository layout

This is a **multi-app repo, not a workspace-managed monorepo**. There is no npm
workspaces, turbo, or nx setup. The root `package.json` owns only repo-wide dev tooling
(Husky, commitlint, lint-staged, Prettier) and does **not** manage the two apps.

```text
backend/          NestJS 11 API, port 3000, its own package.json + node_modules
  drizzle/        Generated migrations, committed: central/ and user/
  databases/      Local database files. Gitignored, recreated from the migrations
  openapi.json    Generated API contract, committed. `npm run api:sync`, never by hand
frontend/         Next.js 16 + React 19, port 4200, its own package.json + node_modules
  src/types/api.d.ts  Generated from that spec, committed. Same rule
docs/plans/       Implementation plans, one file per plan (see below)
.claude/          Skills, agents and permissions for Claude Code (see below)
.github/workflows/ci.yml
.husky/           pre-commit and commit-msg hooks
```

Two consequences that trip people up:

- There are **three** `package.json` files and each is installed separately. Run
  `npm install` inside each app, and run it at the root too. The root install is
  **mandatory, not a convenience**: its `prepare` script is what sets `core.hooksPath` to
  `.husky/_`. Skip it and both hooks are simply absent, so any commit message shape is
  accepted and staged files are never linted. The failure is silent locally and only
  surfaces when the `conventions` job fails on the PR. Verify with
  `git config core.hooksPath`.
- Run app commands from inside that app's directory (`cd backend`, `cd frontend`). This
  matters for ESLint especially, whose config and plugins resolve from the app's own
  `node_modules`.

Node version comes from `.nvmrc` (currently **26**). CI reads that same file, so bump it
there and CI follows. Use `nvm use`, which reads `.nvmrc` and needs no version argument;
avoid `nvm install --lts`, which installs whatever LTS happens to be current. The hard
floor is **v22.12.0**, and all three `package.json` files carry it so npm warns on a
mismatch.

That floor is the **backend's**, not `next`'s: `next` still declares `>=20.9.0`, but the
backend loads three ESM-only packages (`@tursodatabase/database`, `@tursodatabase/sync`,
`uuid`) from CommonJS, which requires Node's `require()` of ESM. That landed unflagged in
22.12 (and was backported to 20.19). The stated floor is the simple form rather than an
exact `>=20.19.0 <21 || >=22.12.0`, which is accurate but unreadable for no gain given
`.nvmrc` says 26. Below the floor the failure is a startup crash, `Cannot use import
statement outside a module`, not a warning.

`mise.toml` pins the same major a **second** time, as `node = "26"` under `[tools]`. mise
does not read `.nvmrc`, so bumping the Node major means editing both files. It is pinned
rather than `latest` precisely so a drift from CI cannot happen silently.

**Implementation plans live in `docs/plans/`**, one Markdown file per plan, named
`YYYY-MM-DD_PET-{number}_{slug}.md` (date the plan was written, the Jira ticket it
serves, then a short slug), for example `2026-08-02_PET-13_login-links.md`. Save any
plan worth keeping there under that pattern rather than leaving it in the conversation.

## Common commands

Backend, from `backend/`:

| Command                                        | Purpose                                                     |
| ---------------------------------------------- | ----------------------------------------------------------- |
| `npm run start:dev`                            | Nest in watch mode on :3000                                 |
| `npm run build`                                | Compile to `dist/`. Doubles as the typecheck gate (`tsc`)   |
| `npm run lint`                                 | ESLint with `--fix`                                         |
| `npm test`                                     | Jest unit tests (`*.spec.ts` under `src/`)                  |
| `npm run test:watch`                           | Same, in watch mode                                         |
| `npm run test:e2e`                             | Supertest e2e (`test/`, uses `test/jest-e2e.json`)          |
| `npm run test:cov`                             | Coverage                                                    |
| `npm run db:generate`                          | drizzle-kit generate for both scopes; commit what it writes |
| `npm run db:studio:central` / `db:studio:user` | Drizzle Studio over the local file                          |
| `npm run api:spec`                             | Build, then write `openapi.json`; commit what it writes     |
| `npm run api:emit`                             | The write half alone, reusing `dist/`. What CI runs         |

Frontend, from `frontend/`:

| Command                   | Purpose                                                   |
| ------------------------- | --------------------------------------------------------- |
| `npm run dev`             | Next dev server on :4200                                  |
| `npm run build`           | Production build. Doubles as the typecheck gate           |
| `npm start`               | Serve the production build on :4200                       |
| `npm run lint`            | ESLint (`eslint-config-next` + `eslint-plugin-storybook`) |
| `npm test`                | Jest + React Testing Library (jsdom)                      |
| `npm run test:watch`      | Same, in watch mode                                       |
| `npm run api:types`       | Regenerate `src/types/api.d.ts` from the spec             |
| `npm run storybook`       | Storybook on :6006, the design system reference           |
| `npm run build-storybook` | Static Storybook build into `storybook-static/`           |

From the repo root, `npm run api:sync` runs both halves in the right order. That is the
command to use after touching anything a response or request body is made of; the two
per-app scripts exist for CI, which has already built one side or the other.

Single test in either app: `npm test -- page` filters by path,
`npm test -- -t "greeting"` filters by test name.

Neither app has a standalone `typecheck` script. `npm run build` is the typecheck.

To run the whole thing locally, start both in separate terminals: backend on 3000,
frontend on 4200. The frontend calls the backend, never the reverse.

## Architecture

**Ports are fixed and asymmetric.** Backend API on **3000**, frontend on **4200**. Both
are wired into code and config, so do not swap them.

**The `/api` prefix lives in one place.** `backend/src/main.ts` sets a global `api`
prefix, so a controller mapped to `hello` is served at `GET /api/hello`. Note the
consequence: `GET http://localhost:3000/` returns 404, which is normal, not a broken
server. The e2e test re-applies the same prefix manually to match production, so if you
change the prefix you must change it in both places.

**Frontend to backend data flow: server-side, and currently nonexistent.** No file in
`frontend/src` fetches the backend any more. PET-19 replaced the scaffold greeting page
with a redirect, and it was the only caller. The shape the first real read has to take is
still fixed, though: an **async Server Component** (or a route handler) fetching at request
time with `cache: 'no-store'`, so the session cookie never leaves the server and no CORS is
involved. CORS is enabled on the backend anyway (`main.ts`), for the case of genuinely
client-side fetches, allowing origin `FRONTEND_URL`.

**Configuration goes through ConfigService.** `ConfigModule.forRoot({ isGlobal: true })`
is registered in `backend/src/app.module.ts`, so it reads `backend/.env` at startup and
`ConfigService` is injectable everywhere without re-importing the module. Read values
through `ConfigService`, as `main.ts` does, rather than scattering `process.env` through
the code.

**One HTTP contract, generated, and the frontend types come out of it.** The backend is
the source of truth and nothing restates it. `nest build` runs `@nestjs/swagger`'s CLI
plugin, `npm run api:spec` writes `backend/openapi.json` from the app's own routes, and
`npm run api:types` turns that into `frontend/src/types/api.d.ts`; `npm run api:sync` at
the root does both. `page.tsx` reads its response type out of `paths['/api/hello']` rather
than declaring one. Both artifacts are **generated but committed**, for the same reason
`backend/drizzle/` and `.agents/skills/` are: everyone needs byte-identical copies and a
fresh clone must work with no extra step. It also keeps `cd frontend && npm run build`
working with no backend running, which is what lets the two CI jobs stay independent.

Four things about that pipeline that are easy to get wrong, all of which fail **quietly**:

- **Response shapes must be classes in `.dto.ts` files.** An interface erases at compile
  time, leaving nothing to hang metadata on, and the plugin only introspects files
  matching its `dtoFileNameSuffix` (default `['.dto.ts', '.entity.ts']`). Break either and
  the spec still generates - the response is just described as `{}`.
- **The generator runs against `dist/`, never `ts-node`.** The plugin is a compile-time
  transformer wired through `nest build`. `test/openapi.e2e-spec.ts` therefore asserts
  against the committed JSON rather than building a document in-process.
- **`setGlobalPrefix` must run before the document is built**, or every path loses its
  `/api` and the generated types point at URLs that 404. `API_PREFIX` in
  `src/common/api-prefix.ts` is shared by `main.ts`, `src/openapi.ts` and the e2e suite.
- **Generating the spec boots the real `AppModule`**, persistence and all.
  `src/openapi.env.ts` scrubs `TURSO_*` and sets `OPENAPI_EMIT`, which makes `AppModule`
  skip `backend/.env` - without the second half dotenv puts every scrubbed variable
  straight back, and writing a JSON file would sync against live Turso.

**Drift is a CI failure, in two halves.** The backend job regenerates the spec and fails
on a diff; the frontend job does the same for `api.d.ts`. Together they prove the spec
matches the code and the types match the spec. A committed generated artifact rots
silently otherwise, which is the exact failure this pipeline exists to kill.

**No operation documents a 500.** Every route can answer 500 through the global filter, so
documenting it per operation restates one non-actionable fact everywhere and widens every
generated response union; the document description in `src/openapi.document.ts` says it once
instead, and `test/openapi.e2e-spec.ts` pins that nothing declares it. Bearer auth is
declared with `addSecurity('bearer', ...)` rather than the `addBearerAuth()` helper, which
cannot be talked out of publishing `bearerFormat: 'JWT'` - these are opaque tokens, so that
would be a lie. The declaration and a bare `@ApiBearerAuth()` are two halves that fail
silently apart: miss either and the guarded operation looks public in both the spec and the
generated types.

Swagger UI is served at `http://localhost:3000/api/docs` from the same document.

**Global pipe and filter are DI providers, not `app.useGlobalPipes`.** `AppModule`
registers `APP_PIPE` (a `ValidationPipe` with `whitelist`, `transform` and
`forbidNonWhitelisted`) and `APP_FILTER` (`AllExceptionsFilter`). Doing it this way
rather than in `main.ts` means the e2e suite, which boots `AppModule` directly, gets the
same validation and the same error shape as production. Every failed request returns
`{ statusCode, message, error, timestamp, path }`; unknown errors are logged in full
server-side and reduced to a generic 500 outward.

**Access is passwordless, and both entry points answer identically.** `POST
/api/auth/register` and `POST /api/auth/login-link` both return an **empty 202**, always.
The design has no password field anywhere (A31) and specifies that neither screen may
reveal whether an account exists (REG-6, LOG-6, A35), so an empty body is the cheapest way
to be byte-for-byte identical. Validation failures are still 400: a malformed address is a
fact about the input, not about the account.

Registering an address that already exists sends a link instead of creating a duplicate.
If that account was never verified, the newly submitted onboarding values **overwrite** the
stashed ones - the realistic case is someone who lost the first email and resubmitted,
possibly with corrections, and they must verify into the profile they last saw. Submitting
an unknown address to `login-link` creates nothing and sends nothing; only the response is
identical. Mailing strangers because they were typed into a form is worse than the
enumeration it would defend against, so **every `login_links` row references a real user**.

**Nothing past the directory lookup is awaited.** Issuing the token and sending the mail
are floated with a `.catch` that logs, and the handler answers 202 as soon as the lookup
(and, for a new registration, the insert) is done. That is load-bearing twice over. A send
failure cannot fail a request whose account really was created - the design's own recovery
is "Resend link" (VER-2). And it closes the timing hole: an awaited send would make a known
address cost an insert plus an HTTPS round trip while an unknown one costs one indexed
read, a difference of hundreds of milliseconds against the whole point of REG-6/LOG-6.
Anything added to these handlers has to preserve that.

**Registration provisions no database.** The central row is written with `db_url` and
`db_auth_token` NULL and the onboarding payload stashed in `users.onboarding_payload`; the
user's own Turso database is created when the emailed link is verified, which is the first
moment anyone has proved the address is theirs. Three reasons: an unauthenticated endpoint
can no longer create real cloud databases, which removes the pre-auth cost exposure rather
than mitigating it; register stops making two sequential Platform API calls, which is what
made the response latency leak account existence; and A19 designs no loading state for
"Finish setup", so a register that blocks on cloud provisioning would be a spinner-shaped
hole in a screen with no spinner.

**Login tokens are looked up by hash, never compared.** `randomBytes(32).toString('base64url')`
is 256 bits of entropy and the SHA-256 of it is the stored key, so verification is an
indexed read and there is no secret comparison to time. bcrypt or argon2 would be wrong
here: they exist to slow brute force against low-entropy secrets. `consume()` is a single
conditional `UPDATE ... RETURNING`, never a read followed by a write - the await between a
check and a mark is exactly where two concurrent consumes of one token would both pass.
`issue()` wraps its supersede-then-insert in one transaction for the same class of reason:
as two standalone statements, two concurrent resends could interleave and leave both new
links live. Those transactions are chained in-process, because the embedded driver refuses
overlapping transactions rather than queueing them (see docs/TODO.md).
Invalidation uses two distinct columns, `used_at` and `superseded_at`, because A38 designs
no screen for a rejected link and "why did this link stop working" has to be answerable
from the row.

**Verifying a link is one blocking call, and it is what provisions the account.** `POST
/api/auth/verify` takes the token in the **body** (a POST from the frontend's route handler,
so a live credential never reaches backend access logs) and does everything in order:
`consume()` first because it _is_ the authentication, then the directory read, then - only if
`users.onboarding_payload` is still set - provision the Turso database, persist the pointer,
open and migrate it, insert the profile, seed the picked categories, and clear the payload
**strictly last**, because while it is set it is both the profile's source data and the "this
may be unfinished" marker. Then a session, then the response. Nothing here is floated, unlike
`AuthService`: the caller holds a token that was emailed to the address owner, so there is no
enumeration timing to defend, and the response must not claim a session that provisioning
failed to earn.

Money crosses units in `src/common/money.ts` and nowhere else: `toCents()` on the way in,
`fromCents()` on the way out. Two callers so far, `VerificationService` for the profile and
`TransactionsService` for amounts, which is what the schema comments mean by the conversion
happening at the service boundary. A third place doing its own arithmetic is a bug.

**Transaction writes are the whole write surface of the spend feature, and nothing they
touch is derived.** `POST /api/transactions` (201), `PATCH /api/transactions/:id` (200) and
`DELETE /api/transactions/:id` (204) live in `src/transactions/`; reads are PET-28's. Every
aggregate the UI shows - dashboard cards, trend buckets, the donut, per-category totals, the
allocation summary - is computed on read and **never stored**, so there is deliberately no
month column: month attribution is the `date` string read against the profile's
`monthStartDay` at query time, which is what makes a backdated transaction land in its own
month and a changed `monthStartDay` re-bucket history correctly.

Four things about that contract are easy to get wrong:

- **A `PATCH` is tri-state**: an absent field is unchanged, `null` clears (only `note` is
  nullable), a value sets. `UpdateTransactionDto` is hand-written rather than
  `PartialType(CreateTransactionDto)` for one reason: `@IsOptional()` skips validation for
  `null` as well as `undefined`, so `{"merchant": null}` would pass every check and reach a
  NOT NULL column as a 500. Each field uses `@ValidateIf((_, v) => v !== undefined)`
  instead; `note` alone keeps `@IsOptional()`, because there null is the point.
- **An empty `PATCH` body is a 400**, thrown before the user database is even opened - a
  bare UPDATE would still bump `updated_at` through `$onUpdateFn` and record an edit that
  changed nothing. For the same reason the service never sets `updatedAt` by hand: drizzle
  v1's `buildUpdateSet` applies `$onUpdateFn` columns itself.
- **404 means two different resources**, the transaction in the URL and a `categoryId` sent
  in a body, so each `@ApiOperation` description says which. An unknown category is a 404
  rather than a 400, which keeps 400 meaning "the shape was rejected".
- **The date regex must stay an inline literal.** The swagger plugin lifts only inline
  regex into `pattern` and silently drops a named constant, so `@Matches(/^\d{4}-\d{2}-\d{2}$/)`
  is written out at both DTOs. `@IsDateString({ strict: true })` beside it is what rejects
  `2026-02-30`, which a regex cannot know is not a day. Nothing in the write path calls
  `new Date(dto.date)` - that would shift the day across timezones.

Cross-user isolation is structural, not a filter: every method opens the caller's own
database, so another user's transaction id simply does not exist there and the ordinary 404
covers it. There is no `user_id` column to forget. Deletes tombstone (`deleted_at`) and
`PATCH` guards on `deleted_at IS NULL`, so a deleted transaction cannot be edited back to
life; the row survives only so a future offline sync cannot resurrect it under a
delete-update conflict.

Four fields the transaction detail mock shows are **deliberately not accepted**: time,
payment method, status and account (DET-8, A20). No form captures them and no column stores
them, so `forbidNonWhitelisted` answers 400 rather than dropping them silently and letting a
frontend believe they were saved.

**A resent link completes a half-provisioned account.** A mid-flight failure answers 500 with
the link already burned, and "Resend link" (VER-2, A36) is the designed recovery - so every
step is written to resume rather than crash or duplicate: provisioning is skipped when
`db_url` is already set, the profile insert is `onConflictDoNothing`, the seed is skipped when
any category row exists, and a cleared payload simply makes the next verify a returning
user's. Provision-and-persist is the one compensated pair (its catch deletes the database and
rethrows); everything after the pointer is persisted is forward-only, because deleting then
would strand a row that resume logic never re-provisions.

**401 for a dead link, 409 for a replaced one.** `consume()` returns a classified result, and
the diagnostic read behind it runs only when the conditional UPDATE matched nothing, so the
success path stays one statement. Disclosing "superseded" is safe: it is returned only to
somebody holding a token that really was emailed to the account owner, random probes see the
generic answer, and it carries no user id. It exists because Gmail threads identical login
mails, which makes clicking the older of two links ordinary rather than exotic.

**Sessions are opaque hashed bearers with a fixed lifetime.** A central `sessions` row stores
the SHA-256 of a 256-bit random token (the `login_links` scheme, sharing its `hashToken`), and
`validate()` is one indexed join back to `users` that performs no write - expiry is absolute,
not sliding, so an authenticated read stays a read. `SESSION_TTL_D` is 30 days; there are no
cookies here (the frontend owns that), no refresh, and no logout by design (A39), so
revocation means tombstoning the row. Concurrent sessions per user are legitimate, one per
device. `GET /api/auth/session` returns only `{ userId, email, expiresAt }`, because that is
all central knows.

**`SessionGuard` is an `APP_GUARD`, so every route is guarded unless it says otherwise.**
It arrived per-route, back when one endpoint was guarded and marking four public ones to
protect it would have been absurd; the transaction endpoints tipped the balance and PET-27
made the flip. Exactly four routes carry `@Public()` (`src/auth/public.decorator.ts`):
hello, register, login-link and verify. **Note the failure direction reversed**, which is
the real reason to prefer this: a forgotten `@Public()` 401s a public route loudly on the
first request, where a forgotten `@UseGuards` used to leave an endpoint silently open. The
guard's public check is a pure metadata read - no header, no body, no query - so it sits
ahead of the controller-level `ThrottlerGuard` without changing what the rate-limit
trackers see. Guards are invisible to OpenAPI, so the flip was a zero-diff `api:sync`.

**The auth routes carry two independent rate limiters, per submitted email and per IP.**
Deliberately two throttlers rather than one composite `ip:email` key: a composite key hands
every new (IP, address) pair a fresh bucket, so it throttles only one host hammering one
address and stops neither a botnet walking a single address nor one host walking a list.
The per-email limiter caps mail sent to one inbox whoever asks; the per-IP one caps total
submissions from one host, with a laxer default because a NAT can hide a classroom. The
trackers run in a guard, which Nest executes _before_ pipes, so they normalize the raw body
themselves rather than trusting the DTO transform - `src/common/normalize-email.ts` is
shared for exactly that reason. `@nestjs/throttler` takes `ttl` in milliseconds, so the
module converts `AUTH_RATE_TTL_S` with the library's `seconds()` helper; getting that wrong
is silent.

The guard sits on the controller, so the two newer routes opt out by name: verify skips the
email limiter (it has no address to key on, and the tracker's `no-email:<ip>` fallback would
put every caller in one narrow bucket) and session skips both (a whoami the frontend calls on
navigation, where one NAT would exhaust the per-IP budget for a whole classroom). **A bare
`@SkipThrottle()` means `{ default: true }`, and no throttler here is named `default`, so it
skips nothing at all - silently.** The named form is mandatory.

## Persistence

**Drizzle ORM (v1 RC) over Turso's new engine, in two modes behind one seam.**

- **Cloud mode**, when all four of `TURSO_ORG`, `TURSO_ORG_TOKEN`,
  `TURSO_CENTRAL_DB_URL` and `TURSO_CENTRAL_DB_TOKEN` are set: `@tursodatabase/sync` with
  the `drizzle-orm/tursodatabase-sync` driver. A local file kept in step with a Turso
  Cloud database. The client has no timer of its own, so
  `backend/src/database/turso-client.factory.ts` schedules `push()` then `pull()` every
  `TURSO_SYNC_INTERVAL_S`.
- **Local mode**, otherwise: `@tursodatabase/database` with
  `drizzle-orm/tursodatabase/database`. A plain local file, nothing remote. CI, the e2e
  suite and offline development all run here, which is why the backend still works with
  no `.env` at all.

Both are the same engine and the same SQLite dialect, so one schema and one migrations
folder per scope serve both. `turso-client.factory.ts` and `UserDatabaseService` are the
only two files that know which mode is active.

**Every cloud database must use the Turso engine, never libSQL.** Turso Cloud still creates
libSQL databases by default, but the local half of `@tursodatabase/sync` is a real Turso
database, so the remote it replicates against has to be one as well. `TursoPlatformService`
therefore sends `use_tursodb: true` on every create, and the central database has to be
made with `turso db create ... --tursodb` by hand. Two things make this easy to get wrong:
the field is **undocumented** in the public API reference (it comes from the CLI's own
request struct, where `--tursodb` serializes as `use_tursodb`), and getting it wrong is
**silent** - the API accepts the request and the app runs. Since the engine is fixed at
creation, the only remedy is deleting the database and making a new one. Check with
`turso db list`, whose `TYPE` column reads `Turso` rather than `SQLite`, or the `engine`
field the Platform API returns. A dedicated test pins the flag in
`turso-platform.service.spec.ts`.

**Database per user.** A small **central** database (`users`: id, email, and a pointer to
that person's database) exists because identity must resolve by email before the per-user
database is known. Everything else about a person lives in **their own Turso database**,
holding `profile` (single row), `categories` and `transactions`. Insights arrive there
later as an ordinary migration. In cloud mode the central database and every per-user one
live in a single group, `TURSO_GROUP` (default `decode-pet`); the backend creates the
per-user ones itself, at **verification** rather than registration - see the access flow
under Architecture.

Central carries three deliberate exceptions to "email and a pointer". `login_links` is there
because a link is consumed before we know - or, for an unverified account, before there
even is - the user's own database, and `sessions` for the same reason one step later: a
bearer is validated before anything knows which database to open. `users.onboarding_payload`
is there because the registration form is collected before the address is proven and the
profile it becomes lives in a database that does not exist yet; it is transient, written at
registration and set NULL by verification, and it holds `monthlyBudget` in **major** units
with the DTO defaults already applied. None of them is a licence to put more profile data in
central.

**Tokens.** Creating databases and minting their tokens are control-plane operations that
no data-plane token can perform, so `TURSO_ORG_TOKEN` is used in exactly one place
(`TursoPlatformService`) at provisioning time. It does not have to be an organization-wide
token: minting it scoped to the group with just `db:create`, `db:delete` and
`db:mint-token` covers everything the service does. Each user database is then reached with
its own minted data-plane token, stored in the central row and never serialized into an API
response. By MVP decision every Turso token is created with **Expires: NEVER**: no refresh
logic anywhere, rotation is a manual ops action.

**Migrations are committed and applied programmatically**, in
`backend/drizzle/central/` and `backend/drizzle/user/`. Note the v1 RC layout: one
directory per migration containing `migration.sql`, named `<YYYYMMDDHHMMSS>_<slug>`, with
no `meta/_journal.json`. The central database is migrated by the `APP_DB` async factory
before Nest finishes booting; a user database is migrated on first open, so adding a
migration upgrades every existing user the next time they are touched. There is no
`db:migrate` script, because N user databases cannot be migrated from a CLI. Consequence
for deployment: `drizzle/` is resolved from `process.cwd()`, so a future Dockerfile must
`COPY` it next to `dist/`.

**Conventions worth knowing before writing a table.** Primary keys are UUIDv7 text
(`src/common/ids.ts`). Money is integer minor units in `*_cents` columns; the API speaks
major units and the service converts. Instants are `integer` epoch-ms
(`{ mode: 'timestamp_ms' }`) set app-side with `$defaultFn`/`$onUpdateFn`; calendar dates
will be `text` `YYYY-MM-DD`. Every table carries a nullable `deleted_at` for future sync
and reads filter it with `isNull(deletedAt)` - the tombstone is invisible through the API,
which still deletes permanently as far as a client can tell.

**Two things the test setup exists to work around.** `@tursodatabase/database`,
`@tursodatabase/sync` and `uuid` are ESM-only. Node loads them fine, but Jest's CommonJS
runtime cannot, and they cannot be transformed either (their napi loader uses
`import.meta.url`). `backend/test/esm-environment.cjs` therefore injects a real Node
`require`, and `test/esm-shims/` plus a `moduleNameMapper` entry in both jest configs
route those three specifiers through it.

**Keeping tests off the cloud takes two separate mechanisms, and both are load-bearing.**
`test/setup-e2e.ts` points `DATABASE_DIR` at a temp directory and deletes every `TURSO_*`
variable inherited from the shell. That alone is not enough: `ConfigModule` also reads
`backend/.env` from disk and puts the deleted variables straight back, which pointed the
whole e2e suite at live Turso Cloud and created real databases there. `AppModule` closes
that hole with `ignoreEnvFile: process.env.NODE_ENV === 'test'` (Jest sets `NODE_ENV`
itself). Remove either half and a developer with a filled-in `.env` runs the suite against
production infrastructure.

## Design tokens

`frontend/src/app/globals.css` is the single source of truth for the design system and
mirrors the Figma **Foundations** page. Tailwind v4 is configured CSS-first, so there is
no `tailwind.config` to look for. Read the stylesheet before styling anything.

**Tailwind's own palette and type scale are cleared** (`--color-*: initial`,
`--text-*: initial`). This is the load-bearing decision: `text-red-600`, `bg-zinc-100`
and `text-4xl` genuinely do not exist and generate no CSS. Because Tailwind drops
unknown utilities silently rather than erroring, a class that appears to do nothing is
usually a class that is not in the design. Use the tokens (`text-body-m`,
`bg-status-danger-soft`, `text-text-secondary`) or add one to the theme.

Colour tokens are group-prefixed to match the Figma groups: `brand-*`, `surface-*`,
`text-*`, `border-*`, `status-*`, `category-*`. This is why you write
`text-text-primary` and `border-border-default`; the stutter is deliberate.

**The 19 type styles are `@utility` blocks, not `--text-*` tokens**, because a type
style has to carry its font-family and the compiler only accepts `--line-height`,
`--letter-spacing` and `--font-weight` as paired suffixes on a `--text-*` token.

**The spacing scale is Tailwind's, not a redeclared Figma one.** The `--spacing`
namespace also drives `w-*`, `h-*`, `size-*`, `inset-*` and `translate-*`, so overriding
it would silently delete every sizing key not explicitly listed. The Figma mapping
(`Space/16` = 16px = `p-4`) is documented in `globals.css`.

Two smaller traps. `--radius-full` is ignored by the compiler, so Radius/Full is
Tailwind's built-in `rounded-full`; and clearing `--radius-*` also removes the bare
`rounded` utility, so use `rounded-md` explicitly.

**Only light mode is designed.** No dark theme ships, and `dark:` variants should not be
added. Note that Tailwind cannot make `dark:` a build error, so this rests on review.

The two typefaces load through `next/font/google` in `frontend/src/app/fonts.ts`. That
module exists separately from `layout.tsx` so `.storybook/preview.ts` can import the same
loaders. The variable classes must land on `<html>`, which is where `:root` resolves.

`npm test` runs `frontend/src/app/globals.test.ts`, which both asserts every documented
value and compiles the stylesheet through Tailwind's own `compile()` to confirm each
utility actually generates. `npm run storybook` renders the whole system under
**Foundations** for diffing against Figma.

## Shared components

`frontend/src/components/ui/` holds the design-system primitives, mirroring the Figma
**Components** page. **Every tile on that page now has a component**: `Button`, `Input`,
`Select`, `Tag`, `ProgressBar`, `Stat`, `SectionHeader`, `ListRow` and `Sidebar`.
`npm run storybook` renders them under **Components**. The library is complete; a new
component from here on is a feature's own, not a tile.

**Shared UI is split by role, not by file type.** `components/ui/` is the primitive layer,
the vocabulary every screen draws from. Components that only make sense for one feature go
in `components/` beside it, or next to the route that uses them. Nothing has earned a
feature folder yet, so `ui/` is currently the only child - the app shell's own components
took the second option and live under `app/(app)/`, described below.

The Storybook section is still called **Components** while the folder is `ui/`. That
mismatch is deliberate: `ui/` says where the code lives, **Components** is the Figma page
name, and the stories exist to be diffed against it.

Five conventions, all of which existing files demonstrate:

- **Tests and stories are colocated**, `Tag.tsx` next to `Tag.test.tsx` and
  `Tag.stories.tsx`. Do not "tidy" them into `__tests__/` or `stories/` trees. Parallel
  trees make a rename touch three directories, and they hide the one signal worth having
  at a glance: a component with no test file beside it.
- **Files are flat inside `ui/`**, not a folder per component. Alphabetical sort already
  groups a component with its satellites, and it keeps imports at `@/components/ui/Tag`
  rather than a stuttering `.../Tag/Tag` or nine files all named `index.tsx`. Promote one
  component to its own folder when it first needs private sub-parts; a mixed directory is
  fine. There is no barrel `index.ts` and adding one is not an improvement.
- **Variant classes come from a `Record<Variant, string>` holding complete literal class
  strings** (`TAG_TONES`, `CATEGORY_TILE`, `BUTTON_VARIANTS`, `INPUT_VARIANTS`,
  `FIELD_CONTROL_BORDER`), interpolated into a template literal. This is
  not style preference. Tailwind's scanner reads these files as raw text, so a class built
  by interpolation (`bg-category-${n}`) is found by nobody and compiles to nothing, with
  no build error and no failing test. There are no `clsx` / `cva` style dependencies and
  none are needed.
- **`src/components/ui/utilities.test.ts` compiles every one of those classes** through
  Tailwind and fails if any generates no CSS. It is what makes the point above enforceable
  rather than a rule people remember. Add new class maps to it.
- **Components stay Server Components.** None of them carry `'use client'`, because none
  holds state. `Button`, `Input` and `Select` accept handler props without it: a client
  component that imports one pulls it into the client bundle on its own, and only a Server
  Component trying to pass a function would break. Only add the directive when a component
  genuinely needs the client itself.

**Form fields go through `ui/Field.tsx`.** `Input` and `Select` are both built on it, and
it owns the label, the inline validation message, and the `aria-invalid` /
`aria-describedby` wiring between them. Build a new control on it rather than repeating the
pattern; that is what keeps every form in the app reporting errors identically. Two things
about it look like friction and are not: `id` is a **required** prop, because `useId()` is a
hook and generating one would force `'use client'` onto the whole field layer; and each
state-dependent colour comes from its own `Record` (`FIELD_CONTROL_SURFACE` for the fill,
`FIELD_CONTROL_BORDER` for the border) rather than being appended conditionally, because
`border-border-strong` and `border-status-danger` have equal specificity, so emitting both
makes the winner depend on stylesheet order. Classes carrying a variant prefix
(`focus-within:`, `disabled:`) are exempt, since the extra pseudo-class settles it.

**Padding sits on the control, never on the bordered box.** Both `Input` and `Select` put it
on the `<input>` / `<select>`, and `Input`'s `$` prefix and `Select`'s chevron are absolutely
positioned over the control with `pointer-events-none`. A padded box turns its own 14-16px
band into a dead zone where a click places no caret and opens no list.

**Five details of the form components have no Figma counterpart.** They were chosen, not
read, so do not "correct" them without asking the designer:

- **The inline error pattern** - red border plus one line of `text-body-s
text-status-danger-text`, no icon. Assumption A29 records that no form error visual exists
  anywhere in the file.
- **The disabled button dimming** (`disabled:opacity-60`). Frame 15 draws the in-flight
  "Generating..." button identically to a resting secondary one, so the design says only the
  label changes (A26). A control that looks enabled while it is not is a defect, hence the
  addition.
- **The disabled field fill** (`bg-surface-muted` plus `text-text-tertiary`). No disabled
  field is drawn anywhere in the file, and it cannot simply be left out: author styles beat
  the user agent's own disabled treatment, so an undecorated disabled field is
  pixel-identical to an editable one.
- **The forced-colors focus outline** on the field box. Windows High Contrast forces every
  border colour to one system colour, so the designed accent border cannot signal focus
  there. The outline is scoped to `forced-colors:` alone, so normal rendering still matches
  Figma exactly.
- **The currency field at rest.** The 1.5px `brand-accent` border is treated as the _focus_
  style, which is what the ticket and spec BUD-3 assert, but Figma only ever draws it on the
  currency amount field and never draws that field unfocused. Its 1px resting border is
  inferred from the plain Input tile. Focus also keeps that accent border on an _invalid_
  field rather than holding the red: invalidity is still carried by the message and by
  `aria-invalid`, and a 0.5px width change is too little focus signal to see.

**`ui/Sidebar.tsx` takes its active item as a prop, and that has a consequence for whoever
mounts it.** `active` is one of four keys matching the Figma variant property, not a
`usePathname()` call, which is what keeps the component a Server Component like the rest of
`ui/`. But an App Router layout cannot read the pathname on the server, so the `(app)` shell
needs a thin `'use client'` wrapper that calls `usePathname()` and passes `active` down;
reading it inside the sidebar instead would force `'use client'` onto the whole component and
break `ui.stories.test.tsx`, which renders every story under Jest with no router in context.
The four hrefs (`/dashboard`, `/transactions`, `/insights`, `/settings`) are declared in that
file's `NAV_SECTIONS` and are the contract the routing ticket has to match.

It is also the **first and only consumer of the six dark-surface tokens** (`surface-ink`,
`-ink-raised`, `-ink-elevated`, `text-on-dark`, `-on-dark-subtle`), which had shipped unused
since the Foundations work. `text-on-dark-muted` is now the one Foundations colour with no
consumer at all.

**Four more details have no Figma counterpart**, on top of the five form ones above:

- **The sidebar's white focus ring** (`focus-visible:outline-white`), where every other
  component uses `focus-visible:outline-brand-accent`. No sidebar focus state is drawn, and
  the accent on `surface-ink` is too dark to read as one.
- **The truncating footer name and email.** Figma clips inside a fixed 260px column because
  it only ever draws the short sample address; `min-w-0` plus `truncate` is the honest
  equivalent, the same pattern `ListRow` uses for a long merchant name.
- **`rounded-[10px]` on the logo tile and the nav pills**, the one place a literal beats a
  token. Figma bound that corner to a raw 10px rather than a radius variable, and the scale
  offers only 8 and 12. Worth a designer answer; until then the literal matches the design.
- **The wordmark reads "Spendifico", not Figma's "Expensa".** The rename was decided on
  2026-08-02 and this is its most visible string. PET-51 finished it everywhere in the repo,
  so the design file is the only holdout left; `docs/TODO.md` records that, and the one
  constraint the rename leaves on any future change to the per-user database naming.

`frontend/src/lib/format.ts` owns display formatting, in three halves. Money: amounts are
stored as positive magnitudes and displayed negative, and the sign is U+2212 MINUS SIGN
rather than the hyphen `Intl.NumberFormat` emits, matching the design. Names: `initials()`
and `shortName()` derive the sidebar footer's "MK" and "Marko K." from the two stored name
fields. Both are derived and never stored (SET-2), and SET-6 requires the sidebar footer and
the Settings avatar to agree, which is why one shared function is the point rather than a
convenience. Both take the first character with `Array.from(name)[0]` rather than
`charAt(0)`, which would split an astral-plane character into a lone surrogate. Period:
`monthOverline()` and `monthLabel()` give the page header its "October 2025" and "October",
shared because Dashboard and Transactions draw the identical overline. Both use the calendar
month and therefore ignore the profile's `monthStartDay`, which A9 says defines the period -
that value is PET-45's, and the display is correct for its default of 1.

## The app shell

`frontend/src/app/(app)/` is the shell every signed-in screen renders inside: the fixed dark
sidebar beside a content column, with the four routed views `/dashboard`, `/transactions`,
`/insights` and `/settings` under it. A **route group**, so the paths stay exactly the hrefs
`ui/Sidebar` declares while sharing one layout; the access screens (01, 02, 03, 22, 23, 24)
sit outside it and inherit none of it.

**`PageHeader` and `SidebarNav` live here rather than in `components/ui/`, deliberately.**
`ui/` mirrors the nine tiles on the Figma Components page and is complete, and neither of
these is a tile - they are the shell's own. The visible consequence is that `PageHeader`'s
stories are filed under **Shell**, not **Components**, so they cannot join
`ui.stories.test.tsx` (which asserts every module's title starts with `Components/`);
`(app)/shell.stories.test.tsx` is the third copy of that smoke test for them. Their
hard-coded classes are still guarded by `ui/utilities.test.ts`, because a *fourth* copy of
the Tailwind compile harness was worse than one list covering both folders.

**`SidebarNav` is the shell's only `'use client'` file, and it exists for exactly one
reason.** `Sidebar` takes `active` as a prop so it can stay a Server Component, and an App
Router layout cannot read the pathname on the server, so something has to call
`usePathname()`. It matches by **prefix with a trailing-slash boundary**, so
`/transactions/abc` keeps Transactions lit while `/settings-import` does not light Settings,
and it falls back rather than throwing on no match: `active` has no "none" variant by design.

**The header owns the overline, the title and a slot - nothing else.** Each route passes its
own action, because all four differ: Dashboard a month select plus primary "Add transaction",
Transactions a **search field** plus the same button, AI Insights a **secondary**
"Regenerate", and Settings nothing at all. Two consequences worth knowing. The tickets that
eventually make those controls work never touch `PageHeader`. And CTG-1's "Add category",
which swaps in on the Categories tab, needs no header change either.

Two things about that list contradict PET-19's own acceptance criteria, and the design won
both times: **AC3 claimed the month select appears on Transactions too** (TRN-1 and node
`26:137` draw a search field there instead), and **the ticket never mentioned "Regenerate"**
(INS-1 and node `38:542` both do). The Jira description was corrected rather than the code.

**The month select and the search field are inert `div`s, not controls.** A8 says the select
renders the current period and does nothing until month navigation is designed, and the
search filters a list that does not exist until PET-28. Neither is a `<select>`, `<input>` or
`<button>`, so neither announces itself as operable, and `(app)/pages.test.tsx` pins that -
`queryByRole('combobox')` and `queryByRole('textbox')` both have to stay empty.

**`export const dynamic = 'force-dynamic'` on the layout is load-bearing today.** The pages
read `new Date()` for the overline; without it Next prerenders them and every screen shows
whatever month the build ran in, a bug that only appears a month after deploying. `npm run
build` is where to check: all four routes must print `ƒ`, not `○`. PET-52's `cookies()` read
makes the segment dynamic on its own, at which point the line becomes redundant.

**`/` is a bare `redirect('/dashboard')`.** No frame in the design corresponds to it: VER-4
lands both a new and a returning account on the Dashboard, and a signed-out visitor belongs
in the access flow, which the shell's own session check sends them to. It is here rather than
in a middleware matcher so the rule has one home.

**`lib/session.ts` is a stub, and that is PET-19's deferral of AC5.** `requireSession()` is
called once, by the `(app)` layout, and currently lets every request through, so the shell is
browsable with no backend. Its doc comment is the specification PET-52 fills in: read the
httpOnly cookie, lift it into `Authorization: Bearer <token>`, call `GET /api/auth/session`,
redirect on 401 or absence. It deliberately does **not** name the cookie, because that name
is not decided anywhere in the repo and choosing it here would hand PET-52 a contract it did
not pick. It returns `Promise<void>` from a non-`async` function so the signature is already
the real one.

**The sidebar footer's profile is fabricated.** `PLACEHOLDER_PROFILE` in `(app)/layout.tsx`
is Figma's own sample data ("Marko", "Kovač", "marko@email.com"), so the shell diffs against
the design rather than against invented copy - which also means it looks entirely real in a
screenshot. It cannot be fixed here: names live in the per-user database's `profile` row and
the email on the central `users` row, so it needs PET-45's read reached with PET-52's cookie.
`ui/Sidebar` itself stays clean; its test pins that those three strings appear nowhere in the
component.

## Environment variables

Copy the templates, then fill in values. Both real files are gitignored.

| App      | Template                | Real file             | Variables                                       |
| -------- | ----------------------- | --------------------- | ----------------------------------------------- |
| Backend  | `backend/.env.example`  | `backend/.env`        | see the table below                             |
| Frontend | `frontend/.env.example` | `frontend/.env.local` | `BACKEND_URL` (default `http://localhost:3000`) |

Backend variables:

| Variable                 | Default                 | Purpose                                               |
| ------------------------ | ----------------------- | ----------------------------------------------------- |
| `PORT`                   | `3000`                  | API port                                              |
| `FRONTEND_URL`           | `http://localhost:4200` | CORS origin                                           |
| `DATABASE_DIR`           | `./databases`           | Local database files (gitignored)                     |
| `TURSO_ORG`              | -                       | Organization slug. Cloud mode: set all four or none   |
| `TURSO_ORG_TOKEN`        | -                       | Control-plane token; group-scoped is enough           |
| `TURSO_CENTRAL_DB_URL`   | -                       | Central database URL                                  |
| `TURSO_CENTRAL_DB_TOKEN` | -                       | Central database data-plane token                     |
| `TURSO_GROUP_TOKEN`      | -                       | Break-glass CLI/Studio access; the app never reads it |
| `TURSO_GROUP`            | `decode-pet`            | Group holding the central and all per-user databases  |
| `TURSO_SYNC_INTERVAL_S`  | `60`                    | Cloud-mode push/pull interval                         |
| `MAILPACE_API_TOKEN`     | -                       | MailPace server token. Paired with `MAIL_FROM`        |
| `MAIL_FROM`              | -                       | Sender address, on the DKIM-authorized domain         |
| `MAIL_FROM_NAME`         | -                       | Sender display name; optional, unpaired               |
| `LOGIN_LINK_TTL_M`       | `15`                    | Login-link lifetime, in minutes                       |
| `SESSION_TTL_D`          | `30`                    | Session lifetime in days; fixed expiry, not sliding   |
| `AUTH_RATE_LIMIT`        | `5`                     | Auth requests per window, per submitted address       |
| `AUTH_RATE_IP_LIMIT`     | `30`                    | Auth requests per window, per caller IP               |
| `AUTH_RATE_TTL_S`        | `900`                   | Window length in seconds, shared by both limiters     |

Both apps run on their defaults with no `.env` at all, so a missing file is not an error.

Note the filename difference: Nest reads `.env`, Next.js reads `.env.local`.

The backend **does** validate its environment: `ConfigModule.forRoot` takes a
`validationSchema` (Joi, `src/config/env.validation.ts`), so a typo fails at boot rather
than at first use. The four cloud variables are tied together with `.and()`, making a
half-filled `.env` an error instead of a silent fallback to local mode. drizzle-kit is the
exception: it reads raw `process.env` and never passes through Joi, which is why the two
`drizzle.*.config.ts` files repeat the `DATABASE_DIR` default themselves.

**Never give a server-only secret a `NEXT_PUBLIC_` prefix.** `BACKEND_URL` deliberately
has no prefix because it is read server-side only; a `NEXT_PUBLIC_` variable is inlined
into the browser bundle and is therefore public forever.

The four cloud variables are optional but paired: set all of them or none. Anything else
fails at boot with a Joi message naming the missing one. `MAILPACE_API_TOKEN` and
`MAIL_FROM` are paired the same way, for a sharper reason: unset means "log the link
instead of sending it", which is a supported mode, but half-set would mean a real login
email silently never leaves. Both therefore stay **commented** in `.env.example`, value
and all: that file is copied verbatim by `cp .env.example .env`, so uncommenting only
`MAIL_FROM` would leave a fresh clone unable to start.

**Smoke-test mail goes to `spendifico@gmail.com`, never a personal address.** That is the
project's official inbox, and it is also where `login@spendifico.eu` - this project's
`MAIL_FROM` - forwards, so one inbox holds both what the app sends and any reply. The
procedure, including running the backend against a throwaway database so a test
registration never reaches the real user directory, is in README.md under Sending real
email. Run it whenever the mail path changes: it catches what a mocked spec cannot, the
standing example being the `Accept: application/json` header that MailPace requires and
Node's `fetch` does not send.

## What is in `.claude/`

This repo ships Claude Code configuration. Knowing what is there prevents both
reinventing it and being surprised by it.

**Skills.** A skill is invoked by its own name, so the slash command is the full name in
the left column (`/repo-dev-setup`). You do not have to remember them: each skill's
description also matches plain requests, so "set me up locally" reaches `repo-dev-setup`
on its own. The short forms quoted inside the descriptions (`/dev-setup`, `/commit`) are
matching phrases, not registered commands.

| Skill             | What it does                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `repo-dev-setup`  | First-time local setup, both apps. Start here on a fresh clone                                                                                                           |
| `repo-commit`     | Analyses changes, runs per-app lint/test, writes Conventional Commit messages, guards against committing to `main`                                                       |
| `repo-secrets`    | Manages `.env` files from templates, explains where real secrets live                                                                                                    |
| `repo-jira`       | Creates/estimates/transitions Jira issues over MCP. Needs a Jira MCP server; see `.claude/skills/repo-jira/references/jira-access.md` for the two supported setups       |
| `repo-review-prs` | Fetches open PRs via `gh` and reviews unreviewed ones                                                                                                                    |
| `repo-stack`      | This repo's stacked-branch wiring: the layers of truth, the worktree trap, the conventions. CLI mechanics live in the committed official `gh-stack` skill                |
| `backend-nestjs`  | Passive reference library, 12 NestJS rules across 7 categories. Consulted when writing backend code                                                                      |
| `frontend-nextjs` | Passive reference library, 16 Next.js/React rules. Consulted when writing frontend code                                                                                  |
| `backend-drizzle` | How Drizzle and Turso are wired in **this** repo: the two migration scopes, the database-per-user consequences, the Turso drivers. Deliberately not a drizzle-kit manual |

**Agents** (delegated subtasks with their own context): `code-reviewer`, `debugger`,
`test-automator`, `nestjs-specialist` and `nextjs-specialist` (these two fetch and
synthesise the live official docs, which is different from the passive rule libraries
above), and `linus-reviewer` (a deliberately blunt review persona; it has no tools, so
paste the diff into the prompt).

**Permissions.** `.claude/settings.json` is committed and applies to everyone. Notably,
`Edit` and `Write` are **not** pre-approved, so Claude asks before every file change and
you see the diff before it lands. Every decision in that file is explained in
`.claude/SETTINGS.md`, because JSON cannot hold comments. Personal preferences belong in
`.claude/settings.local.json`, which is gitignored.

**The `gh stack` CLI ships an official agent skill, and it is committed.**
`.claude/skills/gh-stack/` comes from
`gh skill install github/gh-stack gh-stack --agent claude-code --scope project`
(`gh skill` is a preview feature of the GitHub CLI; the command needs both the repo and
the skill name, or it only lists what is available). It is committed so everyone has a
byte-identical copy and a fresh clone works with no extra step; refreshing it is a
deliberate act - re-run the install and commit the diff. The repo's own `repo-stack`
skill covers only this repo's stacked-branch wiring and defers the CLI to it.

**Drizzle ships its own skills, and they are committed.** `drizzle-kit` bundles eight agent
skills (`drizzle`, `drizzle-generate`, `drizzle-migrations`, `drizzle-push`, `drizzle-pull`,
`drizzle-hints`, `drizzle-output-modes`, `drizzle-responses-and-errors`). `npm run skills`
at the repo root extracts them from the drizzle-kit in `backend/node_modules` into
`.agents/skills/`, and symlinks `.claude/skills/drizzle*` at them.

Both the files and the symlinks are committed, for the same reason `backend/drizzle/`
migrations are: they are generated, but everyone must have byte-identical copies, and a
fresh clone should work with no extra step. Only `skills-lock.json` is gitignored, because
it records the absolute path of whoever ran the installer.

**Refreshing them is a deliberate act, like regenerating migrations.** Bumping `drizzle-kit`
does not update them; re-run `npm run skills` and commit the diff. You will be told when
that is needed: the `drizzle` skill compares its own `metadata.revision` against
`drizzle-kit skills version` from the _installed_ binary and prints a notice when the
bundle is newer. That check is why committing them is safe - drift is surfaced rather than
silent.

Because those eight cover the CLI thoroughly, the repo's own `backend-drizzle` skill covers
only this project's wiring and defers the rest to them.

`drizzle-kit` also ships an **MCP server**, `node backend/node_modules/drizzle-kit/bin.cjs
mcp`, exposing `generate`, `push`, `pull`, `check`, `export` and `up` as tools. It is in
`.mcp.json.example`; copy that to `.mcp.json`, which is gitignored and therefore
per-developer. Note that `push` applies schema changes directly to a database without
writing a migration, which is the opposite of this repo's committed-migrations workflow.

`.claude/commit-checks.md` is a generated cache read by `repo-commit`. Regenerate it
with `/repo-commit refresh-checks` when it goes stale.

## Git workflow

**HARD RULE: never commit or push directly to `main`.** Branch first. `settings.json`
puts `git push` behind a confirmation prompt to give this rule a real barrier rather
than just an instruction.

Branch format: `{type}/PET-{number}-{slug}`, for example
`feat/PET-160-user-profile-card`.

**Branches are stacked, and never manually rebased.** This repo uses GitHub's stacked
branches feature routinely: a feature branch is often cut from an unmerged parent branch
rather than from `main` (`feat/PET-14-link-verification-and-sessions` on top of
`feat/PET-50-api-openapi-typegen`, for example), so the parent's PR merges first and
GitHub retargets and restacks the child itself. Before proposing any rebase, retarget or
merge, check what the branch actually sits on: `gh pr view <branch> --json baseRefName`
names the PR's base, and a base other than `main` means a stacked branch. Do not suggest
`git rebase --onto main` for one; open its PR against the parent and let GitHub do the
restack. New work that depends on an unmerged branch is cut from that branch's tip, not
from `main`.

The tooling for it is the `gh stack` extension (`github/gh-stack`), installed per
developer with `gh extension install github/gh-stack` - like the root `npm install`, a
fresh clone does not carry it. Note the layers of truth. On GitHub a stack is a
first-class object: a stacked PR's REST payload carries a `stack` field with the stack
number, size and the PR's position (`gh api "repos/{owner}/{repo}/pulls/<n>" --jq
.stack`; an empty result means that PR is stacked only through its base branch, which
GitHub still retargets on merge). The extension's local tracking is a separate, optional
layer, so `gh stack view` can say a branch "is not part of a stack" that very much is in
one on GitHub; adopt an existing GitHub stack with `gh stack checkout <stack-number>`,
and reserve `gh stack init` for branches not yet stacked anywhere. Finally, the worktree
trap: `sync` and `rebase` rewrite every branch in the stack, git refuses to move a
branch checked out in another worktree, and this repo routinely parks stack branches in
`.claude/worktrees/*` - detach the other checkouts before a cascade rebase. The
official `gh-stack` skill (committed at `.claude/skills/gh-stack/`) is the CLI manual;
the repo's own `repo-stack` skill covers the wiring above.

**Conventional Commits are enforced** by a `commit-msg` hook running commitlint. The
allowed types are restricted (see `commitlint.config.js`): `build`, `chore`, `ci`,
`docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`. Anything else is
rejected, including a bare description with no type.

**pre-commit** runs `lint-staged` (`.lintstagedrc.js`): per-app `eslint --fix`, then
Prettier. ESLint is invoked from each app's own directory so its config and plugins
resolve correctly, which is why you should not try to lint one app from the other's cwd.

That indirection is via `bash -c "cd <app> && npx eslint ..."`, so **every staged path is
single-quoted through a `shellQuote` helper**. Not defensive: a Next.js route group folder
is literally named `(app)`, and bash reads an unquoted `(` as a subshell. PET-19 hit this
the first time it tried to commit `frontend/src/app/(app)/layout.tsx`, and the error bash
prints (`syntax error near unexpected token '('`) names no file, so it reads as a broken
hook rather than a quoting bug. Prettier needs no quoting, because lint-staged spawns it
with no shell.

**Backend tests are not run on commit.** The hook prints a reminder only, because they
are slow. CI runs them on every PR, but run them locally before pushing backend changes.

Prettier config is per app and there is **no root config at all**: the frontend sets
`printWidth: 100` with `singleQuote` in its `package.json`, the backend has its own
`backend/.prettierrc`. Anything outside those two directories - `CLAUDE.md`, `README.md`,
`docs/`, `.claude/` - therefore gets Prettier's defaults, which means `printWidth: 80` and
**double** quotes. Prose is unaffected because `proseWrap` defaults to `preserve`, but a
fenced `ts` block in one of those files will be reformatted away from repo style. Keep
short code samples in those files as inline spans, which Prettier leaves alone.

## CI

`.github/workflows/ci.yml` runs three jobs in parallel on every PR and on pushes to
`main`:

- **backend**: lint, build, OpenAPI spec is fresh, unit tests, e2e
- **frontend**: generated API types are fresh, lint, unit tests, build, build-storybook
- **conventions**: commitlint over the PR's commit range

The two freshness steps are the drift gate described under Architecture. Both regenerate
a committed artifact and fail on a non-empty `git diff`. Note where each one lives: the
frontend half runs in the frontend job because `openapi-typescript` only reads the
committed JSON and needs no `backend/node_modules`.

The frontend's `build-storybook` step is not redundant with `build`: `tsconfig.json`
includes `.storybook/**` and the story files, so `next build` already typechecks them.
The extra step catches what typechecking cannot, such as a broken framework option or a
CSS import that no longer resolves.

The backend job covers the persistence layer without any Turso credentials: `test-e2e`
runs in local mode against files in a temp directory (see the note under Persistence), and
`npm ci` resolving the `@tursodatabase/*` native bindings on `ubuntu-latest` is itself the
check that those platform binaries are available there. Both are confirmed working.

Actions are pinned to `actions/checkout@v7` and `actions/setup-node@v7`. Older majors run
on Node 20, which GitHub has deprecated: the runner forces them onto a newer runtime and
annotates every job until they are upgraded.

A repo-wide `prettier --check` step exists but is **intentionally commented out**: 55
files predate the Prettier config and the step would fail immediately on a fresh clone.
To enable it, run `npx prettier --write .` once, commit the result, then uncomment.

## Not yet built

Treat these as planned, not available. This section exists so you do not build on
something that is not there.

- **The frontend `/api/chat` route handler.** No route handler exists, and the env
  template deliberately declares no model-provider key. Add whichever variable your
  provider needs when you build the route, server-side only and never behind
  `NEXT_PUBLIC_`. Related: `@google/genai` was once present in `frontend/node_modules`
  while absent from `package.json`, so a clean install removes it. Declare any SDK
  properly rather than relying on a leftover install.
- **The frontend half of the access flow, which is now the single biggest gap.** The backend
  is complete - verify provisions and returns a session, and `GET /api/auth/session` answers
  who a bearer is - but nothing on the frontend calls either: no verify page, no session
  cookie, and **nothing in `frontend/src` fetches the backend at all**. The session cookie is
  the frontend's own httpOnly first-party one, forwarded server-side; the backend reads no
  cookies, and its name is still undecided. The old proof-of-stack routes `POST /api/users`
  and `GET /api/users/:id` are **gone**, and the read's replacement is a session-scoped
  `getProfile()` with preferences, which is PET-45's rather than done. Everything below
  inherits from this: the shell is unauthenticated and its profile is a placeholder.
- **The shell's content, and its authentication.** The `(app)` group, the four routes and the
  page header exist (see "The app shell"), and every screen renders its designed header. What
  is missing is everything below the header - all four `<main>` elements are empty - plus the
  two things the shell fakes: `requireSession()` lets every request through (PET-52), and the
  sidebar footer shows `PLACEHOLDER_PROFILE` rather than a real profile (PET-45 reached with
  PET-52's cookie). The month select and the search field are drawn but inert by design.
- **The rest of the data model.** `users`, `login_links` and `sessions` (central) and
  `profile`, `categories` and `transactions` (per user) exist. Insights arrives with its
  feature. `transactions` has the three write endpoints and **no reads at all** - the list,
  the month windows and every aggregate are PET-28's and the dashboard tickets'.
  `categories` has a table and a starter set but no CRUD, no stats and no allocation
  summary. Its starter colors are the real ones from Figma frame 03, read per chip from the
  design's variable bindings; note the palette has eight colors for ten chips, so two
  repeat and color alone cannot identify a category.

`backend/README.md` is the stock NestJS starter README. Ignore it as a source of truth
for this project.
