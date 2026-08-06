import type { DashboardSummary } from '@/lib/dashboard';

// The one piece of real arithmetic on the trend card: which bucket is the current week.
//
// Its own module rather than a helper inside `TrendCard.tsx`, because AC3's range test is worth
// pinning without a render, and the short-final-bucket case - the contract's last bucket ending
// at the period end rather than seven days after its start - is exactly the kind of thing that
// passes every test written against a tidy 28-day fixture and fails for the last few days of a
// shorter month.

type WeeklyBucket = DashboardSummary['weeklyBuckets'][number];

/**
 * The index of `buckets` that contains `today`, or `null` if none does.
 *
 * **A half-open range test, `startDate <= today < endDate`, string-compared on `YYYY-MM-DD`.**
 * ISO dates sort correctly as text, so this needs no `Date` at all - which is deliberate, since
 * `lib/date.ts` and `lib/format.ts` both record that `new Date(iso)` parses a date-only string as
 * UTC midnight and reads a day early behind UTC. It must not be written as `startDate + 7 days`:
 * the contract documents the final bucket as short, ending at the period end rather than seven
 * days after its start, so a computed end would place `today` outside every range for the last
 * few days of a period shorter than a clean multiple of seven and the highlight would silently
 * vanish. Comparing against each bucket's own `endDate` is what keeps that case correct without a
 * special final-bucket branch.
 *
 * **`null` for the empty array and for a `today` outside every bucket, and both are ordinary.**
 * `weeklyBuckets` is `[]` exactly when `transactionCount === 0` - `TrendCard.tsx` renders nothing
 * for that account rather than calling this at all - and `today` can fall after the last bucket
 * for the same reason `daysLeft` can momentarily read 0 at the midnight boundary
 * (`backend/CLAUDE.md`'s Dashboard section): the endpoint resolves the period more than once
 * per request, so the window and `today` can land on either side of it for an instant. Neither
 * case is a defect this function should paper over; it says "no highlight" honestly and the next
 * request corrects itself.
 *
 * **A `today` past the profile's zone, not the frontend host's, would place the highlight one
 * bucket off for up to an hour twice a month.** `weeklyBuckets`' boundaries come from
 * `monthWindow`, which resolves `today` against the profile's `APP_TIMEZONE`
 * (`backend/src/common/month-window.ts`); `today` here comes from `lib/date.ts`'s
 * `todayIsoDate()`, which reads whichever zone the frontend host runs in. The two clocks can
 * therefore disagree by up to the zone offset, and when that disagreement straddles a bucket
 * boundary the computed index points at the neighbouring week. Self-healing on the next request,
 * exactly like the `daysLeft` edge above, and not fixable here: fixing it would mean this card
 * reading `monthStartDay` and re-deriving the window itself, which is the second-guessing
 * PET-21's `BudgetCard` was written to avoid for `daysLeft`.
 */
export function currentWeekIndex(buckets: WeeklyBucket[], today: string): number | null {
  const index = buckets.findIndex(
    ({ startDate, endDate }) => startDate <= today && today < endDate,
  );
  return index === -1 ? null : index;
}
