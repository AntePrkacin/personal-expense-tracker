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
`fromCents()` on the way out. Four callers so far - `VerificationService` for the budget
the onboarding payload carries, `ProfileService` for the same budget on every read and
update, `TransactionsService` for amounts, and `CategoriesService` for caps and derived
totals - which is what the schema comments mean by the conversion happening at the service
boundary. A fifth place doing its own arithmetic is a bug.

**Every month-scoped figure resolves its period through `src/common/month-window.ts`, and
nothing else computes one.** `monthWindow(monthStartDay, today)` returns `YYYY-MM-DD` bounds
that are inclusive at the start and **exclusive** at the end, so a query reads `date >= start
and date < end`: text compared against the text column the schema stores, served as a range
scan by `transactions_date_idx`, with no last-day-of-month arithmetic anywhere. Nothing in the
file constructs a `Date`, because round-tripping a calendar date through one shifts it across
timezones - the same reason `transactions.date` is text.

`today` is a parameter rather than a clock read, which is what lets specs pin month-boundary
behaviour without faking timers, and it is formatted by `todayIn()` against **`APP_TIMEZONE`**
rather than UTC. UTC is wrong for everybody: just after local midnight on the boundary day a
transaction falls into the previous period, so the whole screen shows the wrong month for a
few hours, twice a month. One configured zone is right for every user this project has and
honest about not solving the general case; the per-user fix is in `docs/TODO.md`. The profile
constrains `monthStartDay` to 1-28 precisely so every month has the day and there is no
clamping case - anything outside that range throws, because it is a programming error rather
than input.

## Transaction endpoints

**Nothing this feature touches is derived, and nothing it returns is stored.** `GET
/api/transactions`, `GET /api/transactions/:id`, `POST /api/transactions` (201), `PATCH
/api/transactions/:id` (200) and `DELETE /api/transactions/:id` (204) all live in
`src/transactions/`. Every aggregate the UI shows - dashboard cards, trend buckets, the
donut, per-category totals, the allocation summary - is computed on read and **never
stored**, so there is deliberately no month column: month attribution is the `date` string
read against the profile's `monthStartDay` at query time, which is what makes a backdated
transaction land in its own month and a changed `monthStartDay` re-bucket history correctly.

**Neither read computes a month itself.** The list's period filter and the detail read's
category progress both come from `CategoriesService`, which owns the app's only month
aggregation - see Category endpoints. `TransactionsModule` imports `CategoriesModule` for
exactly that, its one import. A window resolved or a category summed in
`TransactionsService` would be a second copy of the same arithmetic behind a second screen,
and the Categories screen and the transaction detail would disagree the first time a status
threshold moved.

Eight things about the reads are easy to get wrong:

- **`period` defaults to `current`, so a bare `GET /api/transactions` hides rows.** That is
  deliberate: TRN-1 titles the screen with an overline naming one month and TRN-3 draws the
  filter already reading "This month", so one period is the designed default view. The
  alternative made every caller send `?period=current` to get the specified screen, and
  forgetting it would render all history under a header naming a single month. `period=all`
  is how you ask for history, and it applies no date predicate and reads no profile.
- **The period is a named window, never `?from=&to=`.** A free range lets a caller ask for a
  span that is not a budgeting period, and then every figure derived from it means something
  other than what the screen claims. The three values are `current`, `previous` and `all`.
- **`total` is the count after filters, and A17 was amended to say so.** The spec line reads
  as an account-wide count, but a badge that ignores the filter bar beneath it reports
  nothing useful. It equals `transactions.length` while there is no pagination and is
  returned as its own field anyway, so a future page size cannot silently turn TRN-2's badge
  into a page count.
