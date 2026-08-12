'use client';

import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';

import { useCategoryHover } from './CategoryHover';

// The donut's ring. `CategoryDonut` stays a Server Component and everything on the card that is
// text - the heading, the centre total, the whole legend - is rendered there, which is the rule
// `frontend/CLAUDE.md`'s The chart library sets and the same split `TrendChart` uses.
//
// **It is no longer the card's only client boundary**: PET-78 added `CategoryHover`'s provider
// above it and a client `<li>` wrapper below it, because the hover has to be visible at both ends.
// The legend's *text* is still server-rendered, which is the part that matters - see that file.
//
// **The hover tooltip is gone, deliberately.** It rendered at the cursor inside this 192px box, so
// on most slices it printed the slice's name and amount straight over the centre readout and left
// both unreadable. Nothing was lost by deleting it: the comment below already argued that the
// legend states every fact the tooltip did, in permanent text, which is the same argument that
// lets this plot be `aria-hidden`. The association it *did* carry - which row owns this arc - is
// now carried better, in both directions, by the shared active id.

/** A slice, already sorted, already colour-resolved and already carrying its display percent. */
export type RingSlice = {
  id: string;
  name: string;
  spent: number;
  /** The apportioned integer, the same one the legend row shows. Never re-derived here. */
  percent: number;
  fill: string;
};

export function CategoryRing({ slices }: { slices: RingSlice[] }) {
  const { activeId, setActiveId } = useCategoryHover();

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
        <Pie
          // Reported by index rather than off the event's own datum: Recharts hands `onMouseEnter`
          // a `PieSectorDataItem`, which is our slice merged with every geometric field the sector
          // computed, so reading `id` off it would depend on the library not shadowing a key we
          // chose. The index into the array we passed cannot drift.
          onMouseEnter={(_, index) => setActiveId(slices[index]?.id ?? null)}
          onMouseLeave={() => setActiveId(null)}
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
            <Cell
              key={slice.id}
              fill={slice.fill}
              // **The hovered arc is outlined, and the others are deliberately not dimmed.**
              // Reducing the rest to a `fillOpacity` is the obvious emphasis and it buys a problem
              // this repo has paid for twice: a translucent fill says nothing until it is
              // composited over the card and the pixel is read, and the mark it makes disappear
              // first is a small slice - `frontend/CLAUDE.md` carries both accounts. A stroke
              // introduces no alpha, so there is no contrast argument to have. It replaces the
              // `base-100` seam on this one arc, which is what the seam is for anyway: separating
              // it from its neighbours.
              //
              // **Both arms are stated, and `undefined` on the resting arm is a real bug.** A
              // `Cell`'s prop overrides the `Pie`'s rather than falling back to it, so
              // `stroke={undefined}` deleted the seam from every slice - which is invisible until
              // two same-coloured slices land next to each other, the exact defect the seam was
              // added for. The suite caught it, which is what `SameColourNeighbours` is for.
              stroke={activeId === slice.id ? 'var(--color-base-content)' : 'var(--color-base-100)'}
              strokeWidth={activeId === slice.id ? 2 : 1}
            />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
