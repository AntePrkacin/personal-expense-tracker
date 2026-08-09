import { monthLabel } from '@/lib/format';
import { moneyFormatters } from '@/lib/money';
import type { Allocation, Category } from '@/lib/categories';
import type { UpdateCategoryCapsResult } from '@/lib/updateCategoryCaps';

import { AllocateBanner } from './AllocateBanner';
import type { toAllocateBody } from './allocateForm';
import { BannerCardBody } from './CardBanner';

// The summary card at the top of frame 13 (node 36:490, CTG-2).
//
// **This is the one place the implementation departs from Figma on content rather than on
// style, and it is a product decision recorded in the ticket.** Frame 13 draws "Budget
// allocation" over "$1,800 allocated of $2,000 monthly budget" with a chip carrying the
// unallocated remainder - a card answering "have you distributed your budget". The team's
// Claude Design system replaces it with a card answering "how much have you spent", and moves
// the unassigned figure into a banner underneath. PET-36's AC4 was amended on 2026-08-08 to
// match, and both readings are served by the same `allocation` block, so nothing about the read
// changed with the decision.
//
// A Server Component, and it stays one. Its banner's action is live as of PET-70, and the state
// behind it lives in `AllocateBanner` - a client wrapper whose only job is holding the directive, so
// nothing here needs one. The sentence above this one used to read "the one control on it is inert,
// so there is no state and no boundary"; read that as history.
//
// **It takes two props it does not itself render**, `categories` and `save`, and passes both to that
// banner. The alternative was hoisting the banner into `CategoriesScreen`, which the overlap effect
// forbids: the strip has to be a sibling of the card body inside this file's own `<section>`.
// `AllocateBanner.tsx` carries the rest of that argument.

/**
 * The chip's two tones, complete literal class strings per key.
 *
 * **Two tones rather than the four the Claude Design system draws, and this is deliberate.**
 * That version bands at 80% of the budget, and `dashboard/BudgetCard.tsx` refused to invent
 * exactly that threshold for exactly this figure: a "getting close" tone needs a cutoff - 80%?
 * 90%? pace-relative? - that no design specifies, and `docs/TODO.md` already carries it as owed
 * rather than guessed. Inventing one here would also put two different answers on two screens
 * describing the same monthly budget, which is the failure the category cards avoid by reading
 * `status` off the API.
 *
 * So the split is the one the data really supports: the budget is either overspent or it is
 * not. Duplicated from `BudgetCard` rather than shared, per the rule of three - a third
 * consumer is the signal to lift it, and there are two.
 *
 * **`bg-base-300` on each bar pins the track neutral**, for the reason `categoryCardStatus.ts`
 * records in full: daisyUI derives a `<progress>`'s track from the fill colour, so without it an
 * unspent budget drew as one solid green pill.
 */
const CHIP = {
  onTrack: {
    badge: 'badge badge-soft badge-success',
    dot: 'status status-success',
    bar: 'progress progress-success bg-base-300 w-full',
    label: 'On track',
  },
  overBudget: {
    badge: 'badge badge-soft badge-error',
    dot: 'status status-error',
    bar: 'progress progress-error bg-base-300 w-full',
    label: 'Over budget',
  },
} as const;

type SpendingSummaryCardProps = {
  /** The period's spend, summed from the categories. See `CategoriesScreen` for why that sum is sound. */
  spent: number;
  allocation: Allocation;
  /** Every category, for the banner's modal. Not rendered here - see the note above. */
  categories: Category[];
  /** The bulk cap write, threaded through for the same reason. `AllocateBanner` defaults it. */
  save?: (body: ReturnType<typeof toAllocateBody>) => Promise<UpdateCategoryCapsResult>;
  /**
   * The profile's currency, threaded from the page rather than read here.
   *
   * A Server Component cannot reach `PreferencesProvider`, which is client-side, so the server
   * half of the app takes the currency as a prop while the client half uses `useMoney()`.
   * `lib/money.ts` records the split.
   */
  currency: string;
};

