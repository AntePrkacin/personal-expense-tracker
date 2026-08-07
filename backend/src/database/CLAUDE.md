# backend/src/database/CLAUDE.md

Guidance for Claude Code inside `backend/src/database/`: the drivers, the two modes, the
database-per-user design and everything that follows from it. `backend/CLAUDE.md` is the
authority for the rest of the NestJS app and loads alongside this file; root `CLAUDE.md`
carries the rules that hold everywhere. Runnable detail lives in the guides: local database
files and Turso Cloud procedures in `docs/guides/database.md`, the variable table in
`docs/guides/configuration.md`.

This file exists because `backend/CLAUDE.md` passed 400 lines when the profile endpoints
landed, which is the promotion trigger `docs/agents/conventions.md` sets. It is one directory
deeper, so it loads only when the work is actually in the persistence layer.

## Drivers and the two modes

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

## Database per user

**Database per user.** A small **central** database (`users`: id, email, and a pointer to
that person's database) exists because identity must resolve by email before the per-user
database is known. Everything else about a person lives in **their own Turso database**,
holding `profile` (single row), `categories` and `transactions`. Insights arrive there
later as an ordinary migration. In cloud mode the central database and every per-user one
live in a single group, `TURSO_GROUP` (default `decode-pet`); the backend creates the
per-user ones itself, at **verification** rather than registration - see
`backend/CLAUDE.md`, Access and sessions.

**The Turso CLI cannot address a per-user database, and fails silently at it.** `turso db
shell` and `turso db destroy` resolve names against a local name cache in
`~/.config/turso/settings.json`, not the API, so every `spendifico-user-<uuid>` database -
created by the backend through the Platform API - is invisible to them: `db shell` says
"database not found" and `db destroy` exits 0 having deleted nothing. `db show` and `db
list` hit the API and work on the same name. Use the Turso MCP server (`plugin:turso`)
instead, which has no cache; `docs/TODO.md` has the full write-up and the cache-expiry
workaround. The central database has a short CLI-created name, so the CLI is fine there.

Central carries three deliberate exceptions to "email and a pointer". `login_links` is there
because a link is consumed before we know - or, for an unverified account, before there
even is - the user's own database, and `sessions` for the same reason one step later: a
bearer is validated before anything knows which database to open. `users.onboarding_payload`
is there because the registration form is collected before the address is proven and the
profile it becomes lives in a database that does not exist yet; it is transient, written at
registration and set NULL by verification, and it holds `monthlyBudget` in **major** units
with the DTO defaults already applied. None of them is a licence to put more profile data in
central.

**A fourth exception arrived with PET-64, and it is the first that is not about a credential
outliving the database it belongs to.** `colour_templates`, `icon_templates` and
`category_templates` hold what onboarding _offers_ and what a category picker _offers_: which
default categories exist, and which colours and icons a user may choose from. That is not user
data at all - it belongs to nobody, it is the same for everybody, and a **super admin** edits
it, which is the whole reason it cannot stay a TypeScript constant. The rule above about
constraining closed sets in TypeScript rather than in SQLite holds for a set that only changes
with a deploy; an admin-editable set is not that, it is data, and central is the only database
that can hold it. A user's own database keeps holding only that user's own categories:
provisioning **copies** name, colour, icon and description out of a template into a
`categories` row, and nothing reads across afterwards, so an admin editing a template does not
reach back into anybody's account. Read this as sanctioning **template** data specifically, not
as a second door for profile data.

Two things about those tables are load-bearing. They reference a **code-side allowlist**
(`central/template-tokens.ts`), never a free-form colour or icon name, because Tailwind cannot
build a class from runtime data and `lucide-react` imports by name at build time - that
constraint is what keeps `@IsIn` publishing a real OpenAPI enum, and therefore keeps the
frontend's class and icon maps exhaustiveness proofs. And the seed runs **programmatically at
boot**, in `openCentralDatabase` right after `migrate()`, guarded on "any `category_templates`
row exists": root `CLAUDE.md` forbids hand-editing generated migration SQL, and the guard is
not only idempotence - it is what stops a restart re-creating a template an admin deliberately
deleted.

**Tokens.** Creating databases and minting their tokens are control-plane operations that
no data-plane token can perform, so `TURSO_ORG_TOKEN` is used in exactly one place
(`TursoPlatformService`) at provisioning time. It does not have to be an organization-wide
token: minting it scoped to the group with just `db:create`, `db:delete` and
`db:mint-token` covers everything the service does. Each user database is then reached with
its own minted data-plane token, stored in the central row and never serialized into an API
response. By MVP decision every Turso token is created with **Expires: NEVER**: no refresh
logic anywhere, rotation is a manual ops action.

## Migrations and schema conventions

**Migrations are committed and applied programmatically**, in
`backend/drizzle/central/` and `backend/drizzle/user/`. Note the v1 RC layout: one
directory per migration named `<YYYYMMDDHHMMSS>_<slug>`, holding `migration.sql` and the
`snapshot.json` that `generate` diffs the next one against, with no `meta/_journal.json`.
Both files are committed. The central database is migrated by the `APP_DB` async factory
before Nest finishes booting; a user database is migrated on first open, so adding a
migration upgrades every existing user the next time they are touched. There is no
`db:migrate` script, because N user databases cannot be migrated from a CLI. Consequence
for deployment: `drizzle/` is resolved from `process.cwd()`, so a future Dockerfile must
`COPY` it next to `dist/`.

**A user-scope migration runs against live data, unattended, one user at a time**, which
constrains what it may contain. There is no operator step and no window to inspect the
result: the first request that touches a person's database applies it, and a failure
surfaces as a broken request for that one user rather than a failed deploy. So a new column
must be nullable or carry a default - a bare `NOT NULL` add fails against any database that
already has rows - and a migration that cannot be made safe that way needs to be split into
an additive step now and a tightening step once the data is known to be backfilled.

**Conventions worth knowing before writing a table.** Primary keys are UUIDv7 text
(`src/common/ids.ts`). Money is integer minor units in `*_cents` columns; the API speaks
major units and the service converts. Instants are `integer` epoch-ms
(`{ mode: 'timestamp_ms' }`) set app-side with `$defaultFn`/`$onUpdateFn`; calendar dates
will be `text` `YYYY-MM-DD`. Every table carries a nullable `deleted_at` for future sync
and reads filter it with `isNull(deletedAt)` - the tombstone is invisible through the API,
which still deletes permanently as far as a client can tell.

## What the test setup works around

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

**One `DATABASE_DIR` must not serve both modes, and the failure is silent in one direction.**
Both modes use the same paths - `app.db` and `users/<db-name>.db` - but cloud mode opens them as
sync replicas and local mode as plain files. Rows written while the file was a plain local file are
not in the sync engine's change log when it later adopts that file, so `push()` never sends them
while every later write pushes normally. The replica syncs; those rows simply do not. PET-60 hit
exactly this: a local seed run put `dummy@spendifico.eu` in the central replica, a later cloud run
pushed everything except that row, and the deployed backend could not find the account - answering
the usual empty 202 and mailing nothing. Deleting the central replica and letting it re-bootstrap
from the cloud is the repair; separate directories are the prevention.

**Three callers now share that pattern, and a fourth should copy it rather than invent
something.** `test/setup-e2e.ts` under `NODE_ENV=test`, `src/openapi.env.ts` under
`OPENAPI_EMIT`, and `src/scripts/seed-showcase.env.ts` under `SEED_LOCAL`. Each is a
side-effect-only module that scrubs `TURSO_*` out of `process.env` and sets the flag
`AppModule` reads, and each must be imported before `app.module.ts` - `ConfigModule.forRoot()`
is evaluated inside the `imports` array, so it runs at import time. The seed script is the one
where the mistake would be visible rather than silent: it is a developer-facing command, so
`--local` reaching Turso Cloud would provision a real database under a name that says
`dummy`.

## Not built here

`backend/CLAUDE.md` carries the list, under its own `## Not built here`, and it loads
alongside this file whenever the work is in the backend. That list is the single home, so
nothing is restated here.
