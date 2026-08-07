import type { CategoryContext } from '@/lib/transactionDetail';

// How frame 08's budget chip and bar read a `CategoryResponseDto`.
//
// Two things about that DTO drive everything here, and both are easy to get wrong by
// reasoning from the numbers alone:
//
//   1. **`status` is computed from integer cents, `percentUsed` is not rounded.** So the two
//      can disagree at a band edge - `99.6%` is `near`, and a chip that rounded it to `100%`
//      would sit beside the word for "not there yet". Flooring is what keeps the number from
//      crossing a boundary the status did not.
//   2. **`uncapped` is the common case, not the edge.** Caps are optional and the preselected
//      `Uncategorized` fallback ships without one, so `monthlyCap`, `percentUsed`, `remaining`
//      and `over` are all null on a typical transaction. No Figma frame draws that state -
//      PET-35 and PET-28 both flagged it - and PET-34's answer is to render none of the
//      budget furniture rather than to explain its absence.

type CategoryStatus = CategoryContext['status'];

/**
 * The chip's daisyUI classes, one complete literal string per status.
 *
 * Semantic state rather than the mock's hue, which is the rule `frontend/CLAUDE.md` sets: the
 * frame draws amber at 79% and 79% is `near`, so this is a mapping from a meaning the backend
 * already decided, not a colour picked to match a screenshot. `full` shares `warning` with
 * `near` because being exactly at the cap has not gone wrong yet - `over` is what has.
 *
 * `uncapped` has no entry at all. It is not a chip with no colour, it is no chip, which
 * `chipFor` returns null to express.
 */
const CHIP_CLASSES: Record<Exclude<CategoryStatus, 'uncapped'>, string> = {
  on_track: 'badge badge-sm badge-success',
  near: 'badge badge-sm badge-warning',
  full: 'badge badge-sm badge-warning',
  over: 'badge badge-sm badge-error',
};

/**
 * The percent to print, floored.
 *
 * Floored rather than rounded for reason 1 above. Also clamped at zero, because a category
 * with no spend reports `0` and nothing should ever print a negative percentage of a cap.
 */
export function displayPercent(percentUsed: number): number {
  return Math.max(0, Math.floor(percentUsed));
}

/**
 * How wide to draw the bar, as a percentage.
 *
 * Capped at 100 so an over-budget category fills its track rather than overflowing it. The
 * chip and the `over` line are what say by how much; the bar only has room to say "full".
 */
export function barPercent(percentUsed: number): number {
  return Math.min(100, displayPercent(percentUsed));
}

/**
 * The chip for a category, or null when there is nothing to say.
 *
 * Null covers both halves of the uncapped case: the status itself, and the defensive one where
 * a cap exists but `percentUsed` came back null. The contract types that field as nullable
 * independently of `status`, so a chip built from `status` alone could still print
 * "null% used".
 */
export function chipFor(
  category: Pick<CategoryContext, 'status' | 'percentUsed'>,
): { className: string; label: string } | null {
  if (category.status === 'uncapped' || category.percentUsed === null) {
    return null;
  }

  return {
    className: CHIP_CLASSES[category.status],
    label: `${displayPercent(category.percentUsed)}% used`,
  };
}
