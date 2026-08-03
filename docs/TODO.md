# TODO

Running list of work that is known, deliberately deferred, or unverified. Not a backlog of
ideas: everything here has a concrete reason to exist and enough detail to act on without
rediscovering the context.

Add an item when you defer something, and delete it when it lands. Items that grow past a
paragraph or two probably deserve their own plan in this directory.

---

## Deferred by design

These were decided against deliberately. Reasons are recorded so the decision is not
relitigated by accident.

### The frontend half of verification: the verify page, the cookie, the dashboard

The backend is done: `POST /api/auth/verify` spends a link, provisions the account and
returns a session, and `GET /api/auth/session` answers who the bearer is. Nothing on the
frontend calls either yet - there is no verify page, no session cookie, and no dashboard to
land on. The session-scoped `getProfile()` that replaces the deleted proof-of-stack
`GET /api/users/:id` is PET-45's, not this.

Three constraints that work inherits.

The token travels in a **query string**, so it lands in browser history and potentially a
`Referer` header - the accepted norm for magic links, bounded by the short single-use
window, but it means the verify page must load no third-party resources and must consume
the token immediately. (It no longer reaches backend access logs: verify takes the token in
a POST body.)

A failed send leaves the user with **zero** live links rather than the one they had, because
`issue()` supersedes the previous link before sending; "Resend link" (VER-2) is the only
recovery, and it is the design's own answer (A36).

**The wait behind the verify click is undesigned on purpose, and blank until measured.**
A33/A19 design no loading state, and verify is one blocking POST: on a first verify the
user who clicked the email link sits on a blank tab with only the browser's own loading
affordances while provisioning runs (estimated seconds; a returning user's verify is
effectively instant). A blank-and-brief wait after clicking a link is the normalized
OAuth/SSO-redirect experience and needs no design if the number stays small. The frontend
branch's first job is therefore to measure real cloud-mode provisioning latency, then
choose: keep the plain page-load wait, or take a designed waiting state to the designer.
A streamed "Signing you in..." shell is technically cheap (Suspense), but it is an
in-page loading state, exactly what the design deliberately lacks, so that path is a
design conversation before it is code.

### Handing a browser a token to sync with directly

`TursoPlatformService` documents but does not implement `mintUserDbToken(dbName, expiry)`,
the short-expiry variant of `mintDbToken` needed to let a client sync against its own Turso
database instead of going through this backend. Nothing needs it today - the access flow is
finished and never wanted it, because every read is served with the user's server-side
token - so it stays a documented signature until a client actually syncs.

### Sliding session expiry, as an explicit extension endpoint

Sessions fix their expiry at `SESSION_TTL_D` (30 days) and a unit test pins "validate
performs no UPDATE", so the whoami path stays one indexed read. Sliding
expiry inside `validate()` was rejected deliberately: it turns every authenticated read
into a central-database write (sync and `updated_at` churn, contention on the in-process
transaction chain), and it silently desyncs from the frontend's future cookie, whose
Max-Age would still die at the original 30 days however far the row was extended.

If monthly re-login ever becomes a real complaint, the design to reach for is an explicit
`POST /api/auth/session/extend` behind `SessionGuard`, called by the frontend on its own
policy - it already knows `expiresAt` from `GET /api/auth/session` - and answering with
the new `expiresAt` so the caller re-sets the cookie's Max-Age in the same round trip;
the two lifetimes then stay in sync by construction. The backend still enforces pacing
server-side with one conditional `UPDATE ... RETURNING` (extend only when, say, under 25
of the 30 days remain, so a hammering client produces zero-row updates rather than
churn), plus an absolute cap keyed on the existing `created_at` (never past creation +
90 days) so an extendable stolen token stays bounded. Rotating the token on extend is
the stricter variant if that ever matters. Purely additive: same table, same token, same
guard, no schema change.

### The rest of the data model

`users`, `login_links` and `sessions` (central) and `profile`, `categories` and
`transactions` (per user) exist. `insights` arrives with its own feature as an ordinary
migration under `backend/drizzle/user/`. `categories` has its table and a
`STARTER_CATEGORIES` constant but no CRUD, no per-category stats and no allocation summary.

`transactions` has its three write endpoints (PET-27) and **no reads whatsoever**. The list,
the month windows, the trend buckets, the donut and every card are PET-28's and the
dashboard tickets', and all of them are computed on read - the table carries no month column
and no stored aggregate on purpose, so nothing can go stale. A read implementing them needs
the profile's `monthStartDay` to attribute a `date` to a month; both indexes it will want
(`date`, `category_id`) already ship in the first migration.

