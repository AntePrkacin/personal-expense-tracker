import { todayIsoDate } from '@/lib/date';
import { formatWhole } from '@/lib/format';
import type { DashboardSummary } from '@/lib/dashboard';

import { currentWeekIndex } from './weeks';

// Weekly spending trend chart with stats row (Figma node 22:55 area, DSH-6). AC4: display only,
// no tooltip, no axis, no interaction.
//
// A Server Component: nothing on it is interactive, so it costs the client bundle nothing.
// `page.tsx` builds it from the one dashboard read, matching `BudgetCard`'s own `Pick` off
// `DashboardSummary` rather than a shape of its own.
//
// **No charting library.** Both dashboard charts are static and non-interactive by their own
// acceptance criteria - AC4 here forbids hover and click outright - and every library's value is
// axes, scales, tooltips and transitions, none of which either chart wants. Re-theming one onto
// `--color-accent` would also be more work than not having one, and the failure mode is the one
// `frontend/CLAUDE.md`'s colour rule warns about: a wrong colour compiles and quietly bypasses
// the theme. So the bars are `<div>`s with a proportional height, written in place.
//
// **The API already zero-fills a spend-free week, so this component must not.**
// `weeklyBucketsOf` in `backend/src/dashboard/dashboard.service.ts` pushes every bucket in the
// period's range, a week with no spend included at `total: 0`; its one early return is for an
// account with *no* transactions in the period at all, which answers `[]`. So AC5's "still there
// with a zero value" is satisfied by rendering the array as it arrives, and this card renders
// nothing at all for the whole-period-empty case - which is `transactionCount === 0` on the same
// response - rather than inventing a zero-filled axis nobody designed. PET-26 is what replaces
// that nothing with frame 05's own empty-state card.
export type TrendCardProps = Pick<DashboardSummary, 'weeklyBuckets'>;

/**
 * The shortest a bar's track is ever drawn, as a percentage of the card's fixed bar area.
 *
 * A `total: 0` bucket has zero proportional height on its own, which would leave its week label
 * floating under nothing - this is the floor AC5's "still appears" needs. It also doubles as the
 * guard against the pathological all-zero-bucket division below: that case cannot arise today
 * (`weeklyBucketsOf` returns `[]` outright for an empty period, and every stored amount is
 * `@IsPositive`), but a bare `total / maxTotal` would render `NaN%` in every inline style the day
 * either invariant loosens, where a guarded percentage instead degrades to a flat row of minimum
 * bars.
 */
const MIN_BAR_PERCENT = 4;

/** `total` as a percentage of `maxTotal`, floored at `MIN_BAR_PERCENT` and never `NaN`. */
function barHeightPercent(total: number, maxTotal: number): number {
  if (maxTotal <= 0) return MIN_BAR_PERCENT;
  return Math.max((total / maxTotal) * 100, MIN_BAR_PERCENT);
}

export function TrendCard({ weeklyBuckets }: TrendCardProps) {
  // Nothing to chart for the whole period, which is `transactionCount === 0` on the same
  // response: PET-26 owns what replaces this with, the shared condition across four cards.
  if (weeklyBuckets.length === 0) {
    return null;
  }

  const maxTotal = Math.max(0, ...weeklyBuckets.map((bucket) => bucket.total));
  const highlightIndex = currentWeekIndex(weeklyBuckets, todayIsoDate());

  return (
    <section className="card bg-base-100 shadow-sm">
      <div className="card-body gap-4">
        <div>
          <h2 className="text-base font-semibold">Spending trend</h2>
          {/* "Weekly" alone, not "Weekly · October": the buckets are anchored to the profile's
              `monthStartDay` window, the same one `daysLeft` on `BudgetCard` comes from, and a
              month spanning that window has no single calendar name. `BudgetCard`'s own caption
              dropped its month name for the identical reason; `docs/TODO.md` records the period
              label a backend field would need to bring one back here too. */}
          <p className="text-base-content/60 text-sm">Weekly</p>
        </div>

        {/* h-32 is the fixed track every bar's percentage height is measured against - a chart
            with no axis still needs somewhere for "100%" to mean something. */}
        <div className="flex h-32 items-end justify-between gap-2">
          {weeklyBuckets.map((bucket, index) => (
            <div
              key={bucket.startDate}
              className="flex h-full flex-1 flex-col items-center justify-end gap-1"
            >
              <p className="text-xs font-semibold">{formatWhole(bucket.total)}</p>
              <div
                // The highlight is bg-accent and the rest bg-primary - a chart series rather
                // than a status or a control, which is a case `frontend/CLAUDE.md`'s "colour
                // modifiers are semantic state" rule does not cover either way.
                className={`w-full rounded-t ${index === highlightIndex ? 'bg-accent' : 'bg-primary'}`}
                style={{ height: `${barHeightPercent(bucket.total, maxTotal)}%` }}
              />
              <p className="text-base-content/60 text-xs">Week {index + 1}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
