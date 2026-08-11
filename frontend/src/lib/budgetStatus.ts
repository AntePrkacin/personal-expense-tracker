// The account-level budget's banding: which of four states the whole monthly budget is in,
// and the chip-and-bar tone each state draws as.
//
// **This is the backend's category banding applied to the budget, not a threshold invented
// here.** `dashboard/BudgetCard.tsx` and `transactions/categories/SpendingSummaryCard.tsx`
// each shipped a two-tone split - over budget or not - because a "getting close" tone needed
// a cutoff no design specified, and `docs/TODO.md` carried the question rather than guessing.
// PET-35 answered it for categories: the backend bands on stored cents at 75%, and every
// category card follows that `status` off the API. The product call on PET-74 is that the
// budget bands the same way, so the summary bar cannot sit green beside a wall of amber
// category bars describing the same money.
//
// **Derived client-side because no response publishes it.** A category's `status` is the
// backend's, but neither the dashboard summary nor the categories view carries an account-level
// one - the Categories tab even sums `spent` from the category rows itself. So this module
// mirrors `statusFor` in `backend/src/categories/categories.service.ts` exactly, on cents,
// including its reason: comparing integers is what closes the gap between a rounded 99% and
// 100%, where `percentUsed >= 75` would leave one. If the backend ever publishes an
// account-level status, that field replaces `budgetStatus` and `BUDGET_TONE` stays.
//
// **Shared rather than duplicated, which cuts against the rule of three at two consumers - and
// deliberately.** The two cards describe the *same* monthly budget on two screens, so this is
// not the usual "wait for a third consumer" case where copies may drift apart harmlessly: the
// whole defect being fixed was the two screens answering one question differently. One function
// is what makes that structurally impossible, the same job the API's `status` does for the
// category cards.

/** The four bands, named as the backend names a category's. */
export type BudgetStatus = 'on_track' | 'near' | 'full' | 'over';

/**
 * Which band the budget is in, decided on cents.
 *
 * Both arguments are the response's euro figures (or the Categories tab's client-side sum of
 * them); each is taken to cents with one `Math.round`, which recovers the integers the backend
 * computed with - every stored amount is integer cents, so the only noise is float summation's,
 * under half a cent.
 */
export function budgetStatus(spent: number, monthlyBudget: number): BudgetStatus {
  const spentCents = Math.round(spent * 100);
  const budgetCents = Math.round(monthlyBudget * 100);

  if (spentCents > budgetCents) {
    return 'over';
  }
  if (spentCents === budgetCents) {
    return 'full';
  }
  if (spentCents >= budgetCents * 0.75) {
    return 'near';
  }
  return 'on_track';
}

/**
 * The chip and bar per band, complete literal class strings per key so Tailwind's scanner
 * finds them - the pattern `ui/categoryColour.ts` sets.
 *
 * The mapping is `categoryCardStatus.ts`'s: `near` is warning's amber, `full` is one step
 * hotter - the `orange` status hue PET-74's sixth addendum added to the theme, sitting between
 * amber and red exactly as the state does, so at-the-limit and getting-close no longer share a
 * colour. The labels are real text in the badge as well, so the distinction never rested on
 * hue alone. `over` keeps the budget cards' own wording, "Over budget" rather than the
 * category chip's bare "Over", because these chips stand beside no cap figure to complete the
 * sentence.
 *
 * **`bg-base-300` on each bar pins the track neutral**, for the reason `categoryCardStatus.ts`
 * records in full: daisyUI derives a `<progress>`'s track from the fill colour, so without it
 * an unspent budget drew as one solid green pill.
 */
export const BUDGET_TONE: Record<
  BudgetStatus,
  { badge: string; dot: string; bar: string; label: string }
> = {
  on_track: {
    badge: 'badge badge-soft badge-success',
    dot: 'status status-success',
    bar: 'progress progress-success bg-base-300 w-full',
    label: 'On track',
  },
  near: {
    badge: 'badge badge-soft badge-warning',
    dot: 'status status-warning',
    bar: 'progress progress-warning bg-base-300 w-full',
    label: 'Near',
  },
  full: {
    badge: 'badge badge-soft badge-orange',
    dot: 'status status-orange',
    bar: 'progress progress-orange bg-base-300 w-full',
    label: 'Full',
  },
  over: {
    badge: 'badge badge-soft badge-error',
    dot: 'status status-error',
    bar: 'progress progress-error bg-base-300 w-full',
    label: 'Over budget',
  },
};
