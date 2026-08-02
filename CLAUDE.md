# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository. Everything
below is verified against the code, not aspirational.

`README.md` is the human-facing entry point: setup steps, commands, and troubleshooting.
This file is the reasoning behind them, so the two overlap deliberately but do not
duplicate. When something structural changes, check whether both need updating.

## What this is

**Decode Academy Demo**, a teaching boilerplate for academy final projects. A minimal
Next.js frontend talks to a NestJS backend over HTTP. Exactly one feature works
end to end: the frontend fetches a greeting from the backend's `GET /api/hello` and
renders it. Everything else is scaffolding for you to build on.

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

| Command              | Purpose                                         |
| -------------------- | ----------------------------------------------- |
| `npm run dev`        | Next dev server on :4200                        |
| `npm run build`      | Production build. Doubles as the typecheck gate |
| `npm start`          | Serve the production build on :4200             |
| `npm run lint`       | ESLint (`eslint-config-next`)                   |
| `npm test`           | Jest + React Testing Library (jsdom)            |
| `npm run test:watch` | Same, in watch mode                             |
| `npm run api:types`  | Regenerate `src/types/api.d.ts` from the spec   |

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

**Frontend to backend data flow.** The home page (`frontend/src/app/page.tsx`) is an
**async Server Component**. It fetches the backend at request time on the server with
`cache: 'no-store'`, which means no CORS is involved and there is no client-side loading
state for that call. CORS is enabled on the backend anyway (`main.ts`), for the case of
genuinely client-side fetches, allowing origin `FRONTEND_URL`.

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
`consume()` first because it *is* the authentication, then the directory read, then - only if
`users.onboarding_payload` is still set - provision the Turso database, persist the pointer,
open and migrate it, insert the profile, seed the picked categories, and clear the payload
**strictly last**, because while it is set it is both the profile's source data and the "this
may be unfinished" marker. Then a session, then the response. Nothing here is floated, unlike
`AuthService`: the caller holds a token that was emailed to the address owner, so there is no
enumeration timing to defend, and the response must not claim a session that provisioning
failed to earn.

Money crosses from major units to cents at exactly one place, `toCents()` from
`src/common/money.ts` called in `VerificationService` - the schema comments promise the
conversion happens at the profile boundary, and transactions will reuse the same function.

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

**`SessionGuard` is applied per route, not as an `APP_GUARD`.** With one guarded endpoint, a
global guard would mean marking four routes `@Public()` to protect one. The switch point:
when guarded routes become the majority (PET-45's profile work), flip to `APP_GUARD` plus a
`@Public()` decorator on hello, register, login-link and verify.

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
holding `profile` (single row) and `categories`. Transactions and insights arrive there
later as ordinary migrations. In cloud mode the central database and every per-user one
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
module is deliberately separate from `layout.tsx` so anything else that renders these
styles can import the same loaders. The variable classes must land on `<html>`, which is
where `:root` resolves.

`npm test` runs `frontend/src/app/globals.test.ts`, which both asserts every documented
value and compiles the stylesheet through Tailwind's own `compile()` to confirm each
utility actually generates.

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
- **frontend**: generated API types are fresh, lint, unit tests, build
- **conventions**: commitlint over the PR's commit range

The two freshness steps are the drift gate described under Architecture. Both regenerate
a committed artifact and fail on a non-empty `git diff`. Note where each one lives: the
frontend half runs in the frontend job because `openapi-typescript` only reads the
committed JSON and needs no `backend/node_modules`.

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
- **`frontend/src/components/`.** Does not exist. Create it with your first shared
  component.
- **The frontend half of the access flow.** The backend is complete - verify provisions and
  returns a session, and `GET /api/auth/session` answers who a bearer is - but nothing on
  the frontend calls either: no verify page, no session cookie, no dashboard. The session
  cookie is the frontend's own httpOnly first-party one, forwarded server-side; the backend
  reads no cookies. The old proof-of-stack routes `POST /api/users` and `GET /api/users/:id`
  are **gone**, and the read's replacement is a session-scoped `getProfile()` with
  preferences, which is PET-45's rather than done.
- **The rest of the data model.** Only `users`, `login_links` and `sessions` (central) and
  `profile` and `categories` (per user) exist. Transactions and insights arrive with their features.
  `categories` has a table and a starter set but no CRUD, no stats and no allocation
  summary. Its starter colors are the real ones from Figma frame 03, read per chip from the
  design's variable bindings; note the palette has eight colors for ten chips, so two
  repeat and color alone cannot identify a category.
  component. The design tokens it will consume **do** exist, see Design tokens above.

`backend/README.md` is the stock NestJS starter README. Ignore it as a source of truth
for this project.