export function SpendingSummaryCard({
  spent,
  allocation,
  categories,
  save,
  currency,
}: SpendingSummaryCardProps) {
  const { formatWhole } = moneyFormatters(currency);

  const { monthlyBudget, unallocated } = allocation;

  // Rounded once and the pair derived from the rounded figures, which is `BudgetCard`'s rule
  // and exists for the same reason: formatting each of two figures independently lets one card
  // print "$1,241 of $2,000" beside a remainder that does not add up to the budget.
  const spentWhole = Math.round(spent);
  const budgetWhole = Math.round(monthlyBudget);

  const tone = spentWhole > budgetWhole ? CHIP.overBudget : CHIP.onTrack;

  // **`max` is floored at 1, because a rounded budget can legitimately be 0 and `max="0"` is
  // invalid HTML.** `RegisterDto.monthlyBudget` is only `@IsPositive()`, so `0.40` is an
  // accepted budget and `Math.round` takes it to zero. A `<progress max="0">` is not an error a
  // browser reports - the spec says to fall back to `max=1` - so the bar silently rendered
  // **empty** beside a chip reading "Over budget", and announced 0% to a screen reader, for an
  // account that had overspent its whole budget. Flooring the max and clamping the value
  // against that same floor makes the overspent case draw a full bar, which is what the chip
  // says. `dashboard/BudgetCard.tsx` has the identical shape and the identical bug; it is
  // PET-21's file and out of this ticket's scope, so `docs/TODO.md` carries it.
  const barMax = Math.max(1, budgetWhole);
  const barValue = Math.min(spentWhole, barMax);

  // **Guarded on `> 0` rather than on truthiness, and the difference is a real state.**
  // `unallocated` is `monthlyBudget - allocated` returned **unclamped**, and the contract says
  // outright it can be negative: nothing stops caps summing past the budget (A43), and no
  // over-allocation state is designed. A truthy check would show the banner to someone who has
  // over-allocated, telling them an amount is unassigned when the opposite is true. Zero draws
  // nothing because there is nothing to report.
  const hasUnassigned = unallocated > 0;

  return (
    // A column wrapper rather than the card itself, because the banner is a **sibling** of the
    // card body rather than a child of it - that is what lets the body overlap it. With no
    // banner this is one wrapper around one card and costs nothing.
    <section className="flex flex-col">
      <BannerCardBody>
        <div className="card-body gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* **The heading names the calendar month, and that is a knowing trade rather than an
              oversight.** The figures below it are scoped to the profile's `monthStartDay`
              period, while a month name in the frontend can only be the host's calendar month -
              so at `monthStartDay: 15` this reads "October spending" over Oct 15 to Nov 15
              figures. It is the same mismatch that made `BudgetCard`'s caption drop "in October"
              and `TrendCard`'s read only "Weekly". Kept here by product decision, because it is
              correct at the default start day of 1; `docs/TODO.md` carries the backend field
              that would let it be correct at every start day. */}
            <h2 className="text-base font-semibold">{monthLabel(new Date())} spending</h2>

            <span className={tone.badge}>
              {/* aria-hidden: the badge's text already carries the state. */}
              <span className={tone.dot} aria-hidden="true" />
              {tone.label}
            </span>
          </div>

          <p className="flex flex-wrap items-baseline gap-2">
            <span className="font-display text-2xl font-bold">{formatWhole(spentWhole)}</span>
            <span className="text-base-content/60 text-sm">
              spent of {formatWhole(budgetWhole)} monthly budget
            </span>
          </p>

          {/* **The bar takes the chip's tone, not `primary`.** The category cards below already
            do this, and a summary bar that stayed violet under a green chip made this the one
            card on the screen where the two disagreed. Same rule, one source: `tone` decides
            both, so they cannot drift.

            Clamped for the reason `BudgetCard`'s is: a <progress> above its max renders full but
            reports the raw number to assistive technology. Named rather than hidden, because it
            reports the reader's own budget. */}
          <progress
            className={tone.bar}
            value={barValue}
            max={barMax}
            aria-label="Monthly budget spent"
          />
        </div>
      </BannerCardBody>

      {hasUnassigned ? (
        // One template string rather than an expression followed by JSX text. JSX strips
        // whitespace that contains a newline next to an expression, so the readable two-line
        // version renders "$850of your budget" with no space - which a suite caught here and
        // which no typecheck or lint could.
        <AllocateBanner categories={categories} allocation={allocation} save={save}>
          {`${formatWhole(unallocated)} of your budget isn’t assigned to a category.`}
        </AllocateBanner>
      ) : null}
    </section>
  );
}
