import type { DashboardSummary } from '@/lib/dashboard';

// The donut's two pieces of real arithmetic, in their own module for the reason `weeks.ts` is:
// both are worth pinning without a render, and neither needs one.
//
// **Much smaller than this card's first plan expected.** That plan was written before the epic
// adopted a charting library and called for "the cumulative arc geometry as pure functions" - one
// `stroke-dasharray` and `stroke-dashoffset` per slice, hand-derived. Recharts computes all of
// that from the values it is handed, so the geometry is gone and what is left is the sort and the
// rounding, which are the two things a library cannot decide for us.

type DashboardCategory = DashboardSummary['categories'][number];

/**
 * The categories largest first, with a stable tiebreak.
 *
 * **The contract publishes no order, so this card sorts rather than reading one off the
 * response.** `GET /api/dashboard` documents nothing about how `categories` is arranged, and
 * relying on the order it happens to arrive in is the failure this repo has been careful about
 * elsewhere: it passes today and breaks silently the day the backend's query grows a join or an
 * index. AC3 asks for largest first, so the card asks for largest first.
 *
 * **`spent` descending, then `name` ascending**, and the tiebreak is not arbitrary: it is the
 * same one `topCategory` already documents on the backend. Without it two categories on equal
 * spend could order one way here and the other way there, so PET-21's "Top category" stat and
 * this legend's first row would name different categories on the same screen. Two rows with the
 * same spend and the same name are indistinguishable anyway, so the comparator is total.
 *
 * The donut and the legend both consume the returned array, which is what makes a slice's
 * position around the ring and its row's position in the list unable to disagree.
 */
export function sortedCategories(categories: DashboardCategory[]): DashboardCategory[] {
  return [...categories].sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name));
}

/**
 * Whole percentages that sum to exactly 100, by largest remainder.
 *
 * **Rounding each value on its own is what this replaces, and it is visibly wrong.** Five slices
 * at 32.4, 24.3, 18.2, 14.2 and 10.9 each round to the nearest integer perfectly well and then
 * add up to 99. Nothing is wrong with the data; the error is introduced by the rounding itself,
 * and it appears in most category mixes rather than in a rare one. A legend whose column reads 99
 * under a ring that visibly closes is a chart contradicting itself.
 *
 * **The method:** floor every value, count how many points are missing from 100, and hand them
 * one each to the values with the largest fractional parts. That is the Hamilton apportionment,
 * and the property that matters here is the only one being claimed: the results are integers,
 * each within one of its own unrounded value, and they sum to exactly 100.
 *
 * **The cost, accepted deliberately:** a slice can display one point away from what it would
 * round to alone. In the example above the floors are 32, 24, 18, 14 and 10, which is 98, so two
 * points are handed out rather than one - to `.9` and `.4` - and the visible difference lands on
 * the 32.4, which shows 33. Making every slice individually "correct" is precisely what makes the
 * total wrong, so this is a choice between two kinds of inaccuracy rather than between accuracy
 * and inaccuracy. Do not "fix" it back to `Math.round`.
 *
 * **The input is expected to sum to 100 and this does not require it to.** The backend guarantees
 * it - `CategoriesService` folds spend belonging to no live category into Uncategorized, so every
 * transaction lands in exactly one row - but a guarantee is a thing to survive the breach of, not
 * to divide by. The values are normalised against their own total first, so a response that
 * somehow summed to 97 still yields a legend reading 100 rather than 97, matching a ring that
 * closes regardless because Recharts normalises the arcs the same way.
 *
 * An empty input returns an empty array rather than anything summing to 100, since there is no
 * slice to carry it.
 */
export function apportionPercents(values: number[]): number[] {
  if (values.length === 0) return [];

  const total = values.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) return values.map(() => 0);

  const scaled = values.map((value) => (value / total) * 100);
  const floors = scaled.map(Math.floor);
  const used = floors.reduce((sum, value) => sum + value, 0);

  // Never negative: the floors can only undershoot 100, and by less than the number of slices.
  let remaining = 100 - used;

  // Largest fractional part first, index ascending on a tie so the result is deterministic
  // rather than dependent on the sort's stability.
  const byRemainder = scaled
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  const apportioned = [...floors];
  for (const { index } of byRemainder) {
    if (remaining <= 0) break;
    apportioned[index] = (apportioned[index] ?? 0) + 1;
    remaining -= 1;
  }

  return apportioned;
}
