# PET-39: Build the category row menu and delete confirmation

Jira: [PET-39](https://decode.atlassian.net/browse/PET-39) · Figma:
[18 Categories - Row menu](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=75-806),
[20 Delete confirmation for category](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=102-1078)

**Stacked on `feat/PET-37-add-category-modal`, which is not yet merged and is itself stacked on
`feat/PET-36-categories-tab` (PR #67).** Every file this ticket edits was created by one of those
two branches, so it cannot be cut from `main`; the PR targets `feat/PET-37-add-category-modal`
and GitHub retargets it as each parent lands.

## Why

`/transactions/categories` shipped in PET-36 with a kebab on every card drawn as a real
`<button aria-disabled="true">` that opens nothing, and `CategoryCard.tsx` names PET-39 as the
ticket that owns it in as many words. PET-37 then made the header's "Add category" real, which
leaves that kebab as **the last inert control on the screen** and therefore the one a reviewer is
most likely to try - the same trap `frontend/src/app/CLAUDE.md` recorded four times running on the
transactions screen before PET-34 closed it.

This ticket adds the menu behind the kebab, the confirmation behind its "Delete", and the app's
fifth write: `lib/deleteCategory.ts`, the second delete and the first that removes anything
outside transactions.

Everything server-side already exists. `DELETE /api/categories/:id` has been there since PET-35:
it reassigns the category's transactions to the `Uncategorized` fallback, tombstones the category,
and answers 204, 401, 404 and 409. Nothing in the frontend calls it. **No request or response body
is touched, so `npm run api:sync` does not apply to this ticket** - worth saying out loud, because
root `CLAUDE.md` makes it mandatory after any DTO change and its absence here should read as
deliberate rather than forgotten.

## What the ticket does not know, and what this does about it

Four statements in the description predate the code they describe. All four are recorded on the
issue and in the PR body; three of them change what ships.

| # | The ticket says | What is true | Disposition |
| --- | --- | --- | --- |
| 1 | Transactions "will be moved to Other", and AC6 protects "the Other category" | The fallback is `Uncategorized`; "Other" is an ordinary chip | Copy interpolates the real fallback row's name. **AC6 amends** to "the fallback category". |
| 2 | "Its 24 transactions will be moved" | `transactionCount` is the **current period's**; the delete moves everything | Copy is scoped to say what the number counts. **CED-9 amends.** |
| 3 | AC1's menu carries a working "Edit" | PET-38 does not exist in the repo | Edit ships **disabled**. **AC1 amends.** |
| 4 | AC2's dialog also opens from inside the edit modal (CED-7) | Same | Only the row-menu entry point is live. The provider makes it a two-line call site. |

The first is the one worth arguing rather than listing. `backend/CLAUDE.md` records that role
being **deliberately split**: the ticket originally named the "Other" onboarding chip as the
reassignment target, which would have made one row serve both as a user's free choice and as a
system invariant, so "Other" stays an ordinary chip anyone can rename or delete and
`Uncategorized` became a seeded system row (`is_fallback = 1`, colour `base-content/50`, icon
`circle-question-mark`) that is offered on no screen and never part of `STARTER_CATEGORIES`.
Shipping the ticket's wording would therefore tell the user something false twice over: their
transactions land on `Uncategorized`, and the "Other" card sitting on the same screen is
untouched.

The second is a smaller correction with the same shape. `transactionCount` is computed in
`CategoriesService.withSpend()` against `monthWindow(...)`, and it is exactly the figure the card
footer already draws. The delete reassigns every transaction the category ever held, tombstoned
ones included, so "Its 24 transactions will be moved" understates on any account with history.
The alternative was reading the real all-time count from
`GET /api/transactions?period=all&categoryId=<id>`, which is accurate and costs a round trip
between the click and the dialog plus a loading state A19 designs nowhere. Saying what the number
counts is free and true.

AC3, AC4 and AC5 are met in full. AC4 is the one only verifiable indirectly here, and the
Verification walk says how.

## Decisions

**The menu is the platform popover, not React state.** AC1 asks for "clicking elsewhere or
pressing Escape closes it", which is light dismiss and the Escape default action - the platform
gives both, plus the top layer, so nothing picks a z-index and nothing listens on `document`.
This is the third time this app makes that argument and the second time on this screen:
`transactions/TransactionRowMenu.tsx` first, then `ColourSelect.tsx` and `IconSelect.tsx`.
daisyUI 5 requires it independently, its `dropdown` rules forbidding the legacy `tabindex`,
`<details>` and focus-based forms.

Two costs come with it, both inherited rather than re-litigated, and both already in
`docs/TODO.md`. **jsdom implements none of the Popover API** and `jest.setup.ts` deliberately
polyfills none of it, unlike `<dialog>` - faking light dismiss would turn AC1 into a test of the
fake - so under Jest the menu is permanently open, the suite asserts the wiring, and opening and
closing are Chrome and Storybook checks. And **Firefox does not support CSS anchor positioning**,
where daisyUI's own `@supports` fallback centres the menu behind a dimmed backdrop instead of
anchoring it to the kebab.

**No `role="menu"`, no `role="menuitem"` and no `aria-haspopup`.** A `<ul>` of ordinary buttons,
matching `TransactionRowMenu`. Those roles promise an arrow-key contract this repo does not
implement, and this is the fourth time it has declined to publish one.

**The dialog is `Modal align="center"`, not a new component.** `Modal.tsx`'s `ModalShape` union
already names the category delete confirmation in its own doc comment as one of the frames that
arm serves, so this is the caller it was built for. The centred arm supplies the tinted circle,
drops the X and splits the footer into two equal buttons, which is frame 20 exactly. A
`ConfirmDialog` of its own would duplicate the single-exit `close()`, the focus capture and
restore, and the backdrop target test: the three least obvious things in that file.

**One dialog per screen, owned by a provider `CategoriesScreen` renders. Not one per card, and
not one on the shell.** Three shapes were available and the middle one wins on a concrete failure
rather than on taste.

Per card is `AddCategoryButton`'s precedent, and it puts the `<dialog>` **inside the card being
deleted** - so the success path's `router.refresh()` can unmount the dialog out from under its own
`close()`. That is the same class of defect as `Modal`'s focus restore, which
`frontend/src/app/CLAUDE.md` states as a rule: a platform guarantee that fires during an event
React unmounts inside is not a guarantee.

On the shell is `DeleteTransactionProvider`'s precedent, and it would mount a category dialog on
all four routes. That provider's own stated criterion is five triggers across three segments; this
has N triggers on **one** route, which is the case `AddTransactionProvider` explicitly does not
cover.

So the provider wraps the screen: one `<dialog>` for N cards, it outlives the card that opened it,
and PET-38 gets its call site. `AddCategoryButton` keeps its local state and is not touched - a
context with one consumer still expresses no choice, and that file's note about a per-card kebab
being "a different trigger with different state" is precisely what this provider is.

**The dialog renders only while open**, which `(app)/pages.test.tsx` depends on in two places: a
closed `<dialog>` is `display: none` so `queryByRole` cannot see in, but `queryAllByText` and
`queryAllByLabelText` can.

**The fallback name is resolved once at the screen and passed down.**
`categories.find((c) => c.isFallback)?.name ?? 'Uncategorized'`. The literal is a last resort for
a response carrying no fallback row, which the partial unique index plus provisioning make
unreachable; it is there so the copy degrades to a true sentence rather than to `undefined`.
Resolved at the screen rather than in the dialog so N cards do not each scan the list.

**Delete is omitted on the fallback card, and the 409 is still classified.** AC6 asks for no
delete action on that row, `isFallback` is on `CategoryResponseDto` and already in every fixture,
so the menu decides client-side rather than offering a button that answers 409. The action
classifies 409 anyway, because a hidden control is not an enforcement and the honest message for
that arm is not "please try again".

One consequence to state rather than discover: **`Uncategorized`'s menu is a single disabled
"Edit" until PET-38 lands**, which is a menu with nothing operable in it. That is still better
than a kebab that opens nothing, it announces its condition rather than staying silent, and it
becomes a live one-item menu through the same two-attribute deletion as every other card's.

**"Edit" renders disabled rather than being omitted or wired to nothing**, which is PET-33's call
for the identical control one screen over. `menu-disabled` plus `aria-disabled`, so it announces
honestly; `disabled` is deliberately not used, because it removes the item from the tab order.
The alternative, a menu with one item, is strictly honest too and costs PET-38 a re-layout instead
of an attribute, and it makes frame 18 look like a different design.

**The body copy follows the amended ticket, not the frame.** Straight quotes and a plain
apostrophe: the frame draws curly quotes, and following it would make this the only such copy in
the repo and would diverge from the text a reviewer diffs the screen against. Same call PET-33
made for frame 12.

## Copy

Exported from the dialog module so no test or story restates a shipped string, which is
`TransactionsEmpty.tsx`'s rule and `DeleteTransactionDialog.tsx`'s.

Title: `Delete this category?`

Body, with transactions in the period:

> This permanently removes "Groceries" from your categories. Its 24 transactions this month will
> be moved to Uncategorized, along with any from earlier months. This can't be undone.

Body, with none in the period. A separate shape rather than a count of zero, because "Its 0
transactions this month will be moved" is a sentence nobody writes, and the clause that matters is
the one about earlier months:

> This permanently removes "Groceries" from your categories. Any transactions filed under it will
> be moved to Uncategorized. This can't be undone.

Both go through one exported helper, which also pluralizes - the third pluralized string in the
app after `BudgetCard`'s "days left" and `CategoryCard`'s own `transactionCountLabel`, and still a
local ternary rather than a library.

Buttons are `Cancel` (`variant="secondary"`) and `Delete` (`variant="danger"`, which is
`btn btn-error`). Both variants already exist in `ui/Button`; no new one is needed.

Four failure lines, one per reason arm, all ours and all joining what A29 owes a designer:

- `missing` - the category is already gone, close this to see the current list. It must **not**
  say "try again": a repeat answers 404 forever.
- `fallback` - `Uncategorized` cannot be deleted, because it is where deleting any other category
  sends its transactions. Unreachable through the UI by construction, and the message has to be
  right anyway.
- `unauthenticated` - the session has expired, log in again.
- `failed` - could not delete, please try again.

## Shape

**The write path.** `lib/session.ts` needs nothing new: `authorizedDelete` arrived with PET-33 and
already returns `AuthorizedWriteResult`. `lib/deleteCategory.ts` is the Server Action over it,
named after the operation for `createCategory`'s reason - `'use server'` makes every export an
action, so it cannot live beside the reads in `lib/categories.ts`. It publishes **four** reasons
where the transaction delete publishes three and the category create three: 401 is
`unauthenticated`, 404 is `missing`, **409 is `fallback`**, and everything else folds into
`failed`. The 409 is the arm neither existing delete has, and it is the whole reason this is not a
copy of `deleteTransaction.ts` with the noun changed.

**The client boundary is the menu, and the card stays a Server Component.** Exactly the split
PET-33 made when `TransactionRowMenu` came out of `TransactionRow`: the popover means the menu
holds no open state, so the `'use client'` is there only because Delete calls into a context, and
`CategoryCard` keeps rendering on the server with its glyph, its bar and its chip.

**What the menu hands over is narrow.** `{ id, name, transactionCount }`, where PET-38's Edit will
hand over the whole category. The confirmation has no business reading a note or a cap, which is
the same asymmetry `DeleteTransactionDialog` and `EditTransactionModal` already have.

## Tasks

- [ ] Commit this plan alone and open the draft stacked PR against `feat/PET-37-add-category-modal`
- [ ] Comment on PET-39 with the four amendments in the table above
- [ ] `lib/deleteCategory.ts` and its status-to-reason suite
- [ ] `categories/DeleteCategoryDialog.tsx`, its exported copy helpers, and its suite
- [ ] `categories/DeleteCategoryProvider.tsx` and its suite
- [ ] `categories/CategoryCardMenu.tsx` and its suite
- [ ] `CategoryCard.tsx` and `CategoriesScreen.tsx`: the live kebab and the provider; invert the
      two now-false assertions in `CategoryCard.test.tsx` and re-verify `(app)/pages.test.tsx`
- [ ] Stories: `Shell/Delete category`, and check `Screens/13 Categories` draws a live kebab
- [ ] Docs: both `CLAUDE.md` files under `frontend/`, root `CLAUDE.md`, `docs/TODO.md`
- [ ] Verify

No `npm run api:sync`: nothing here changes a request or response body.

## What this leaves owed

Both belong in the PR body rather than being discovered by a reviewer.

**Deleting a card destroys the kebab that opened the dialog**, so `Modal`'s `isConnected` guard
finds nothing to hand focus back to and it lands on `<body>`. This is the identical gap
`docs/TODO.md` already carries for the transaction delete and for saving from the empty state, and
it joins that entry rather than opening a second one.

**AC4 is verifiable only indirectly from this screen.** "Those transactions still exist and now
sit under Uncategorized" is the backend's behaviour, pinned by `backend/test/categories.e2e-spec.ts`.
What the frontend can show is the `Uncategorized` card's count and spend rising by what the deleted
card held, plus the rows still being there on `/transactions`. The walk below does exactly that.

## Verification

From `frontend/`: `npm run lint`, `npm run build` (which is the typecheck), `npx tsc --noEmit` for
the suites the build does not read, and `npm test`. From the repo root: `npm run docs:check`.

Then `npm run storybook` and open `Shell/Delete category`, diffing against node 102:1078. That is
the only check there is on a story reaching a router hook, since both gates miss it.

Then the real app, signed in, on `/transactions/categories` in **Chrome**, which is the only place
Escape, light dismiss and the focus trap are observable:

1. A card's kebab opens a menu anchored under it; a click anywhere else closes it; Escape closes
   it (AC1)
2. "Edit" reads as disabled and does nothing; "Delete" is danger-coloured (AC1, amended)
3. Delete closes the menu and opens the dialog quoting that category's name and its real period
   count (AC2)
4. Cancel leaves the category and its transactions unchanged (AC5)
5. Note the `Uncategorized` card's spend and count, then delete a category that has spend this
   month: the card disappears, the "Categories" badge drops by one, the allocation summary
   recomputes, and `Uncategorized`'s figures rise by what the deleted card held (AC3, AC4)
6. Go to `/transactions` and confirm those rows still exist, now under `Uncategorized` (AC4)
7. Open the `Uncategorized` card's own menu: no Delete (AC6, amended)

Then the same page in **Firefox**, to confirm the menu falls back to centred-with-a-backdrop
rather than breaking, which is the documented degradation rather than a defect.
