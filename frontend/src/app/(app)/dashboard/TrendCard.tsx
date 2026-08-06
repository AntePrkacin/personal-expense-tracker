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

        <div className="flex items-end justify-between gap-2">
          {weeklyBuckets.map((bucket, index) => (
            <div key={bucket.startDate} className="flex flex-1 flex-col items-center gap-1">
              <p className="text-xs font-semibold">{formatWhole(bucket.total)}</p>
              {/* **The plot area holds the bar and nothing else, and that is a correctness
                  requirement rather than tidiness.** A percentage height resolves against the
                  containing block, so with the two label rows inside this box the bars measured
                  themselves against a track 40px of which was already spoken for - and, being
                  shrinkable flex items, they absorbed the whole overflow. Every bucket at or
                  above 68.75% of the max then rendered at the identical clamped height, so
                  `$410` and `$300` drew the same bar and AC2's "the biggest week is the tallest"
                  was false on screen while the inline `style.height` said otherwise. Review of
                  this PR caught it; `h-32` now belongs to a box whose only child is the bar, so
                  100% means the whole track. */}
              <div className="flex h-32 w-full items-end">
                <div
                  // The highlight is bg-accent and the rest bg-primary - a chart series rather
                  // than a status or a control, which is a case `frontend/CLAUDE.md`'s "colour
                  // modifiers are semantic state" rule does not cover either way.
                  className={`w-full rounded-t ${index === highlightIndex ? 'bg-accent' : 'bg-primary'}`}
                  style={{ height: `${barHeightPercent(bucket.total, maxTotal)}%` }}
                />
              </div>
              <p className="text-base-content/60 text-xs">Week {index + 1}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
