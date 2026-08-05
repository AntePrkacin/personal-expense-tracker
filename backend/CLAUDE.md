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
`fromCents()` on the way out. Three callers so far - `VerificationService` for the budget
the onboarding payload carries, `ProfileService` for the same budget on every read and
update, and `TransactionsService` for amounts - which is what the schema comments mean by
the conversion happening at the service boundary. A fourth place doing its own arithmetic
is a bug.

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

## Profile and preferences

**One resource with two homes, and `ProfileService` is the only place that sees the seam.**
`GET /api/profile` and `PATCH /api/profile` live in `src/profile/` and serve the Settings
page and the sidebar footer. There is no `/profile/{id}` and no id in any signature - the
resource is always the session's own, so cross-user access is structural rather than
policed. `email` is the login identifier and lives on the central `users` row; the other
five fields live in the caller's own single-row `profile` table. The read never touches
central at all, because `SessionService.validate` already joins `users` on every request,
so the principal's address cannot be stale and a second lookup would buy a round trip for
a value already in hand.

Five things about the update are easy to get wrong:

- **The `PATCH` is tri-state minus its middle case.** Absent is unchanged and a value sets,
  but **no field accepts null**, because every profile column is NOT NULL. Every field
  carries `@ValidateIf((_, v) => v !== undefined)` and none carries `@IsOptional()`, which
  would skip validation for null as well as undefined.

- **An empty body is a 400** before any database is opened, the `UpdateTransactionDto`
  reasoning exactly: a bare UPDATE would bump `updated_at` through `$onUpdateFn`.

- **A body carrying only the address you already have is a 200, not that 400.** The
  Settings form saves the whole page at once (SET-5), so resubmitting an unchanged address
  is ordinary rather than an error. Both sides of that comparison are normalized, or a
  differently cased address would read as a self-conflict. An email-only `PATCH` selects
  rather than issuing an empty UPDATE, so the profile's `updated_at` does not move for a
  change that happened in another database.

- **A taken address is a 409, and the disclosure is deliberate.** Unlike the public auth
  routes, whose identical 202s exist to defeat enumeration, an authenticated Settings form
  cannot tell a typo from a taken address unless it is told. It sits behind no throttler;
  the trade-off and the pre-check race it leaves are in `docs/TODO.md`.

- **Write order is the only atomicity there is.** No cross-database transaction exists, so
  the 409 pre-check runs before either write, the user database is written first, and
  central's email strictly last - a profile that saved is never contradicted by a directory
  that did not.

**A missing profile row answers 500, not 404.** Verification inserts it before clearing the
onboarding payload, so a verified session implies one exists and its absence is a broken
invariant: the service throws a plain `Error` naming the user id. A documented 404 would
invite a "create your profile" flow that has nothing behind it, which is why neither
operation declares one.

## Persistence

The persistence layer has its own file, `backend/src/database/CLAUDE.md`, which loads
whenever the work is under `backend/src/database/`. It is the authority for the two driver
modes, the database-per-user design and what follows from it, the migration scopes and the
table conventions, and the two mechanisms that keep the test suites off Turso Cloud. Read it
before writing a schema, a migration, or anything that opens a database.

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
runs in local mode against files in a temp directory (see `backend/src/database/CLAUDE.md`,
What the test setup works around), and
`npm ci` resolving the `@tursodatabase/*` native bindings on `ubuntu-latest` is itself the
check that those platform binaries are available there. Both are confirmed working.

## Deployment

The commands, the first-time setup and how to verify a deploy are in
`docs/guides/deployment.md`. What follows is why the deployment has the shape it has, because
almost every constraint here is one the persistence design imposed rather than a hosting
preference.

**Exactly one instance, and it is not a preference.** The architecture is a local replica synced
to the cloud, so a second process is a second replica set with its own unpushed writes.
`LoginTokenService.issue()` wraps supersede-then-insert in a transaction and `consume()` is a
single conditional `UPDATE ... RETURNING`, but both are atomic only _within_ one replica - two
instances mean two live login links, or one token consumed twice. The throttler's storage is
in-memory, so the auth rate limits would also become per-instance, and nothing holds a
cross-process lock while migrations run. This is what ruled out a serverless host, and it is why
`fly deploy` is always run with **`--ha=false`**: that flag defaults to true, creates a spare
machine, and no setting in `fly.toml` overrides it. A volume can only attach to one machine, so
the platform partly enforces the rule, but relying on that rather than on the flag is relying on
an accident.

