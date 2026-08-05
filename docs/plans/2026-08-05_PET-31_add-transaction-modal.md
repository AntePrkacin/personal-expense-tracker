# PET-31 — [FE] Build Add transaction modal with validation

Ticket: [PET-31](https://decode.atlassian.net/browse/PET-31) · Figma
[09 Add transaction](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=28-135)
(node `28:384`) · stacked on `feat/PET-30-transactions-empty-state` (PR #43)

## Why

The backend has had the transaction write path since PET-27 and the category endpoints since
PET-35, and **no screen has ever written to either**. This ticket builds frame 09 — a modal over
the dimmed page with Amount, Category, Date, Merchant and Note — validates it on submit, and
POSTs it.

It is the repo's **first modal** and **first authenticated write**, so several decisions here set
precedent rather than follow one. It is also **the ticket PET-30 is waiting on**: PET-30's AC4 is
explicitly open, and its comment says "once that lands, AC4 needs nothing here beyond an
`onClick`".

## Decisions

| Question | Answer |
| --- | --- |
| Branch | Stacked on PET-30, which introduced `authorizedGet`, `EmptyState` and the second trigger |
| Modal mechanism | Native `dialog` + `showModal()`, with a jsdom polyfill in `frontend/jest.setup.ts` |
| Date control | A Select-styled trigger opening a custom mini-calendar popover |
| Category | A `Select…` placeholder, not a preselected fallback |
| AC5 | `router.refresh()`; the badge half is met, the list half is PET-29's |

**Native `dialog` is the call `ui/Select.tsx` already argues for** over a hand-rolled listbox. It
gives the top layer (so no z-index is chosen at all, and it beats the sidebar's `sticky top-0`), UA
centring over the whole viewport including the sidebar — which is what Figma draws — focus
containment, Escape via `cancel`, focus restore to the trigger, `inert`-equivalent blocking of the
page behind, and `::backdrop` as the scrim with no extra element.

The cost is real and is recorded here so nobody rediscovers it: jsdom 26.1.0's
`HTMLDialogElement.prototype` carries exactly `constructor` and `open`. No `showModal`, no `close`,
no `cancel` event, no top layer. So a guarded polyfill goes in `frontend/jest.setup.ts`, and Escape,
the focus trap and focus restoration become Storybook and manual checks — the trade
`app/setup/BudgetForm.tsx`'s caret restore already documents.

## What PET-30 changed under this plan

1. **`authorizedGet` exists in `frontend/src/lib/session.ts`** and all three reads go through it.
   `frontend/CLAUDE.md` now says outright not to inline a fourth copy, so `lib/categories.ts` is a
   handful of lines rather than a transcription of `lib/profile.ts`. It lives in `session.ts`
   because it needs `SESSION_COOKIE` and `lib/backend.ts` would cycle — the split is by credential,
   not by HTTP verb, which is what says where the write helper belongs.
2. **The tab badge is real.** `TransactionTabs` reads `view.total`, so `router.refresh()` genuinely
   increments it. AC5's badge half is now buildable and testable where it was impossible.
3. **A third trigger exists and two are on one page.** `TransactionsScreen.tsx` has the header's
   button and `TransactionsEmpty.tsx` has the empty card's. PET-30's own `pages.test.tsx` comment
   records that the second one "would make the `getByRole` below ambiguous", so the
   duplicate-trigger problem is manifest rather than forecast.
4. **The table is PET-29's, not PET-28's.** PET-30 took the list read, the tab bar and the badge
   out of PET-29's scope.

Baseline to beat: 1406 tests, 55 suites, green on #43.

## Three traps that fail quietly

Each verified by compiling against this repo's own Tailwind harness.

1. **`m-auto` is mandatory.** Tailwind preflight sets `margin: 0` on `*` and `::backdrop`, which
   defeats the UA's `dialog { margin: auto }` — the entire centring mechanism. Without it the modal
   pins to the top-left corner.
2. **The display class is `open:flex`, never bare `flex`.** A plain `flex` overrides the UA's
   `dialog:not([open]) { display: none }`, so the box flashes visible between mount and the effect.
3. **No `overflow-clip`**, despite Figma reporting it. It would clip the footer buttons'
   `focus-visible:outline-offset-2`, the reason `components/AccessCard.tsx` already omits it. The
   UA's own `dialog:modal` max-height and `overflow: auto` survive preflight and handle a short
   window.

## Shape

`(app)/Modal.tsx` is a reusable shell, not one monolith: frames 09, 11, 19, 21 and both delete
confirmations draw the same box, and every one sits inside the `(app)` group — the common parent, so
this is the `PageHeader` case rather than `AccessCard`'s. It takes `title`, `onClose`, `children`,
`footer`, `initialFocusId` and `onSubmit`, renders the title as an `h2` so the page keeps one `h1`,
and takes its title id from `useId()`.

**Every close affordance funnels through one exit**: `close()` fires the native `close` event, which
is `onClose`. Escape needs no code at all. The backdrop click is an `onClick` closing only when
`event.target` is the dialog itself.

**One modal instance per shell**, owned by `AddTransactionProvider` on `(app)/layout.tsx`. A
per-header component would mount two dialogs on Transactions with two focus traps and two copies of
every `ui/Field` id — a required literal prop precisely because `useId` would force `'use client'`
onto the field layer — so the DOM would carry duplicate ids and `getByLabelText` would throw. The
payoff: PET-20's DSH-9 teaser and PET-44's INS-7 card each add a trigger in two lines.

**A closed modal renders nothing**, and the reason is text queries rather than role queries: a
closed dialog gets `display: none` so `queryByRole` cannot see inside it, but `queryAllByText` and
`queryAllByLabelText` can.

**The write needs `authorizedPost` beside `authorizedGet`**, and one thing about it is the design
point: `AuthorizedResult` collapses every non-401 failure into `unavailable`, which is right for a
read and wrong here. The modal must tell 400 (say "check the values", never "try again", which would
loop forever) from 404 (the category was deleted since the modal opened) from a request that never
completed. So it surfaces the status on rejection and `lib/createTransaction.ts` classifies.

**No `Date` round-trips a submitted value.** `new Date().toISOString().slice(0, 10)` is wrong in
both directions: at 20:00 on Oct 8 in UTC−5 it says Oct 9, and at 00:30 on Oct 9 in UTC+2 it says
Oct 8. `lib/date.ts` builds the string from local getters with no `Intl` and no UTC.

**The date control** is a button wearing the Select field's clothes, because a native `select`
cannot host a popover. The popover sits inside the dialog, so the top layer already covers it. Its
Escape handler must `preventDefault` and `stopPropagation` — otherwise the browser's close request
closes the whole modal instead of just the calendar. That is the one place Escape needs code.

## Tasks

- [ ] Stack the branch and commit this plan alone, then open a draft PR
- [ ] `--shadow-modal` in `globals.css`, its row in `globals.test.ts`, and "three shadows" becoming four
- [ ] The guarded `showModal` / `close` polyfill in `jest.setup.ts`, with Escape deliberately not faked
- [ ] `lib/date.ts` and `lib/calendar.ts` with suites
- [ ] `(app)/transactionForm.ts`: the predicates and the one boundary to `CreateTransactionDto`
- [ ] `lib/categories.ts` on `authorizedGet`, and `app/api/categories/route.ts`, with suites
- [ ] `authorizedPost` in `lib/session.ts`, and `lib/createTransaction.ts`, with suites
- [ ] Export `Chevron` from `ui/Select.tsx`; give `ui/Field`'s label an id
- [ ] `(app)/Modal.tsx` with its suite and its `Shell/Modal` stories
- [ ] `(app)/DateField.tsx` with its suite
- [ ] `AddTransactionProvider`, `AddTransactionButton` and `AddTransactionModal` with suites
- [ ] Wire all three triggers; repair `pages.test.tsx`, `TransactionsScreen.test.tsx`, `layout.test.tsx`
- [ ] New classes into `ui/utilities.test.ts`; `Screens/09` stories including `WithMessages`
- [ ] Docs: both `CLAUDE.md` files, `docs/agents/api-contract.md`, `docs/TODO.md`
- [ ] Gates, then comment on PET-31 and PET-30

## Copy, all of it ours

Assumption A29 records that no form error visual exists anywhere in the Figma file, so every string
below owes a designer sign-off. The `WithMessages` story is the artifact to review.

| case | string |
| --- | --- |
| empty, zero or negative amount | Enter an amount greater than 0. |
| missing category | Choose a category. |
| missing date | Choose a date. |
| missing merchant | Enter a merchant. |
| 400 | We couldn't add this transaction. Please check the values and try again. |
| 404, dead category | That category no longer exists. Pick another one. |
| 401 | Your session has expired. Log in again to save this. |
| generic or never completed | We couldn't add this transaction. Please try again. |
| categories would not load | We couldn't load your categories. Please close this and try again. |

**One amount string covers AC3 and AC4.** `BudgetForm` already reuses "Enter an amount greater than
0." for both its empty and its zero case, and it is the only error copy in the app read off an
existing artifact — `ui/Field`'s doc comment and `Input.stories.tsx`'s `WithError` — rather than
invented. It states the rule, so it is true of both.

## Amendments to file on Jira

1. **AC5 splits, and it is better news than before.** The tab badge half is met and tested; only
   "the expense appears in the list" is blocked, on PET-29's table slot rather than PET-28. Reword
   as "the modal closes, the page refreshes and the badge increases by one".
2. **PET-30's AC4 closes with this ticket**, exactly as its comment predicted.
3. **AC4** wants one amount message, not two.
4. **ADD-7 and A14**: the date pattern is a custom mini-calendar rather than the "standard date
   picker" the spec hedged on, and the popover has no Figma frame at all — weekday order, day-cell
   states and header layout are ours.
5. **A29** owes sign-off on the nine strings, plus the X's stroke width and colour token and whether
   its 34px target has any hover treatment. None is drawn anywhere in the file.
6. **AC7's outside click can silently discard a half-typed form.** The AC is explicit and A19 backs
   it, so it ships as written, but it is the one affordance that loses typed data by accident and no
   discard confirmation is designed. A product opinion rather than a blocker.
7. **Two live gaps before a demo, both PET-29's.** Saving from the Transactions empty state replaces
   the card with the table slot, which is blank until PET-29, so the page shows correct tabs, a badge
   of 1 and nothing under it. And that refresh destroys the very button that opened the modal, so the
   browser's focus restore has no target — hypothetical while only header triggers existed, real now.
8. **Backdating**, on PET-29: the list defaults to `period=current`, so a September date entered in
   October creates a row the refreshed list will not show and the badge will not count. Record it
   rather than fix it — the period filter is PET-29's, a confirmation naming the month is copy A19
   and A29 design nothing for, and bounding the date field contradicts the DTO's own statement that
   backdating is ordinary and supported.

## Verification

Gates from `frontend/`: `npm test` against the 1406-test baseline, `npm run lint`, `npm run build`,
`npx tsc --noEmit` (required, because `build` does not typecheck test files and this adds a five-arm
union that suites construct by hand; three pre-existing `Sidebar.test.tsx` errors are expected),
`npm run build-storybook`. Then `npm run docs:check` from the root. **No `api:sync`** — nothing a
request or response body is made of changes.

By hand, backend on 3000 and frontend on 4200, signed in via an emailed link, in both Chrome and
Firefox since every free behaviour here is the UA's:

1. Open from the Dashboard header, the Transactions header and the Transactions empty card. Confirm
   the scrim dims the sidebar too, the box is centred at 1440x1024 against node `28:384`, and Amount
   holds focus with the accent border and a visible currency prefix (AC1 and AC2, neither observable
   in jsdom).
2. On an empty account: type an amount, open the Date popover, page back a month and forward again,
   pick today, type a merchant, leave Note blank, submit. The modal closes and the badge goes 0 to 1
   (AC5's met halves, AC6). The empty card is replaced by a blank table slot, which is PET-29's.
3. Confirm the row landed, through the Swagger UI at `http://localhost:3000/api/docs`.
4. Submit empty for four inline messages at once with nothing saved (AC3); submit a zero (AC4).
5. Close via Cancel, the X, a backdrop click and Escape (AC7). With the calendar open, confirm the
   first Escape closes only the popover and the second closes the modal.
6. Tab and Shift+Tab through the open modal: focus must cycle inside the dialog and return to the
   trigger on close, and the footer buttons' focus outlines must not be clipped. These are the
   polyfill's blind spots, so this is the only check on them.
7. Backdate a transaction to last month and confirm it neither appears nor counts — the gap in
   amendment 8, verified rather than assumed.
8. `npm run storybook`: `Shell/Modal` and `Screens/09 Add transaction`, each diffed against Figma.
