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
open and migrate it, insert the profile, seed the picked categories, seed the account's first
`period_rules` and `budget_history` rows, and clear the payload **strictly last**, because while it
is set it is both the profile's source data and the "this may be unfinished" marker.

**Those two seed rows are what establish the invariant every period read depends on**, and PET-72's
one subtle decision here is where their anchor comes from. Both take the _same_ anchor, computed once
in `provisionAccount` as `mostRecentAnchor(monthStartDay, today, SEED_ANCHOR_MONTHS_BACK)` - twelve
months back - and passed in rather than re-read. Three things follow. It is **twelve months back
rather than the current period**, because an anchor at today would sort _after_ any retroactive
schedule change and leave two rules claiming one span; twelve is what makes the whole of Settings'
nine-month window reachable. It is computed **once** rather than by each seed, because two clock
reads either side of midnight can disagree and the budget would then be anchored to a period the rule
does not start. And this is deliberately the one place that injects `ConfigService` rather than
`PeriodService`: the service resolves periods _from_ the rules, so asking it to help write the first
one is asking it to depend on the invariant being established already. Then a session, then the response. Nothing here is floated, unlike
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
cookies here (the frontend owns that) and no refresh, and revocation means tombstoning the
row - which a user can now do for themselves, see the logout paragraph at the end of this
section. Concurrent sessions per user are legitimate, one per
device. `GET /api/auth/session` returns only `{ userId, email, expiresAt }`, because that is
all central knows.

**`SessionGuard` is an `APP_GUARD`, so every route is guarded unless it says otherwise.**
It arrived per-route, back when one endpoint was guarded and marking four public ones to
protect it would have been absurd; the transaction endpoints tipped the balance and PET-27
made the flip. Exactly **five** routes carry `@Public()` (`src/auth/public.decorator.ts`):
health, register, login-link, verify and PET-64's `GET /api/templates/categories` - the first
public route that is not part of getting a credential, and public because onboarding step 2
draws its chips before an account exists. See `## Templates`. **Note the failure direction reversed**, which is
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

**`POST /api/auth/logout` is the fifth auth route and the one that ends a session (PET-84), so
"no logout by design (A39)" is history wherever this file or the schema still says it.** The
product owner overruled A39; the designer never drew a control, so the sidebar footer's glyph,
its label and the absence of a confirmation step are the frontend's invention and owe a sign-off
with the rest of A29's list. Five things about the endpoint are decisions rather than shape.

It **revokes only the bearer it is called with**, keyed on the token hash, so a second device
stays signed in. `sessions_user_id_idx` is what a "sign out everywhere" would key on instead, and
that belongs on Settings as its own explicit control rather than as a side effect of the footer -
concurrent sessions per device are legitimate, so signing a phone out because a laptop was tidied
up would be a surprise nothing on screen warned about.

It is **guarded rather than `@Public()`**, so the count above stands: exactly five routes carry
`@Public()` and this is not one of them. The consequence worth knowing is that **it is not
repeatable**: the call revokes the very token it was authenticated with, so a second attempt is a
401 from the guard rather than a second 204. PET-84 shipped with an idempotence criterion asking
for the opposite and it was **amended on the ticket** rather than implemented, because satisfying
it literally would mean making a mutating route public to buy a status nobody reads.

`SessionService.revoke()` guards its UPDATE on `isNull(deletedAt)`, which **keeps the first
tombstone rather than overwriting its timestamp** - the same reason `login_links` invalidation
uses two distinct columns, so "when did this session end" stays answerable from the row. Matching
zero rows is not an error.

The handler takes **`@BearerToken()`**, a param decorator beside `CurrentUser`, because
`SessionPrincipal` carries no token and no session id and the guard discards what it parsed. That
shape is not cosmetic: `@Headers('authorization')` in the controller made the Swagger plugin
publish a required `in: header` parameter, so the operation documented `Authorization` twice -
once as the `bearer` security scheme and once as an explicit input - and it was the only operation
in the spec that did. Caught by reading the `api:sync` diff, not by a gate, since both forms build
and both answer 204.

It **skips both limiters**, which is `session`'s treatment for `session`'s reason plus one of its
own: there is no repeatable action here to spend a budget on. The `email` skip is the mandatory
half (no address to key on), and the suite proves that one; the `ip` half is unprovable in e2e
because `AUTH_RATE_IP_LIMIT` is 1000 there, exactly as `session`'s own skip is unprovable.

## Backend conventions

Money crosses units in `src/common/money.ts` and nowhere else: `toCents()` on the way in,
`fromCents()` on the way out. Four callers so far - `VerificationService` for the budget
the onboarding payload carries, `ProfileService` for the same budget on every read and
update, `TransactionsService` for amounts, and `CategoriesService` for caps and derived
totals - which is what the schema comments mean by the conversion happening at the service
boundary. A fifth place doing its own arithmetic is a bug.

**Every period-scoped figure resolves its period through `PeriodService`, and nothing else
resolves one.** That paragraph used to name `monthWindow(monthStartDay, today)` in
`src/common/month-window.ts` as the single owner, and PET-72 replaced the function without
changing the rule: a period is no longer derivable from one number, so the resolution reads a
history. `src/periods/period.service.ts` is the only thing that reads `period_rules`, and
`src/common/period-rules.ts` is the pure walk under it - no clock, no database, so its 40 cases
pin every boundary without a fake timer or a connection. Both halves of the old shape survive.
Bounds are still `YYYY-MM-DD`, inclusive at the start and **exclusive** at the end, so a query
still reads `date >= start and date < end`: text against the text column the schema stores,
served as a range scan by `transactions_date_idx`, with no last-day-of-month arithmetic
anywhere. And nothing constructs a `Date` from a calendar date, because round-tripping one
through a `Date` shifts it across timezones - the same reason `transactions.date` is text.

**A period is anchored to a paycheck, which is what the history is for.** A `period_rules` row
says "from this date, periods start on day N", and periods tile forward from it with no gap.
Change the pay day and the change is anchored to **T**, the first paycheck under the new
schedule: salaries are paid in arrears, so the old schedule's last paycheck never arrives, which
means the boundary immediately before T is **removed** and one stretched **transition period**
runs from the last kept boundary up to T. That period keeps the **old** budget, because it is
the span the old paycheck was spent against. T may be retroactive, which re-shapes periods from
then on, or in the future, which stretches the current period up to it. `transitionStart` is
**stored on the rule rather than derived** by the walk: the decision about which boundary was
removed belongs to the write that made it, and a walk that re-derived it would have to know the
whole future of the history to answer a question about its past.

**Three histories, one shape.** `period_rules`, `budget_history` and `category_cap_history` are
all append-only and effective-dated, all resolved on read, and all resolved the same way: the
newest row whose `effective_from` is at or before the period's start. That is the whole of what
PET-72 changed - a budget, a cap and a pay day were single settings, so raising the budget in
2026 silently re-priced every month of 2025. `backend/src/database/CLAUDE.md` owns the tables;
what belongs here is the one asymmetry between them. **A budget falls back and a cap does
not.** `budgetCentsFor` reads the earliest row for any period older than it, because an account
always had _some_ budget; a cap with no row at or before the period is **uncapped**, because a
sparse history is how an uncapped category is represented. So the seed and the fixture both
anchor every history at or before the oldest transaction rather than at today, or every period a
user can navigate back to would report every category uncapped.

