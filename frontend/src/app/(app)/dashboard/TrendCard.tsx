import { ChartNoAxesColumnIncreasing } from 'lucide-react';

import { moneyFormatters } from '@/lib/money';
import type { DashboardSummary } from '@/lib/dashboard';

import { TrendChart, type TrendRow } from './TrendChart';
import { bucketRangeLabel, currentWeekIndex, todayFromDaysLeft } from './weeks';

// Weekly spending trend chart with stats row (Figma node 22:55 area, DSH-6).
//
// A Server Component. The plot itself is not - `TrendChart.tsx` carries the `'use client'` and
// the reasoning for where that boundary sits - but everything on this card that is text stays
// server-rendered, which is what keeps the screen-reader list below assertable without any
// client-only machinery.
//
// **This card is drawn with Recharts, and the branch that first shipped it argued the opposite
// at length.** PET-22's original plan settled "no charting library" for both dashboard charts,
// on the grounds that AC4 forbids interaction outright, so axes, scales, tooltips and
// transitions were all value nobody wanted, and that re-theming a library onto daisyUI semantic
// colour would cost more than the markup it replaced. That reasoning was sound for one chart and
// stopped being sound for a sequence of them: PET-23's donut, and whatever follows it, would each
// have hand-rolled their own geometry. The library is the decision now, and both dashboard charts
// go through it so the epic ends with one mechanism rather than two.
//
// Two of that plan's conclusions survive the reversal intact and are the reason this file still
// looks the way it does. Colour is still daisyUI semantic colour, reached through
// `var(--color-*)` on an SVG `fill` rather than through a class, because a class string is not a
// valid attribute value - `TrendChart.tsx` records that. And the chart is still not interactive
// in the sense AC4 meant: no click target, no keyboard affordance, nothing focusable. What it
// gained is a hover tooltip, which **does** amend AC4 and is recorded on the ticket. The argument
// is narrow: the bucket's date range is the one fact on the response this card discarded, and it
// is the only thing that can explain a short final bucket drawn beside full weeks.
//
// **The API already zero-fills a spend-free week, so this component must not.**
// `weeklyBucketsOf` in `backend/src/dashboard/dashboard.service.ts` pushes every bucket in the
// period's range, a week with no spend included at `total: 0`; its one early return is for an
// account with *no* transactions in the period at all, which answers `[]`. So AC5's "still there
// with a zero value" is satisfied by rendering the array as it arrives, and the whole-period-empty
// case - `transactionCount === 0` on the same response - draws PET-26's own frame 05 treatment
// instead of a zero-filled axis nobody designed.
//
// **The empty guard is `isEmpty`, not `weeklyBuckets.length === 0`, even though the two are
// documented as identical today.** `frontend/src/app/CLAUDE.md` states the biconditional -
// `weeklyBuckets` is `[]` exactly when the period has no transactions at all - but reading the
// array here would be this card's own fifth-and-sixth spelling of the screen's one condition,
// which is exactly what `page.tsx` resolving `isEmpty` once is meant to prevent. The prop is the
// screen's flag; the array is what the populated branch draws from.
//
// **`daysLeft` is on these props to buy a clock rather than a caption.** `BudgetCard` reads the
// same field to print "26 days left"; this card never prints it, and takes it because
// `weeks.ts`'s `todayFromDaysLeft` turns it back into the `today` the backend resolved against
// `APP_TIMEZONE`. Review of this PR found the alternative - `todayIsoDate()` off the frontend
// host - drops the highlight entirely on the first day of a period, so the second field is what
// the accent bar costs, and it arrives on the response the card is already built from.
export type TrendCardProps = Pick<DashboardSummary, 'weeklyBuckets' | 'daysLeft'> & {
  /** The screen's shared PET-26 condition. */
  isEmpty: boolean;
  /**
   * The profile's currency, threaded from the page rather than read here.
   *
   * A Server Component cannot reach `PreferencesProvider`, which is client-side, so the server
   * half of the app takes the currency as a prop while the client half uses `useMoney()`.
   * `lib/money.ts` records the split.
   */
  currency: string;
};

/**
 * The shortest a bar's track is ever drawn, as a percentage of the plot area.
 *
 * A `total: 0` bucket has zero height on its own, which would leave its week label floating
 * under nothing - this is the floor AC5's "still appears" needs. It also doubles as the guard
 * against the pathological all-zero-bucket case: that cannot arise today (`weeklyBucketsOf`
 * returns `[]` outright for an empty period, and every stored amount is `@IsPositive`), but a
 * bare proportion would be `0/0` the day either invariant loosens.
 */
const MIN_BAR_PERCENT = 4;

/**
 * The top of the chart's scale, which is the period's biggest week and never zero.
 *
 * **The guard moved onto the domain rather than onto the value, and that is a consequence of the
 * library.** The hand-rolled version returned a bare `MIN_BAR_PERCENT` when every bucket was
 * zero, because a percentage is meaningful on its own. A magnitude is not: handed `4` against a
 * `[0, 0]` domain Recharts has no scale to place it on. So the degenerate period gets a scale of
 * `[0, 1]` instead, on which every floored bucket lands at the same visible minimum - the same
 * flat row of stubs the old code produced, reached the way a scale needs.
 *
 * Unreachable today either way: `weeklyBucketsOf` answers `[]` outright for a period with no
 * transactions, and every stored amount is `@IsPositive`. It is here so that the day one of
 * those loosens, the chart degrades instead of dividing by zero.
 */