- **The detail read's two context pieces have different windows, and that is the point.**
  `category` is the progress for the **current** period even when the transaction being
  viewed is older - the bar answers where the category stands now (AC4, and DET-4's own "this
  month" title). `recentInCategory` has **no date predicate at all**, because DET-5's mock
  reaches back a month. Serving both from one window is wrong in one direction or the other.
- **The sibling list excludes the transaction being viewed, at a limit of 5.** DET-5's first
  row _is_ the transaction whose page it sits on, already the header and the amount card, so
  A22's row set was amended. Five rather than the mock's three, so the exclusion costs the
  card nothing.
- **`search` matches the merchant only, and only folds ASCII case.** The note is captured but
  surfaces on no list row, so matching it would return rows whose reason the user cannot see.
  SQLite's `LIKE` does not fold non-ASCII, so a merchant name with diacritics matches only on
  exact case - a real gap for this project's own persona, recorded in `docs/TODO.md`. The term
  is trimmed in the DTO, and a whitespace-only term applies no predicate rather than `%%`. The
  term is also escaped before it reaches `LIKE`: `%` and `_` are wildcards to SQLite, not literal
  characters, so a merchant search for `10%` would otherwise also match `1000`. `escapeLikeTerm`
  in `transactions.service.ts` is the only place that builds this pattern, and it is why the
  predicate is a raw `sql` template rather than drizzle's `like()` helper, which has no `ESCAPE`
  clause to attach.

- **A `categoryId` can dangle, narrowly, and only `detail()` notices.** `assertCategoryExists`
  ahead of every write is a plain SELECT with no lock, and `DELETE /api/categories/:id` already
  tombstones, so a create or update racing that delete can still land a transaction pointing at a
  category gone a moment later. Every other read tolerates this silently - `categoryId` is
  returned verbatim and never re-validated. `detail()` is the one read that joins back to the
  category through `monthStatsFor`, and a `NotFoundException` from there is caught and rethrown
  as a plain `Error`, the same broken-invariant pattern `ProfileService` uses for a missing
  profile row: the id in the URL is fine, so the failure is a 500, not a 404 that would name the
  wrong resource.

Two smaller notes. The list's `ORDER BY` always carries `created_at` then `id` behind the
date, because a calendar day is shared routinely and without a tiebreak the list reshuffles
between two identical requests; both tiebreaks stay descending under `date_asc`. And **`GET
:id` must stay below any literal sibling path** in the controller, or Nest matches `:id`
first - there is no literal sibling today, so it is a note rather than a constraint, and the
failure would be a 400 from `ParseUUIDPipe` on a route that looks fine.

Four things about the write contract are easy to get wrong:

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
covers it. There is no `user_id` column to forget. Deletes tombstone (`deleted_at`), `PATCH`
guards on `deleted_at IS NULL`, and **every read filters on it too** - the list, the detail
row and the sibling list - so a deleted transaction cannot be edited back to life and cannot
be read back either. The row survives only so a future offline sync cannot resurrect it under
a delete-update conflict.

Four fields the transaction detail mock shows are **deliberately not accepted**: time,
payment method, status and account (DET-8, A20). No form captures them and no column stores
them, so `forbidNonWhitelisted` answers 400 rather than dropping them silently and letting a
frontend believe they were saved.

## Category endpoints

**One `Uncategorized` category exists per account, and it is a system row rather than a
chip.** `GET /api/categories`, `POST`, `PATCH /:id` and `DELETE /:id` live in
`src/categories/`. The ticket named the "Other" onboarding chip as the fallback every
deletion reassigns to; that would have made one row serve both as a user's free choice and as
a system invariant, so the roles were split. "Other" stays an ordinary chip anyone can rename
or delete, and `Uncategorized` is seeded at provisioning, offered on no screen, and never part
of `STARTER_CATEGORIES`.

It is found by an `is_fallback` column, not by its name. The flag is still needed even though
the name is immutable, because refusing the rename requires already knowing the row is
special - matching the string would also make "Uncategorized" a reserved word `POST` has to
block. A partial unique index (`where is_fallback = 1`) enforces "at most one"; provisioning
is what guarantees "at least one", and **no code repairs a database that predates the
migration** - every account that existed was a test account and was re-provisioned by hand.

Its color, `#98A0AE`, is the design system's `--color-text-tertiary` rather than one of the
eight category colors. White was chosen first and reversed: since this is the category the
transaction form preselects, it is likely to hold the largest donut slice, and white would
have rendered that slice, the legend swatch and the list dot as nothing.

Five things about the rest of it are easy to get wrong:

- **A cap is optional, and `0` is not how you say "no cap".** The ticket originally required
  one above zero, which would have made uncapped categories a legacy artifact the API could
  never produce again - every onboarding chip and the fallback arrive without one. Users are
  not forced to budget per category, so an absent cap is a first-class choice. A cap of
  exactly `0` is still a 400: it means "spend nothing here", which puts the category Over on
  its first transaction and is almost always an empty form field coerced to a number.

- **The status band is decided on stored cents, never on `percentUsed`.** Read literally the
  design's four bands leave a hole between 99% and 100% (CTG-5, A23). Comparing integers
  closes it with no judgement call and makes display rounding unable to move a category
  between bands - so a card can legitimately read 100% and say Near, which PET-36 has to
  round down for. Uncapped is the fifth band, with a null cap, percent, remaining and over.

- **The date predicates belong in the JOIN condition, not the WHERE clause.** The stats read
  is one grouped LEFT JOIN from `categories` to `transactions`. Moved into WHERE, the window
  bounds would filter out the category rows themselves, silently hiding every category that
  happened to have no spend this period.

- **The allocation summary ships inside the list response**, because frame 13 draws it as the
  header of the screen the cards are on. It is the one figure there that is time-independent -
  caps are monthly by definition, so no window enters into it. `unallocated` is returned
  **unclamped** and goes negative when caps exceed the budget (A43).

- **Delete is two ordered statements, not a `db.transaction()`.** Both tables are user-scope
  so a transaction is genuinely available, and it is refused for the reason under Access and
  sessions: the embedded driver refuses overlapping transactions, so a second call site means
  two quick deletes on one database collide. Reassign first, tombstone second - a failure in
  between leaves the transactions on `Uncategorized` and the category live but empty, which is
  visible and fixed by retrying, where the reverse strands rows pointing at a tombstone. The
  reassignment deliberately sweeps **tombstoned** transactions too, so the offline-sync record
  carries no dangling category id.

Renaming or deleting the fallback is a **409**, not a 403: the request is well-formed and the
caller is entitled to make it, it just conflicts with an invariant of the resource. Everything
else about that row - cap, color, icon, note - is editable.

The month window itself is `src/common/month-window.ts`, shared with PET-28 and PET-20 and
described under Backend conventions.

**`CategoriesService` is the app's only month aggregation, and other features compose it.**
Three public methods exist for that and for no screen of its own: `currentWindow(userId)` and
`previousWindow(userId)` hand out the windows, and `monthStatsFor(userId, categoryId)` returns
one `CategoryResponseDto` with its stats for the current period. The transaction reads use all
three and PET-20's dashboard uses the first two, while `period()` and `withSpend()` behind
them stay private so there is one copy of "resolve the window, then sum against it". `update()`
goes through `monthStatsFor` too rather than keeping a second copy, which is why it carries no
`.returning()`: the row comes back out of the stats read.

## Dashboard

**`GET /api/dashboard` computes nothing itself.** `src/dashboard/` has no imports from
`categories` or `transactions` tables at all - `DashboardService` composes `CategoriesService`
(the window, the per-category totals, the monthly budget) and `TransactionsService` (the
current period's rows, for the total, the weekly buckets and the recent-transactions card).
A window resolved or a month summed here would be the fourth copy of arithmetic that
`## Backend conventions`' money note already calls a bug at the third.

**This is the most expensive read in the app, and that is accepted rather than optimised
away.** `currentWindow`, `CategoriesService.list` and `TransactionsService.list` each resolve
the period independently, so one request reads the profile row up to three times. All three
land on the one connection `UserDatabaseService` caches per user, the database is small and
the caller's own, and the alternative - a shared `PeriodService` - would edit code in both
branches below this one to save a read nothing has measured as slow. That trade, and the
`PeriodService` idea itself, are in `docs/TODO.md`.

Five things about the figures are easy to get wrong:

- **The account-wide total is summed from the transaction list, never from the per-category
  rows.** A transaction whose category was deleted moments after it was created (see
  `TransactionsService`'s own note on that race) would not appear in any live category row, and
  summing categories instead would silently under-report `spent` - the one figure the top stat
  tile exists to get right. The same reasoning makes the donut's percentages relative to that
  total rather than to the sum of the slices: the two can disagree by the same rare margin, and
  disagreeing in the total would be worse.
- **`averagePerDay` divides by days elapsed, counting today, never by the days in the whole
  period.** Elapsed is the rate that answers "am I burning too fast"; dividing by the full
  period on day 2 makes a number that looks like success and means nothing. It is never zero,
  so there is no division to guard.
- **The weekly buckets anchor to the period start, not to ISO weeks**, because AC3 needs them
  to sum to the period total and ISO weeks do not: a period starting on the 5th would straddle
  two ISO weeks at each end and overshoot. Bucket _n_ covers `start + 7n` to `start + 7(n+1)`,
  clipped to the period end, so the last one is short rather than reaching past it. Each bucket
  carries its own `startDate`/`endDate` rather than a rendered label, which is what
  `addDays` in `src/common/month-window.ts` exists for - the one function in that file that
  inverts `toDayNumber` rather than only subtracting two of them, because a label needs an
  actual calendar date, not a day count.
- **An empty account's weekly series is an empty array, not five zero buckets.** Within an
  account that does have spend, a week with none still gets a zero-valued bucket - the chart
  draws a continuous axis and a missing week would compress it - but "nothing to chart at all"
  is a different state the empty-state frame replaces the chart for entirely.
- **`topCategory` ties break by name ascending, and `Uncategorized` is not excluded.** Two
  categories at the same spend is possible with round numbers, and `CategoriesService.list()`
  already returns its rows name-ascending, so replacing the running winner only on a strictly
  greater spend is enough - no separate tiebreak comparison is needed. Nothing here special-cases
  the fallback: whether the designer wants it excluded from this tile is an open question
  recorded on the ticket, not one this branch answers unasked.

**`insight` is always `null`.** AC6 wants the teaser from the most recently generated insight
set, and there is no `insights` table yet - `## Not built here` below still lists it. The field
ships in the contract now so PET-41 fills it in without a second `api:sync` churn and a second
frontend change for a field that was always going to exist. The amendment is recorded on the
ticket, per `docs/agents/conventions.md`.

**`TransactionsModule` exports `TransactionsService`, the same reason `CategoriesModule`
exports `CategoriesService`.** Without it, `DashboardModule` importing `TransactionsModule` for
the recent-transactions card cannot actually inject the service Nest resolves it to - a module
that provides something is not the same as a module that shares it.

Like `ProfileController`, there is no 404: a verified session implies a profile row, and its
absence is the broken invariant `CategoriesService.period()` already throws a plain `Error`
for, answered by the generic 500.

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

## Not built here

Treat these as planned, not available. This list exists so you do not build on something that
is not there. One bullet per capability, ordered alphabetically by its bold lead-in; when a
capability lands, delete its whole bullet and nothing else. Why each one is deferred, where
that was a decision rather than a queue, is in `docs/TODO.md`.

- **Insights has no table.** It arrives with its feature, as an ordinary user-scope migration.
