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
  nothing else.
- **The per-category month stats shape** - `spent`, `cap`, `percentUsed`, `remaining`, `over`
  and `status`, with the uncapped variant carrying nulls. AC4 asks the detail read for exactly
  the first four of those, so the detail response embeds PET-35's own DTO rather than defining a
  parallel one that drifts.

The second point is the reason for stacking. Written against `main`, this branch would compute
"that category's spent, cap, percent used and remaining" itself, and the Categories screen and
the transaction detail would then disagree the first time a threshold moved.

## Decisions made

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

The recent-in-category list excludes the transaction being viewed. Showing a row its own detail
page is already displaying is noise.

### 6. A missing transaction is a 404, and cross-user isolation stays structural

AC6 requires that an unknown id, or one belonging to another account, fails rather than returning
data. Both are already covered by opening the caller's own database: another user's id does not
exist there, so there is no `WHERE user_id = ?` to forget, exactly as `TransactionsService`'s
existing doc comment records. Tombstoned rows filter on `isNull(deletedAt)` and 404 the same way.

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

- [ ] **Write `ListTransactionsQueryDto`** with the four optional filters, the two-value sort
      enum and the three-value period enum, and confirm the swagger plugin lifts the enums into
      `openapi.json` rather than widening them to `string`
- [ ] **Implement the list read**: filters composed into one `and()`, the period resolved through
      `monthWindow()`, the tiebreak on `created_at` then `id`, and `total` computed after filters
- [ ] **Add the response DTOs**, embedding PET-35's category stats DTO for the detail read rather
      than redefining its fields
- [ ] **Implement the detail read** as its three queries, with the current-month stats window,
      the unbounded recent-in-category window, and the viewed row excluded from the latter
- [ ] **Write the service spec** covering AC1 to AC6, plus a same-date tiebreak, a
      whitespace-only search term, a `previous` period across the December-to-January roll, and a
      detail read of a transaction older than the current window
- [ ] **Add e2e coverage** for both reads, including the 404 for an unknown id and for a
      tombstoned one
- [ ] **Run `npm run api:sync`** from the repo root and commit both artifacts
- [ ] **Document it**: extend `## Transaction writes` in `backend/CLAUDE.md` into the read
      surface too, delete the **Transaction reads** bullet from its `## Not built here`, and
      record the LIKE-diacritics and no-pagination limitations in `docs/TODO.md`
- [ ] **Run the gates**: `npm run lint`, `npm run build`, `npm test`, `npm run test:e2e` from
      `backend/`, and `npm run docs:check` from the root

## Risks

**This branch is meaningless if PET-35's `monthWindow()` signature changes.** It is the single
hard dependency. The mitigation is the stack itself: this branch rebases onto PET-35 rather than
racing it.

**AC4's "current month" reading is an interpretation.** If the designer means the month of the
transaction being viewed instead, the detail read changes shape and the spec with it. Confirm
before implementing rather than after.

**`backend/openapi.json` and `frontend/src/types/api.d.ts` conflict with both neighbours.** Take
the parent's version and re-run `npm run api:sync`; never hand-edit either.
