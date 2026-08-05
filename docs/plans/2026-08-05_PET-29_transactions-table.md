# PET-29 — Build the transactions table with search, filters and sort

Branch `feat/PET-29-transactions-table`, stacked on `feat/PET-31-add-transaction-modal`
(itself on `feat/PET-30-transactions-empty-state`, itself on `main`).

## Context

`/transactions` was the only signed-in screen reading its own data and still rendered nothing
below the tab bar. PET-30 deliberately shipped `TransactionsScreen` with two empty slots -
`filterBar` and `table` - and `readTransactionsView(filters)` already took exactly the filter
object this ticket had to produce. PET-31 then made the app write, so saving from the empty card
replaced it with a blank table body: correct tabs, a badge that ticked up, and nothing beneath.

This ticket fills both slots, turns the inert `SearchPill` into a real input, and is what makes
a write visible.

## Scope decisions taken before planning

Four, agreed with the ticket owner, and each one amends the ticket:

1. **AC7 is drawn, not wired.** The kebab renders non-interactive and rows are not clickable.
   PET-33 owns the row menu (frame 10), PET-34 owns the detail page (frame 08). Same call
   `SearchPill`, `MonthPill` and both tabs already made: no control that lies about being
   operable.
2. **Filter state lives in URL `searchParams`**, not client state. Shareable, reloadable,
   back-navigable, and it keeps the table a Server Component with one read path.
3. **The selects expose everything the backend supports** - period `current|previous|all`, sort
   `date_desc|date_asc` - which **amends A16**, whose whole content is that Figma never draws
   either dropdown open.
4. **The "Categories" tab stays inert**, which **amends AC2**. Frame 13 is PET-36's route and
   `lib/routes.test.ts` keeps an empty `PENDING` list. AC2's badge half shipped in PET-30.

## Tasks

- [x] `filters.ts`: the searchParams contract - option lists, defaults, `parseTransactionFilters`,
      `filterHref`, plus the exhaustiveness proofs against the contract's own unions
- [x] `lib/transactionQuery.ts`: the query-string builder, extracted so both sides can reach it
- [x] `lib/transactions.ts`: the `period=all` short-circuit its own comment asked for
- [x] `components/ui/categoryColour.ts`: hex-to-token map, neutral tile, `categoryTileClass`
- [x] `lib/format.ts`: `formatIsoDayMonth` ("Oct 8"), the sixth formatter
- [x] `lib/categories.ts`: `readCategoryLabels`, a second projection over one shared request
- [x] `TransactionsTable.tsx` and `TransactionRow.tsx`: the card, the columns, the category join
- [x] `TransactionFilterBar.tsx`: three label-less pills
- [x] `TransactionSearch.tsx` and `SearchPill.tsx`: the real input and its debounce
- [x] `page.tsx` and `TransactionsScreen.tsx`: parse, read in parallel, fill both slots
- [x] Amend `pages.test.tsx`, `TransactionsScreen.test.tsx`, both story modules,
      `screens.stories.test.tsx` and `utilities.test.ts`
- [x] New suites for every new module, plus `categoryColour.test.ts`
- [x] Amend `frontend/CLAUDE.md`, `frontend/src/app/CLAUDE.md` and `docs/TODO.md`
- [x] Gates: `npm test`, `lint`, `build`, `npx tsc --noEmit`, `build-storybook`, `docs:check`
- [x] Open both story modules in a browser, and walk the real app end to end
- [ ] Comment on PET-29 recording the four amendments above

## Decisions worth keeping

**A junk query parameter is a broken page, not an ignored filter.** `?sort=lol` fails `@IsIn`,
the backend answers 400, `authorizedGet` reports `unavailable`, `readTransactions` throws, and
there is no `error.tsx` anywhere in this app. `parseTransactionFilters` is therefore load-bearing,
and the `@MaxLength(200)` trim and the UUID check are as load-bearing as the two enum checks.
Verified in the running app: `?sort=lol&period=yearly&categoryId=groceries&search=zzz` renders
normally with the three invalid values dropped and the valid one kept.

