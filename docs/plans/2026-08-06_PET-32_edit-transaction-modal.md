# PET-32 — Edit transaction modal with prefilled values

[PET-32](https://decode.atlassian.net/browse/PET-32) — `[FE] Build Edit transaction modal with
prefilled values`. Figma: [11 Edit
transaction](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=29-196).

Base branch is `main`. PET-33 merged at `2da69dd`, so nothing is stacked and this is an ordinary
branch.

## Why

A user can log an expense and delete one, and cannot correct one. `PATCH /api/transactions/:id`
has existed since PET-27 — 200, 400, 401, 404 — and nothing in the frontend calls it: there is no
`authorizedPatch`, no update action and no edit form.

The visible half is the row kebab. PET-33 shipped its "Edit" item as a `menu-disabled` `<span>`
carrying `aria-disabled`, and both `frontend/src/app/(app)/transactions/TransactionRowMenu.tsx` and
`frontend/CLAUDE.md` name this ticket as the one that turns it into a real button. That also closes
PET-33's own AC2, which its Jira comment records as amended pending this work.

Three files were written in anticipation of this ticket and say so, and following them is most of
the design. `(app)/Modal.tsx` predicts frame 11's left-hand Delete button as `modal-action` plus a
`justify-between`. `(app)/layout.tsx` says the Add and Delete provider pairing "is what lets
PET-32's edit modal open the confirmation over itself". And `(app)/DeleteTransactionProvider.tsx`
deliberately left `open()` without an `onDeleted`, because "the ticket with the caller adds the
parameter" — this is that ticket.

## What cannot be built yet, and what this does about it

Two of the six acceptance criteria name a screen that does not exist. Written down here so the PR
is not read as an unfinished one:

| AC | Depends on | Disposition |
| --- | --- | --- |
| AC1 — the modal opens from the row menu **or from its detail page** | PET-34: no route, no read, no header | The row menu only. The modal is mounted on the shell, so PET-34 adds a two-line call site. Amends AC1. |
| AC3 — the new value shows **on the detail page** | PET-34 | Same. Amends AC3. |
| AC3 — and in **the dashboard and category totals** | The Dashboard `<main>` is empty and PET-21 to PET-26 are an open draft stack; the Categories tab is PET-36 | `router.refresh()` makes it true the day those screens read anything. Unverifiable today, exactly as PET-33's AC6 was. |

## Decisions

**The patch body carries only what changed.** `UpdateTransactionDto` is a real partial patch —
absent leaves a field alone, `null` clears the note — so a diff is what it is built for, and it
keeps an edit from rewriting four fields the user never touched. Two consequences. Emptying a Note
that had one sends `note: null`, which is the only way to clear it, while leaving a blank Note blank
sends nothing at all. And **saving with nothing changed closes the modal without a request**, rather
than earning the backend's empty-body 400 — `Provide at least one field to update.` is a correct
answer to a question the user did not ask.

**A 404 is ambiguous on PATCH, and the diff is what narrows it.** The backend answers 404 both for
a missing transaction and for a missing `categoryId`, distinguished only in the message text — where
create's 404 could only ever be the category and delete's only ever the transaction. So this
classification is new rather than copied. Since the action builds the body it knows whether
`categoryId` is in it: without one a 404 can only be the transaction, and with one the copy names
both. Two reasons and two strings, rather than matching the backend's error prose, which nothing
pins and which a wording change would silently invert.

**The delete confirmation opens over the edit modal, which stays mounted behind it.** So Cancel
returns the user to their form with their edits intact. `Modal` already generates its heading id
with `useId()` for exactly this case — its comment calls frame 11 opening frame 12 "a real
two-dialog case" — and `layout.tsx` already predicts the nesting. The cost is the parameter PET-33
declined to invent: `open()` grows an optional `onDeleted`, which is sound now because there is a
caller for it, and was the `TransactionsTable`-`pending` mistake before that.

**The confirmation quotes the stored values, not the edited ones.** It describes the row that is
about to be removed, so quoting an unsaved draft would misdescribe it.

**`useCategoryOptions` is lifted rather than duplicated.** The Add provider's fetch-on-open is a
path string plus a generation guard against a late response writing into a reopened modal — subtle
correctness logic rather than markup, which is the distinction the rule of three is about. The path
is also a string whose only other copy, `app/api/categories/route.ts`, the Add provider's suite
asserts character for character; a third would be a third place to forget. The effect collapses
into a `read()` the opener calls, which is what keeps the state reset out of an effect body:
`react-hooks/set-state-in-effect` rejects that and this repo carries no eslint-disable comments.

**No third copy of `isAmountValid`.** The edit form reuses `(app)/transactionForm.ts` wholesale, so
the rule of three does not fire and `lib/amount.ts` is still not earned. `docs/TODO.md` predicted
this ticket would be the third copy, and its entry gets amended rather than acted on.

**No `isFallback` on `CategoryOption`.** `lib/categories.ts` invites this ticket to add it back.
Declined: the edit form prefills a real `categoryId` and never needs to preselect the fallback, so
the field would arrive with no reader — which is the same objection as the callback above.

## Shape

**The write path.** `lib/session.ts` gains `authorizedPatch(path, body)`, the fourth verb beside
the other three, reusing `AuthorizedWriteResult` rather than growing a shape of its own and still
taking a `path` — so that module still must not become `'use server'`. It does not parse the 200
body: `session.ts` offers this ticket the returned `TransactionResponseDto`, and nothing reads it,
because `router.refresh()` is what makes the new value appear on screen.

`lib/updateTransaction.ts` is the `'use server'` action over it, and it publishes **five** reasons
where create publishes four and delete three. `invalid` is 400, which covers both a value the DTO
rejects and a malformed id from `ParseUUIDPipe`. `unauthenticated` is 401. `transactionMissing` and
`transactionOrCategoryMissing` are the 404 split above. `failed` is everything else, including a
request that never completed. `encodeURIComponent(id)` in the path, as `deleteTransaction` does.

**`transactionForm.ts` gains two boundaries and keeps its rules.** `toTransactionFormValues` turns
a `Transaction` into form values: `formatAmountInput(amount.toFixed(2))`, so a stored `24` renders
as EDT-1's `24.00` rather than `24`; `note: note ?? ''`, because a controlled input cannot hold
`null`; date and merchant verbatim. `toUpdateTransactionBody(original, values)` is the diff, and the
note arm is the only interesting one — trimmed, compared against `original.note ?? ''`, and included
as `null` when it emptied. `invalidFields`, all four predicates and the strings-live-in-the-component
convention are reused unchanged.

**`Modal` gains `footerStart`, on the `align: 'start'` arm of `ModalShape` only.** Present, the
footer row becomes `modal-action justify-between` with the right-hand controls grouped so Cancel and
Save stay together; absent, nothing about the footer changes. `footerStart?: never` on the centre
arm, because frame 12 draws no such control and a prop that typechecks and then renders nothing is
exactly the mistake that union already exists to prevent. The grouping element's gap is read from
`frontend/node_modules/daisyui/components/modal.css` rather than guessed.

**`(app)/EditTransactionModal.tsx`** mirrors `AddTransactionModal` field for field: the same five
controls in ADD-2's order, the same amount reformat-and-caret handler, the same submit-only
validation clearing per field, its own `edit-transaction-*` id constants, and `initialFocusId` on
Amount, which frame 11 draws focused exactly as frame 09 does. Four differences. Values initialise
from `toTransactionFormValues(transaction)`. The footer is Cancel plus `Save changes`, with a
`variant="textDanger"` `Delete transaction` in `footerStart` carrying lucide's `Trash2`. An empty
diff closes without a request. And the action call is wrapped in `try/catch`, which is the
RPC-rejects case `DeleteTransactionDialog` had to add after a review and `AddTransactionModal` still
lacks — not a defect to copy. The action arrives as a prop, so the suite injects a `jest.fn()` and
no `jest.mock` has to resolve the `@/` alias.

**`(app)/EditTransactionProvider.tsx`** holds `Transaction | null` — one piece of state, which is
`DeleteTransactionProvider`'s shape rather than a boolean beside a target — renders the modal only
while open, and throws from `useEditTransaction()` outside it. The closed-modal-renders-nothing rule
is load-bearing rather than tidy: `(app)/pages.test.tsx` depends on it in two places, because a
closed dialog is invisible to `queryByRole` and entirely visible to `queryAllByLabelText`. The
provider calls `useCategoryOptions` and `useDeleteTransaction().open(stored, { onDeleted })`, so the
modal itself knows about neither. It mounts inside `DeleteTransactionProvider` on
`(app)/layout.tsx`, because it consumes that context.

**`DeleteTransactionProvider.open` grows an options argument**, and the dialog calls `onDeleted?.()`
on success only. The unwind order is `router.refresh()`, then the confirmation's own `close()`, then
`onDeleted()`, so the two dialogs come down top-first: the confirmation restores focus to the edit
modal's Delete button, which then unmounts and hands focus on toward the kebab. The kebab was
destroyed with the row, so focus lands on `<body>` — the gap `docs/TODO.md` already carries for the
delete path, reached by one more route.

**The row menu's Edit becomes a button** shaped exactly like its Delete: `popovertargetaction="hide"`
so the dialog never opens under an open popover, `triggerRef.current?.focus()` first so `Modal`
captures the kebab rather than a menu item about to be hidden inside a closed popover, then
`open(transaction)`. It passes the **whole** transaction where Delete passes four fields, and that
is the point rather than an oversight: a row already carries `note` and `categoryId`, so every field
prefills with no second read. `menu-disabled` and `aria-disabled` are deleted.

## Tasks

- [ ] Commit this plan alone and open the draft PR against `main`
- [ ] `lib/session.ts`: `authorizedPatch`, with its cases in `session.test.ts`
- [ ] `lib/updateTransaction.ts`: the action and its five-reason mapping, with its suite
- [ ] `(app)/transactionForm.ts`: `toTransactionFormValues` and `toUpdateTransactionBody`, with the note tri-state and the empty diff pinned
- [ ] `(app)/useCategoryOptions.ts`: lift the path, the fetch and the generation guard out of `AddTransactionProvider`, refactor that provider onto it, keep its suite green
- [ ] `(app)/Modal.tsx`: `footerStart` on the start arm; extend `Modal.test.tsx` both ways
- [ ] `(app)/EditTransactionModal.tsx` and its suite, organised by acceptance criterion
- [ ] `(app)/EditTransactionProvider.tsx` and its suite; mount it on `(app)/layout.tsx`; repair `layout.test.tsx`
- [ ] `DeleteTransactionProvider` and `DeleteTransactionDialog`: the `onDeleted` option, with success, failure and cancel pinned
- [ ] `transactions/TransactionRowMenu.tsx`: the live Edit item; invert the disabled assertions in its suite
- [ ] `(app)/pages.test.tsx`: wrap in the third provider, re-verify the inert-control and no-dialog cases
- [ ] Stories: `Screens/11 Edit transaction`, added to `screens.stories.test.tsx`'s `MODULES`; update `TransactionsList.stories.tsx`'s wrapper and its "Edit reads dimmed" note
- [ ] Docs: both `CLAUDE.md` files under `frontend/`, root `CLAUDE.md`, `docs/agents/api-contract.md`, `docs/TODO.md`
- [ ] Comment on PET-32 with the AC1 and AC3 amendments, and close out PET-33's AC2

No `npm run api:sync`: nothing here changes a request or response body, and the `PATCH` operation
and `UpdateTransactionDto` are already in both committed artifacts.

## Copy, all of it ours

Ten messages: **six reused verbatim from frame 09, four new.** The four field messages are among the
reused — they state rules rather than operations, so `Enter an amount greater than 0.` is as true of
an edit as of a create. The four new ones each join what assumption A29 owes a designer, since no
form error visual exists anywhere in the Figma file. The `WithMessages` story is the artifact to
review them on.

| case | string |
| --- | --- |
| 400 | We couldn't save this transaction. Please check the values and try again. |
| 404, no category in the body | This transaction no longer exists. Close this and refresh the list. |
| 404, a category in the body | This transaction or that category no longer exists. Close this and try again. |
| 401 | Your session has expired. Log in again to save this. |
| generic or never completed | We couldn't save this transaction. Please try again. |
| categories would not load | We couldn't load your categories. Please close this and try again. |

The 401 and the categories line are reused verbatim, which with the four field messages makes six. Of
the four that remain, the 400 and the generic failure are frame 09's own sentences with the verb
changed, because "add" is wrong about an edit and "check the values" must never become "try again"
for a body the DTO will reject just as firmly the second time. The two 404 lines have no counterpart
in frame 09 at all: that endpoint's 404 could only ever mean a missing category.

## Verification

Gates from `frontend/`: `npm run lint`, `npm test`, `npm run build`, `npx tsc --noEmit` and
`npm run build-storybook`. The `tsc` run is required rather than belt-and-braces: this adds a
five-arm union and widens an exclusive one, both of which suites construct by hand, and `build`
never reads `*.test.tsx`. Then `npm run docs:check` from the repo root.

Then the app itself, backend on 3000 and frontend on 4200, signed in, in **Chrome**:

1. Kebab, then Edit. Every field prefilled: the amount as `24.00`, the category selected rather than
   `Select…`, the date reading `Oct 8, 2025`, merchant and note filled (AC1). Amount holds focus.
2. The footer at 1440x1024 against node `29:196`: a red `Delete transaction` with its trash icon on
   the left, Cancel and `Save changes` grouped on the right (AC2).
3. Change the amount and save. The modal closes and the row shows the new value (AC3). Confirm
   through the Swagger UI at `http://localhost:3000/api/docs` that only `amount` was written.
4. Clear the merchant and submit: an inline message, nothing saved (AC4). Then a `0` amount, for the
   one shared amount message.
5. Save with nothing changed: the modal closes and the Network tab shows no request at all.
6. Clear a Note that had one, save, and confirm through Swagger that `note` is `null` rather than
   `""`.
7. Close via Cancel, the X, a backdrop click and Escape, each discarding the edits (AC5). With the
   date popover open, confirm the first Escape closes only the popover.
8. `Delete transaction`: the confirmation opens over the edit modal quoting the stored merchant,
   amount and date (AC6). Cancel returns to the form with the edits still typed and focus back on
   the Delete button. Then Delete: the row goes, both dialogs close, the badge drops by one.
9. Tab and Shift+Tab through the open modal, and again with the confirmation over it. The focus trap
   and Escape are jsdom's blind spots, so this is the only check there is on them.
10. Move a date into another month and save. The row leaves the `period=current` list, which is the
    entry `docs/TODO.md` already carries for a backdated create, now reachable by editing too —
    verified rather than fixed, and that entry gains the edit path.

Then `/transactions` in **Firefox**, to confirm the row menu still falls back to
centred-with-a-backdrop and that Edit works from it. Then Storybook: `Screens/11 Edit transaction`
diffed against frame 11, and `Screens/06 Transactions — List` to confirm Edit no longer reads
dimmed.