Starter category colors are the real ones, read per chip from the design's variable
bindings in Figma frame 03 (node 43:705) and checked against a render. Two open design
questions remain, both for the designer rather than for code:

- **The palette has eight colors for ten chips**, so Subscriptions reuses Transport's blue
  and Other reuses Bills' orange. Colour therefore cannot identify a category on its own,
  which constrains any later legend, chart or filter that wants to key on it.
- **A7's conflict sits on the same seam.** The starter set includes Bills and
  Subscriptions, which never reappear, while later screens show Health and Other - and the
  duplicated colors are exactly on those chips. All ten are seeded until it is resolved.

### The transaction detail fields no form captures (A20)

The transaction detail mock (DET-8) shows **time, payment method, status and account**
alongside the fields that are really stored. No form anywhere in the design captures any of
them, and no screen lets a user set one, so PET-27 gave them no columns and
`CreateTransactionDto` no properties.

The consequence is deliberate and worth knowing before building the reads: because
`forbidNonWhitelisted` is on, sending one of those keys is a **400**, not a silently dropped
field. That is the safer direction - a dropped field would let a frontend believe it saved
something - but it does mean a client that codes from the detail mock rather than from the
generated types will get a rejection.

**PET-28 and PET-34 must answer them as empty or defaulted rather than hunting for a
column.** Two ways out when the designer is available: either the mock's values are
illustrative and the detail view drops them, or a form has to capture them and they earn
columns in a later migration. Until then A20 stands, and nothing should infer a payment
method from anything.

### Renaming the product from Expensa to Spendifico

Decided on 2026-08-02: the product becomes **Spendifico**. Not done yet, and the rename is
not uniform - one part of it is a data migration wearing a find-and-replace costume.

