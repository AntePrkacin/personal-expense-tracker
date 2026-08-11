'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { createElement } from 'react';

import { Button } from '@/components/ui/Button';
import { categoryIcon, categoryTileClass } from '@/components/ui/categoryColour';
import type { Allocation, Category } from '@/lib/categories';
import type { CreateCategoryResult } from '@/lib/createCategory';
import type { Palette } from '@/lib/palette';
import type { components } from '@/types/api';

import { Modal } from '../Modal';
import { useMoney } from '../PreferencesProvider';
import { AddCategoryButton } from '../transactions/categories/AddCategoryButton';
import {
  toAllocateDraft,
  toAllocateLedger,
  toAllocateTotals,
} from '../transactions/categories/allocateForm';
import { AllocationBar } from '../transactions/categories/AllocationBar';
import { useDeleteCategory } from '../transactions/categories/DeleteCategoryProvider';
import { useEditCategory } from '../transactions/categories/EditCategoryProvider';

import { capsCaption, manageableCategories, noLimitCount, rowCaption } from './manageCategories';

// The Manage categories modal, from the Spendifico Design System
// (`ui_kits/spendifico-app/ManageCategoriesModal.jsx`), opened by the Settings Categories card's
// "Manage". **There is no Figma frame for it** - frame 17 draws the card and its button and stops -
// so its copy and its states are invented and owe A29 a sign-off with the rest of this screen.
//
// **It is `AllocateBudgetModal`'s counterpart, not its reuse, and the source says so in its own
// header**: same canvas shell and two-island structure, but "the summary island trades the headline
// figure for a row of three, and the list island trades the cap field for Edit / Delete icon
// actions". Reusing the Allocate modal unchanged was considered and rejected on that basis - it
// edits caps inline and can neither rename nor delete.
//
// **This modal performs no write of its own**, which is the single most important thing about it and
// the reason it is so short. `AddCategoryModal`, `EditCategoryModal` and `DeleteCategoryDialog` own
// every write it can reach, all three already existed, and all three open *over* it as the source
// draws them. So there is no action prop here, no `pending`, no failure taxonomy and no `role=alert`.
//
// **It reads straight from props and resyncs, which is deliberately the opposite of the Allocate
// modal's rule.** That one reads once on open and never resyncs, because it holds a draft a
// background refresh would rewrite under the user's hands; this one holds no draft at all, so when a
// delete lands and `router.refresh()` re-runs the route, the dead row has to leave this list. That
// also removes the entire `stale` apparatus its neighbour needs: there is no payload here to be
// refused for naming a category that no longer exists.
//
// **Two deliberate departures from the source.** It is rebuilt on daisyUI semantic classes rather
// than the source's inline `var(--token)` styles, per `frontend/CLAUDE.md`. And the month picker in
// the source's header is dropped: PET-72 replaced calendar months with paycheck-anchored periods,
// and `EditCategoryModal` already asks which paycheck a **cap** change applies from at save time, so
// a second period control here would be a third way to answer a question that already has one.
//
// **Everything it imports from `transactions/categories/` is imported rather than moved**, and that
// is a recorded seam rather than a preference - see the note above the imports' first consumer
// below, and `docs/TODO.md`.

/**
 * The two islands, matching `AllocateBudgetModal`'s constant of the same name.
 *
 * **Duplicated rather than lifted, and that is this repo's rule of three being followed rather than
 * ignored.** This is the string's *second* consumer; the filter this ticket did lift to
 * `lib/fallbackCategory.ts` had reached its third, which `categoriesSummary.ts` had named as the
 * trigger in as many words. Whichever ticket brings a third island lifts both.
 */
const ISLAND = 'card bg-base-200 card-body gap-4 p-5';

/** The subtitle under the title, exported so no test or story restates a shipped string. */
export const MANAGE_SUBTITLE = 'Edit or remove your spending categories';

/**
 * What the list says with nothing in it, exported for the same reason.
 *
 * **Reachable rather than defensive, and by exactly the route `ALLOCATE_EMPTY` documents next
 * door.** `Uncategorized` is not a row here and cannot be deleted, so an account that has removed
 * every other category opens this on an empty list. Without a sentence that is a column header over
 * an empty box, with "Add category" the only thing on screen that does anything - which is in fact
 * the right next step, so the copy says it.
 */
export const MANAGE_EMPTY = 'You have no categories to manage yet. Add one to get started.';

type ManageCategoriesModalProps = {
  /**
   * The account's categories, whole, exactly as `GET /api/categories` answered.
   *
   * Filtered to the listed rows by `manageableCategories` **inside** this component rather than by
   * the caller, because `toAllocateLedger` needs the unfiltered list to derive `reservedCents` - the
   * cap held by rows the modal does not draw. Handing it a pre-filtered list is how the summary
   * silently stops agreeing with `allocation.allocated`.
   */
  categories: Category[];
  allocation: Allocation;
  /** Threaded to both sub-modals' pickers; `null` when that read failed, which they already model. */
  palette: Palette | null;
  /** The create action, threaded to `AddCategoryButton` and injectable for the same reason. */
  create?: (body: components['schemas']['CreateCategoryDto']) => Promise<CreateCategoryResult>;
  onClose: () => void;
};