`today` is a parameter rather than a clock read, which is what lets specs pin boundary behaviour
without faking timers, and it is formatted by `todayIn()` against **`APP_TIMEZONE`** rather than
UTC. UTC is wrong for everybody: just after local midnight on the boundary day a transaction
falls into the previous period, so the whole screen shows the wrong period for a few hours. One
configured zone is right for every user this project has and honest about not solving the general
case; the per-user fix is in `docs/TODO.md`. `MAX_MONTH_START_DAY` is **28** for the reason the
profile's own constraint always gave - every month has the day, so there is no clamping case -
and a day outside 1-28 reaching the walk throws, because it is a programming error rather than
input.

**`PeriodService.current()` returns the period _and_ the `today` it resolved from**, which is not
redundancy. Two consumers need the day itself: the dashboard's `daysLeft`, and its `daysElapsed`.
Resolving the period and then reading the clock a second time is a real defect rather than a
theoretical one - the two reads can straddle midnight, and the figure that goes wrong is the one
the card is about.

**Money crosses two decimal places and the currency allowlist is why.** `toCents()` and
`fromCents()` assume an exponent of 2, so `src/common/currency.ts` publishes
`SUPPORTED_CURRENCIES` - every code on it exponent-2, and the list itself is that file's to count
rather than a number to restate here - with `DEFAULT_CURRENCY = 'EUR'`

- and `UpdateProfileDto` validates against it rather than against `@IsISO4217CurrencyCode()`.
  That validator accepts `JPY` and `KWD`, whose exponents are 0 and 3, and either one turns every
  figure in the app into a silent factor of 100 or 1000. A wider list is a real feature and it
  needs a per-currency exponent first; `docs/TODO.md` carries it.

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

## Receipt scanning

**`POST /api/transactions/scan` (PET-59) extracts a transaction's fields from a photo or PDF
of a receipt, and stores nothing.** The image is read in memory, sent to Gemini, and discarded;
nothing about the request reaches a database column. It lives on `TransactionsController`,
declared above `GET :id` as that class's own note on route order explains, and its two
collaborators, `ReceiptScanService` and `ReceiptExtractionService`, are split so a spec can
mock the SDK wholesale without touching the database reads.

**A model that returns the same id it was given, or none.** The prompt hands Gemini the
caller's live categories as `{id, name}` pairs and asks for the same id back; `ReceiptScanService`
then validates `categoryId` against that same list and **drops** anything that fails to match,
reporting the field in `missing` rather than falling back to `Uncategorized`. A silent fallback
would render as a confident categorization and quietly mis-file the expense, where a missing
field asks the user to pick. `date` and `amount` get the identical treatment for the identical
reason: a model's answer is not a validated DTO, and trusting an invented value only moves the
failure downstream. `note` is deliberately never reported in `missing` - a receipt may carry
nothing worth noting at all, so its absence is not something another photo would fix.

**The merchant history is capped at the top 50 by transaction count, over the past year, and
the cap is the point.** Unbounded, `seed-showcase.ts` alone would put hundreds of rows into the
prompt on every scan - paid for in latency, in tokens, and on the free tier in exactly the data
Google retains. `MERCHANT_HISTORY_LIMIT` and `MERCHANT_HISTORY_DAYS` in
`transactions/receipt-scan.constants.ts` are named constants for exactly that reason: the
number is meant to be tuned against a real prompt, not rediscovered. The query groups by
merchant and category in one pass and folds the per-category breakdown in memory, because
ranking merchants by their total count while also breaking each one down by category is two
different groupings over the same rows.

**The key is optional, and `/scan` has a defined keyless answer.** `GEMINI_API_KEY` is
unpaired in `env.validation.ts`, matching the contract every other variable there keeps: the
backend must still boot with no `.env` at all. Its absence answers **503**, checked in
`ReceiptScanService.scan` ahead of opening the database, so an unconfigured deployment costs no
wasted reads. The buttons stay visible on the frontend regardless - see
`frontend/src/app/CLAUDE.md`.

**The call is bounded.** `ReceiptExtractionService` wraps the Gemini call in an
`AbortController` with a timeout (`RECEIPT_SCAN_TIMEOUT_MS`), and a call that does not finish
in time answers **504**, distinguished from the keyless 503 rather than collapsing into it -
the failure PET-56 was an entire ticket about is a hung or quota-throttled call leaving a
frontend loading state up forever.

