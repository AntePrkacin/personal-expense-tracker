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

### Link verification and sessions

The issuing half of the magic-link flow has landed: `POST /api/auth/register` and
`POST /api/auth/login-link` create accounts and send links, and `LoginTokenService.consume()`
is written and tested. Nothing consumes a link yet - there is no verify route, no session,
no guard, and therefore no authenticated endpoint. The proof-of-stack `POST /api/users` and
`GET /api/users/:id` are deleted; the read is replaced by a session-scoped `getProfile()`
with that work.

Verification also owns everything registration deliberately does not do: provisioning the
user's Turso database, inserting the profile from `users.onboarding_payload` (converting
`monthlyBudget` to cents at that boundary), calling `seedStarterCategories`, and clearing
the payload. `UserDatabaseService.deleteUserDb` is kept for its failure path.

`TursoPlatformService` documents but does not implement `mintUserDbToken(dbName, expiry)`,
the short-expiry variant needed to hand a browser a token it can sync with directly. That
is now verification's, since it is what makes "which user is asking" answerable.

Two constraints the verify page inherits. The token travels in a **query string**, so it
lands in server access logs, browser history and potentially a `Referer` header - the
accepted norm for magic links, bounded by the short single-use window, but it means that
page must load no third-party resources and must consume the token immediately. And a
failed send leaves the user with **zero** live links rather than the one they had, because
`issue()` supersedes the previous link before sending; "Resend link" (VER-2) is the only
recovery, and it is the design's own answer (A36).

**Gmail threads every login link into one conversation, and only the newest works.**
Observed on 2026-08-02 against a real inbox: four links sent to the same address collapsed
into a single Gmail thread, because every message has an identical sender and subject
("Your Expensa login link"). After a resend the user therefore opens one conversation
holding several visually indistinguishable emails, of which exactly one is valid - and
Gmail's "trimmed content" collapsing can hide the newest below a fold. Clicking the wrong
one is the likely outcome, not an edge case, and A38 designs no screen for a rejected
link, so today that is a dead end with no explanation.

This is the invalidation behaving as specified, not a bug in it, and it was invisible
until someone looked at an actual inbox rather than at a send API returning
`{"status":"queued"}`. Two ways out, and they are not exclusive:

- **Cheap.** Make each message its own thread by varying the subject - appending a short
  local time is the usual trick. Costs a slightly uglier subject line.
- **Proper, and PET-14's.** Have the verify page distinguish "superseded" from the other
  rejections and say so: "this link was replaced by a newer one, check your inbox for the
  most recent email." The schema already supports it - `superseded_at` and `used_at` are
  separate columns precisely so the cases stay distinguishable - but `consume()`
  deliberately returns a bare `null` for all four rejections, so telling them apart needs a
  richer return type. Weigh that against enumeration: the reason for the flat `null` is
  that the caller cannot learn anything, though here the holder of a real token is already
  the address owner, so the calculus differs.

### The rest of the data model

`users` and `login_links` (central) and `profile` and `categories` (per user) exist.
`transactions` and `insights` arrive with their own features as ordinary migrations under
`backend/drizzle/user/`. `categories` has its table and a `STARTER_CATEGORIES` constant but
no CRUD, no per-category stats and no allocation summary.

Starter category colors are the real ones, read per chip from the design's variable
bindings in Figma frame 03 (node 43:705) and checked against a render. Two open design
questions remain, both for the designer rather than for code:

- **The palette has eight colors for ten chips**, so Subscriptions reuses Transport's blue
  and Other reuses Bills' orange. Colour therefore cannot identify a category on its own,
  which constrains any later legend, chart or filter that wants to key on it.
- **A7's conflict sits on the same seam.** The starter set includes Bills and
  Subscriptions, which never reappear, while later screens show Health and Other - and the
  duplicated colors are exactly on those chips. All ten are seeded until it is resolved.

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
- **Login links are never purged.** Used, superseded and expired rows accumulate in
  `login_links` forever. Harmless at this scale, and the same purge policy that covers
  tombstones can cover them.
- **The embedded driver cannot overlap transactions.** One connection per database, and a
  second `db.transaction()` while one is open fails with "cannot start a transaction
  within a transaction" rather than queueing. `LoginTokenService.issue()` chains its own
  transactions in-process; a second transactional call site would need the same care, or
  a shared queue pushed down into the database layer.
- **Soft deletes are never purged.** Every table carries `deleted_at` for future sync, and
  reads filter it, but nothing removes tombstones. A purge policy is deferred until the
  sync design needs one.
- **`Math.round(v * 100)`** assumes two-decimal currencies. Fine for USD and EUR, wrong for
  JPY (zero decimals) and KWD (three).
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
  `@ApiProperty({ minimum: 0, exclusiveMinimum: true })` to correct it; any future money
  field needs the same line. Check the generated `backend/openapi.json` when adding a DTO
  rather than assuming the derived constraints are faithful - `@ArrayMaxSize` is simply
  dropped, for instance, which is a smaller version of the same thing. Two more live
  gaps, both in the permissive direction, so a client that codes to the spec can still be
  handed a 400: `RegisterDto.currency` is published as a bare string while
  `@IsISO4217CurrencyCode()` enforces the ISO 4217 list, and `monthStartDay` is published
  as `type: number` while `@IsInt()` rejects anything fractional. Neither has earned a
  hand-written `@ApiProperty` correction yet; `currency` is the one a frontend developer
  reading the generated `currency?: string` will trip over first.
- **`GET /api/hello` documents a 500; the auth routes do not.** Every route can 500
  through `AllExceptionsFilter`, so the asymmetry is arbitrary rather than meaningful:
  the auth routes document exactly 202, 400 and 429, and `test/openapi.e2e-spec.ts` pins
  that exact list. Decide one way when the next endpoint lands - either every operation
  carries `@ApiErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR)` or none does - and
  remember that widening the auth routes means updating the pinned test with them.
