'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { useMoney } from '../PreferencesProvider';

// The donut's ring, and the card's only client boundary. `CategoryDonut` stays a Server
// Component and everything on the card that is text - the heading, the centre total, the whole
// legend - is rendered there, which is the rule `frontend/CLAUDE.md`'s The chart library sets and
// the same split `TrendChart` uses.

/** A slice, already sorted, already colour-resolved and already carrying its display percent. */
export type RingSlice = {
  id: string;
  name: string;
  spent: number;
  /** The apportioned integer, the same one the legend row shows. Never re-derived here. */
  percent: number;
  fill: string;
};

type TooltipContentProps = {
  active?: boolean;
  payload?: { payload: RingSlice }[];
};

export function CategoryRing({ slices }: { slices: RingSlice[] }) {
  return (
    <ResponsiveContainer width="100%" height={192}>
      <PieChart
        // Defaults to `true` in Recharts 3 and puts `role="application"` and `tabindex="0"` on
        // the svg. PET-22 shipped that defect on the trend chart and its suite caught it; the
        // same default applies here and it is worse, because this plot sits inside `aria-hidden`
        // - so it would be focusable and unannounceable at once. `frontend/CLAUDE.md` carries the
        // rule; the suite asserts the negative rather than trusting this comment.
        accessibilityLayer={false}
      >
        {/* **The category name is the whole point of this tooltip.** The ring is pure colour, so
            hovering a slice otherwise means tracing a hue back to the legend by eye - which is
            the colour-alone problem the legend exists to solve, reintroduced for the one user who
            is pointing directly at the thing. The amount and the percentage come along because a
            tooltip carrying a bare name looks unfinished and both numbers are already computed. */}
        <Tooltip content={<SliceTooltip />} isAnimationActive={false} />

        <Pie
          data={slices}
          // **`spent`, not `percent`.** Recharts sizes each arc against the sum of the values it
          // is handed, so driving the ring from the amounts closes it by construction - whatever
          // the legend's rounding does beside it, and even if a future response's percentages did
          // not sum to 100. The ring closing is this card's requirement, so it should not depend
          // on a field being well-behaved.
          dataKey="spent"
          nameKey="name"
          // **A second focusable default, separate from `accessibilityLayer`.** `Pie` puts
          // `tabIndex` on its own group and defaults it to 0, so turning the accessibility layer
          // off is not enough on this chart type: the ring stayed in the tab order inside an
          // `aria-hidden` subtree. Found by the same assertion that caught the first one, which
          // is the argument for asserting the negative rather than listing known defaults.
          rootTabIndex={-1}
          cx="50%"
          cy="50%"
          innerRadius="70%"
          outerRadius="100%"
          // Twelve o'clock, sweeping clockwise, which is where the frame starts the first slice.
          startAngle={90}
          endAngle={-270}
          // **A hairline of the card's own colour between the arcs, and it is not decoration.**
          // `CATEGORY_FILL` is lossy by design - `orange` and `yellow` both resolve to
          // `var(--color-warning)`, which `categoryColour.test.ts` blesses - and that is harmless
          // on a chip list where every mark is separated by layout. On a contiguous ring it is
          // not: two same-coloured slices that happen to land next to each other in the
          // `spent`-descending sort merge into one arc, so the ring shows four slices where the
          // legend lists five. A seam in `base-100` separates them without touching the palette,
          // because the card behind this chart is `bg-base-100`; it is invisible between two
          // differently-coloured slices, which is why it costs the ordinary case nothing.
          stroke="var(--color-base-100)"
          strokeWidth={1}
          isAnimationActive={false}
        >
          {slices.map((slice) => (
            <Cell key={slice.id} fill={slice.fill} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

function SliceTooltip({ active, payload }: TooltipContentProps) {
  // Recharts renders `content` as a real element rather than calling it, so this is an ordinary
  // component inside the shell's provider and the hook resolves. It has to be read before the
  // early return below, which is the ordinary rules-of-hooks constraint and the reason the
  // destructure sits above a guard it does not need.
  const { formatWhole } = useMoney();

  const slice = payload?.[0]?.payload;
  if (active !== true || slice === undefined) return null;

  return (
    <div className="rounded-box bg-neutral text-neutral-content px-3 py-2 text-xs shadow-md">
      <p className="font-semibold">{slice.name}</p>
      {/* The apportioned percent, handed in rather than recomputed, so the tooltip and the
          legend row for the same slice can never disagree by a point. */}
      <p>
        {formatWhole(slice.spent)} · {slice.percent}%
      </p>
    </div>
  );
}
