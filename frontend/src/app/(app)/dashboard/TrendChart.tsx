'use client';

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useMoney } from '../PreferencesProvider';

// The weekly trend chart's plot, and the only client boundary on the card.
//
// **`TrendCard` stays a Server Component and this file is the smallest wrapper that could not**,
// which is the rule `SidebarNav` and `ResendLink` already set. Recharts measures its own box
// through a `ResizeObserver`, so it cannot render on the server; everything on the card that is
// not the plot itself - the heading, the caption, the screen-reader list - stays server-rendered
// beside it. That does not make Recharts cheaper in the bundle, since importing it anywhere ships
// it; what it buys is that the card's text is still ordinary server HTML that a suite can assert
// on and a reader gets before hydration.
//
// **This component is handed answers, never inputs.** It receives no `daysLeft`, no
// `weeklyBuckets`, no clock: `TrendCard` resolves each bucket to a tone first, using `weeks.ts`,
// whose doc comments record three rounds of review about which clock a period belongs to. There
// is deliberately no code path here through which a chart could form its own opinion about what
// "today" is - that defect was shipped once and is not reachable from this file.

/** The chart's fixed height, and the plot area inside it once the margins are taken out. */
const CHART_HEIGHT = 176;
const LABEL_BAND = 20;
const AXIS_BAND = 24;

/**
 * A bucket, already classified and already formatted, ready to draw.
 *
 * **`value` and `actual` are different numbers on purpose.** `value` carries the
 * `MIN_BAR_PERCENT` floor and exists only to give the bar a height; `actual` is the real total
 * and is what every piece of text renders. A `$0` week has to keep a visible sliver *and* still
 * read `$0`, and collapsing the two fields would force a choice between an invisible bar and a
 * lying label.
 */
export type TrendRow = {
  /** `bucket.startDate`, which is unique across the period and so serves as the key. */
  key: string;
  /** "Week 1", the caption under the bar. */
  label: string;
  /** "Oct 1 – Oct 7", the tooltip's title and the one fact the card used to discard. */
  range: string;
  /** Floored magnitude. Drives geometry only. */
  value: number;
  /** The bucket's true total. Drives every string. */
  actual: number;
  tone: 'current' | 'upcoming' | 'past';
};

/**
 * The fill for each tone, as CSS custom property references rather than Tailwind classes.
 *
 * **`fill` is an SVG presentation attribute and a class string is not a valid value for one**, so
 * `CATEGORY_DOT`'s pattern of handing out whole `bg-*` literals does not transfer here. A
 * `var(--color-accent)` string is a live reference resolved by the browser exactly as
 * `bg-accent` is, so it follows a theme change with no JavaScript and needs no `dark:` variant -
 * the same mechanism, reached through the attribute instead of through a class.
 *
 * The muted tone reproduces `bg-base-content/20` as a fill plus `fillOpacity`, because SVG
 * composites the alpha itself. `frontend/src/app/CLAUDE.md` records why that tone rather than
 * `base-300`: at the minimum bar height `base-300` computes to roughly 1.09:1 against the card
 * and is simply invisible, so the state meant to remove an ambiguity removed itself instead. It
 * also records that the check which found that had to composite a painted pixel, because
 * `getComputedStyle` returns a translucent colour uncomposited - and this is a *different*
 * compositing path (SVG `fill-opacity` rather than Tailwind's `/20`), so the browser walk
 * measures it again rather than inheriting the old number.
 */
const TONE_FILL: Record<TrendRow['tone'], { fill: string; fillOpacity: number }> = {
  current: { fill: 'var(--color-accent)', fillOpacity: 1 },
  past: { fill: 'var(--color-primary)', fillOpacity: 1 },
  upcoming: { fill: 'var(--color-base-content)', fillOpacity: 0.2 },
};

/** The figure above each bar, dimmed for a week that has not started. */
const DIMMED_TEXT_OPACITY = 0.4;

type LabelContentProps = {
  x?: string | number;
  y?: string | number;
  width?: string | number;
  index?: number;
};

type TooltipContentProps = {
  active?: boolean;
  payload?: { payload: TrendRow }[];
};

function toNumber(value: string | number | undefined): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

