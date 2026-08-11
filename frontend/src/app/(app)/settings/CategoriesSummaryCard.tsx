import { Button } from '@/components/ui/Button';

import { useMoney } from '../PreferencesProvider';

import { categoryCountLabel, type CategoriesSummary } from './categoriesSummary';
import { useManageCategories } from './ManageCategoriesProvider';

// The "Categories" card on 17 Settings (SET-4, frame `40:722`): how the account's categories add up,
// and the way through to where they are edited.
//
// **The third and last of frame 17's cards, and the only read-only one.** The two above it collect
// values that submit through the page's single "Save changes"; this one draws three figures and a
// button, and touches `SettingsFormValues` nowhere. That is why its props are one object rather
// than the `values` / `errors` / `disabled` / `onChange` shape its two siblings share - there is no
// field here to carry a message or to freeze while a save is out.
//
// **No `'use client'` of its own**, for `ProfileCard`'s and `PreferencesCard`'s reason: its only
// importer is `SettingsForm`, which is a client component, so this module is already client by
// import and the directive would advertise a boundary that is not here. Being client by import is
// also what lets it call `useMoney()` rather than take a currency prop.
//
// **Both authorities draw the same card**, which is unusual enough to say: Figma node `40:722` and
// the team's Claude Design `ui_kits/expensa-app/SettingsScreen.jsx` agree on the box, the sentence
// and the secondary button, where `PreferencesCard` had to choose between them twice.

/** The copy for a summary that could not be read. Exported so no story or test restates it. */
export const SUMMARY_UNAVAILABLE = "We couldn't load your category totals just now.";

type CategoriesSummaryCardProps = {
  /**
   * The three figures, or `null` when the categories read failed.
   *
   * **`null` is a real state rather than a loading placeholder.** `settings/page.tsx` degrades
   * every failure - a 401 included - to `null` rather than throwing, because this card is not the
   * content of the screen: the Profile and Preferences cards above it are still editable and still
   * saveable, and trading them for an error page over one summary sentence would be the wrong
   * bargain. `lib/palette.ts` makes the identical call for the same shape of reason.
   */
  summary: CategoriesSummary | null;
};

export function CategoriesSummaryCard({ summary }: CategoriesSummaryCardProps) {
  // The Manage modal's seam. A hook rather than a prop threaded through `SettingsForm`, because the
  // modal has to be mounted outside this card's `<form>` and the state therefore lives above it -
  // `ManageCategoriesProvider` is where that is argued.
  const { open: openManage } = useManageCategories();

  // Reads the *saved* currency, off the profile `(app)/layout.tsx` handed the provider - which is
  // deliberately not the one the Preferences card above may be mid-edit. Every figure on this card
  // is a saved figure, so a symbol from an unsaved edit would be the one lie the card could tell.
  const { formatWhole } = useMoney();

  // **"of {budget}" is the budget in force for the current period, which after PET-72 is not always
  // the figure in the Preferences field above.** Both are saved, so the sentence above still holds -
  // what changed is that there is more than one saved budget. `GET /api/profile` reports the
  // **newest** row of the budget history and fills that field; `AllocationResponseDto.monthlyBudget`
  // reports the row in force for the period being reported, and its own contract description says
  // outright that the two need not agree. So a **future-anchored** change leaves the field reading
  // the new figure while this card goes on reading the one the current period is actually priced at,
  // and a **retroactive** one leaves them agreeing while an earlier period's row is what moved.
  //
  // That is the right figure rather than a skew to fix: this card is one sentence about how *this*
  // period's caps add up, so pricing it against a budget that does not apply to this period is the
  // reading that would be wrong. It is worth stating because the divergence is invisible - two
  // whole-dollar figures on one screen, both correct, with nothing on the card naming the period
  // either belongs to. `docs/TODO.md`'s entry on a schedule change landing on a period the screen
  // never names is where that gap already lives, and this is a second surface it reaches.

  return (
    // The same box as both siblings. The three cards on this page must not drift apart.
    <section className="card bg-base-100 shadow-sm">
      <div className="card-body">
        {/* **An inner flex row rather than `card-body flex-row`.** `card-body` sets its own
            `flex-direction`, and a utility landing at equal specificity is resolved by daisyUI's
            emission order rather than by the attribute - the mechanism `frontend/CLAUDE.md`
            records for two modifiers of one component, reached from a different direction. */}
        <div className="flex items-center gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {/* `h2`, matching both siblings, because `PageHeader` owns the page's `h1`.

                **No inset rule under it, unlike the two cards above.** Neither authority draws one
                here: this card is a single row rather than a heading over a set of fields. */}
            <h2 className="text-base font-semibold">Categories</h2>

            {summary ? (
              // `formatWhole` rather than `formatCurrency`, which is the rule every aggregate in
              // this app follows: the design draws whole figures and the cents belong to
              // per-transaction amounts. Rounded once, here, by the formatter - there is no third
              // figure derived from these two, so the round-then-derive rule
              // `allocateForm.ts`'s `toAllocateTotals` carries has nothing to do here.
              <p className="text-base-content/60 text-sm">
                {categoryCountLabel(summary.count)} · {formatWhole(summary.allocated)} allocated of{' '}
                {formatWhole(summary.monthlyBudget)}
              </p>
            ) : (
              // **Invented copy, owing A29 a sign-off** like every other undesigned state on this
              // page. It says what is missing and claims nothing about why, because the read
              // collapses a dead session, a dead backend and a 500 into one answer on purpose.
              //
              // Not a `role="alert"`: nothing the reader did caused it, it is present on first
              // paint rather than arriving after an action, and `FormError`'s assertive treatment
              // is for a save that failed.
              <p className="text-base-content/60 text-sm">{SUMMARY_UNAVAILABLE}</p>
            )}
          </div>

          {/* **Live as of PET-48's follow-up, and the third answer this control has had.** It
              shipped inert by a product decision - no `disabled`, no `aria-disabled`, the app's one
              silently dead control - over an AC3 that asked it to open the Categories tab. The
              product owner's answer is now neither: it opens the **Manage categories modal**, which
              the design system drew (`ui_kits/spendifico-app/ManageCategoriesModal.jsx`). So AC3 is
              superseded rather than met, and this button never navigates.

              **It opens through a provider rather than owning the modal**, which is not the shape
              `AddCategoryButton`'s one-trigger-one-route rule would pick. This card sits inside
              `SettingsForm`'s `<form>`, and the modals that one opens over itself have forms of
              their own - so a dialog rendered from here would nest a `<form>` inside the page's.
              `ManageCategoriesProvider` mounts it as a sibling of the form instead, and carries the
              full argument.

              **`type="button"` stays, and it is still not optional.** `ui/Button` defaults `type` to
              `button`, and it is passed explicitly anyway because this control is inside the page's
              `<form>`: the day somebody replaces it with a bare `<button>`, the default flips to
              `submit` and "Manage" saves the profile instead of opening the modal. That was true
              while the button did nothing and it is more reachable now that it does something -
              `SettingsForm`'s suite still pins that pressing it sends no PATCH. */}
          <Button variant="secondary" label="Manage" type="button" onClick={openManage} />
        </div>
      </div>
    </section>
  );
}
