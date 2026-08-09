import type { Category } from '@/lib/categories';

// How frame 13's card reads a `CategoryResponseDto`: the chip, the bar and the left-hand
// footer figure.
//
// **The status is the backend's, and nothing here re-derives it.** PET-35 bands on stored
// integer cents - `spentCents >= capCents * 0.75` is `near` - deliberately, so that nothing
// falls in the gap between a rounded 99% and 100%. Both design sources for this screen carry
// their own thresholds (Figma implies them from four examples; the team's Claude Design system
// bands at 80%), and copying either would put a second authority on the same question one
// rounding error away from disagreeing with the chip beside it.
//
// **This is deliberately a sibling of `[id]/categoryStatus.ts` rather than a reuse of it**, and
// the reason is that the two screens say different things with the same data. Frame 08's chip
// reads "79% used" in a plain `badge-sm`; frame 13's reads "Near" in a soft badge with a status
// dot. So the only genuinely common part is flooring and clamping a percentage, which is three
// lines - and `frontend/src/components/CLAUDE.md`'s rule of three says duplicate until a third
// consumer appears, then lift into one owner. **A third screen drawing a category bar is the
// signal to lift both files into one**, not this one.
//
// The one thing that must not drift between them is the reason for flooring, so it is restated
// rather than cross-referenced: `status` is computed on cents and `percentUsed` is unrounded,
// so the two can disagree at a band edge. 99.6% is `near`, and a bar or figure that rounded it
// to 100 would sit beside the word for "not there yet".

type CategoryStatus = Category['status'];

/** Every status except the one that draws no chip and no bar at all. */
type CappedStatus = Exclude<CategoryStatus, 'uncapped'>;

/**
 * The chip per status: a complete literal class string, a dot, and frame 13's own label.
 *
 * Semantic state rather than the mock's hue, which is the rule `frontend/CLAUDE.md` sets. The
 * frame draws amber at 79% and 79% is `near`, so this maps a meaning the backend already
 * decided. `full` shares `warning` with `near` because sitting exactly on the cap has not gone
 * wrong yet - `over` is what has.
 *
 * **`near` and `full` therefore share a colour, and the label is what separates them.** That is
 * not a colour-only signal: both words are real text in the badge, so the distinction survives
 * for a reader who cannot see the hue.
 *
 * The soft badge with a `status` dot is `dashboard/BudgetCard.tsx`'s treatment, matched
 * deliberately - both are "how is this budget doing" chips, and two chips answering the same
 * kind of question on two screens should not look like two different components.
 *
 * `uncapped` has no entry. It is not a chip with no colour, it is no chip, which `chipFor`
 * returns null to express.
 */
const CHIP: Record<CappedStatus, { badge: string; dot: string; label: string }> = {
  on_track: {
    badge: 'badge badge-soft badge-success',
    dot: 'status status-success',
    label: 'On track',
  },
  near: {
    badge: 'badge badge-soft badge-warning',
    dot: 'status status-warning',
    label: 'Near',
  },
  full: {
    badge: 'badge badge-soft badge-warning',
    dot: 'status status-warning',
    label: 'Full',
  },
  over: {
    badge: 'badge badge-soft badge-error',
    dot: 'status status-error',
    label: 'Over',
  },
};

/**
 * The bar per status, again as whole literal strings.
 *
 * **`on_track` is `progress-success` rather than `progress-primary`, which is a deliberate
 * departure from frame 13.** The frame draws a violet bar beside a green "On track" chip; the
 * team's Claude Design system has the bar follow the chip, and that is the version being built.
 * Recorded here because the frame is otherwise this screen's authority on structure and
 * content, and a reviewer diffing against it will notice.
 */
/**
 * **`bg-base-300` is on every arm and is not decoration: without it the track is a tint of the
 * fill.** daisyUI's `.progress` paints its background as `color-mix(in oklab, currentcolor 20%,
 * transparent)` and each `progress-*` modifier sets `currentcolor` - so `progress-success` gives a
 * 20% green track, and a category at 0% used drew as one solid green pill with no fill visible in
 * it. The design system draws a neutral track under every colour, which is also what
 * `transactions/[id]/CategoryContextCard.tsx` already does with its own div-based bar. Tailwind's
 * `bg-*` wins here on layer order, verified in the browser rather than assumed.
 */
const BAR: Record<CappedStatus, string> = {
  on_track: 'progress progress-success bg-base-300 w-full',
  near: 'progress progress-warning bg-base-300 w-full',
  full: 'progress progress-warning bg-base-300 w-full',
  over: 'progress progress-error bg-base-300 w-full',
};

/**
 * Whether this category draws budget furniture at all.
 *
 * A type guard rather than a boolean, so a caller that has narrowed on it can reach
 * `chipFor`/`barClassFor` without re-checking. It tests `status` **and** `monthlyCap`, because
 * the contract types every derived field as nullable independently of the status - a card built
 * on `status` alone could still print "of null".
 */
export function isCapped(category: Pick<Category, 'status' | 'monthlyCap'>): category is Pick<
  Category,
  'status' | 'monthlyCap'
> & {
  status: CappedStatus;
  monthlyCap: number;
} {
  return category.status !== 'uncapped' && category.monthlyCap !== null;
}

/**
 * How wide to draw the bar, as a percentage.
 *
 * Floored for the band-edge reason above, clamped below at 0 because nothing should ever draw a
 * negative share of a cap, and clamped above at 100 so an over-budget category fills its track
 * rather than overflowing it. The chip and the "over" figure are what say by how much; the bar
 * only has room to say "full".
 */
export function barPercent(percentUsed: number | null): number {
  if (percentUsed === null) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.floor(percentUsed)));
}

/** The chip for a capped category. */
export function chipFor(status: CappedStatus): { badge: string; dot: string; label: string } {
  return CHIP[status];
}

/** The bar's classes for a capped category. */
export function barClassFor(status: CappedStatus): string {
  return BAR[status];
}