**Four size limits, layered strictly smallest-innermost.** At most 4 images per scan, or
exactly one PDF (`MAX_RECEIPT_FILES` in `receipt-scan.constants.ts`). Multer's own `fileSize`
limit is set to the larger of the two per-kind caps, 4MB (a PDF's) - it applies one number to
every file regardless of kind - and the smaller cap, 1.5MB (an image's), is checked after
upload in `ReceiptScanService.scan`, which is what lets the 413 name which cap was actually
passed. A `fileFilter` in `receipt-scan.upload.ts` rejects an unsupported MIME type and a PDF
sent beside any other file, both as 400: multer calls it once per part in arrival order, so a
PDF's siblings are tracked on the request object itself, the only place one call can see what
an earlier one accepted.

**`/scan` carries a rate limiter, which meant moving the throttler registration rather than
adding a second one.** `ThrottlerModule` is `@Global()`, so a second `forRootAsync` call in
`TransactionsModule` would not scope anything - both registrations export the same
`THROTTLER_OPTIONS` token, and whichever loses the resolution race is silently absent from
every route that names it. The one registration therefore moved from `AuthModule` to
`AppModule`, byte-identical for the existing `email` and `ip` throttlers, with a third named
throttler, `scan`, added beside them - keyed on the session user id rather than IP, because the
budget it protects is the project's shared Gemini quota rather than a per-caller one. Every
route not named `scan` carries `@SkipThrottle({ scan: true })` (`AuthController`'s class
decorator), and `/scan` itself carries `@SkipThrottle({ email: true, ip: true })`: `ThrottlerGuard`
runs every configured throttler on a route it guards, and the `email` tracker reads
`req.body.email`, which is `undefined` on a multipart request and would otherwise put every
caller in one shared fallback bucket.

**What the scan limiter protects, stated honestly.** It does not cap total consumption of the
shared Gemini quota - the throttler store is in-memory, so more than one Fly machine gives each
user a full bucket per machine, and a per-user limit is per-user by construction. What it buys
is fairness and blast radius: one account in a retry loop cannot outrun everybody else. A
genuine aggregate cap needs a shared store and a global counter; see `docs/TODO.md`.

### What crosses the wire to Google

**This is the one place in the app that sends a user's data to a third party, so what goes is
written down rather than left to be reconstructed from four files.** The literal prompt string
is `buildPrompt` in `backend/src/transactions/receipt-extraction.service.ts` and is not restated
here - it would drift the first time somebody tuned a sentence. What is here is the inventory,
which is what the modal's disclosure line and `docs/TODO.md`'s training-opt-in entry are both
claims about.

One `generateContent` call carries four things: the model name, the prompt string, the files, and
a response schema.

- **The files, inlined as base64.** `createPartFromBase64`, not the Files API, so nothing persists
  on Google's side beyond the request. This is what "Nothing is stored" in the modal's copy means
  on both ends: no column here, no uploaded file there.
- **Every live category, as `{id, name}` pairs.** Uncapped, deliberately not narrowed, because the
  model is asked to return one of these ids verbatim and an id it was never shown cannot be
  returned. Note the asymmetry with the merchant list below, which _is_ capped: the categories are
  bounded by how many a person makes (thirteen seeded) rather than by a constant, so nothing
  enforces it. If prompt size ever matters, this is where an unbounded list is.
- **The top `MERCHANT_HISTORY_LIMIT` merchants of the past `MERCHANT_HISTORY_DAYS`**, each with the
  categories it has been filed under and how many times. Merchant name, category id, category name,
  count - and nothing else about those transactions.
- **The response schema's field descriptions**, which are instruction as much as shape: they are
  where "the final total charged", "in major currency units" and "the id verbatim, not the name"
  are actually said. Editing one changes the model's behaviour, so treat that object as prompt.

**What deliberately does not go, and is worth being able to say quickly:** no email, no user id, no
session token, no transaction amounts, no transaction dates, no notes, no category caps and no
spend figures. The personal data in a scan is the receipt image plus two sets of user-authored
strings - merchant names and category names.

**The disclosure line names all three, and naming only two was a review finding.** It read "what
you upload and your recent merchant names" while category names were going too, on a free-tier key
where both are training input. The copy is in `AddTransactionModal.tsx` and mirrored in
`docs/explainers/receipt-scanning-modal-preview.html`; the two must agree, and nothing checks that
they do. Widening the prompt is what obliges that sentence to widen with it.

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

**PET-64 reversed the first half of that and kept the second.** `categories.color` stores a
daisyUI semantic token now rather than a hex, so there is no off-palette neutral left to reach
for: `--color-text-tertiary` went with the token layer PET-57 retired, and the paragraph above
is dated to before that caught up with this row. The fallback carries **`base-content/50`**,
with `circle-question-mark` as its icon, both from the same allowlist every other category draws
from. What still holds is the reason white was rejected - this row can hold the largest donut
slice, so its colour has to be visible against the card in both themes. Its `note` is written in
`FALLBACK_CATEGORY` too, since it is the one category with no template to copy a description
from.

**PET-64 first shipped `warning-content` here and the sentence above was false about it**, which
is worth keeping rather than quietly correcting, because the mistake is a class rather than a
typo. This file claimed the colour "has to be visible against the card in both themes, which is
exactly what a real theme token gives it and a hex could not promise" - and a real theme token
gives no such thing. `warning-content` measures **1.713:1** against the dark card. The claim was
written from the plausible idea that a semantic token is theme-aware and therefore safe, and
nobody measured it. `COLOUR_CONTRAST` in `src/database/central/template-tokens.ts` is the
measured table that now exists so the next person does not repeat it: of the sixteen semantic
tokens, **only `primary` and `secondary` clear 3:1 against the card in both themes**, because
daisyUI deliberately puts each `-content` at the opposite end of the lightness range from its
base. `base-content/50` is the seventeenth entry in the allowlist precisely because no muted
semantic token works, and PET-23 had already measured it at 3.401:1 and 4.769:1 for this exact
row before PET-64 took it away.

**It is deliberately not a `category_templates` row**, for the same reason it was never in
`STARTER_CATEGORIES`: that table is the onboarding chip list, this must never appear there, and
its name is a system invariant rather than something an admin may rename. See `## Templates`.

Six things about the rest of it are easy to get wrong:

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
  **Ordering is one of two sanctioned shapes, and this is where to look for the other.** It works
  here only because the two writes are order-_dependent_, so one direction of a mid-way failure is
  harmless. Where writes are order-independent - `setCaps` below - there is no safe order to pick,
  and the answer is a conditional single statement instead.

- **The bulk cap write is one conditional statement, not a transaction and not a loop.** `PATCH
/api/categories` sets many caps at once for the Allocate budget modal, and its `WHERE` carries the
  live filter, the id set **and** a `(select count(*) ...) = n` subquery, with `RETURNING id`. That
  subquery is the whole all-or-nothing story: the database refuses the statement unless every id in
  the payload is live at the instant it runs, so there is no window between a check and a write for a
  concurrent delete to land in, and a payload naming one dead category is a **404 with nothing
  written**. It is the shape `docs/TODO.md` has prescribed since PET-30 and the first place it is
  used; `LoginTokenService.consume()` is the same shape one table over.

  Five traps in it, and the first would be silent. **The `CASE` arms and the `IN` list must come from
  one array**: a row matched by the `WHERE` with no arm of its own falls off the end of the `CASE` and
  is set to **NULL**, so building the two halves from two sources wipes caps the caller never named
  and answers 200 doing it. **`@ArrayUnique` is load-bearing**, because a repeated id makes `count(*)
= ids.length` unreachable and turns every duplicate into a permanent 404 rather than a clean 400.
  **`@ValidateNested` and `@Type` are both mandatory** or the entries arrive unvalidated - and a
  wrapper object is mandatory too, since `ValidationPipe` skips a body whose reflected metatype is
  `Array` outright, at which point SQLite's INTEGER affinity stores a string cap as TEXT and the row
  serialises as a shape `CategoryResponseDto` says is impossible. **`monthlyCap` is
  required-and-nullable**, the inverse of `UpdateCategoryDto`'s tri-state: this route has no
  leave-alone case, so an omitted cap is a 400 and `@ValidateIf` rather than `@IsOptional` is what
  makes it one. And **there is no 409 and no budget ceiling** - the fallback's cap is editable and no
  rename is in play, so this is the one categories write with no conflict case, and caps may sum past
  the monthly budget exactly as `PATCH /categories/{id}` allows. `test/openapi.e2e-spec.ts` pins both
  absences.

  **A cap change regenerates no insights**, deliberately. `PATCH /categories/{id}` has never done so,
  so emitting only here would make one user action behave differently depending on which modal
  performed it. The over-cap rule does read caps, so a `ready` set can go stale; `docs/TODO.md`
  carries the `CATEGORY_CHANGED` event that would close it, beside the debounce the LLM swap needs.

Renaming or deleting the fallback is a **409**, not a 403: the request is well-formed and the
caller is entitled to make it, it just conflicts with an invariant of the resource. Everything
else about that row - cap, color, icon, note - is editable.

**This service no longer resolves the period, and that is PET-72's structural change here.** Read
the two paragraphs this replaces as history: they said `CategoriesService` was "the app's only month
aggregation", with `currentWindow(userId)` and `previousWindow(userId)` public purely so the
transaction reads, the dashboard and the insights generator could reach the arithmetic - three
features importing the categories feature for something with nothing to do with categories.
`PeriodService` owns the resolution now and all four compose it directly. What stays here is
aggregation: sum spend against a window somebody else resolved. `monthStatsFor(userId, categoryId)`
stays public, because one category's stats for the current period really is this feature's business
and the transaction detail needs it, and `update()` still goes through it rather than keeping a
second copy - which is why that method carries no `.returning()`.

**`GET /api/categories` takes `?period=<start>`, and a date that starts none of the caller's periods
is a 400.** Omit it for the current period, the same absent-key rule the frontend states from its
side. The response echoes the resolved period back as a `period` object with a **label**, which is
what the screen prints above the cards: a period is not always one calendar month, so a client
deriving a name from `start` would print the wrong thing exactly when a pay-day change has stretched
one. `PeriodQueryDto` in `src/common/dto/` is shared with the dashboard rather than copied.

**A cap is history now rather than a column, and `withSpend` resolves it with a correlated scalar
subquery.** Every screen therefore shows the cap that was **in force for the period it is
displaying**, not today's cap applied retroactively to a period that closed months ago. Three things
about that query are easy to get wrong. It is a subquery rather than a **join**, because a join
against a history table multiplies the rows inside the `SUM` and silently doubles the spend. The
result is read as `capCents === null ? null : Number(capCents)`, because `Number(null)` is `0` - and
a cap of zero is a category with no room rather than an uncapped one. And a category with no row at
or before the period is **uncapped**, which is how sparseness carries meaning here: there is no
"remove the cap" write, an uncapped category is one whose newest applicable row is `NULL`.

The three writes that used to set `monthly_cap_cents` all append instead, through one private
`appendCap`. `setCaps` is the interesting one, because it appends **many** rows conditionally: it is
an `INSERT ... SELECT` over a `(values ...)` list whose `WHERE` carries the same `(select count(*)
...) = n` guard the old `UPDATE` used, so the all-or-nothing story below is unchanged while the
statement writes new rows rather than overwriting old ones. That shape was unproven in this Drizzle
version, so it was probed against the real local driver before being written: an all-live payload
inserts every row and returns every id, a payload naming one tombstoned category inserts nothing and
returns `[]`, and a `NULL` cap round-trips.

**A cap write is anchored to a period now, and the anchor is asked rather than assumed.** Both cap
writes dated their rows at the current period unconditionally when PET-72 first shipped, which the
review of PR #84 flagged from the UI side: the frontend offered the controls on a historical view and
the write landed somewhere else. The decided behaviour (recorded in the PET-72 plan's user story) is
the budget change's own shape: `PATCH /categories/{id}` takes an optional `capFrom` and the bulk
`PATCH /categories` an optional `capsFrom` - a period's own `start` from `GET /api/periods`, resolved
through `PeriodService.startingAt` so a non-start or a future period is a 400, defaulting to the
current period when absent. A backdated row re-judges the anchored period onward _except_ periods a
newer cap row already covers, because resolution prefers the greatest `effective_from` at or before
each period's start - so backdating is visible and deliberate, never a silent rewrite of a span that
had its own decision. `capFrom` without a `monthlyCap` is a 400 rather than ignored, and the bulk
anchor is one value for the whole batch, because the Allocate modal asks its question once per save.

**`GET /api/dashboard` computes nothing itself.** `src/dashboard/` has no imports from
`categories` or `transactions` tables at all - `DashboardService` composes `CategoriesService`
(the window, the per-category totals, the monthly budget) and `TransactionsService` (the
current period's rows, for the total, the weekly buckets and the recent-transactions card).
A window resolved or a month summed here would be the fourth copy of arithmetic that
`## Backend conventions`' money note already calls a bug at the third.

**PET-72 built the shared `PeriodService` this paragraph used to argue against, and it closed the
edge case the argument came with.** The old version said `currentWindow`, `CategoriesService.list`
and `TransactionsService.list` each resolved the period independently - three profile reads for one
request - and accepted it, because the connection is cached per user, the database is small and the
caller's own, and nothing had measured it as slow. That trade is gone rather than re-taken: the
period had to stop being derivable from a single column, so a service owning the resolution stopped
being an optimisation and became the only place the walk can live. What the collapse also removed is
the defect the old note recorded as self-healing: with the window and the request's own `today`
resolved separately they could land on either side of midnight, so `daysLeft` could read 0 where its
DTO promises 1. `PeriodService.current()` hands back the period **and** the `today` it resolved
from, so the two cannot disagree - and `daysElapsed` reads the same day, which is what makes a _past_
period's elapsed count the whole period rather than a number derived from now.

**It is still the most expensive read in the app**, and that part is unchanged: one request composes
two services over four tables and computes every figure on it. Nothing is stored, nothing is cached,
and `docs/TODO.md` carries the measurement anybody optimising it should take first.

Six things about the figures are easy to get wrong:

- **The account-wide total is summed from the transaction list, never from the per-category
  rows**, and the donut's percentages are relative to that total rather than to the sum of the
  slices. Both still hold; the reason has changed. It used to be that the two figures could
  genuinely disagree, because a transaction whose category was deleted moments after it was
  created (see `TransactionsService`'s own note on that race) appeared in no live category row -
  so the slices were allowed to sum to just under 100% and this file preferred a visible
  shortfall in one slice to a hidden one inside every percentage. **PET-23 removed the
  shortfall instead of choosing where to put it**: `CategoriesService.withSpend` folds spend
  matching no live category into the Uncategorized fallback, so every transaction in the period
  is counted in exactly one row, the rows sum to `spent` exactly, and the percentages sum to 100.
  The donut relies on that, because its ring is required to close. Keeping the two derivations
  independent is now a **check** rather than a hedge: if the fold ever regresses, the
  percentages visibly fail to reach 100 instead of the total quietly shrinking to match. See
  `docs/TODO.md`'s invariant entry for what the write path still cannot guarantee.
  **That check is only worth stating because the consumer stopped defeating it.** The donut's
  `apportionPercents` originally renormalised its input against the set's own sum before rounding,
  which turned any shortfall back into a legend reading 100% - so the detector this bullet
  describes existed on the wire and was erased one function later. The review of PET-23 removed
  the renormalisation. Anything else consuming these percentages inherits the same obligation:
  divide by nothing.
- **The fold is a read-time attribution and repairs nothing, so two endpoints disagree about one
  row.** An orphaned transaction is counted on the Uncategorized row while still storing the
  tombstoned category's id, which means `GET /categories` can report a `transactionCount` that
  `GET /transactions?categoryId=<fallback id>` will not return - the filter matches the stored id,
  and nothing has changed it. `CategoryResponseDto` says so on both `spent` and `transactionCount`,
  because a client cannot see it from the shape; the repair `UPDATE` that would close it is in
  `docs/TODO.md` with the conditional-write fix, deferred rather than forgotten. What is safe to
  build on is the **sum**, which is the whole of what the donut and the month stats need.
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
  categories at the same spend is possible with round numbers, so the tie is broken in
  `topCategoryOf` on the name itself rather than inherited from the order `CategoriesService.list()`
  returns its rows in - that `ORDER BY` is name-ascending today, but a winner leaning on it would
  flip silently the day it changed. Nothing here special-cases the fallback: whether the designer
  wants it excluded from this tile is an open question recorded on the ticket, not one this branch
  answers unasked.

**`insight` is the latest insight set's headline and body, or `null`.** PET-41 filled the field
the dashboard shipped as `string | null`, and PET-25 widened it to `InsightSummaryDto | null`:
`DashboardService` composes `InsightsService.latestReadySummary`, so the teaser is the summary of
the most recent `ready` set and `null` when none has been generated (including while the first run
is still in flight). It stayed a plain string through PET-41 because the dashboard had no
consumer for the body yet; PET-25 is the first ticket to render one - see `## Insights`.

**`TransactionsModule` exports `TransactionsService`, the same reason `CategoriesModule`
exports `CategoriesService`.** Without it, `DashboardModule` importing `TransactionsModule` for
the recent-transactions card cannot actually inject the service Nest resolves it to - a module
that provides something is not the same as a module that shares it.

Like `ProfileController`, there is no 404: a verified session implies a profile row, and its
absence is the broken invariant `CategoriesService.period()` already throws a plain `Error`
for, answered by the generic 500.

## Insights

**`src/insights/` owns two user-scope tables (`insight_sets` and its child `insights`), one read
and one asynchronous generate.** `GET /api/insights` serves the screen in all three states;
`POST /api/insights/generate` produces a fresh set. `InsightsService` is exported because the
dashboard composes it for the teaser.

**The API's `empty`/`generating`/`ready` state is derived, never stored.** A row carries a `status`
of `generating`, `ready` or `failed`; the read turns the rows into one state - a run in flight wins
(skeletons), else the newest `ready` set, else empty. A `failed` row is simply skipped, and that is
the whole of AC6: the previous `ready` set stays the answer with no restore step, because a run only
becomes visible content once it reaches `ready`. The newest set wins by `generated_at` (AC5).

**Content is returned independently of state, and that is deliberate.** The read always carries the
latest `ready` set's content alongside `state`. On a regenerate the page renders skeletons off
`state`, while the dashboard teaser keeps reading this same last-good content rather than blanking
mid-run. `empty` alone carries null content.

**Insight content is stored as rendered prose - the one place in this database that does.** Every
other read formats on the way out; a set is a snapshot of what the generator wrote at `generated_at`,
so `month_label`, the summary and each card body are stored strings that re-read byte-for-byte (AC2).
Do not "fix" this toward the format-at-the-DTO convention: a persisted generation is not a derived
view. The tables are FK-less like the rest of the schema (`insights.set_id` is a plain column, the
way `transactions.category_id` is), because a set and its cards are only ever written together.

**The dashboard teaser widened from a `string` to `InsightSummaryDto` at PET-25.**
`latestReadySummary` hands `DashboardResponseDto.insight` the latest ready set's headline **and**
body, replacing `latestReadyTeaser`, which honoured PET-20's committed `string | null` only until
PET-25's card needed the body the frame was already drawing. The Dashboard section above carries
the note, and **this file is its only home**: `docs/agents/api-contract.md` describes the pipeline
rather than the fields that travel through it, and a one-field widen with no new mechanic gives it
nothing to say. Three places on PET-25's branch claimed that file carried the note too, which sent
the next reader to a file with no mention of insights in it at all. If frame 04's teaser ever needs
a tone on top of that, that is a further contract change to weigh, not one taken here unasked.

**Generation is genuinely asynchronous, and one run at a time.** `POST /api/insights/generate`
writes the `generating` row, commits it, and returns **202** before floating the work with a logging
`.catch`, the same shape `AuthService` uses - so the state is observable and a future slow generator
(an LLM) needs no reshaping. Rule-based generation is fast, so `generating` is rarely caught in
practice, but the lifecycle is the design's contract (INS-5), not a performance workaround. A second
request while a run is in flight is a **409**: regenerate is disabled during a run (A26), and it keeps
the one completion transaction the only writer on the cached connection. On completion the row becomes
`ready` and its cards are inserted in **one** `db.transaction()`; on any failure the row is set
`failed` and nothing else is touched, so the previous set stays readable (AC6).

**An empty account produces no set, via insert-then-remove.** Emptiness is only known once the
generator has run, so the placeholder `generating` row is written first and then deleted when the
generator returns `null` (no transactions, AC7). The account flickers `generating` for a
sub-millisecond and settles back to `empty`; it never leaves a bare `ready` set behind.

**The two content rules live behind an `InsightGenerator` seam.** `RuleBasedInsightGenerator` is the
only implementation: deterministic detectors filling templated copy, composing `CategoriesService`
and `TransactionsService` rather than querying their tables (it reads `profile.currency` directly, the
one static field neither surfaces). Each rule yields at most one card and is omitted when it has
nothing to say. Over-cap is `warning`, a favourable month-over-month move is `positive`, an
unfavourable one `neutral`. That is the point of the seam: a later `LlmInsightGenerator` replaces
the whole class through the one `INSIGHT_GENERATOR` provider binding in `InsightsModule`, storage,
the read and the frontend untouched.

**There were four rules until PET-42-43-44, and a zero-card `ready` set is now the steady state.**
`projectionCard` went because the summary banner's headline already said the same thing, and
`recurringMerchantCard` went because month counting cannot separate a subscription from a habit - a
monthly travel pass at a steady price is mathematically identical to Netflix, and irregular manual
logging disqualifies a genuine subscription. That amends two criteria that already shipped, tech
spec **INS-4 / AC5** and **PET-40 AC5**; PET-40 and PET-62 stay Done as the record of what shipped,
and PET-62 in particular exists only to fix the rule deleted here. The consequence for anyone
reading a response: over-cap can only fire for a category that _has_ a cap, which is optional and
absent on the fallback, and month-over-month needs a previous month - so a first-month user who set
no caps gets the summary banner and nothing else, indefinitely. That is not an edge case to guard,
it is what most accounts show.

**The `info` tone went with `projectionCard`, and the narrowed enum is a promise about what is
generated rather than about what is stored.** `InsightTone` is `warning | positive | neutral` now.
`insights.tone` is a plain `text` column with no CHECK constraint and `cardsFor` casts it unchecked,
so every set generated before the cut still holds an `info` card and the read serves it verbatim.
Two things cover that rather than a backfill: the write-path trigger below, which replaces such a
set on the account's next transaction, and the frontend's tone map, which falls back rather than
rendering an unknown tone with no styling. `test/insights.e2e-spec.ts` asserts both directions -
that nothing generated carries a retired tone, and that a stored one still reads back.

**A transaction write regenerates the set, which is what makes `state: 'empty'` mean the account has
never logged anything.** `TransactionsService.create`, `update` and `remove` all emit through
`@nestjs/event-emitter`, and `TransactionChangedListener` inside `InsightsModule` calls
`InsightsService.generate`. An emitter rather than a direct call because `InsightsModule` already
imports `TransactionsModule` for the generator, so calling back would close the loop into a circular
module dependency - the write path never learns that insights exist. **`emitAsync`, not `emit`, and
that is load-bearing**: `generate` commits the `generating` row before returning, so awaiting the
listener carries that guarantee out to the request, and by the time `POST /api/transactions`
responds `GET /api/insights` already reports `generating`. A user who saves an expense and navigates
straight to `/insights` gets the skeletons with no race and no flash of the wrong state.

**The 409 is swallowed in two places and neither is redundant.** `emitAsync` rejects when a listener
rejects, so a catch only at the emit site still lets a listener throwing synchronously escape, and a
catch only in the listener leaves the hazard for whoever adds a second one. A run already in flight
means fresh-enough content is already being generated, which is benign; the losing write's data is
missing from that set until the next save, bounded by one run and self-healing. **All three
arguments rest on generation being sub-second**, so binding a real `LlmInsightGenerator` to
`INSIGHT_GENERATOR` needs a debounce or a dirty flag before that swap - `docs/TODO.md` records it
next to the entry this trigger supersedes.

**The converse of that guarantee does not hold, deliberately.** `runGeneration` deletes only its own
placeholder when the generator returns `null`, leaving any previous `ready` set intact - so an
account that deletes its way back to zero transactions keeps being served content describing
spending that no longer exists. `empty` implies never-written; `ready` does not imply the
transactions behind it still exist. Clearing the set on the way down would mean the generator
distinguishing "nothing to say this month" from "nothing at all" and the read's state derivation
acting on the difference, which is a larger change than the one it fixes.

**Floated runs are tracked and drained on shutdown.** A run outlives the request that started it by
design, and that was harmless while only an explicit POST started one. Now a write does, so a
shutdown can land on a run mid-flight - and `DatabaseModule.onApplicationShutdown` closing every
replica underneath it is the same silent write loss the kill-timeout paragraph under Deployment
describes for the final push. `InsightsService.onApplicationShutdown` waits for them, bounded, since
a wedged generator must not hold the process open. It is also what keeps the three e2e suites that
post transactions without ever reading an insight from racing their own teardown.

**The single-run guard is enforced at the database, and an abandoned run self-heals.** The
409 is not left to a check-then-insert: a partial unique index on `status = 'generating'` (the
`categories_fallback_idx` shape) makes a second concurrent insert fail at the database, and that
failure is translated to the same 409, so two racing POSTs cannot both start a run. Because that
index would otherwise let one dead run wedge the feature forever, `generate()` first reclaims any
`generating` row older than a staleness cutoff by marking it `failed` - the run whose process died
mid-flight, or whose own failing catch threw. Past the cutoff the read stops reporting `generating`
and a new POST is accepted, so skeletons-forever cannot outlive a crash. The cutoff is generous
against rule-based generation and exists for a future slow `LlmInsightGenerator`; its value lives in
`insights.service.ts`.

**A reclaimed run writes nothing, and every write in `runGeneration` says so.** The reclaim buys
self-healing at the price of the guarantee the completion path used to rest on: past the cutoff a
second run starts while the first may still be working, so "the single-run guard keeps this the only
transaction on the connection" stopped being true. Hence `status = 'generating'` in the `WHERE` of
all three writes there, not just the row id. A run that lost its claim cannot flip a row already
declared `failed` back to `ready`, cannot stamp a fresh `generated_at` on content generated minutes
ago and win AC5's newest-set ordering with it, and cannot leave cards hanging off a set the read will
never serve; it logs a warning and drops its result. Two runs' transactions genuinely overlapping is
still reachable and still degrades one of them to `failed`, which is in `docs/TODO.md` rather than
fixed here.

**A `ready` row missing its content is skipped in SQL, not patched up in the DTO.**
`latestReadySet` filters `summary_headline`/`summary_body IS NOT NULL` alongside the status, so a
half-written set behaves like a `failed` one: the previous complete set stays the answer, which is
AC6's rule applied to a different way of being broken. Doing it in the query rather than in `getSet`
is what keeps `latestReadySummary` honest too, since the dashboard teaser reads the same row
through the same helper and would otherwise be deciding for itself what a half-written set means.
It does **not** save that method a null check, and the comment in `insights.service.ts` that
claimed it did was wrong: `InsightSetRow` types both columns `string | null`, so narrowing forces
a redundant guard there whatever the query filters.

**Translating a unique-constraint failure means reading `cause`, never `error.message`.** Drizzle
wraps every driver error, so the top-level message is the failed SQL and the constraint text is one
level down; `@tursodatabase/database` then wraps SQLite's own wording rather than replacing it.
`src/common/unique-violation.ts` walks that chain and is shared by the single-run 409 and
registration's converge-on-the-winner path, which both previously kept a local copy that read only
`error.message` and therefore never fired. Note how quietly that failed: the wrapper's message is
the SQL, so it contains the table and the column the predicate was looking for, and only the word
"unique" was missing. It matches `table.column` rather than the table, because a primary-key clash
on the same table is a broken invariant and belongs in the generic 500. **The walk is duck-typed on
`message` and `cause` and must not use `instanceof Error`**: the driver builds its error inside its
own ESM module, so under Jest's module registry that is a different realm with a different `Error`
global and `cause instanceof Error` is `false` for an object that prints as one. The only test that
catches any of this is one that forces a real collision, which is why `test/insights.e2e-spec.ts`
races two runs rather than asserting a hand-written message.

**A completed run deletes what it supersedes, and that is new since the write-path trigger.**
Until PET-42-43-44 a set was written only when somebody pressed Regenerate, so `insight_sets` and
its child `insights` growing by a row per run was a slow accrual `docs/TODO.md` recorded and left
alone. A run per transaction write turns that into growth proportional to how much the user
spends - roughly 1,800 set rows and 3,600 card rows a year at five expenses a day, in that user's
own replica, every one of them carried to Turso Cloud by the shutdown push. So the transaction
that flips a run to `ready` now also hard-deletes every settled set past the newest few, cards
first. Three things about it are decisions. It is a **hard** delete, the second and last exemption
from this database's tombstone convention alongside the empty-account placeholder removal, because
a tombstoned row is still a row and soft-deleting would bound nothing. It runs **inside the
completion transaction**, so the tables are bounded at every commit rather than between them. And
it skips `generating` rows rather than ordering around them, so a live run past the stale cutoff
cannot be deleted out from under its own claim.

**That is also why `generated_at` still carries no index, and must not grow one on the strength of
a plan that reads the table as unbounded.** `latestReadySet` orders by it, which was a full scan
and sort over a table growing with the user's transaction count and is now a sort of a handful of
rows. The retention constant lives in `insights.service.ts`; the index is the wrong answer to a
problem the prune removes, and adding both would be paying twice.

**"Self-healing" was the wrong word for the swallowed 409, and the correction is worth more than
the tidy version.** This section said the losing write's data is "missing from that set until the
next save, bounded by one run and self-healing". The first half is right and the second is not:
nothing re-runs after the in-flight run completes, so there is no retry, no dirty flag and no
sweep. A user deleting three transactions in a row has the first delete's run read the table
mid-burst while the next two land on the 409, and both `/insights` and the dashboard teaser keep
quoting spend including rows already removed - until the next transaction write, or a click on
Regenerate. The accurate statement is **heals on the next write**, `docs/TODO.md` carries it as
deferred work beside the debounce the LLM swap already needs, and the two want the same fix built
once.

**PET-73 built that fix, so read "there is no retry, no dirty flag and no sweep" as dated**, and
read `InsightsService.dirty`'s own docblock for the mechanism rather than a copy of it here. The
whole of what belongs in this file is the bound - a burst of N writes produces **at most two runs** -
and the one thing a review of PR #86 corrected about it: the follow-up hung on the success path
alone, so the **empty-account** path, which settles the state just as much by removing its own
placeholder, scheduled none and leaked its flag. Reachable in one step - delete the last
transaction, then create one before that run returns - and the consequence was the exact staleness
the flag exists to close. Both settling paths schedule one now; the two that settle nothing (a
failed run, a run reclaimed as abandoned) still deliberately do not.

**And a review of that fix found it had left a fourth path**, which is worth one sentence because it
is the same class of mistake twice: the empty-account delete is conditional on the row still being
this run's, and the first version **discarded the result**, so a reclaimed run whose generator
answered `null` deleted nothing and scheduled a follow-up regardless. It reads the delete back with
`.returning()` now and returns early when it matched nothing, exactly as the completion transaction
already read its own `UPDATE` back - so "settled the state" means the write actually landed rather
than merely having been attempted.

## Templates

**`src/templates/` serves the admin-managed data behind onboarding and the category picker, and
it is the first step toward a super-admin panel.** Two reads over central's three template
tables: `GET /api/templates/categories`, the fifth `@Public()` route, answering the starter
chips onboarding step 2 draws; and `GET /api/templates/palette`, guarded, answering which
colours and icons a create-or-edit category picker may offer, each with the label to show for
it. `backend/src/database/CLAUDE.md` owns why those tables are in central at all - the fourth
sanctioned exception - and why the seed runs at boot.

**Deliberately not part of `CategoriesModule`.** That module is user-scope: every row it touches
belongs to one person and it opens the caller's own database. These tables belong to nobody and
are the same for everybody, which is the whole distinction. `TemplatesService` is exported
because both halves of the access flow compose it.

Four things about it are easy to get wrong:

- **The public route is public because onboarding has no session, and it carries no throttler.**
  `ThrottlerModule` is registered once in `AppModule` (PET-59 moved it there from `AuthModule` to
  add a third named throttler, `scan`), but nothing on this controller carries
  `@UseGuards(ThrottlerGuard)`, so there is nothing here to skip - which is worth stating rather
  than leaving to be discovered, since a bare `@SkipThrottle()` means `{ default: true }` and
  would silently skip nothing anyway. The route reads no request state and returns the same
  bytes to everybody, so it enumerates nothing.
- **Validation checks the code-side allowlist and never the `enabled` flag.** `enabled` is
  presentation: the palette read offers what is enabled, while `@IsIn(COLOUR_TOKENS)` accepts the
  whole allowlist - so a category carrying a since-disabled colour still saves and still renders.
  `error-content` ships disabled for exactly that reason, measuring 1.01:1 against the dark card.
  The two lists being different is the design, not drift.
- **Registration takes template ids, and the membership check must stay ahead of the floated
  work.** `RegisterDto.categories` is a shape check plus `@ArrayUnique` - `@IsIn` has nothing to
  close over once the list is a table - and `AuthService.register` resolves the ids against
  central **before** the directory lookup and before the token issue and mail send. It costs the
  same whether or not the address exists, so it cannot become a second timing channel, and after
  the float a 400 would arrive too late to be a 400 at all. Its `@ArrayMaxSize` is a **literal
  ceiling** rather than the list's length, and deliberately not a count query: that would put a
  database read in front of validation on the one route anybody can post to.
- **That check asks `exists()`, never `resolve()`, and the two are not interchangeable.** Both
  read `category_templates`, but `resolve()` inner-joins the colour and the icon, so a template
  whose _colour_ an admin tombstoned comes back missing from it. That is right where it is used -
  provisioning cannot write a category with no colour, and `seedStarterCategories` skips it with
  a warning - and wrong as a membership check, because the caller then cannot tell "not a
  template" from "lost its colour" and registration answers 400 naming an id the picker had just
  offered, on a screen with no error state for it (A29). `exists()` reads the one table and
  filters only the tombstone. PET-64 shipped the conflated version; `test/templates.e2e-spec.ts`
  pins both directions, including that a genuinely unknown id is still a 400.
- **Verification copies rather than references, and tolerates a template that vanished.**
  `seedStarterCategories` writes name, colour, icon and the template's `description` into the
  user's own `categories` row - the description becoming `note`, which is what keeps this whole
  change free of a user-scope migration. A template tombstoned between the form and the click
  simply comes back missing from `resolve()` and is skipped with a warning: refusing to verify a
  live login link over a category the user can no longer be given would strand the account.

The **write** side is explicitly out of scope. There is no role or permission concept anywhere -
central `users` holds an id, an email and a database pointer, and `SessionGuard` is the only
guard - so `users.role`, a `SuperAdminGuard` and the admin UI are their own later ticket.

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

**PET-72 split this resource in two, and the split is the point of the ticket on this endpoint.**
`PATCH /api/profile` no longer accepts `monthlyBudget` or `monthStartDay` at all - sending either is
a **400** - because neither is a property of the account. Both are properties of a **span of time**,
so a request setting one is incomplete without saying from when: raising the budget on the old
endpoint silently re-priced every period the account had ever had. They go through
`POST /api/profile/schedule` instead, and every field of `ChangeScheduleDto` is **required**, which
is what makes the omission impossible rather than merely discouraged. What `GET /api/profile` returns
for them is the value **as configured** - the newest row of each history, a change scheduled at a
future paycheck included. This read used to report the values in force for the current period, and a
review of PET-72 is why it stopped: Settings is a form, and a form must round-trip. Mid-pending-change
the old semantics loaded the _old_ day, so a faithful budget-only re-submit wrote a rule reverting the
change the user had just scheduled. What a period was actually lived under stays per-period on the
dashboard, category and transaction reads.

Five things about the schedule write are easy to get wrong:

- **It answers 200, and `@HttpCode(HttpStatus.OK)` is what makes that true.** Nest defaults a POST to
  201 and the DTO published 200, so the two disagreed with every gate green until an e2e case pinned
  it. 200 is right: the write creates no resource a caller could then address - what comes back is the
  profile, exactly as the read returns it.
- **`firstPaycheckDate` must be day `monthStartDay` of its month**, or it is a 400. That is the guard
  that keeps a rule's anchor and its own start day consistent, so the walk never has to reconcile a
  rule that contradicts itself.
- **An anchor earlier than the account's earliest rule is a 400**, which is why provisioning seeds
  the first rule `SEED_ANCHOR_MONTHS_BACK` months back rather than at the current period. Anchored at
  today, any retroactive change would sort _before_ the seed rule and two rules would claim one span.
  Twelve months is what makes the whole of the Settings dialog's nine-month window reachable.
- **A pay-day change moves boundaries and a budget-only change does not.** The service decides which
  it is by comparing the requested day against `ruleInForceAt(anchor)`, not against the profile's
  current day: at a retroactive anchor those are different rules, and comparing against the wrong one
  writes a boundary move for a change that moved nothing. **One exception, found by review**: a body
  carrying the _newest_ rule's day with an anchor before that rule is a budget-only change reaching
  back across the last pay-day change - the form always sends the configured day, so the comparison
  at the anchor misreads exactly that case - and it appends a budget row for the containing period,
  never a rule.

- **A pay-day change cannot be anchored behind a later pay-day change, and that is a 400.** A rule
  inserted _between_ two existing ones leaves the later rule's stored `transitionStart` computed
  against a predecessor that no longer governs the span, so the walk clamps periods at a bridge that
  lands on no boundary - periods ending on a day nobody was ever paid. Correcting history is in
  `## Not built here`; until it exists, refusing the anchor is the honest answer.
- **Sending the identical body twice converges rather than duplicating.** The rule insert is
  `onConflictDoNothing` on `period_rules`' unique `effective_from` index, and a second budget row for
  one date resolves to the newest - which is the same value. That is why the frontend action publishes
  no conflict arm: there is nothing here for two requests to collide over.

**`GET /api/periods` is the read behind all of it**, in `src/periods/`, and it answers every period
the account has, newest first, each with `start`, `end`, a **label** and a `current` flag. Two things
about its range are decisions. It is bounded by the **oldest transaction** rather than by the oldest
rule, because a rule anchored a year back for the reason above is not a claim that the account has a
year of history. And the label is the backend's to compute for every consumer, because a period a
schedule change stretched spans two calendar months and no client-side arithmetic over a start day
can name it.

## The assistant

**PET-73's AI assistant chat has its own file**, `backend/src/assistant/CLAUDE.md`, which loads
whenever the work is under `backend/src/assistant/`. It is the authority for the three endpoints, the
prompt and its ceilings, the one-transaction-per-turn write, the abort chain's third hop, and - the
reason it is a file rather than a section here - the `### What crosses the wire` inventory for the
**second** place in this app that sends a user's data to a third party.

Two things about it belong here rather than there, because they are claims about the rest of the
backend. **It generates nothing**: `INSIGHT_GENERATOR` is still bound to
`RuleBasedInsightGenerator` and the "No LLM behind the insights" bullet below is still literally
true. And **`chat` is a fourth named throttler** beside `email`, `ip` and `scan`, registered in the
one `ThrottlerModule.forRootAsync` in `app.module.ts` - so every guarded route now skips three
throttlers it is not named by rather than two.

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

**The count is exact, and it shipped wrong once.** Fly's deployed value is 2, not the 1 that first
went out - discovered when a phone tether got a 429 against an already-exhausted bucket, meaning
every caller was landing in one shared one regardless of source. Captured via a throwaway
diagnostic route echoing the raw `X-Forwarded-For` Fly delivers, then confirmed by replaying it
offline through the same Express/proxy-addr stack: a direct client with nothing in front already
produces two addresses, `<real client>, <this app's own IP>`, because Fly's internal routing
appends the app's own address before the request reaches the machine. Numeric trust proxy counts
hops from the **server** end of the chain, which is what makes an exact value safe rather than
merely convenient: replaying a client-forged `X-Forwarded-For` prefix through the same stack, 2
correctly ignores it - a client can only push its own junk further left, never move the boundary -
while 3 or higher trusts the forged entry as if it were real, reopening the exact hole this
variable exists to close. So the number tracks Fly's real topology, not a margin of safety; see
`backend/fly.toml`'s comment on `TRUST_PROXY_HOPS` and `docs/guides/deployment.md`'s per-IP
verification step for the check that catches a regression here.

**Merging a backend change does not deploy it - dispatch the workflow, or it stays undeployed.**
PET-55 added `.github/workflows/deploy.yml`, but its trigger is `workflow_dispatch` only, never a
push to `main`: every deploy stops the single machine (see above), and a merge can add a new env
var with no safe default for a blind auto-deploy to boot into. This already bit the project once,
before PET-55 existed - merging PET-53 did not redeploy anything, and `main` drifted ahead of
production until someone noticed and ran `fly deploy` by hand. So after merging a backend PR meant
to reach users, go to the Actions tab and dispatch "Deploy backend to Fly.io" from `main` -
finishing the merge is not finishing the deploy. Step by step, and what permission it needs:
`docs/guides/deployment.md`, "Dispatching a deploy, step by step".

## Not built here

Treat these as planned, not available. This list exists so you do not build on something that
is not there. One bullet per capability, ordered alphabetically by its bold lead-in; when a
capability lands, delete its whole bullet and nothing else. Why each one is deferred, where
that was a decision rather than a queue, is in `docs/TODO.md`.

- **A page-count guard on a scanned PDF.** The backend has no PDF parser, so a 40-page bank
  statement is accepted up to the 4MB size cap and billed as roughly 10,000 tokens of prompt
  describing no receipt at all. The 4MB cap is the practical bound today.

- **A per-scan opt-in for training on the free tier.** V1's disclosure beside the scan buttons is
  on-screen copy, not a setting: a real opt-in belongs in Settings, which has no field for it and
  no column behind one, and migrating to the paid tier is the only mechanism that actually turns
  training off. See `docs/TODO.md`. (This bullet said the Settings `<main>` was not built, which
  PET-46 and PET-47 ended - the gap is the setting, not the screen.)

- **Correcting a history row.** `period_rules`, `budget_history` and `category_cap_history` are
  append-only by design and no endpoint edits or removes a row, so a schedule change made from the
  wrong paycheck can only be answered with another schedule change - which leaves both rows in the
  history and resolves to the newer one. That is right for a record of decisions and wrong for a
  typo, and the two are indistinguishable from here. Deleting the mistaken row needs an endpoint that
  can say which row it means, which means exposing row ids the API currently publishes nowhere.

- **A shared-store aggregate cap on the Gemini quota.** The `scan` throttler is per-user and
  in-memory, so it protects fairness and blast radius, not total consumption of the project's
  shared free-tier quota. A real cap needs a shared store and a global counter.

- **No LLM behind the insights.** Generation is deterministic rules
  (`RuleBasedInsightGenerator`); the "AI" is branding. An `LlmInsightGenerator` can replace it
  through the `INSIGHT_GENERATOR` binding without touching storage, the read or the frontend, but
  no such implementation exists and none is wired.

- **Scanning several distinct receipts into several transactions.** One scan produces one
  transaction; every image in a request is treated as a page of the _same_ receipt and
  synthesized into one extraction. A batch import needs a review queue, N draft rows and a bulk
  write, none of which `POST /transactions/scan` can express.