export function TrendChart({ rows, max }: { rows: TrendRow[]; max: number }) {
  // `renderValue` below is passed to `LabelList` as a plain render function rather than mounted as
  // a component, so it cannot hold a hook of its own and reads this one out of the closure. It is
  // now the only consumer on this card: `TrendTooltip` is a real element and did call `useMoney()`
  // itself, until PET-78 left it holding a date range and no money at all.
  const { formatWhole } = useMoney();

  // Recharts positions this from the bar's own box, so it needs the row back to know whether the
  // week has started. A plain function rather than a component, so nothing here looks like a
  // component defined inside a render.
  const renderValue = (props: LabelContentProps) => {
    const row = rows[props.index ?? -1];
    if (row === undefined) return null;

    return (
      <text
        x={toNumber(props.x) + toNumber(props.width) / 2}
        y={toNumber(props.y) - 6}
        textAnchor="middle"
        className="text-xs font-semibold"
        fill="var(--color-base-content)"
        fillOpacity={row.tone === 'upcoming' ? DIMMED_TEXT_OPACITY : 1}
      >
        {formatWhole(row.actual)}
      </text>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart
        data={rows}
        // **Explicit, not Recharts' default.** PET-22 shipped a version whose bars were clamped
        // because the box they measured against was shared with the label rows, and the review
        // finding generalises: the plot area must contain the plot. Recharts computes its own
        // rather than sharing a flex container, so that exact bug cannot recur - but a margin
        // left to a library default is the same mistake with a different owner. The top band is
        // the figures above the bars; the bottom is the axis's own `height`.
        margin={{ top: LABEL_BAND, right: 0, bottom: 0, left: 0 }}
        barCategoryGap="20%"
        // **`accessibilityLayer` defaults to `true` in Recharts 3 and must be turned off, which
        // is not the same as declining to turn it on.** Left alone it puts `role="application"`
        // and `tabindex="0"` on the surface: a tab stop on a card whose ticket says display only,
        // and an `application` role that tells a screen reader to leave browse mode and forward
        // every keystroke to a chart with no keyboard interface. Worse in this exact position,
        // because the card hides the plot with `aria-hidden` and hands the same facts to a
        // `sr-only` list - and `aria-hidden` does **not** remove focusable descendants from the
        // tab order, the trap `frontend/src/app/CLAUDE.md` already records for the Welcome
        // panel. So the default left a tab stop that no screen reader could announce. The
        // suite's "puts nothing in the tab order" case is what caught it and is what keeps it
        // caught.
        accessibilityLayer={false}
      >
        {/* The domain is the **period's** maximum, passed in, never `auto`. Left to itself
            Recharts would fit the domain to the data it holds, which is the same array - fine
            here, but the moment a future caller draws a subset the bars would silently rescale
            to their own biggest rather than to the period's. Stating it removes the question. */}
        <YAxis hide domain={[0, max]} />

        {/* AC4 forbids a visible axis; it does not forbid the week captions the frame draws.
            `interval={0}` because Recharts drops labels it thinks are crowded, and a chart that
            silently stops naming Week 3 on a narrow viewport is worse than a cramped one. */}
        <XAxis
          dataKey="label"
          height={AXIS_BAND}
          axisLine={false}
          tickLine={false}
          interval={0}
          tick={{ fill: 'var(--color-base-content)', fillOpacity: 0.6, fontSize: 12 }}
        />

        {/* **The tooltip amends AC4, deliberately, and the ticket carries the note.** What it
            adds is the bucket's date range, which is the only fact on the response the card
            never showed and the only thing on screen that can explain a short final bucket
            drawn beside full weeks. `cursor={false}` suppresses the grey hover rectangle
            Recharts draws by default, which no frame designs. The range is also in the
            card's screen-reader list, because a tooltip is pointer-only.

            **It carries the range and nothing else, as of PET-78 item 3.** It printed the
            amount underneath, which `LabelList` above already paints permanently over every
            bar - so hovering a bar restated the one figure that was never in question and
            covered the neighbouring bars to do it. That leaves this tooltip holding exactly
            what is not otherwise on screen, which is the same test that deleted the donut's
            tooltip outright in item 2: there the legend already stated everything, here the
            date range is stated nowhere else. The screen-reader list keeps **both**, because
            it is the equivalent of the whole chart rather than of this bubble. */}
        <Tooltip content={<TrendTooltip />} cursor={false} isAnimationActive={false} />

        <Bar dataKey="value" isAnimationActive={false} radius={[4, 4, 0, 0]}>
          {rows.map((row) => (
            <Cell key={row.key} {...TONE_FILL[row.tone]} />
          ))}
          <LabelList dataKey="actual" content={renderValue} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function TrendTooltip({ active, payload }: TooltipContentProps) {
  const row = payload?.[0]?.payload;
  if (active !== true || row === undefined) return null;

  // **An empty range now suppresses the whole tooltip, and that is a consequence of dropping the
  // amount rather than a separate decision.** `bucketRangeLabel` answers `''` for a date it could
  // not parse; while the amount was here that only had to avoid a blank line above it, and the
  // bubble still had something to say. The range is the only thing left, so an empty one would
  // paint an empty box floating beside the bar.
  if (row.range === '') return null;

  return (
    <div className="rounded-box bg-neutral text-neutral-content px-3 py-2 text-xs font-semibold shadow-md">
      {row.range}
    </div>
  );
}