**Safe to change with a find and replace.** User-facing copy: the email subject and body
(`src/mail/login-link.template.ts`, currently "Your Expensa login link" and "Log in to
Expensa"), the frontend `<title>`, the OpenAPI document title in `src/openapi.document.ts`
(run `npm run api:sync` after, or CI's drift gate fails), README prose, and the wording
throughout `docs/project-management/`. `SYNC_CLIENT_NAME` (`expensa-backend`) is sent to
Turso for observability only and nothing keys on it.

**Not safe: `USER_DB_NAME_PREFIX` in `src/database/database.constants.ts`.** That prefix
feeds `userDbName(id)`, which derives both the remote Turso database name and the local
file path, and the result is persisted in `users.db_name`. Change the prefix and every
existing user's derived name stops matching both their central row and the database that
actually exists: `getUserDb` opens or creates the wrong file, and `deleteUserDb` - which
derives the name from the id on purpose, because its caller may have no row to read -
targets a database that is not there. Nothing errors loudly; people simply lose their data.

If it has to change, the prefix stops being derivable and `db_name` becomes the source of
truth: read it from the central row wherever a name is needed, and let the constant apply
to new users only. That is a real change to `UserDatabaseService`, not a rename, and it is
worth deciding whether the infrastructure naming needs to follow the brand at all.

The central database (`expensa-app`) is created by hand per the README, so renaming it
means creating a new one and moving the directory into it.

**Meanwhile the sender and the copy disagree.** `MAIL_FROM_NAME` is already `Spendifico`,
so the login email arrives from "Spendifico" while its subject and body still say Expensa.
Accepted deliberately until the rename lands, but it is the one email a stranger has to
trust enough to click, so it should not sit that way for long.

### `frontend/src/components/`

Does not exist. Create it with the first shared component.

---

## Operational

### Unverified registrations accumulate, and hold their address

Registering no longer costs a database, but it still writes a central row that holds the
email against the partial unique index. Nobody has to prove the address is theirs to do it,
so anyone can register an address they do not own and rows pile up for accounts that will
never be verified. The squatting itself is self-healing - a genuine owner's registration
overwrites the stashed payload, and only they can click the link - but the rows are not.
Give unverified rows an expiry and a sweep before this is deployed anywhere public.

### Gmail still threads the login emails

Observed on 2026-08-02 against a real inbox: four links to the same address collapsed into
one Gmail thread, because every message has an identical sender and subject. The user
therefore opens one conversation holding several indistinguishable emails, of which exactly
one works. That is the invalidation behaving as specified, and the sharp edge is now
answerable rather than a dead end: verify returns **409** for a superseded link, distinct
from the 401 every other dead token gets, so the verify page can say "this link was replaced
by a newer one, open the most recent email". If inbox confusion persists anyway, varying the
subject - appending a short local time is the usual trick - remains available, and costs
only a slightly uglier subject line.

### In cloud mode the remote is a schema behind, briefly

Observed on 2026-08-03 while smoke-testing verification against Turso Cloud: reading the
central database remotely moments after boot failed with `no such column:
onboarding_payload`, then succeeded a minute later with no intervening deploy.

That is the embedded replica working as designed rather than a migration failure.
Migrations are applied to the **local** replica at boot, and `turso-client.factory.ts`
pushes on the `TURSO_SYNC_INTERVAL_S` beat (60s by default), so for up to one interval the
cloud copy legitimately lacks both the new DDL and any rows written since. The app is
unaffected - it reads and writes its own replica - but anything looking at the remote is:
the Turso MCP, the CLI, Studio, and any dashboard. Worth knowing before someone debugs a
phantom "migration did not run" for a minute, and worth remembering when a deploy is
verified by querying the cloud database directly.

### Revoking a session is a manual tombstone

A39 designs no logout, so there is no endpoint that ends a session. A stolen or unwanted
bearer lives until its `expires_at`, and the only way to kill it sooner is to set
`sessions.deleted_at` by hand - `validate()` filters on it, so the next request with that
token answers 401. `sessions_user_id_idx` exists to make "revoke everything this person
has" one statement. Write the tooling before an incident needs it, not during one.

### A verify that fails twice can orphan a cloud database

Verification creates the user's database and persists the pointer to it inside one
compensated block: if either step fails, it deletes the database and rethrows. If that
delete _also_ fails, a cloud database exists that no row points at, the central row's
`db_url` stays NULL, and every later verification of that account 500s on the name
collision. The failure is logged in full by `VerificationService`, naming the database.

The fix is manual and one step: delete `expensa-user-<id>` through the Turso MCP server or
the Platform API - never the CLI, for the name-cache reason below. The next resent link then
provisions cleanly.

### Two verifies of one account can overlap, across a resend

`consume()` makes each _link_ single-use, but nothing serializes verification per
_account_: while a first verify is still provisioning (a window of seconds), a resend plus
a click on the new link starts a second verify against the same half-built account. In
cloud mode the second create then collides on the database name and its compensation
deletes the database out from under the first; in local mode both can pass the seed's
empty check and duplicate the starter categories. Reaching it takes a user who resends and
clicks while the first click has not answered yet, so it is accepted at this scale - the
same single-instance reasoning as the throttler and the migration lock. If it ever bites,
the shape of the fix is a per-user in-process queue around provisioning, which is the
`issueQueue` pattern `LoginTokenService` already uses.

### The auth throttler is in-memory, and blind behind a proxy

`@nestjs/throttler` uses its default in-memory storage, so the limit is **per backend
instance**: two instances give an attacker twice the budget. Same single-instance
assumption as the migration lock below.

Separately, the per-IP limiter (and the fallback key for bodies with no usable address)
keys on `req.ip`, which behind a reverse proxy or load balancer is the proxy's address
unless Express `trust proxy` is set. Every caller would then share one per-IP bucket, which
throttles everybody at once and protects nobody in particular; the per-email limiter is
unaffected either way. Set it when the deployment topology is known, not before - trusting
the header without a proxy in front lets a client spoof its own key.

### Token rotation is manual

By MVP decision every Turso token is created with **Expires: NEVER**: the control-plane
token, the central database token, and every per-user token minted at registration. There
is no refresh logic anywhere, which is the point. The cost is that a leaked token never
dies on its own.

Rotation is a deliberate ops action:

```bash
turso db tokens invalidate expensa-app        # central database
turso auth api-tokens revoke expensa-backend  # control plane
```

Per-user tokens live in the central `users.db_auth_token` column, so rotating those means
re-minting and updating the rows. No tooling exists for that yet; write it before it is
needed urgently rather than during an incident.

### The Turso CLI has a stale name cache, and it bites this project constantly

With CLI v1.0.31, `turso db shell expensa-user-<uuid>` reports "database not found" and
`turso db destroy expensa-user-<uuid> --yes` exits 0 having done nothing, while `turso db
show` and `turso db list` handle the identical name perfectly.

**Cause, confirmed on 2026-08-01.** The CLI caches the organization's database names in
`~/.config/turso/settings.json` under `cache.database_names`, with a short TTL. `db shell`
and `db destroy` resolve the name against that cache instead of the API. Any database
created by something other than this CLI is therefore invisible to them until the cache
expires. That is _every_ per-user database, since the backend creates them through the
Platform API, which is why `expensa-app` and `jura` work (both created via the CLI) and
`expensa-user-*` never does. Nothing to do with the name being long, which was the first
guess.

Note that `turso db list` does **not** refresh the cache, so the error message's advice to
"List known databases using turso db list" does not help.

Three ways around it, best first:

1. **Use the Turso MCP server.** It goes straight to the API and has no cache.
   `read_database`, `evolve_schema` and `delete_database` all worked on a
   freshly-created `expensa-user-<uuid>` in the same session where the CLI refused.
2. **Expire the cache**, after which the CLI falls back to the API and works:
   ```bash
   python3 -c "import json;p='$HOME/.config/turso/settings.json';d=json.load(open(p));d['cache']['database_names']['expiration']=0;json.dump(d,open(p,'w'))"
   ```
3. **Use the Platform REST API directly**, which is what the backend does:
   ```bash
   TOKEN=$(grep '^TURSO_ORG_TOKEN=' backend/.env | cut -d= -f2-)
   curl -X DELETE "https://api.turso.tech/v1/organizations/<org>/databases/<name>" \
     -H "Authorization: Bearer $TOKEN"
   ```

Worth retesting after a CLI upgrade; this looks like a plain bug rather than a design
decision. Inspecting the central directory is unaffected either way:
`turso db shell expensa-app "select id, email from users;"`.

### Text primary keys are nullable at the database level

SQLite's historic quirk lets a non-INTEGER primary key hold NULL, and the Turso engine
inherits it (verified with a direct insert). Both `id` columns carry `.notNull()` in the
Drizzle schemas, but drizzle-kit's sqlite DDL generator emits no `NOT NULL` for a
primary-key column, so the constraint exists only app-side: every id comes from `newId()`.
Two limitations were confirmed in `drizzle-kit@1.0.0-rc.4` while trying to fix this
properly:

- the sqlite **differ only sees created and dropped entities**, so any in-place change to
  an existing index or column (a new `where` clause, a new `NOT NULL`) generates
  `no_changes`. The partial email index worked around it by renaming the index;
- the sqlite **DDL generator drops `notNull` on primary-key columns** entirely, so even a
  rename-style workaround cannot produce the constraint.

The `.notNull()` stays in the schemas so a future drizzle-kit that fixes the generator
picks it up on the next diff. If that lands, expect a table-recreate migration for both
scopes; review it rather than being surprised by it.

### Deployment must ship `backend/drizzle/`

Migration folders are resolved from `process.cwd()`, because `nest build` emits only
JavaScript into `dist/` and leaves the SQL behind. Any future Dockerfile has to `COPY` the
`drizzle/` directory next to `dist/`, or the app boots and fails to migrate.

---

## Scaling, when it is actually needed

None of these matter at current scale. They are recorded so the limits are known rather
than discovered.

- **Connection cache is unbounded.** `UserDatabaseService` keeps every opened user database
  in a `Map` with no eviction. An LRU with an idle timeout is the obvious next step.
- **No cross-process migration lock.** A single backend instance is assumed. Two instances
  opening the same user database for the first time could both run its migrations.
- **Enumeration resistance is argued, not measured.** With the mail send floated off the
  request, every path through the two auth routes answers after at most one indexed read
  and one write into the local central database, so the timing difference should be
  negligible. The weakest spot is `register` against a verified account, which answers
  after the read alone - the only path that skips the write entirely, and therefore the
  most distinguishable one. Nobody has profiled the residual. If this ever has to be more
  than best-effort, it needs a measurement rather than an argument.
- **Login links and sessions are never purged.** Used, superseded and expired rows
  accumulate in `login_links` forever, and so do expired and revoked rows in `sessions` -
  one per login per device, none of which anything removes. Harmless at this scale, and the
  same purge policy that covers tombstones can cover both.
- **The embedded driver cannot overlap transactions.** One connection per database, and a
  second `db.transaction()` while one is open fails with "cannot start a transaction
  within a transaction" rather than queueing. `LoginTokenService.issue()` chains its own
  transactions in-process; a second transactional call site would need the same care, or
  a shared queue pushed down into the database layer.
- **Soft deletes are never purged.** Every table carries `deleted_at` for future sync, and
  reads filter it, but nothing removes tombstones. A purge policy is deferred until the
  sync design needs one. `transactions` is the first table a user can actually delete from
  through the API, so it is where this stops being theoretical: `DELETE
/api/transactions/:id` answers 204 and the row stays. PET-27's AC3 said "no soft-delete
  record"; that wording was re-derived from the delete dialog's copy without the sync
  consideration, and a hard delete risks row resurrection under delete-update conflicts once
  devices hold replicas. The tombstone is invisible through every endpoint, which is what
  "permanently" means to a client.
- **`toCents()` and `fromCents()` assume two-decimal currencies.** `src/common/money.ts` is
  `Math.round(v * 100)` and `v / 100`: fine for USD and EUR, wrong for JPY (zero decimals)
  and KWD (three). The API accepts any ISO 4217 code, so fixing it means a per-currency
  exponent table rather than a change at those two call sites. Note the blast radius grew
  with PET-27: it was one profile field written once at verification, and it is now every
  transaction amount in both directions, so a wrong exponent would misreport every number
  the dashboard shows rather than just a budget.
- **Offline conflict policy is undecided.** The schema is shaped for last-write-wins
  (UUIDv7 keys, epoch-ms timestamps, tombstones), but no client syncs yet and clock skew is
  unaddressed.

---

## Housekeeping

- **Repo-wide `prettier --check` is commented out in CI.** 55 files predate the Prettier
  config and the step would fail on a fresh clone. To enable: run `npx prettier --write .`
  once, commit that, then uncomment the step in `.github/workflows/ci.yml`. Note that
  `.lintstagedrc.js` only formats files under `backend/` and `frontend/`, so root-level
  Markdown such as this file is not covered by the pre-commit hook and has to be formatted
  by hand.
- **The swagger plugin renders `@IsPositive()` as `minimum: 1`.** Right for an integer,
  wrong for anything with decimals, and it publishes a constraint the API does not
  actually enforce. `RegisterDto.monthlyBudget` carries an explicit
  `@ApiProperty({ minimum: 0, exclusiveMinimum: true })` to correct it, and PET-27 added the
  second and third compliant fields, `amount` on both `CreateTransactionDto` and
  `UpdateTransactionDto`; any future money field needs the same line, and
  `test/openapi.e2e-spec.ts` now pins all three against a regression. Check the generated `backend/openapi.json` when adding a DTO
  rather than assuming the derived constraints are faithful - `@ArrayMaxSize` is simply
  dropped, for instance, which is a smaller version of the same thing. Two more live
  gaps, both in the permissive direction, so a client that codes to the spec can still be
  handed a 400: `RegisterDto.currency` is published as a bare string while
  `@IsISO4217CurrencyCode()` enforces the ISO 4217 list, and `monthStartDay` is published
  as `type: number` while `@IsInt()` rejects anything fractional. Neither has earned a
  hand-written `@ApiProperty` correction yet; `currency` is the one a frontend developer
  reading the generated `currency?: string` will trip over first.
- **`created_at` and `updated_at` can differ by a millisecond on insert.** Every table
  defaults the two from independent `$defaultFn(() => new Date())` calls, so an insert that
  straddles a millisecond boundary writes two different values - observed on a local
  transaction create as `.824Z` against `.825Z`. Harmless in itself, but it means
  `updatedAt === createdAt` is **not** a sound test for "never edited", and any code or test
  tempted to use it needs a tolerance instead. PET-27's e2e originally asserted equality and
  passed only by luck; it now asserts a sub-50ms window. Making them genuinely identical
  would mean the service passing one timestamp explicitly into both columns, which fights
  `$onUpdateFn` and deviates from the schema-level default every other table uses - not worth
  it unless something real needs exact equality.
- **No operation documents a 500, deliberately.** Resolved with PET-14: every route can 500
  through `AllExceptionsFilter`, so per-operation documentation restated the same
  non-actionable fact everywhere and widened every generated response union. The document
  description says it once instead, and `test/openapi.e2e-spec.ts` pins that no operation
  declares a 500. Keep new endpoints consistent with that.
