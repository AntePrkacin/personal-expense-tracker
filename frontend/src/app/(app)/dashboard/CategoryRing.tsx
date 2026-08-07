'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { formatWhole } from '@/lib/format';

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
          stroke="none"
          isAnimationActive={false}
        >
          {slices.map((slice) => (
            <Cell key={slice.id} fill={slice.fill} stroke="none" />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

function SliceTooltip({ active, payload }: TooltipContentProps) {
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