export function ManageCategoriesModal({
  categories,
  allocation,
  palette,
  create,
  onClose,
}: ManageCategoriesModalProps) {
  const { formatWhole } = useMoney();
  const { open: openEdit } = useEditCategory();
  const { open: openDelete } = useDeleteCategory();

  const rows = manageableCategories(categories);

  // **The same three figures the Allocate modal draws, from the same function**, so the two modals
  // cannot disagree about one account. `toAllocateTotals` rounds twice and subtracts once, which is
  // the rule `dashboard/BudgetCard.tsx` and `SpendingSummaryCard.tsx` both carry: formatting each
  // figure independently is what lets a column print numbers that do not add up under a rule drawn
  // to say they do. Its `assigned` is `Σ visible caps + reservedCents`, which is
  // `allocation.allocated` by construction rather than by a second sum over the same rows.
  const draft = toAllocateDraft(categories);
  const ledger = toAllocateLedger(allocation, categories);
  const totals = toAllocateTotals(draft, ledger);

  return (
    <Modal
      title="Manage categories"
      width="wide"
      onClose={onClose}
      footerStart={
        // The source's own footer: "Add category" on the left against "Done" on the right, which is
        // `Modal`'s `footerStart` slot and the `modal-action justify-between` it brings.
        //
        // `secondary` because the design draws it that way and because "Done" is this dialog's one
        // emphasized action - the rule that a screen has a single primary. `AddCategoryButton` grew
        // the `variant` prop for it; its own modal opens over this one, which is the stacking the
        // source draws and the product owner confirmed.
        <AddCategoryButton palette={palette} create={create} variant="secondary" />
      }
      footer={
        // A plain close rather than a submit. This modal saves nothing, so there is no form here at
        // all - `Modal` only creates one when handed an `onSubmit` - and "Done" is an
        // acknowledgement rather than a commit. Every change it lists was already saved by the
        // sub-modal that made it.
        <Button label="Done" onClick={onClose} />
      }
    >
      <p className="text-base-content/60 -mt-2 text-sm">{MANAGE_SUBTITLE}</p>

      {/* The summary island: the budget headline beside the ledger, the bar spanning both, and the
          caption that says where caps are actually set. */}
      <section className={ISLAND}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-base-content/60 text-xs font-semibold uppercase">
              Monthly budget
            </span>
            <span className="font-display text-3xl font-bold">
              {formatWhole(totals.budgetWhole)}
            </span>
          </div>

          <dl className="flex min-w-56 flex-col gap-1.5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-base-content/60">Assigned to categories</dt>
              <dd className="font-medium">{formatWhole(totals.assignedWhole)}</dd>
            </div>
            {/* **The same weight and tone as the row above it**, deliberately, where the Allocate
                modal's equivalent row emphasises this one. There the remainder is the figure the
                whole dialog is about - it is the headline as well as the row - so it earns the
                emphasis; here the three figures are peers describing an account, and a bolder
                "Unassigned" reads as a warning about a number that is merely a fact. The rule
                above it stays, because that is what says the column sums. */}
            <div className="border-base-300 flex justify-between gap-4 border-t pt-1.5">
              <dt className="text-base-content/60">Unassigned</dt>
              <dd className="font-medium">{formatWhole(totals.unassignedWhole)}</dd>
            </div>
          </dl>
        </div>

        <AllocationBar draft={draft} ledger={ledger} />

        {/* Counted over the listed rows, so the fallback - uncapped on every account - cannot make
            this read one high for everybody. `manageCategories.ts` owns both halves. */}
        <p className="text-base-content/60 text-xs">{capsCaption(noLimitCount(categories))}</p>
      </section>

      {/* The list island. `max-h-93 overflow-y-auto` bounds the list rather than the box, which is
          `AllocateBudgetModal`'s call and needs nothing from any ancestor; `overscroll-contain`
          stops a scroll at the end of the list chaining out to the box behind it. */}
      <section className="card bg-base-200 card-body gap-0 p-0">
        {rows.length === 0 ? (
          // The column header goes with the rows rather than standing over an empty box, which is
          // the neighbouring modal's call for the identical state.
          <p className="text-base-content/70 px-5 py-6 text-sm">{MANAGE_EMPTY}</p>
        ) : (
          <>
            <div className="text-base-content/60 flex justify-between px-5 py-3 text-xs font-semibold uppercase">
              <span>Category</span>
              <span>Actions</span>
            </div>

            <ul className="border-base-300 -mx-1 max-h-93 list-none overflow-y-auto overscroll-contain border-t px-1">
              {rows.map((row) => {
                const Icon = categoryIcon(row.icon);

                return (
                  <li
                    key={row.id}
                    className="border-base-300 flex items-center gap-3 px-4 py-3 not-first:border-t"
                  >
                    <span
                      className={`rounded-field flex size-9 shrink-0 items-center justify-center ${categoryTileClass(row.color)}`}
                    >
                      {/* `createElement` rather than `<Icon />`, which is the idiom every tile in
                          this app uses: `react-hooks/static-components` reads a capitalised local in
                          JSX as a component created during render, and this repo permits no
                          eslint-disable. */}
                      {Icon === null
                        ? null
                        : createElement(Icon, { className: 'size-4.5', 'aria-hidden': 'true' })}
                    </span>

                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold">{row.name}</span>
                      {/* **The spend beside what the category was actually given**, which is the
                          one figure the list was missing: a row saying only what it spent cannot be
                          read against anything, and the whole point of this modal is deciding where
                          the budget goes. `manageCategories.ts` owns the string, including what an
                          uncapped category says. */}
                      <span className="text-base-content/60 text-xs">
                        {rowCaption(row, formatWhole)}
                      </span>
                    </div>

                    {/* **Both are `type="button"` and both compose their accessible name with the
                        category's, which is `SetLimitButton`'s existing rule.** An icon-only control
                        repeated once per row is the case a bare "Edit" cannot serve: eight buttons
                        all announcing "Edit" name nothing a reader can act on. The glyphs are
                        `aria-hidden` because the name is on the button.

                        The `type` is defensive rather than load-bearing *here* - this modal is
                        mounted by `ManageCategoriesProvider`, deliberately outside the Settings
                        `<form>`, so there is no form for a bare button to submit. It is written
                        anyway because that placement is the only thing making it safe, and the
                        provider's own comment is where that is argued. */}
                    {/* **`gap-3` rather than the `gap-1` this shipped with**, which the source
                        draws as 12px: two icon-only controls one destructive need a gap you can see
                        before you click, not the tightest one that fits. */}
                    <div className="flex shrink-0 items-center gap-3">
                      {/* **The hover tone is written out rather than left to `btn-ghost`, and that
                          is a dark-theme fix.** daisyUI's ghost hover is a tint of the button's own
                          `--btn-color`, which against the `bg-base-200` island reads as almost
                          nothing under `expensa-dark` - the control looked inert on hover on half
                          the app's themes. `base-content/15` is the theme-adaptive answer: it is the
                          ink colour at low alpha, so it darkens a light surface and lightens a dark
                          one, where any fixed token can only do one of those. It also restores the
                          source's own two-tone pairing, which `btn-ghost` had flattened - the
                          destructive action hovers `error` rather than neutral, so the two controls
                          do not look interchangeable a moment before one of them deletes something.

                          A Tailwind utility beats `.btn-ghost:hover` here on cascade **layer**
                          rather than on specificity - both are (0,2,0), and utilities are emitted
                          after components - which is the one direction of that fight this repo can
                          rely on.

                          **`btn-circle` rather than `btn-square`**, which is the shape the
                        source draws (`borderRadius: var(--r-full)`) and the one `Modal`'s own close
                        button already uses - so the hover reads as a circular chip around the glyph
                        rather than a rounded tile behind it.

                        **Both alphas are measured rather than chosen, and the two differ because
                          red buys almost no luminance.** Painted on a canvas over the island and
                          read back, against `expensa-dark`'s `base-200`: daisyUI's own ghost hover
                          (`base-content 10%`) is **1.316:1**, which is the state the product owner
                          reported as invisible; `base-content/15` is **1.568:1**, just past the
                          `base-content/20` this repo already accepted for the trend chart's muted
                          bars and well clear of the `base-300` it rejected at ~1.15. The
                          destructive one had to go much further for the same result - `error/20`
                          measures **1.148:1**, no better than that rejected token, and the sweep
                          only reaches 1.457 at `error/40`. That is not the alpha being wrong at 20%
                          so much as luminance being the wrong axis for a red chip on a dark ground:
                          the hue carries the difference the ratio cannot see, so the figure is a
                          floor to clear rather than the thing being optimised. */}
                      <button
                        type="button"
                        aria-label={`Edit ${row.name}`}
                        className="btn btn-ghost btn-circle btn-sm hover:bg-base-content/15"
                        onClick={() => openEdit(row)}
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${row.name}`}
                        className="btn btn-ghost btn-circle btn-sm text-error hover:bg-error/40"
                        onClick={() =>
                          openDelete({
                            id: row.id,
                            name: row.name,
                            transactionCount: row.transactionCount,
                          })
                        }
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </Modal>
  );
}
