# Transaction list and detail read endpoints

**Ticket:** PET-28 · **Branch:** `feat/PET-28-transaction-reads` · **Written:** 2026-08-04

**Stack position:** middle of a three-branch stack, based on `feat/PET-35-category-endpoints`.
`feat/PET-20-dashboard-summary` sits on top of this branch. It is stacked rather than cut from
`main` because both reads here consume two things PET-35 introduces: `monthWindow()` and the
per-category month stats.

## Context

`src/transactions/` has the three write endpoints PET-27 landed and **no reads at all**. This
ticket adds the two the Transactions screens need: a filtered, sorted list with the total count
that feeds the tab badge, and a detail read that carries two pieces of context beyond the row
itself.

Both are pure reads over the caller's own database. Nothing here is stored: the period, the
category month progress and the recent-in-category list are all computed per request, the same
rule `backend/src/database/user/schema.ts` states for every aggregate in the app.

**Figma:** the data behind [06 Transactions - List](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=26-90)
and [08 Transaction detail](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=34-349).

## What this branch inherits from PET-35

Two imports, and neither is re-implemented here. If either changes during PET-35's
implementation, this plan changes in the same PR.

- **`monthWindow(monthStartDay, today)`** from `backend/src/common/month-window.ts`, returning
  inclusive-start and exclusive-end `YYYY-MM-DD`. AC3's period boundary is this function and
  nothing else. `today` is formatted against `APP_TIMEZONE` (`Europe/Zagreb` by default), which
  PET-35 introduces - not UTC, and not a per-user zone, which `docs/TODO.md` records as the
  eventual fix.
- **`CategoryResponseDto`**, PET-35's category payload. It carries the month stats AC4 asks for -
  `spent`, `monthlyCap`, `percentUsed`, `remaining`, `over`, `status` and `transactionCount`, with
  the uncapped variant carrying nulls - and it carries them **alongside** the category's identity
  fields, because PET-35 shipped one flat DTO rather than a nested stats object. So the detail
  read embeds the whole thing. That is wider than the narrowing AC4 describes and is the right
  shape anyway: DET-2's category chip needs `name` and `color`, and DET-5's rows need `color` for
  their dots. Carving a stats-only DTO out of it now would be a breaking change to a response
  already committed to `openapi.json`.

**Uncapped is the common case, not the edge case**, which changes what AC4 actually returns most
of the time. PET-35 settled that caps are optional everywhere, and that the seeded fallback
category `Uncategorized` ships uncapped and is the default selection in the Add transaction form.
So a detail read of a typical transaction returns `cap`, `percentUsed`, `remaining` and `over` all
null with `status: "uncapped"`. The frame draws a progress bar there and PET-34 will have to
handle its absence - the same unanswered designer question PET-35 raises for the category card,
surfacing on a second screen.

The second point is the reason for stacking. Written against `main`, this branch would compute
"that category's spent, cap, percent used and remaining" itself, and the Categories screen and
the transaction detail would then disagree the first time a threshold moved.

## Decisions made

Seven. The first six were written on 2026-08-04 against PET-35's plan; the seventh was added on
2026-08-05, once PET-35's code existed to be read rather than predicted, and it is the one that
turns "this branch inherits two things" into an actual call path. All seven are settled with the
ticket owner as of 2026-08-05, and **two of the spec's own assumptions are amended as a result** -
A17 under decision 4, and A22's row set under decision 5. Both amendments are being made on the
ticket rather than left to live only here.

### 1. The period is a named window, not a date range

AC3 says the period boundary follows the month-start preference (TRN-3, A9). The obvious API is
`?from=&to=`, and it is the wrong one here: it lets a caller ask for a range that is not a
budgeting period at all, and then every figure derived from it silently means something else.

The filter is therefore `?period=current|previous|all`, resolved server-side through
`monthWindow()`. `current` is the window containing today, `previous` the one before it, `all`
applies no date predicate. The design's own filter control offers periods, not a date picker, so
nothing is lost.

Resolving `previous` is "subtract one month from the window start, then take the window
containing that day", not "subtract 30 days". With `monthStartDay` constrained to 1-28 there is
no clamping case.

Note the category filter will very often be `Uncategorized`, since PET-35 makes it the default
selection when logging a transaction. Nothing special is needed for that - it is an ordinary
category id to this endpoint - but it is worth knowing that the filter's most-used value is a
category the user never picked.

### 2. Sort is a closed set of two, and the ticket's unknown stays unknown

A16 records that the open sort dropdown is never drawn, so only "Newest first" is known. AC1
requires it as the default.

Shipping a free-text sort parameter to cover an unknown menu would put a contract in
`openapi.json` that no screen asked for. The parameter is `?sort=date_desc|date_asc`, defaulting
to `date_desc`. Two values, because ascending is the one option a date sort certainly has, and
adding the rest is a one-line DTO change once the designer draws the menu.

Ties break on `created_at` descending, then `id`. Without a tiebreak, two transactions on the
same date have no stable order and the list reshuffles between requests for no visible reason.