function domainMaxOf(buckets: { total: number }[]): number {
  const max = Math.max(0, ...buckets.map((bucket) => bucket.total));
  return max > 0 ? max : 1;
}

/**
 * The magnitude a bar is actually drawn at: the bucket's own total, floored so it stays visible.
 *
 * **Expressed in the bucket's own unit rather than as a CSS percentage**, which is the one
 * arithmetic change the library brings. The old version computed `height: X%` against a fixed
 * box; Recharts is handed a value and a domain of `[0, domainMax]` and does the same division
 * itself. The floor has to move with it, or it would be a percentage of a percentage.
 */
function flooredValue(total: number, domainMax: number): number {
  return Math.max(total, (MIN_BAR_PERCENT / 100) * domainMax);
}

/** Which of the three tones a bucket wears, given where the current week is. */
function toneFor(index: number, highlightIndex: number | null): TrendRow['tone'] {
  if (highlightIndex === null) return 'past';
  if (index === highlightIndex) return 'current';
  // **A bucket after the current one has not happened yet, and without this it drew identically
  // to AC5's real spend-free week.** `weeklyBucketsOf` tiles the *whole* period regardless of
  // where today falls, so on the 2nd of a 31-day period a user with one transaction gets one real
  // bar and four `$0` ones - and at the minimum height every one of those four was pixel-identical
  // to a week somebody genuinely spent nothing in. That is the shape most accounts show for most
  // of a period, and it is not what node 22:55 (a completed month) draws, which is why the frame
  // answers neither state. A `null` highlight dims nothing: it means the response could not place
  // today at all, and guessing which weeks are behind us from a window we could not locate would
  // be inventing the very thing this card stopped deriving for itself.
  return index > highlightIndex ? 'upcoming' : 'past';
}

/** The suffix naming a bucket's state in the screen-reader list, if it has one. */
const TONE_DESCRIPTION: Record<TrendRow['tone'], string> = {
  current: ', current week',
  upcoming: ', upcoming week',
  past: '',
};

export function TrendCard({ weeklyBuckets, daysLeft, isEmpty, currency }: TrendCardProps) {
  const { formatWhole } = moneyFormatters(currency);

  if (isEmpty) {
    return (
      <section className="card bg-base-100 shadow-sm">
        <div className="card-body gap-4">
          <div>
            <h2 className="text-base font-semibold">Spending trend</h2>
            <p className="text-base-content/60 text-sm">Weekly</p>
          </div>

          {/* The glyph is decorative, same call `RecentTransactionsCard`'s icon tile and
              `ui/categoryColour.ts`'s dots make - the caption beside it already says there is
              nothing to chart. Muted `base-content/30` rather than `primary`: there is nothing
              here to draw attention to, the same reasoning the donut's gray ring states for
              itself. */}
          <div className="flex h-48 flex-col items-center justify-center gap-3">
            <ChartNoAxesColumnIncreasing
              className="text-base-content/30 size-11"
              aria-hidden="true"
            />
            <p className="text-base-content/60 text-sm">No spending to chart yet</p>
          </div>
        </div>
      </section>
    );
  }

  const domainMax = domainMaxOf(weeklyBuckets);
  const today = todayFromDaysLeft(weeklyBuckets, daysLeft);
  const highlightIndex = today === null ? null : currentWeekIndex(weeklyBuckets, today);

  // Every bucket is resolved to a finished row here, on the server, so the chart is handed
  // answers rather than the inputs it would need to form its own.
  const rows: TrendRow[] = weeklyBuckets.map((bucket, index) => ({
    key: bucket.startDate,
    label: `Week ${index + 1}`,
    range: bucketRangeLabel(bucket),
    value: flooredValue(bucket.total, domainMax),
    actual: bucket.total,
    tone: toneFor(index, highlightIndex),
  }));

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

        {/* **The chart is hidden from assistive technology and the list below replaces it**,
            rather than both being announced. Every figure in the plot is SVG text now, which is
            reachable in principle and useless in practice: it would be read as a bare run of
            numbers with no way to tell which belongs to which week, and the tooltip carrying the
            date range is pointer-only and so reaches nobody using a keyboard or a screen reader.
            So the list is the accessible equivalent of the whole chart, and it carries *more*
            than the old per-bar `sr-only` spans did - each row names its week, its date range,
            its amount and its state in one sentence.

            Recharts' own `accessibilityLayer` was the alternative and is deliberately not used:
            it adds a tab stop and arrow-key navigation, which would put a focusable control on a
            card whose ticket says display only, and it would announce alongside this list rather
            than instead of it. Two more strings with no frame behind them, joining what A29
            owes a designer. */}
        <div aria-hidden="true">
          <TrendChart rows={rows} max={domainMax} />
        </div>

        <ul className="sr-only">
          {rows.map((row) => (
            <li key={row.key}>
              {row.label}
              {row.range === '' ? '' : `, ${row.range}`}: {formatWhole(row.actual)}
              {TONE_DESCRIPTION[row.tone]}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
