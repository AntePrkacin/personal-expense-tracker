# backend/CLAUDE.md

Guidance for Claude Code inside `backend/`. Root `CLAUDE.md` carries the rules that hold
everywhere and points here; this file is the authority for everything inside the NestJS app.
Runnable detail lives in the guides: commands in `docs/guides/commands.md`, environment
values in `docs/guides/configuration.md`, database procedures in `docs/guides/database.md`.

Two rules from root that bite hardest here, repeated because breaking them is silent: run
every command from `backend/`, and after changing anything a request or response body is made
of, run `npm run api:sync` from the repo root and commit both artifacts.

## Nest wiring

**Configuration goes through ConfigService.** `ConfigModule.forRoot({ isGlobal: true })`
is registered in `backend/src/app.module.ts`, so it reads `backend/.env` at startup and
`ConfigService` is injectable everywhere without re-importing the module. Read values
through `ConfigService`, as `main.ts` does, rather than scattering `process.env` through
the code.

**Global pipe and filter are DI providers, not `app.useGlobalPipes`.** `AppModule`
registers `APP_PIPE` (a `ValidationPipe` with `whitelist`, `transform` and
`forbidNonWhitelisted`) and `APP_FILTER` (`AllExceptionsFilter`). Doing it this way
rather than in `main.ts` means the e2e suite, which boots `AppModule` directly, gets the
same validation and the same error shape as production. Every failed request returns
`{ statusCode, message, error, timestamp, path }`; unknown errors are logged in full
server-side and reduced to a generic 500 outward.

## Access and sessions

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

## Backend conventions

Money crosses units in `src/common/money.ts` and nowhere else: `toCents()` on the way in,
`fromCents()` on the way out. Two callers so far, `VerificationService` for the profile and
`TransactionsService` for amounts, which is what the schema comments mean by the conversion
happening at the service boundary. A third place doing its own arithmetic is a bug.

## Transaction writes

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
per-user ones itself, at **verification** rather than registration - see Access and sessions
above.

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

## Environment

The variable table, the defaults and the two template files are in
`docs/guides/configuration.md`, which is their single home. What follows is why they behave
the way they do.

The backend **does** validate its environment: `ConfigModule.forRoot` takes a
`validationSchema` (Joi, `src/config/env.validation.ts`), so a typo fails at boot rather
than at first use. The four cloud variables are tied together with `.and()`, making a
half-filled `.env` an error instead of a silent fallback to local mode. drizzle-kit is the
exception: it reads raw `process.env` and never passes through Joi, which is why the two
`drizzle.*.config.ts` files repeat the `DATABASE_DIR` default themselves.

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
registration never reaches the real user directory, is in `docs/guides/email.md`. Run it whenever the mail path changes: it catches what a mocked spec cannot, the
standing example being the `Accept: application/json` header that MailPace requires and
Node's `fetch` does not send.

## The backend's half of CI

The backend job covers the persistence layer without any Turso credentials: `test-e2e`
runs in local mode against files in a temp directory (see Keeping tests off the cloud), and
`npm ci` resolving the `@tursodatabase/*` native bindings on `ubuntu-latest` is itself the
check that those platform binaries are available there. Both are confirmed working.

## Not built here

Treat these as planned, not available. This list exists so you do not build on something that
is not there. One bullet per capability, ordered alphabetically by its bold lead-in; when a
capability lands, delete its whole bullet and nothing else. Why each one is deferred, where
that was a decision rather than a queue, is in `docs/TODO.md`.

- **Categories have no endpoints.** The table and a starter set exist; there is no CRUD, no
  month stats and no allocation summary. The starter colors are the real ones from Figma frame
  03, read per chip from the design's variable bindings, and the palette has eight colors for
  ten chips, so two repeat and color alone cannot identify a category.
- **Insights has no table.** It arrives with its feature, as an ordinary user-scope migration.
- **The profile read.** The old proof-of-stack routes `POST /api/users` and `GET /api/users/:id`
  are **gone**. Their replacement is a session-scoped `getProfile()` with preferences, which is
  PET-45's rather than done, and it owns `monthStartDay` and `monthlyBudgetCents` that every
  later month-scoped read derives from.
- **Transaction reads.** `transactions` has the three write endpoints above and **no reads at
  all**. The list, the month windows and every aggregate the designs show are PET-28's and the
  dashboard tickets', all computed on read and never stored.
