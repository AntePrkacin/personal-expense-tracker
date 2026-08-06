# PET-34 — Transaction detail page with category context

[PET-34](https://decode.atlassian.net/browse/PET-34) — `[FE] Build transaction detail page with
category context`. Figma: [08 Transaction
detail](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=34-349).

Base branch is `main`. PET-32 merged at `2b11f96`, so nothing is stacked and this is an ordinary
branch.

## Why

`/transactions` looks finished and is not. Every control on it works except one: a row click opens
nothing, because frame 08 has never been built. Three tickets in a row have recorded that same
sentence — PET-29 left it, PET-33 narrowed it, PET-32 closed the last of the others — so a row
click is now the only dead affordance in the signed-in app, and the one a reviewer is most likely
to try.

This ticket builds the screen behind it: one expense in full, with its category's budget position
for the month and the latest other transactions in that category.

Four files were written in anticipation of it and say so, and following them is most of the design.
`(app)/DeleteTransactionProvider.tsx` and `frontend/src/app/CLAUDE.md` both say "PET-34's redirect
now needs no new parameter: its detail page passes an `onDeleted` that navigates".
`(app)/EditTransactionProvider.tsx` describes this page's entry point as costing two lines.
`transactions/TransactionsTable.tsx` gave its table an `sr-only` caption because "PET-34's detail
page adds a second table". And `frontend/src/app/CLAUDE.md` records where the list's link belongs:
on the **merchant cell** rather than the row, because a link wrapping the whole row takes its
accessible name from every cell inside it.

The backend is entirely ready. `GET /api/transactions/:id` was purpose-built for this frame and
returns `{ transaction, category, recentInCategory }` in one call — the category's stats for the
**current** period even when the transaction is older, and up to five siblings from any month
excluding the one being viewed.

## Scope decisions taken with the user before planning

Five, all narrowing the frame rather than widening it:

1. **The Details card shows three rows, not six.** Merchant, Category, Date. Time, Payment and
   Status are dropped entirely rather than rendered blank. That answers DET-8 and A20 in the
   direction PET-34's own Jira comment framed as the alternative to permanently empty rows, and it
   removes AC6 from this ticket: there are no never-captured fields left on the screen.
2. **No time anywhere.** The header caption is `Oct 8, 2025` plus the category chip, not
   `Oct 8, 2025 · 2:32 PM ·`. There is no time column and no formatter for one. Amends AC1.
3. **An uncapped category drops the chip, the bar and the remaining figure**, keeping the card, its
   title, the spent figure and the whole recent list.
4. **The amount card's "Debited from Everyday account" caption is dropped.** Account is the fourth
   A20 field and nothing in the schema holds one. Same reasoning as decision 1.
5. **The merchant cell on the list becomes a link, and it carries the current filters.** Without it
   the page is reachable only by a typed URL. The recent-in-category rows link the same way.

## What is amended, and what this closes for other tickets

| AC | Disposition |
| --- | --- |
| AC1 — header shows merchant, date, **time** and category chip | Time dropped, per decision 2. Everything else met. |
| AC3 — the category card's figures match that category's real figures | Met when a cap exists. An uncapped category renders no chip, bar or remaining figure at all, per decision 3. |
| AC6 — time, payment and status show as empty or a default | **Removed.** Those rows no longer exist, per decision 1. |

Four criteria on two other tickets close here, none of them needing new plumbing. **PET-32's AC1
and AC3**: the edit modal is mounted on the shell, so this page becomes the second entry point its
comment promised, and `router.refresh()` re-reads this route after a save. **PET-33's AC3 and
AC7**: the confirmation opens from this header, and deleting navigates back to the list, which is
A18.

## Decisions

**The 404 path widens `AuthorizedFailure` rather than adding a fifth cookie-to-bearer lift.**
`authorizedGet` collapses every non-401 into `unavailable`, defended in its own doc comment on the
grounds that a caller which could not get its data has one thing to say about it. A 404 here is a
different statement — the data definitively is not there — and this is the only read in the app
whose endpoint can answer one. So the union becomes
`'unauthenticated' | 'missing' | 'unavailable'` and `authorizedGet` maps 404 to the new arm. The
four existing callers keep `if (reason === 'unauthenticated') redirect(...)` followed by a throw,
so their behaviour is unchanged: none of `GET /api/auth/session`, `/api/profile`, `/api/categories`
or `/api/transactions` can answer 404. The detail read calls `notFound()` on the new arm, and a
`not-found.tsx` beside the route renders it inside the shell with the sidebar intact.

The alternative was a bespoke fetch in the detail read that inspects the status itself. That is a
fifth copy of the cookie-to-bearer lift, which `frontend/CLAUDE.md` forbids by name.

**`PageHeader` gains a second shape rather than a second component.** Frame 08's header is
structurally the existing one with two differences: a breadcrumb link where the overline sits, and
a caption row under the title. A discriminated union with `never` on the opposite arm is the
technique this repo already uses four times — `ui/Button`'s `href` xor `onClick`, `Modal`'s
`align`, `CheckEmailScreen`'s `resend` — and it is exactly what PET-33 did to `Modal` for this
situation, for the reason recorded there: a second component would duplicate the parts nobody
should own twice. Keeping one owner also keeps one `h1`, which `(app)/pages.test.tsx` pins per
screen.

**The breadcrumb round-trips the list's filters through the URL, reusing both existing helpers.**
`TransactionRow`'s merchant link is `/transactions/{id}` plus `toQuery(filters)`, and the detail
page parses its own `searchParams` with `parseTransactionFilters` and rebuilds the target with
`filterHref`. Those two functions already guarantee the URL keys and the API's parameter names
cannot drift, and validation is already load-bearing there rather than defensive. A page opened
cold carries no filter keys, so `filterHref({})` gives a plain `/transactions` and the fallback
needs no branch of its own.

**The progress bar is `aria-hidden`.** Every figure it encodes — the percent, the spent amount, the
remaining amount and the cap — is already text beside it, so an announced `progressbar` would
restate all four. Same call `app/setup/SetupShell.tsx`'s step indicator makes against its own
"STEP 1 OF 3" overline, and it keeps `WelcomeScreen.test.tsx`'s pin that the decorative panel holds
the app's only `role="progressbar"` true.

**`percentUsed` is floored, not rounded.** The backend computes `status` from integer cents and
`percentUsed` unrounded, so the two can disagree; rounding `99.6` up to `100%` beside a `near` chip
is the visible form of that. Flooring cannot cross a band boundary upward. The bar's own width is
`min(percentUsed, 100)`, so an over-budget category does not overflow its track.

**The status chip is semantic colour, not the mock's hue.** `on_track` → `badge-success`, `near`
and `full` → `badge-warning`, `over` → `badge-error`, `uncapped` → no chip at all. The frame's
amber at 79% is `near`, which is what makes this a mapping rather than a colour choice — the rule
`frontend/CLAUDE.md` states as "colour modifiers are semantic state, not decoration". Class strings
stay complete literals in a `Record`, per the Tailwind scanner rule, and `ui/categoryColour.ts` is
the pattern.

**The recent list is a `<ul>`, not a table.** PET-29 predicted this ticket would add the app's
second `<table>` and gave `TransactionsTable` an `sr-only` caption in anticipation. The frame draws
a list — icon tile, merchant, a category-and-date caption, an amount — with no column headers and
no fourth field, so daisyUI's `list` is the honest markup and a table would invent a header row the
design does not have. PET-29's caption keeps its own reason for existing regardless: a table with
no accessible name is the defect it was fixing.

**Amounts go through `formatCurrency` and therefore show cents**, where the frame draws `$397
spent` and `$103 left of $500`. That deviation is already recorded in `docs/TODO.md` as applying
app-wide, and introducing a second, cents-less money formatter for one card is the wrong place to
resolve it.

## Shape

**`lib/session.ts`.** `AuthorizedFailure` gains `'missing'`; `authorizedGet` returns it for a 404,
above the existing `!response.ok` arm. The doc comment gains the reasoning above, beside the
paragraph it qualifies.

**`lib/transactionDetail.ts`** (new). `readTransactionDetail(id)`, modelled on
`lib/transactions.ts`'s classified-failure policy and extending it by one arm:
`redirect(ACCESS_ROUTES.login)` on `unauthenticated`, `notFound()` on `missing`, throw on
`unavailable`. Its type is `components['schemas']['TransactionDetailResponseDto']`, read off the
contract rather than restated, and it re-exports the two sub-types the screen's props need.

**`(app)/PageHeader.tsx`.** A `PageHeaderShape` union: the existing `{ overline: string }` arm with
`breadcrumb?: never; caption?: never`, and a new `{ breadcrumb: ReactNode; caption?: ReactNode }`
arm with `overline?: never`. `title` and `action` stay outside the union.

**`(app)/transactions/[id]/page.tsx`** (new). Async Server Component. Awaits `params` and
`searchParams`, calls `readTransactionDetail(id)`, and hands the response and the parsed filters to
`TransactionDetailScreen`. The async/sync split is the shape `/transactions/page.tsx` established,
and it is what lets Storybook render the screen at all.

**`(app)/transactions/[id]/not-found.tsx`** (new). `components/EmptyState.tsx` with a link back to
the list.

**`(app)/transactions/[id]/TransactionDetailScreen.tsx`** (new). Synchronous. The header — the
breadcrumb, the merchant as the page's `h1`, the date-and-chip caption, the actions slot — then a
two-column grid that stacks below `lg`: Amount and the category context on the left, Details and
Note on the right. The Note card is not rendered at all when `note` is null or blank (A21). Cards
are `AccessCard`'s box, which `frontend/src/app/CLAUDE.md` names as the reference if a second card
ever needs to match the first.

**`(app)/transactions/[id]/CategoryContextCard.tsx`** (new). The `{category} this month` title, the
chip, the bar, the spent and remaining lines, the divider and the recent list. Owns the uncapped
branch and the over-budget branch, and the line that replaces the list when there are no siblings.

**`(app)/transactions/[id]/categoryStatus.ts`** (new). The status-to-badge `Record` and the
floored-percent helper, with its own suite — a module rather than inline constants because a
mapping is the kind of thing a test should pin per key.

**`(app)/transactions/[id]/TransactionDetailActions.tsx`** (new, `'use client'`). The Edit and
Delete pair, which is the whole reason any of this page is a client component. Edit calls
`useEditTransaction().open(transaction)` and needs no request, because that modal takes a whole
`Transaction` and the page already holds one. Delete calls `useDeleteTransaction().open(target,
{ onDeleted })` where `onDeleted` navigates to the list — the parameter PET-32 added, and this is
the caller it was added for. Deleting from here therefore navigates, which sidesteps the
focus-restore gap `docs/TODO.md` records for the row menu rather than adding a fourth route to it.

**`(app)/transactions/TransactionRow.tsx`** and **`TransactionsTable.tsx`.** The merchant cell
becomes a `<Link>` carrying `toQuery(filters)`; the table gains a `filters` prop to build it, and
`transactions/page.tsx` already holds the parsed filters. `TransactionRow.test.tsx` and
`(app)/pages.test.tsx` each invert an assertion that `queryByRole('link')` is empty — both are
documented as holding **by decision** pending this ticket, so this is the change they were waiting
for rather than a stale pin being deleted.

## Tasks

- [ ] Commit this plan alone and open the draft PR against `main`
- [ ] `lib/session.ts`: `'missing'` on `AuthorizedFailure` and the 404 arm in `authorizedGet`, with its cases in `session.test.ts`; confirm the four existing readers still throw on it
- [ ] `lib/transactionDetail.ts`: the read and its three-way failure policy, with its suite
- [ ] `(app)/PageHeader.tsx`: the second shape; extend `PageHeader.test.tsx` and its Shell story both ways
- [ ] `(app)/transactions/[id]/categoryStatus.ts` and its suite, one case per status
- [ ] `(app)/transactions/[id]/CategoryContextCard.tsx` and its suite: capped, uncapped, over budget, and an empty recent list
- [ ] `(app)/transactions/[id]/TransactionDetailActions.tsx` and its suite: both openers, and the delete's navigating `onDeleted`
- [ ] `(app)/transactions/[id]/TransactionDetailScreen.tsx` and its suite, organised by acceptance criterion, with the note-absent case pinned
- [ ] `(app)/transactions/[id]/page.tsx` and `not-found.tsx`, with a page suite mocking the detail read by relative specifier
- [ ] `transactions/TransactionRow.tsx`, `TransactionsTable.tsx` and `transactions/page.tsx`: the merchant link carrying the filters; invert the two no-link assertions
- [ ] Stories: `Screens/08 Transaction detail`, added to `screens.stories.test.tsx`'s `MODULES`; update `TransactionsList.stories.tsx`'s "row click does nothing" note
- [ ] Docs: both `CLAUDE.md` files under `frontend/`, root `CLAUDE.md`, `docs/agents/api-contract.md`, `docs/TODO.md`
- [ ] Comment on PET-34 with the AC1, AC3 and AC6 amendments, and close out PET-32's AC1 and AC3 and PET-33's AC3 and AC7

No `npm run api:sync`: nothing here changes a request or response body, and the
`GET /api/transactions/{id}` operation and `TransactionDetailResponseDto` are already in both
committed artifacts.

## Copy, all of it ours

Frame 08 draws none of these states, so all five strings owe A29 sign-off and join its entry in
`docs/TODO.md`. The `Screens/08 Transaction detail` stories are what to put in front of the
designer, since three of the five are states the frame has no variant for.

| Case | String |
| --- | --- |
| Category over its cap, right of the bar | `{over} over {cap}` |
| No other transactions in the category | `Nothing else in {category} yet.` |
| Transaction not found, heading | `That transaction is gone` |
| Transaction not found, body | `It may have been deleted. Everything else is still on your transactions list.` |
| Transaction not found, action | `Back to transactions` |

An uncapped category needs no string at all, which is the point of decision 3: the chip, the bar
and the remaining line are absent rather than replaced by an explanation of their absence.

## Verification

Gates from `frontend/`: `npm run lint`, `npm test`, `npm run build`, `npx tsc --noEmit` and
`npm run build-storybook`. Then `npm run docs:check` from the repo root.

Then the app itself, backend on 3000 and frontend on 4200, signed in, in Chrome over the DevTools
protocol:

1. From `/transactions`, click a merchant. The detail page opens, the sidebar keeps Transactions
   lit — `SidebarNav` already matches by prefix with a trailing-slash boundary — and the URL
   carries the filters that were active.
2. Header: breadcrumb, merchant as the only `h1`, `Oct 8, 2025` and the category chip, Edit and
   Delete. No time anywhere on the page (AC1, amended).
3. Amount card shows the negative figure in the large style, with no account caption (AC2).
4. A **capped** category: the chip percent, the bar width, the spent and the remaining figure all
   agree with the same category's figures for the same month, and the percent is floored (AC3).
5. An **uncapped** category: no chip, no bar, no remaining line; the spent figure and the recent
   list still there.
6. An **over-budget** category: the `over` line renders and the bar does not overflow its track.
7. `Recent in {category}` lists siblings newest first, includes one from a previous month, and
   excludes the transaction being viewed. Clicking one opens its own detail page (AC4).
8. Details card shows exactly three rows.
9. A transaction with a note shows the Note card; one without renders no Note card at all (AC5).
10. The breadcrumb returns to the list with the filters intact (AC7).
11. Edit opens frame 11 prefilled; saving closes it and this page shows the new value — PET-32's
    AC1 and AC3.
12. Delete opens frame 12; confirming lands back on `/transactions` with the row gone — PET-33's
    AC3 and AC7. Cancelling leaves the detail page as it was.
13. A typed URL with an unknown UUID renders the not-found card inside the shell rather than Next's
    default error page. A non-UUID still renders the error page, which is the existing behaviour
    for a backend 400 and is unchanged.
14. Both themes, and a narrow viewport where the two columns stack.

Then Firefox for steps 1 to 10, and Storybook for the five stories.
