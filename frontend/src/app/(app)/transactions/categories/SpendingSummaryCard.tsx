import { moneyFormatters } from '@/lib/money';
import { BUDGET_TONE, budgetStatus } from '@/lib/budgetStatus';
import type { Allocation, Category } from '@/lib/categories';
import type { Period } from '@/lib/periods';
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

type SpendingSummaryCardProps = {
  /** The period's spend, summed from the categories. See `CategoriesScreen` for why that sum is sound. */
  spent: number;
  allocation: Allocation;
  /** Every category, for the banner's modal. Not rendered here - see the note above. */
  categories: Category[];
  /** Every period, for the modal's cap-anchor question. Threaded like `categories`. */
  periods: readonly Period[];
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
  /**
   * The period's own label, from the response.
   *
   * Threaded from the page rather than read here, the same split the currency takes: a Server
   * Component cannot reach `PreferencesProvider`. It labels the period and resolves no window -
   * every figure below is scoped to the one the backend resolved.
   *
   * **A label rather than a `monthStartDay` since PET-72.** This card derived "October spending" from
   * a start day and today, which cannot name a period a pay-day change stretched across two months -
   * and the paragraph below, about the heading and the figures disagreeing, is exactly the failure
   * that derivation had one more way to produce.
   */
  periodLabel: string;
  /**
   * True on a historical period view, where the Allocate banner is not drawn.
   *
   * The modal drafts from and validates against the live configuration, and its backdating path is
   * the cap-anchor question it asks on save - so a banner over December's figures would open a
   * modal editing something other than what is on screen. `CategoriesScreen`'s `isCurrentPeriod`
   * note carries the full account. Not drawn rather than disabled, per the fallback card's rule:
   * nothing on this screen is drawn that cannot be acted on.
   */
  readOnly?: boolean;
};

export function SpendingSummaryCard({
  spent,
  allocation,
  categories,
  periods,
  save,
  currency,
  periodLabel,
  readOnly = false,
}: SpendingSummaryCardProps) {
  const { formatWhole } = moneyFormatters(currency);

  const { monthlyBudget, unallocated } = allocation;

  // Rounded once and the pair derived from the rounded figures, which is `BudgetCard`'s rule
  // and exists for the same reason: formatting each of two figures independently lets one card
  // print "$1,241 of $2,000" beside a remainder that does not add up to the budget.
  const spentWhole = Math.round(spent);
  const budgetWhole = Math.round(monthlyBudget);

  // **The tone is the category cards' banding applied to the budget, decided on cents** -
  // `lib/budgetStatus.ts` carries the account, including why it mirrors the backend's
  // `statusFor` rather than inventing a threshold, and why it is shared with `BudgetCard` at
  // two consumers. On the raw figures rather than the rounded pair above, which is what lets
  // the chip read "Near" while the card prints "$2,000 of $2,000" - the same band-edge honesty
  // `categoryCardStatus.ts` restates for the cards below, where 99.6% is `near` and floors to
  // 99 rather than rounding to 100 beside the word for "not there yet".
  const tone = BUDGET_TONE[budgetStatus(spent, monthlyBudget)];

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
  // nothing because there is nothing to report. And nothing is drawn on a historical period,
  // whose unassigned budget is a fact about a closed month that no write can change - see
  // `readOnly` above.
  const hasUnassigned = !readOnly && unallocated > 0;

  return (
    // A column wrapper rather than the card itself, because the banner is a **sibling** of the
    // card body rather than a child of it - that is what lets the body overlap it. With no
    // banner this is one wrapper around one card and costs nothing.
    <section className="flex flex-col">
      <BannerCardBody>
        <div className="card-body gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* **The heading names the period the figures are from, and PET-72 is what made that
              possible.** It used to name the host's calendar month while the figures below were
              scoped to the profile's own period - so at a start day of 15 it read "October
              spending" over Oct 15 to Nov 15 figures, the same mismatch that made `BudgetCard`'s
              caption drop "in October" and `TrendCard`'s read only "Weekly". The label is the
              backend's now, resolved from the same period the figures were summed over, so the
              heading and the numbers under it cannot disagree. */}
            <h2 className="text-base font-semibold">{periodLabel} spending</h2>

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
        <AllocateBanner
          categories={categories}
          allocation={allocation}
          periods={periods}
          save={save}
        >
          {`${formatWhole(unallocated)} of your budget isn’t assigned to a category.`}
        </AllocateBanner>
      ) : null}
    </section>
  );
}