### 3. Search matches the merchant only, case-insensitively, as a substring

AC2 says "matching the merchant", and the design's placeholder says "Search transactions". Only
the merchant is searched: the note is captured but surfaces on no list row, so matching it would
return rows the user cannot see the reason for.

SQLite's `LIKE` is already case-insensitive for ASCII, which the `%s%` pattern relies on. It is
**not** case-insensitive for non-ASCII, so a Croatian merchant name with diacritics matches only
on exact case. That is a real limitation for this project's own persona and it is worth a
`docs/TODO.md` entry; fixing it properly means a normalized search column, which is a migration
this ticket does not need to carry.

The term is trimmed, and an empty or whitespace-only term applies no predicate rather than
matching everything with `%%` - same result, one less scan.

### 4. No pagination, and the count is not a page count

A11 and TRN-6 record that the design has no pagination anywhere; the list scrolls. So the
response is `{ transactions: [...], total: N }` where `total` is the count **after** filters,
which is what AC2 requires and what the tab badge shows.

`total` is therefore always `transactions.length`. It is returned anyway, explicitly, because
the moment pagination does arrive the badge must not start counting the page - and a frontend
that read `.length` would do exactly that, silently. This is a deliberate redundancy, not an
oversight.

**A17 reads the other way, and it is the assumption being amended.** It says the badge shows "the
total transaction count", and TRN-2 draws 128 on it against ten visible rows, which is an
unfiltered count on any plain reading. A badge that ignores the filter bar directly beneath it is
the worse behaviour though: filter to Dining out and the tab still says 128, so the one number on
the screen that could report what the filter caught reports nothing instead. Post-filter it is,
and A17 is amended to say so rather than quietly contradicted.

Returning a second, unfiltered count beside it was considered and dropped. No frame draws two
numbers, so it would buy an extra `COUNT` on every request to serve a screen that does not exist.

Returning an unbounded list is fine at this scale and will not stay fine forever. A cap with a
`hasMore` flag is the natural next step; `docs/TODO.md` gets the note.

### 5. The detail read is three queries, and its two context pieces have different windows

AC4 wants the transaction plus its category's progress **for the current month**. AC5 wants the
latest transactions in the same category **regardless of month** - the mock includes a September
row, which is what proves the second window is different from the first (DET-5, A22).

Those are genuinely different reads and collapsing them would be wrong in one direction or the
other. So: the row, then the category stats over `monthWindow(today)`, then the recent-in-category
list with no date predicate at all, newest first, limited to a small fixed number.

Note the asymmetry that follows: the category progress is the **current** month even when the
transaction being viewed is from an earlier one. That is what AC4 says and it is the right
reading - the progress bar answers "where is this category now", not "where was it in March".
Worth confirming with the designer, because the frame does not disambiguate.

**The recent-in-category list excludes the transaction being viewed, and DET-5 includes it.** The
mock's three rows are Whole Foods · Oct 8 · -$62.40, Trader Joe's · Oct 3 and Costco · Sep 28,
while DET-2's header is Whole Foods, Oct 8, -$62.40 - so the first row *is* the transaction whose
page it sits on, printed for the third time on one screen. Excluding it is the right call and it
is a deviation from the mock, which is the part of A22 being amended.

The exclusion is also what fixes the limit. At three, the card would render three siblings where
the mock renders two, a visible difference bought for nothing; at five it gets back the row the
exclusion costs it and then some, and still reads as a short list rather than a second table. So
five, newest first, `created_at` then `id` as the tiebreak, exactly as decision 2 orders the list.

### 6. A missing transaction is a 404, and cross-user isolation stays structural

AC6 requires that an unknown id, or one belonging to another account, fails rather than returning
data. Both are already covered by opening the caller's own database: another user's id does not
exist there, so there is no `WHERE user_id = ?` to forget, exactly as `TransactionsService`'s
existing doc comment records. Tombstoned rows filter on `isNull(deletedAt)` and 404 the same way.

### 7. The month aggregation is composed from `CategoriesService`, never copied

Decisions 1 and 5 both need something PET-35 wrote and then kept private. `period()` resolves
`monthStartDay` and `todayIn(APP_TIMEZONE)` into a window; `withSpend()` and `toResponse()` turn
one category id into the stats DTO. All of them are private to `CategoriesService`, so "this
branch inherits `monthWindow()` and the stats shape" was true of the types and had no runtime
path behind it - as written, the list read had no way to resolve a period and the detail read had
no way to compute stats except by writing both again.

`CategoriesModule` already exports `CategoriesService`, and its comment says why: "because
PET-20's dashboard composes it rather than running a fourth copy of the same month aggregation".
This branch is the third copy that comment exists to prevent. So the aggregation stays where it
is and three public methods are added to reach it:

- `currentWindow(userId)` and `previousWindow(userId)`, thin wrappers over the private `period()`
  and `previousMonthWindow()`, for the list read's `period` filter.
