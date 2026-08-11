# PET-48 (follow-up): Make Settings' "Manage" open the Manage categories modal

Jira: [PET-48](https://decode.atlassian.net/browse/PET-48) · Epic:
[PET-5 Category budgets](https://decode.atlassian.net/browse/PET-5) · Design: the Spendifico Design
System's `ui_kits/spendifico-app/ManageCategoriesModal.jsx`, wired from its `SettingsScreen.jsx`.
**No Figma frame exists for this modal** - frame 17 draws the card and its button and stops there.

Continues on `feat/PET-48-settings-categories-summary`, which is rebased onto `main` and already
carries the summary card. This is a second plan on one ticket rather than a new ticket, because it
finishes the control that card ships with.

## Why

`CategoriesSummaryCard`'s "Manage" ships inert - no `disabled`, no `aria-disabled` - by a product
decision recorded in three `CLAUDE.md` files, in `docs/TODO.md` and as an amendment on the ticket.
It is the only control in this app that looks operable and is not, and every one of those documents
says so while pointing at the same one-line fix (`<Button href={TAB_HREFS.categories}>`).

The product owner has now chosen a different answer, and it is not that one-liner: "Manage" opens a
**Manage categories modal**, which the design system has drawn. So AC3 is superseded a second time -
the button never navigates - and this plan carries both the build and the retraction of four written
claims.

## What the design actually draws, and why it is not the Allocate modal

`ManageCategoriesModal.jsx`'s own header comment: "Settings' counterpart to AllocateModal. Same
canvas shell and two-island structure; the summary island trades the headline figure for a row of
three, and the list island trades the cap field for Edit / Delete icon actions."

So the two share a **shell**, not a **function**. Reusing `AllocateBudgetModal` unchanged was
considered and rejected on that basis: it edits caps inline and has no way to rename or delete.

| | `AllocateBudgetModal` (built) | `ManageCategoriesModal` (this) |
| --- | --- | --- |
| Row | one cap input per category | name, "{spent} spent", **Edit** and **Delete** icon buttons |
| Summary | budget headline over a three-row ledger | "Monthly budget" beside Assigned / Unassigned, over the allocation bar |
| Footer | Cancel / Save changes | **"Add category"** left, **"Done"** right |
| Caps | inline, one bulk write | in the Edit sub-modal - the caption says "Set caps per category from Edit." |
| Writes | one `PATCH` of every cap | none of its own; the sub-modals write |
| Sub-modals | none | Add, Edit (its footer carries "Delete category"), Delete confirmation |

**This modal performs no write at all**, which is the single most important thing about it. It is a
list with actions; `AddCategoryModal`, `EditCategoryModal` and `DeleteCategoryDialog` already own
every write it can reach, and all three already exist and are complete.

## The four decisions taken with the product owner

1. **Build it faithfully** rather than pointing "Manage" at `AllocateBudgetModal`.
2. **No month picker in the header.** The design draws one over `D.months`; PET-72 replaced calendar
   months with paycheck-anchored periods, and the Allocate and Edit modals both ask which paycheck a
   **cap** change applies from, at save time. A second period control here would be a third way to
   answer a question that already has one, so the header carries the title and the close alone.
3. **Sub-modals stack**, as drawn, rather than closing Manage and reopening it.
4. **AC3 is superseded and the documents are rewritten**, not left dated.

## What the design does not settle, and what this does about it

| # | The source shows | What is true here | Disposition |
| --- | --- | --- | --- |
| 1 | An "Other" row in the list | Our fallback is `Uncategorized`, which cannot be renamed or deleted | **Excluded**, by the product owner's instruction and `allocatableCategories`' existing precedent |
| 2 | `assigned` re-summed from the rows | `allocation.allocated` is the authority two other surfaces read | Use the contract's figure; the fallback-cap seam is the one `docs/TODO.md` already records |
| 3 | Figures from a fixture | Every figure must come from `GET /api/categories` | Derived through `allocateForm.ts`, as the Allocate modal is |
| 4 | Inline `var(--token)` styles | daisyUI semantic classes only, per `frontend/CLAUDE.md` | Rebuilt on daisyUI; structure and content follow the source |
| 5 | A month picker in the header | See decision 2 | Dropped |
| 6 | `role="radio"`-style hand-rolled controls elsewhere in the kit | This repo has refused that four times | Icon actions are real `<button>`s with composed accessible names |
| 7 | Delete copy says "moved to Other" | The fallback's name comes off the list response | `DeleteCategoryProvider`'s existing `fallbackName`, unchanged |
| 8 | A "Danger zone" card and a Cancel beside Save on the screen | Neither exists in this app | **Out of scope**, noted in `docs/TODO.md` |

## Decisions

**The modal resyncs from its props, and that is the opposite of the Allocate modal's rule.** That one
reads once on open and never resyncs, because it holds a draft a background refresh would rewrite
under the user's hands. This one holds **no draft** - the sub-modals do - so after a delete lands and
`router.refresh()` re-runs the route, the dead row must leave this list. Reading straight from props
is what makes that free, and it removes the whole `stale` apparatus the Allocate modal needs.

**It owns its open state and takes no provider**, which is `AddCategoryButton`'s criterion applied
unchanged: one trigger on one route. What it does need is to sit *inside* `DeleteCategoryProvider`
and `EditCategoryProvider`, in that nesting order, because the edit modal's footer calls
`useDeleteCategory()` - reversed, it throws while rendering Settings rather than on the first click.
That is the ordering `(app)/layout.tsx` already records for the transaction pair.

**Settings grows two reads, and both degrade rather than throw.** `readPalette()` and `readPeriods()`
join `readCategoriesView()`, mirroring `transactions/categories/page.tsx`'s `Promise.all`. The
failure policy is this route's own, established by the summary card: `requireProfile()` is the only
read on the page with an opinion about whether the session is alive, and everything else degrades so
a working, saveable profile form is never traded for an error page.

- A failed **palette** is `null`, which both category modals already model as disabled pickers.
- A failed **periods** read is `[]`, which is a **deliberate departure from `lib/periods.ts`'s
  throwing policy** and is safe only because `EditCategoryModal` already guards it: its
  `currentStart !== undefined` check falls back to sending the cap with no anchor, which its own
  comment calls "the honest fallback". On `/transactions/categories` periods back a header select
  that is the screen's content, so throwing is right there; here they back one question inside a
  modal nobody has opened.

**Two reads for a modal most visits never open** is the cost, and it is the same trade
`transactions/categories/page.tsx` already took for its palette - recorded in `docs/TODO.md` rather
than solved, because solving it means a route handler and the null-versus-failed-versus-loading
triple `AddTransactionModal` has to model.

**The count and the sum still disagree by one row.** The list excludes the fallback while
`allocation.allocated` would include a cap on it. Unreachable through the UI, zero in practice, and
already recorded - this plan extends the existing entry rather than opening a second.

## Markup

daisyUI throughout, `Modal` with `width="wide"` (40rem against the design's 620px - the box is a
ceiling, per `MODAL_BOX`'s own comment) and `align="start"`, so the footer can use `footerStart` for
"Add category" against "Done" on the right. Two `card bg-base-200` islands over the modal's canvas,
matching `AllocateBudgetModal`'s `ISLAND` constant, which is lifted to a shared module rather than
copied - it is the third consumer of that string once this lands.

The allocation bar is `AllocationBar`, unchanged, fed by `toAllocateDraft` and `toAllocateLedger`.
The row tile is `categoryTileClass` and `categoryIcon`. The two icon actions are `lucide-react`'s
`Pencil` and `Trash2`, each `aria-hidden` inside a `<button>` whose accessible name composes the
action with the category name ("Edit Groceries"), which is `SetLimitButton`'s existing rule.

## Tasks

- [ ] Commit this plan alone, and open/refresh the draft PR with the checklist in its body
- [ ] `settings/manageCategories.ts` and its suite: the visible-row filter, the no-limit count, and
      the caption string, React-free like `categoriesSummary.ts` beside it
- [ ] Lift `ISLAND` out of `AllocateBudgetModal.tsx` to a shared module and repoint both callers
- [ ] `settings/ManageCategoriesModal.tsx`: the shell, the summary island, the scrolling list, the
      two icon actions, the "Add category" / "Done" footer, and the empty state
- [ ] `settings/ManageCategoriesButton.tsx`: the trigger, its open state, and the two providers
      nested around it in the order the edit modal's footer requires
- [ ] `settings/CategoriesSummaryCard.tsx`: "Manage" stops being inert and opens the modal; delete
      the `type="button"` comment's inert half but **keep the `type="button"`**, which is what still
      keeps it out of the page form's submit path
- [ ] Thread `categories`, `allocation`, `palette` and `periods` from `settings/page.tsx` through
      `SettingsScreen` and `SettingsForm` to the card
- [ ] `settings/page.tsx`: `readPalette()` and `readPeriods()` in a `Promise.all`, each degrading
- [ ] Suites: the modal's own, the button's, and the additions to `SettingsForm.test.tsx`,
      `SettingsScreen.test.tsx` and `(app)/pages.test.tsx` - including that "Manage" still sends no
      PATCH, which is the assertion the inert version already carries and which must survive
- [ ] `SettingsScreen.stories.tsx` and a `Screens/17 Settings` story per modal state: open, one
      category, no categories, palette unavailable
- [ ] Gates from `frontend/`: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`,
      `npm run build-storybook`; `npm run docs:check` from the root
- [ ] Browser walk: open from Settings, edit a cap through the sub-modal, delete a row and watch it
      leave the list, add one, and confirm `Uncategorized` appears nowhere - both themes
- [ ] Retract the inert-control claims in `docs/TODO.md`, root `CLAUDE.md`, `frontend/CLAUDE.md` and
      `frontend/src/app/CLAUDE.md`, and record the two new reads
- [ ] Jira: supersede the AC3 amendment, and record decisions 2 and 3

## What this deliberately does not do

- **No new endpoint and no `api:sync`.** Every write it reaches already exists.
- **No category management moves off the Categories tab.** This is a second entry point to the same
  three modals, not a replacement, and the tab keeps its grid, its kebab and its banner.
- **No "Danger zone" and no avatar "Change".** Both are on the design's Settings screen and neither
  is this ticket's.
- **No period control**, per decision 2.
