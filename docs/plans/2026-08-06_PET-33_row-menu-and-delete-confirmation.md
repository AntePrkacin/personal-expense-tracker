# PET-33 — Row menu and delete confirmation dialog

[PET-33](https://decode.atlassian.net/browse/PET-33) — `[FE] Build row menu and delete
confirmation dialog`. Figma: [10 Row
menu](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=30-257),
[12 Delete
confirmation](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=31-302).

Base branch is `refactor/PET-57-daisyui-frontend` (PR #42), so this is a stacked branch and its
PR targets that branch rather than `main`.

## Why

PET-29 shipped the transactions table with a kebab drawn as an inert `<span>`, and PET-31 shipped
the app's only write. A user can log an expense and watch it appear in the list, and cannot
remove one. `DELETE /api/transactions/:id` has existed since PET-27 - 204, 400, 401, 404 - and
nothing in the frontend calls it. This ticket adds the menu behind the kebab, the confirmation
dialog behind its "Delete", and the first delete write in the app.

It also closes half of the trap `frontend/src/app/CLAUDE.md` records at the end: that the
transactions screen looks finished and the two controls a reviewer is most likely to try are the
two that are dead. The kebab stops being one of them. A row click still opens nothing, which is
PET-34's.

## What cannot be built yet, and what this does about it

Three of the seven acceptance criteria describe screens that do not exist. Written down here so
the PR is not read as an unfinished one:

| AC | Depends on | Disposition |
| --- | --- | --- |
| AC2 — "Edit" opens the edit modal | PET-32, In Progress, nothing in the repo | Edit ships **disabled**. Amends AC2. |
| AC3 — the dialog also opens from the detail page and the edit modal | PET-34, PET-32 | The dialog is opened through a shell-level provider, so each of those adds a two-line call site. Only the row-menu entry point is live. |
| AC6 — the dashboard cards, chart, donut and category cards stop including it | Dashboard `<main>` is empty; the Categories tab is PET-36 | `router.refresh()` makes it true the day those screens read anything. Unverifiable today. |
| AC7 — deleting from the detail page lands back on the list | PET-34 | Deliberately **not** designed in. See below. |

AC7 is the one worth arguing rather than listing. The obvious move is an `onDeleted` or a
`redirectTo` on the provider's `open()`, ready for PET-34 - and that is exactly the shape this
repo has already been bitten by. PET-29's first version gave `TransactionsTable` a `pending`
prop that no caller could pass: the affordance existed, had tests that set it by hand, and was
wired to nothing. A callback nothing passes is the same object. PET-34 adds the option in the
ticket that has a caller for it.

## Decisions

**Edit renders disabled rather than being omitted or wired to nothing.** daisyUI's
`menu-disabled` plus `aria-disabled`, so it announces honestly. The alternative - a menu with one
item - is strictly honest too and costs PET-32 a re-layout instead of a flag, and it makes frame
10 look like a different design. The precedent it deliberately breaks with is the inert `<span>`
kebab, `SearchPill` and both tabs: those are things that look operable and are not, where this is
a thing that says it is unavailable.

**`(app)/Modal.tsx` is extended, not duplicated.** Frame 12 is a centred icon circle above a
centred title with no X, where `Modal` draws a left-aligned title with an X beside it. Two
optional props - `icon` and `align` - are what closes that gap. The alternative, a
`ConfirmDialog` of its own, would re-implement the single-exit `close()`, the focus capture and
restore, and the backdrop target test: the three trickiest things in the file, duplicated so that
one dialog can be centred. Modal's own doc already names "both delete confirmations" among the
frames it serves.

**The menu is the daisyUI popover dropdown, not React state.** AC1 asks for "clicking elsewhere
or pressing Escape closes it", which is light dismiss and the Escape default action - the
platform gives both, plus the top layer, which is the same argument `(app)/Modal.tsx` makes for
`<dialog>` and `ui/Select.tsx` for `<select>`. Hand-rolling it means a document click listener, a
keydown listener and a chosen z-index, which is three of our approximations in place of three
browser guarantees. daisyUI 5 requires it independently: the `dropdown` component's own rules
forbid the legacy `tabindex`, `<details>` and focus-based forms.

Two consequences of that, both recorded rather than fought.

**jsdom 26.1.0 implements none of the Popover API.** Verified directly: `showPopover` is
`undefined`, and `popoverTargetElement` is not on `HTMLButtonElement`. Unlike `<dialog>`,
`jest.setup.ts` gets **no** polyfill - faking light dismiss would turn AC1 into a test of the
fake, passing just as happily with the real markup broken, which is the call that file already
makes about Escape. The practical effect is that in Jest the menu is always "open", so the suites
assert the wiring - the trigger's name, the target and id pairing, Edit's disabled state, that
Delete opens the dialog with that row's values - and opening and closing is a Chrome and
Storybook check.

**Firefox does not support CSS anchor positioning.** daisyUI ships an
`@supports not (position-area: bottom)` fallback that renders the popover centred with a dimmed
backdrop instead of anchored to the kebab. Degraded rather than broken, and cheaper than
hand-rolling positioning for one browser.

**`lucide-react` arrives as the icon library**, per the daisyUI Blueprint MCP's setup guidance,
and PET-33's pencil and trash come from it. The repo's two existing hand-traced glyphs -
`ui/Button.tsx`'s `TrashGlyph` and `(app)/Modal.tsx`'s `CloseGlyph` - stay where they are for
now; migrating them is a change with no behaviour in it and belongs in its own commit.
`docs/TODO.md` carries it.

**The dialog's body copy follows the ticket, not the frame.** DEL-1 as written in Jira uses
straight quotes and a hyphen; the frame draws curly quotes and an em dash. Following the frame
would make this the only curly-quote copy in the repo and would diverge from the text a reviewer
diffs the screen against.

## Shape

**The write path.** `lib/session.ts` gains `authorizedDelete(path)`, the third verb beside
`authorizedGet` and `authorizedPost`, reusing `AuthorizedWriteResult` rather than inventing a
second result shape: a missing cookie reports 401, a 204 is `{ ok: true }`, and a request that
never completed carries no status, which is the convention `lib/backend.ts` set. `lib/
deleteTransaction.ts` is the Server Action over it, named after the operation for
`createTransaction`'s reason - `'use server'` makes every export an action, so it cannot live
beside the reads in `lib/transactions.ts`. Three reasons rather than four: 404 is `missing`, 401
is `unauthenticated`, and 400 folds in with everything else as `failed`, because a malformed id
is indistinguishable from a broken request to the person who pressed the button and there is no
`categoryMissing` equivalent here.

**The dialog is mounted once on the shell**, exactly as `AddTransactionProvider` is, and for a
sharper version of the same reason: the table draws one kebab per row, so a dialog owned by the
menu would mount one `<dialog>` per transaction, each with its own focus trap. The provider takes
`{ id, merchant, amount, date }`, `useDeleteTransaction()` throws outside it, and the dialog
renders only while open - the closed-dialog-renders-nothing rule `(app)/pages.test.tsx` depends
on in two places.

**The menu's client boundary is smaller than PET-29 predicted.** `TransactionRow.tsx` was split
out of `TransactionsTable.tsx` in anticipation of the kebab needing open state; the popover means
there is no open state at all, so the directive lands on `TransactionRowMenu.tsx` alone and the
row stays a Server Component. The menu is a client component only because Delete calls into a
context.

## Tasks

- [ ] Commit this plan alone and open the draft stacked PR against `refactor/PET-57-daisyui-frontend`
- [ ] Install `lucide-react` in `frontend/`
- [ ] `lib/session.ts`: `authorizedDelete`, with its suite
- [ ] `lib/deleteTransaction.ts`: the Server Action, with its status-to-reason suite
- [ ] `(app)/Modal.tsx`: the `icon` and `align` props; extend `Modal.test.tsx` both ways
- [ ] `(app)/DeleteTransactionDialog.tsx` and its suite
- [ ] `(app)/DeleteTransactionProvider.tsx` and its suite; mount it on `(app)/layout.tsx`
- [ ] `transactions/TransactionRowMenu.tsx` and its suite
- [ ] `TransactionRow.tsx` and `TransactionsTable.tsx`: the live kebab and the named fifth header cell
- [ ] `(app)/pages.test.tsx`: wrap in the second provider, re-verify the inert-control cases
- [ ] Stories: `Shell/Delete transaction`, and check `Screens/06 Transactions — List` draws a live kebab
- [ ] Docs: both `CLAUDE.md` files under `frontend/`, root `CLAUDE.md`, `docs/TODO.md`
- [ ] Comment on PET-33 with the AC2 amendment and the AC3, AC6 and AC7 dependencies

No `npm run api:sync`: nothing here changes a request or response body.

## Verification

From `frontend/`: `npm run lint`, `npm test`, `npm run build` (the typecheck) and
`npx tsc --noEmit`, which is the only one that reaches `*.test.tsx`. From the repo root:
`npm run docs:check`.

Then the app itself, signed in, in **Chrome**:

1. The kebab opens a menu anchored under it; a click anywhere else closes it; Escape closes it (AC1)
2. Edit reads as disabled and does nothing (AC2, amended)
3. Delete closes the menu and opens the dialog quoting that row's merchant, amount and date (AC3)
4. Cancel leaves the transaction untouched (AC5)
5. Delete removes the row and drops the "All transactions" badge by one (AC4)

Then the same page in **Firefox**, to confirm the menu falls back to centred-with-a-backdrop
rather than breaking. Then `Shell/Delete transaction` in Storybook, which is the only check there
is on a story that reaches a router hook - both gates miss it.

**One gap this ticket creates and does not fix.** Deleting a row unmounts the kebab that opened
the dialog, so `Modal`'s `isConnected` guard finds nothing to hand focus back to and it lands on
`<body>`. That is the same gap `docs/TODO.md` already carries for saving from the empty state,
and it joins that entry rather than opening a second one.