**Defaults are the absent key.** Choosing "This month" removes `period` rather than writing
`?period=current`, so one view has one URL. The consequence is that parsed filters are sparse
while every select needs a resolved value - a pill rendering blank on a bare `/transactions` is
that mistake.

**The search input is locally stateful and the URL is write-mostly.** A plain
`value={filters.search}` loses characters without a debounce and loses the caret with one. The
field owns its value while typing and re-reads the URL only when the prop *changed* **and** the
change was not its own echo.

**A real `<table>` with `table-fixed`,** so the four column headers are the platform's semantics
rather than four hand-written ARIA roles, and the widths are declared once on the `<thead>`.

## What changed during implementation

Six things the plan got wrong or did not know, all verified rather than assumed:

1. **`toQuery` could not simply be exported from `lib/transactions.ts`.** That module reaches
   `next/headers` through `authorizedGet`, and `filters.ts` is imported by client components, so
   the import would have been a build error rather than a style question. It moved to
   `lib/transactionQuery.ts`, pure and importable from either side - the same split `lib/date.ts`
   makes against `lib/format.ts`.
2. **The echo check needed two conditions, and the one-condition version was a real bug.**
   Comparing the URL against the last write alone means `navigate` sets that value *before* the
   server answers, so the very next render reads the component's own pending navigation as
   somebody else's change and resets the field to the old term. Caught by the suite. The outer
   check asks whether the prop actually changed; only then does the inner one ask whether it was
   us.
3. **The echo tracker is state, not a ref.** `react-hooks/refs` rejects reading or writing
   `.current` during render, and this repo carries no eslint-disable comments.
4. **The card is `rounded-lg` with no shadow, and the row rules are Border/Subtle.** Read off
   node 26:172 rather than assumed - `EmptyState` is the standing proof that guessing this pair
   is wrong, and reaching for `AccessCard`'s `shadow-card rounded-xl` box would have been wrong
   twice over. The card's own border is Border/**Default**; only the rules are Subtle.
5. **The tile glyph is not `ui/ListRow`'s at another size.** ListRow's export (node 15:13) puts
   the handle left of centre, which that file records as deliberate; this frame's (node 27:149)
   centres it. Two different drawings of one placeholder, so the row traces its own and
   `docs/TODO.md` records the discrepancy for a designer.
6. **`SearchPill` needed a focus treatment.** `outline-none` on a borderless input inside a box
   deletes the focus indicator outright, so the box takes `ui/Field`'s accent border and its
   `forced-colors` outline.

## Undesigned decisions this ticket adds

All owe A29 sign-off with the rest: the two period labels beyond "This month" and the second sort
label (A16's amendment); and the pending affordance - `aria-busy` plus a dimmed `<tbody>` while a
filter change is in flight - since no frame draws one and without it the gap between the last
keystroke and the new rows is a screen where nothing changes.

## Verification

Gates: `npm test` (71 suites, 1980 tests), `npm run lint`, `npm run build`, `npx tsc --noEmit`
(only the three pre-existing `Sidebar.test.tsx` errors `frontend/CLAUDE.md` documents),
`npm run build-storybook`, `npm run docs:check`.

Storybook: `Screens/06 Transactions — List` and its `Filtered` story, plus both frame 07 stories,
opened in a browser - which is the only check that catches a missing
`nextjs: { appDirectory: true }`, since neither gate runs a story.

The real app, against the running backend: added two transactions and watched them appear in the
table rather than only in the badge; searched (URL gains `?search=`, caret survives, badge shows
the post-filter total); typed on to a term matching nothing and got the no-results card with the
bar still visible; cleared the field and watched the key leave the URL; changed each of the three
selects and confirmed the others survive; Back-navigated and watched the field resync; and loaded
a URL with three invalid filter values.
