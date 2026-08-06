import { formatWhole } from '@/lib/format';
import type { DashboardSummary } from '@/lib/dashboard';

import { currentWeekIndex, todayFromDaysLeft } from './weeks';

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
//
// **`daysLeft` is on these props to buy a clock rather than a caption.** `BudgetCard` reads the
// same field to print "26 days left"; this card never prints it, and takes it because
// `weeks.ts`'s `todayFromDaysLeft` turns it back into the `today` the backend resolved against
// `APP_TIMEZONE`. Review of this PR found the alternative - `todayIsoDate()` off the frontend
// host - drops the highlight entirely on the first day of a period, so the second field is what
// the accent bar costs, and it arrives on the response the card is already built from.
export type TrendCardProps = Pick<DashboardSummary, 'weeklyBuckets' | 'daysLeft'>;

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

/**
 * The one background class a bar wears: accent for now, muted for later, primary for done.
 *
 * A function returning whole literals rather than an interpolation, which is the rule
 * `frontend/CLAUDE.md` states about Tailwind's scanner reading source as raw text - a
 * `bg-${tone}` compiles to nothing with no build error.
 *
 * **`base-content/20` rather than `base-300`, and the browser walk is what chose it.**
 * `base-300` is the obvious "empty surface" token and it computes to `oklch(0.95 0 0)` in the
 * light theme - against the card's own white `base-100`, an upcoming week at `MIN_BAR_PERCENT`
 * would have been a 5px bar nobody could see, which is a worse answer than the one this state
 * exists to replace. The muted foreground reads as a track in both themes for the same reason
 * `text-base-content/60` reads as a caption in both, and needs no `dark:` variant.
 */
function barTone(isCurrent: boolean, isUpcoming: boolean): string {
  if (isCurrent) return 'bg-accent';
  if (isUpcoming) return 'bg-base-content/20';
  return 'bg-primary';
}

export function TrendCard({ weeklyBuckets, daysLeft }: TrendCardProps) {
  // Nothing to chart for the whole period, which is `transactionCount === 0` on the same
  // response: PET-26 owns what replaces this with, the shared condition across four cards.
  if (weeklyBuckets.length === 0) {
    return null;
  }

  const maxTotal = Math.max(0, ...weeklyBuckets.map((bucket) => bucket.total));
  const today = todayFromDaysLeft(weeklyBuckets, daysLeft);
  const highlightIndex = today === null ? null : currentWeekIndex(weeklyBuckets, today);

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
          {weeklyBuckets.map((bucket, index) => {
            const isCurrent = index === highlightIndex;
            // **A bucket after the current one has not happened yet, and without this it drew
            // identically to AC5's real spend-free week.** `weeklyBucketsOf` tiles the *whole*
            // period regardless of where today falls, so on the 2nd of a 31-day period a user
            // with one transaction gets one real bar and four `$0` ones - and at
            // `MIN_BAR_PERCENT` every one of those four was pixel-identical to a week somebody
            // genuinely spent nothing in. That is the shape most accounts show for most of a
            // period, and it is not what node 22:55 (a completed month) draws, which is why the
            // frame answers neither state. `highlightIndex` of `null` dims nothing: it means the
            // response could not place today at all, and guessing which weeks are behind us from
            // a window we could not locate would be inventing the very thing this card stopped
            // deriving for itself.
            const isUpcoming = highlightIndex !== null && index > highlightIndex;

            return (
              <div key={bucket.startDate} className="flex flex-1 flex-col items-center gap-1">
                <p className={`text-xs font-semibold ${isUpcoming ? 'text-base-content/40' : ''}`}>
                  {formatWhole(bucket.total)}
                </p>
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
                    // The highlight is bg-accent, an upcoming week bg-base-content/20 and the
                    // rest bg-primary - a chart series rather than a status or a control, a
                    // case `frontend/CLAUDE.md`'s "colour modifiers are semantic state" rule
                    // does not cover either way. All three are complete literals, per the
                    // scanner rule; `barTone` picks between them rather than composing one.
                    className={`w-full rounded-t ${barTone(isCurrent, isUpcoming)}`}
                    style={{ height: `${barHeightPercent(bucket.total, maxTotal)}%` }}
                  />
                </div>
                <p className="text-base-content/60 text-xs">Week {index + 1}</p>
                {/* **Neither of the two states above may be carried by colour alone**, which is
                    the second finding from this PR's review: a bar reading `$0` says the same
                    thing to a screen reader whether it is a spent-nothing week or a week that
                    has not started, and AC3's current-week accent said nothing at all. An
                    `sr-only` line rather than `aria-current`, which the repo does use on
                    `DateField`'s today: that is a `gridcell` inside a real grid, where the
                    attribute is reliably conveyed, while these columns are generic `div`s with
                    no role for it to qualify. AC4's "no interaction" forbids controls, not a
                    non-visual label. Two more strings with no frame behind them, joining what
                    A29 owes a designer. */}
                {isCurrent ? <span className="sr-only">Current week</span> : null}
                {isUpcoming ? <span className="sr-only">Upcoming week</span> : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
