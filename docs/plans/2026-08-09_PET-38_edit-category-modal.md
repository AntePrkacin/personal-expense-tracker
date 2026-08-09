# PET-38: Build the Edit category modal with cap recalculation

Jira: [PET-38](https://decode.atlassian.net/browse/PET-38) · Figma:
[21 Edit category](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=116-1040)

**Stacked on `feat/PET-39-category-row-menu` (PR #74), which is itself stacked on
`feat/PET-37-add-category-modal` (PR #68) and `feat/PET-36-categories-tab` (PR #67), none of them
merged.** Every file this ticket edits was created by one of those three branches, so it cannot be
cut from `main`; the PR targets `feat/PET-39-category-row-menu` and GitHub retargets it as each
parent lands.

## Why

`/transactions/categories` has shipped in four instalments and each one left the next its inert
controls. PET-36 drew the screen with three: the header's "Add category", the card kebab, and the
banner actions. PET-37 made the header button real. PET-39 made the kebab open a real menu whose
"Delete" really deletes, and its own section in `frontend/src/app/CLAUDE.md` states plainly - after
a code review caught the first draft claiming otherwise - that **three controls remain and all
three are PET-38's**: the menu's own "Edit", `CardBanner`'s "Set limit" on every uncapped card, and
the summary card's "Allocate".

This ticket builds the modal behind "Edit", makes "Set limit" a second entry point into it, and
adds the app's **seventh authenticated write**, `lib/updateCategory.ts` - which is what finally
makes the sentence "every category write is unbuilt" false in all three directions rather than two.

Everything server-side already exists. `PATCH /api/categories/:id` has been there since PET-35: a
real partial patch where an absent field is left alone, `monthlyCap: null` clears a cap and
`note: null` clears a note, an empty body is a 400, and a 409 means a rename of `Uncategorized`,
whose name is fixed while its cap, colour, icon and note are all editable. Nothing in the frontend
calls it. **No request or response body is touched, so `npm run api:sync` does not apply to this
ticket** - said out loud because root `CLAUDE.md` makes it mandatory after any DTO change, and its
absence here should read as deliberate rather than forgotten.

## What the ticket does not know, and what this does about it

Five statements in the description predate the code they describe, or describe a decision the repo
made differently. All five are recorded on the issue and in the PR body; four change what ships.

| # | The ticket says | What is true | Disposition |
| --- | --- | --- | --- |
| 1 | AC1: the row menu's "Edit" opens the modal, on any card | `Uncategorized` cannot be renamed (409) and PET-39 already hides Delete on it | The fallback card renders **no kebab at all**. **AC1 amends** to "a non-fallback category card's row menu". |
| 2 | AC1: the modal is prefilled with "name, cap, color, icon and note" | The Note field is hidden behind `SHOWS_NOTE` (A42) | Note is prefilled into state and not drawn, exactly as in Add category. **AC1 amends.** |
| 3 | AC3: saving a changed cap updates "the Settings categories line" | The Settings `<main>` is empty; SET-4 is unbuilt | The three surfaces that exist are covered. **AC3 amends** to drop the Settings clause. |
| 4 | AC7: "Delete category" opens the confirmation | It exists and takes `onDeleted`, which PET-39 added for this caller | Ships as specified. No amendment. |
| 5 | The description is silent on "Set limit" and "Allocate" | Both are `aria-disabled` controls this file's own docs assign to PET-38 | "Set limit" becomes the modal's second entry point. **"Allocate" stays inert**, by product decision on 2026-08-09. |

The first is the one worth arguing rather than listing, because it is a real subtraction and it was
decided against the two softer alternatives. The backend accepts a cap, a colour, an icon and a
note on `Uncategorized` and refuses only a rename. So a modal with a disabled Name field would have
been correct and would have kept that row cappable. It is not what ships: offering Edit on a card
whose menu has had Delete hidden since PET-39 means a kebab holding one item that opens a form with
one field greyed out, which is three explanations deep for the one category no user asked for. The
whole kebab goes instead, and the banner with it, so **nothing on that card is drawn that cannot be
acted on**. The cost is stated rather than hidden: `Uncategorized` can now be neither renamed nor
capped from the UI. `docs/TODO.md` records it, and the 409 is still classified in
`lib/updateCategory.ts` for `lib/deleteCategory.ts`'s reason - a hidden control is not an
enforcement.

The fifth is the other one with a decision in it. "Set limit" has exactly one meaning - a category
with no cap wants one - and the Edit modal is the control that assigns it, so it opens the same
modal with focus on the budget field. "Allocate" has no such reading: it sits on a banner saying
some part of the monthly budget is unassigned, and no frame draws where it goes. Rather than invent
a destination or delete a control the design system draws, it stays `aria-disabled` and stays on
the gap list.

AC2, AC4, AC5 and AC6 are met in full. AC4 is the one only verifiable indirectly here, and the
Verification walk says how.

## Decisions

**A second component rather than a mode on `AddCategoryModal`, which is `EditTransactionModal`'s
call one screen over and holds for the same reasons.** The fields, their order, their validation
and the amount field's caret handling are already shared through `categoryForm.ts` and the `ui/`
primitives. What is not shared is the diff, the footer's third control, the prefill, five of the
messages, and the fact that submitting an unchanged form is a legitimate no-op. A `mode` prop would
carry all of that as branches inside one file.

**The provider is `DeleteCategoryProvider`'s shape, and this ticket is the second use of an
argument PET-39 wrote for one consumer.** That file sets out why a screen-scoped provider beats
both alternatives, and every clause transfers. A modal owned by each card sits **inside the card
being edited**, so the success path's `router.refresh()` can unmount it out from under its own
`close()`. A modal on `(app)/layout.tsx` would put a category form on all four routes to serve one
screen. And this feature has what PET-39's had only in prospect: **two kinds of trigger on one
route** - N card kebabs and N "Set limit" banners - which is exactly the shape "screen-scoped"
fits. So `EditCategoryProvider` wraps the screen, mounts one modal, and every trigger is a
`useEditCategory().open(category)` and nothing else.

**It nests inside `DeleteCategoryProvider` rather than beside it**, because AC7's "Delete category"
in the modal footer is a `useDeleteCategory().open(target, { onDeleted })` call. That option
existed with no caller from the day PET-39 shipped it, named this ticket in its own doc comment,
and is what takes the edit modal down when the delete really lands - while a cancelled confirmation
leaves the form exactly as it was. Two `<dialog>` elements open at once is a case `(app)/Modal.tsx`
already handles, which is why its heading id is generated rather than constant.

**`CardBanner` grows an `onAction`, and the `aria-disabled:` variants PET-39 wrote pay off
literally.** That file's comment says the live styling comes back "by deleting the attribute, with
nothing here left to remember", and that is what happens: with a handler the button is live, and
without one it keeps the inert treatment the summary card still needs. The handler cannot come from
`CategoryCard`, which is a Server Component, so `SetLimitBanner.tsx` is a one-purpose client
wrapper that composes the banner - the same "push the boundary into the smallest wrapper" rule
`SidebarNav` and `TrendChart` follow. **`CategoryCard` stays a Server Component**, as it did when
the kebab became live.

**The diff is `toUpdateCategoryBody`, and it is `toUpdateTransactionBody`'s shape with two
differences.** Both emit only changed fields, both return an empty object when nothing changed, and
both leave the caller to close without submitting rather than send a body the endpoint answers 400
to. The first difference is that **`monthlyCap` clears to `null`**, which is the one way to make a
capped category uncapped and the reason `isCapValid` accepts a blank field at all - `note`'s
`'' -> null` rule is the same shape and already exists next door. The second is that **`color` and
`icon` are skipped while they are `''`**, rather than the function taking a narrowed
`ChosenCategoryValues` the way `toCreateCategoryBody` does. `''` here cannot be a change - the form
is prefilled from a stored row whose colour and icon are real tokens - so a guard at the call site
would be a dead branch, where the skip is a true statement that also narrows the type.

**A failed palette read does not block a save, which is the one place this form must not copy
`AddCategoryModal`.** That modal guards submission on `hasChosenMarks` because a create has no
colour until the palette arrives. An edit has one: it is prefilled from the row, so a failed read
leaves the two pickers disabled with a line saying why and every other field perfectly saveable -
and fixing a typo in a name while the palette is unavailable is a reasonable thing to do. This is
the identical finding a review made about `EditTransactionModal`'s `categoriesFailed` guard, which
returned before any state changed and made Save do nothing observable.

**Focus opens on the field the trigger implies.** The kebab's "Edit" focuses Name; "Set limit"
focuses Monthly budget, because a banner whose entire text is "No limit set for this category" is a
request to type a number. `Modal`'s `initialFocusId` takes an id, so the provider passes which of
the two the trigger asked for.

## Known limitation, recorded rather than fixed

**A stored colour or icon that the palette no longer offers reads as "Select…" in its trigger.**
`GET /api/templates/palette` returns `enabled` rows only, so an admin disabling a token a user
already has produces a value with no matching row - and both pickers derive their trigger label by
finding that row. The swatch still paints correctly (it comes from `categoryColour.ts`, not from
the palette), and saving without touching the field omits the key entirely so nothing is lost. A
real fix needs a label for a token the palette declines to describe, which is a contract question
rather than a component one. `docs/TODO.md` gains the entry.

## Tasks

- [ ] Plan committed alone as the branch's first commit, draft PR opened against
      `feat/PET-39-category-row-menu` with this checklist in the body
- [ ] `lib/updateCategory.ts`: the Server Action over `authorizedPatch`, publishing five reasons
      (`invalid`, `missing`, `fallback`, `unauthenticated`, `failed`), plus its suite
- [ ] `categoryForm.ts`: `toCategoryFormValues` and `toUpdateCategoryBody`, plus their cases in
      `categoryForm.test.ts`
- [ ] `EditCategoryModal.tsx`: frame 21's form, prefilled, with `footerStart`'s "Delete category",
      plus its suite and a `Screens/21 Edit category` story
- [ ] `EditCategoryProvider.tsx`: the screen's single modal and the `open` seam, plus its suite
- [ ] `CardBanner.tsx`: the optional `onAction`, and `SetLimitBanner.tsx` as the client trigger
- [ ] `CategoryCardMenu.tsx`: "Edit" becomes live; `CategoryCard.tsx`: the fallback card renders no
      kebab and no banner
- [ ] `CategoriesScreen.tsx`: mount `EditCategoryProvider`, thread `palette` and the Storybook
      `update` seam; update the screen's suite and stories
- [ ] Gates: `npm run lint`, `npm test`, `npm run build`, `npx tsc --noEmit`, `npm run
      build-storybook`, `npm run docs:check`
- [ ] Browser walk against every acceptance criterion, in both themes, recorded in the PR
- [ ] Docs: `frontend/src/app/CLAUDE.md`, `frontend/CLAUDE.md`'s two gap bullets, `docs/TODO.md`
- [ ] Jira: record the five amendments on PET-38

## Verification

The suites cover the diff, the five failure arms, the prefill, the empty-patch no-op and every
piece of wiring. Four things they cannot see, so they are browser and Storybook checks:

1. **AC3, the recalculation.** Change a cap, save, and watch the card's percent, chip and
   remaining-or-over figure move together with the summary card's own figures. All four come from
   one `router.refresh()`, so the check is that they agree rather than that each updated.
2. **AC4, the rename crossing screens.** Rename a category, then visit `/transactions`, a
   `/transactions/[id]` detail page filed under it, and `/dashboard`'s donut legend. This is the
   criterion no Jest suite can reach, because it is four Server Components re-reading one row.
3. **AC5.** Raise a cap past the monthly budget and confirm the save is accepted and the summary
   card shows no unallocated chip rather than an error.
4. **AC6 and AC7 together.** Escape, the X, the backdrop and Cancel all discard; "Delete category"
   opens the confirmation over the form, Cancel there returns to the form with the edits intact,
   and a real delete takes both down.

Plus the two the modal inherits and must not regress: Escape and the focus trap, which jsdom
implements for neither dialog, and the focus hand-back to the trigger that opened the modal.