- `monthStatsFor(userId, categoryId)`, which is what `update()` already does at its tail -
  `period()`, then `withSpend(db, window, id)`, then `toResponse()` - lifted into one method, with
  `update()`'s own tail collapsed onto it so there is a single copy in that file too.

`TransactionsModule` gains `imports: [CategoriesModule]`, its first import. The extra
`getUserDb()` call this costs is free: `UserDatabaseService` caches an open handle per user, so
the detail read opens one database no matter how many services ask it for one.

A shared `PeriodService` under `src/common/` was the alternative and was dropped. It is the tidier
end state, and it is also an edit to code the parent branch landed hours ago, so every commit here
and on PET-20 would carry that churn through two rebases to buy a seam nothing yet needs. It goes
in `docs/TODO.md` instead, as the thing to do when a third feature needs a window.

## Endpoints

Two operations added to the existing `src/transactions/` module. No new module, because these are
reads of the same resource the write endpoints own.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/transactions` | Filtered, sorted list plus the post-filter total |
| `GET` | `/api/transactions/:id` | One transaction, its category's month progress, and recent siblings |

Query parameters on the list, all optional: `search`, `categoryId`, `period`, `sort`. They go in
a `ListTransactionsQueryDto` with `@IsOptional()` throughout - unlike the write DTOs, where
`@IsOptional()` was the trap, a query string has no `null` to confuse it with.

**Route ordering matters here.** `GET /api/transactions/:id` must be declared after any literal
sibling path, or Nest matches `:id` first. There is no literal sibling today; PET-20's dashboard
lives on its own path, so this stays a note rather than a constraint.

## Tasks

- [ ] **Expose the month aggregation on `CategoriesService`**: `currentWindow`, `previousWindow`
      and `monthStatsFor`, with `update()`'s tail collapsed onto the last of them, and
      `imports: [CategoriesModule]` added to `TransactionsModule`
- [ ] **Write `ListTransactionsQueryDto`** with the four optional filters, the two-value sort
      enum and the three-value period enum. This is the app's first `@Query` DTO, and every enum
      in `openapi.json` today comes from an explicit `@ApiProperty({ enum: [...] })` rather than
      from the swagger plugin, so declare these the same way instead of trusting it to lift them
- [ ] **Implement the list read**: filters composed into one `and()`, the period resolved through
      `CategoriesService`'s two window methods, the tiebreak on `created_at` then `id`, and
      `total` computed after filters
- [ ] **Add the response DTOs**, the detail one embedding `CategoryResponseDto` whole rather than
      restating any of its fields
- [ ] **Implement the detail read** as its three queries, with the current-month stats window,
      the unbounded recent-in-category window, and the viewed row excluded from the latter under
      a limit of 5
- [ ] **Write the service spec** covering AC1 to AC6, plus a same-date tiebreak, a
      whitespace-only search term, a `previous` period across the December-to-January roll, a
      detail read of a transaction older than the current window, a detail read whose category is
      uncapped - which is the common case, not the exotic one - and a detail read whose category
      holds fewer than six transactions, where the exclusion is visible in the row count
- [ ] **Add e2e coverage** for both reads, including the 404 for an unknown id and for a
      tombstoned one
- [ ] **Run `npm run api:sync`** from the repo root and commit both artifacts
- [ ] **Document it**: extend `## Transaction writes` in `backend/CLAUDE.md` into the read
      surface too, record there that `CategoriesService` owns the app's only month aggregation and
      that the read endpoints compose it, delete the **Transaction reads** bullet from its
      `## Not built here`, and record the LIKE-diacritics, no-pagination and
      shared-`PeriodService` notes in `docs/TODO.md`
- [ ] **Amend A17 and A22 on the ticket**, per decisions 4 and 5
- [ ] **Run the gates**: `npm run lint`, `npm run build`, `npm test`, `npm run test:e2e` from
      `backend/`, and `npm run docs:check` from the root

## Risks

**This branch is meaningless if PET-35's `monthWindow()` signature changes.** It is the single
hard dependency. The mitigation is the stack itself: this branch rebases onto PET-35 rather than
racing it. As of 2026-08-04 that signature is settled, along with the rest of PET-35's six
decisions, so the risk is now about drift during implementation rather than about an open
question.

**`APP_TIMEZONE` is inherited, and its failure mode is silent.** Set the zone wrong and the
period boundary moves without anything crashing: the list quietly returns the wrong month's
transactions. That is PET-35's variable, but this endpoint is where a user would first see the
consequence.

**AC4's "current month" reading is an interpretation, though a better-supported one than this plan
first allowed.** DET-4 titles the card "Groceries this month", which is the frame saying it out
loud. What the frame cannot settle is the case it never draws: the transaction it shows is itself
in the current month, so the two readings agree there. If the designer means the month of the
transaction being viewed, the detail read changes shape and the spec with it. Worth asking, not
worth blocking on.

**`backend/openapi.json` and `frontend/src/types/api.d.ts` conflict with both neighbours.** Take
the parent's version and re-run `npm run api:sync`; never hand-edit either.