**The machine runs continuously, and autostop was rejected on evidence rather than on
principle.** It was configured, deployed and measured, so the numbers are recorded here to save
anyone repeating it. It is _not_ a breach of the single-instance rule, which is the obvious
objection and a wrong one: stopping and starting are operations on _the_ one machine, while a
second replica set only ever comes from `--ha` or autoscaling. It also does not skip the flush -
an autostop sends the configured `kill_signal` and honours `kill_timeout`, and the shutdown
bracket was observed completing on an autostop, with the health check not keeping the machine
alive either. What killed it was the resume: about **15 seconds** to serve the first request
after idling, of which roughly 9 is the app and the rest is Fly starting the machine, against
about 200ms warm. And Fly exposes **no way to tune the idle delay** - the proxy's stop loop runs
on its own schedule and decides on excess capacity, while `idle_timeout` is an HTTP connection
setting rather than this. So the choice was 15-second first impressions or roughly $3.32 a month,
and the money won. One further wrinkle if it is ever reconsidered: `register` floats its token
issue and mail send rather than awaiting them, and `onApplicationShutdown` does not await that
promise, so a stop landing in that window answers 202 and sends nothing.

**The kill timeout is raised far past Fly's default of 5 seconds** because
`DatabaseModule.onApplicationShutdown` closes every open user replica and then the central one,
each `close()` doing a final `push()` over the network, with no timeout of its own. That final
push is the last chance for a locally-committed write to reach Turso Cloud. A stop cut off
half-way through loses those writes silently, which is the same failure a serverless host would
have had, arriving by a different door - so the shutdown brackets itself with two log lines. An
opening line with no closing line is the signal, and it is the only reason the ticket's central
check is observable at all: both failure paths inside only `warn`, so before those lines a
truncated flush and a clean one looked identical.

**The image must carry `drizzle/` at the working directory.** `CENTRAL_MIGRATIONS_DIR` and
`USER_MIGRATIONS_DIR` resolve from `process.cwd()`, and `nest build` emits only JavaScript, so
the SQL has to be copied beside `dist/`. Forgetting it does not break the build or the boot: the
migrator throws on the first migration instead, which for a user database means one person's
first authenticated request rather than a failed deploy.

**The container runs as root, deliberately for now.** Note the trap before "fixing" it: Fly
mounts volumes root-owned, so adding `USER node` without a `chown` or an init step turns the
`mkdir(DATABASE_DIR)` at boot into a permission error. Either change both together or leave it
alone on purpose. Observed on the first deploy: as root, `mkdir /data/databases` succeeds and the
sync engine writes its `-wal`, `-info` and `-log` siblings there without complaint.

**Trusting the proxy is configuration that defaults to off.** `TRUST_PROXY_HOPS` exists because
the per-IP throttler keys on `req.ip`, which behind a proxy is the proxy. It is a hop count
rather than a boolean because Express's `trust proxy: true` trusts every hop, which lets a client
prepend its own `X-Forwarded-For` and pick a fresh bucket per request - so the careless value is
worse than the bug. It defaults to 0 because local development, CI and the e2e suite have nothing
in front, and only the deployment raises it. Nothing tests the wiring: no suite boots `main.ts`,
which is also true of CORS and the Swagger setup, and it cannot move into `AppModule` (where this
repo puts globals so e2e sees them) because it needs the HTTP adapter that exists only after
`NestFactory.create`.

**The deploy is manual, and that order was deliberate.** Automating it is PET-55. Automating
before a manual `fly deploy` had ever succeeded would make a red CI run indistinguishable from a
bad `fly.toml`, a bad Dockerfile or a missing secret.

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
- **Transaction reads.** `transactions` has the three write endpoints above and **no reads at
  all**. The list, the month windows and every aggregate the designs show are PET-28's and the
  dashboard tickets', all computed on read and never stored.
