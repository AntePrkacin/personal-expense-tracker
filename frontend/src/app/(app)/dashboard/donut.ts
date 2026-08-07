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
 * **The comparison is `<` rather than `localeCompare`, and agreeing with the backend is the whole
 * reason.** "Same rule" has to mean the same *collation* or the sentence above buys nothing:
 * `dashboard.service.ts`'s `topCategoryOf` breaks its tie with `row.name < winner.name`, which is
 * UTF-16 code-unit order, and `CategoriesService.withSpend` orders by SQLite's BINARY collation,
 * which is the same thing. `localeCompare` is a different order and disagrees on ordinary data,
 * not on exotic data: two categories tied at $100 named `Bills` and `arcade` sort `Bills` first
 * by code unit (`B` is 66, `a` is 97) and `arcade` first by locale, so the stat and the legend's
 * first row would name different categories - the exact failure this tiebreak exists to prevent.
 * Any accented name does it too. The nicer human ordering is real and is the backend's to choose
 * for both of us; a second opinion here is worth less than agreement.
 *
 * The donut and the legend both consume the returned array, which is what makes a slice's
 * position around the ring and its row's position in the list unable to disagree.
 */
export function sortedCategories(categories: DashboardCategory[]): DashboardCategory[] {
  return [...categories].sort(
    (a, b) => b.spent - a.spent || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
}

/**
 * Whole percentages that sum to their own input's total, by largest remainder.
 *
 * On every response the API actually produces that total is 100, because the backend's rows sum
 * to the period's spend. When it is not 100, saying so is the point - see the fourth paragraph.
 *
 * **Rounding each value on its own is what this replaces, and it is visibly wrong.** Five slices
 * at 32.4, 24.3, 18.2, 14.2 and 10.9 each round to the nearest integer perfectly well and then
 * add up to 99. Nothing is wrong with the data; the error is introduced by the rounding itself,
 * and it appears in most category mixes rather than in a rare one. A legend whose column reads 99
 * under a ring that visibly closes is a chart contradicting itself.
 *
 * **The method:** floor every value, count how many points the floors lost against the input's
 * own rounded sum, and hand them one each to the values with the largest fractional parts. That
 * is the Hamilton apportionment, and the property that matters here is the only one being
 * claimed: the results are integers, each within one of its own unrounded value, and they sum to
 * that same rounded total - so a well-formed response sums to exactly 100.
 *
 * **The cost, accepted deliberately:** a slice can display one point away from what it would
 * round to alone. In the example above the floors are 32, 24, 18, 14 and 10, which is 98, so two
 * points are handed out rather than one - to `.9` and `.4` - and the visible difference lands on
 * the 32.4, which shows 33. Making every slice individually "correct" is precisely what makes the
 * total wrong, so this is a choice between two kinds of inaccuracy rather than between accuracy
 * and inaccuracy. Do not "fix" it back to `Math.round`.
 *
 * **The input is expected to sum to 100 and this deliberately does not renormalise it.** An
 * earlier version divided each value by the set's own total first, on the reasoning that a
 * guarantee is a thing to survive the breach of - so a response summing to 97 still produced a
 * legend reading 100. That is the wrong way to survive it, because of what the guarantee is made
 * of. `dashboard.service.ts`'s `categoriesOf` divides by `totalCents`, the account-wide total
 * summed from the transaction list, **rather than** by the sum of these rows - and its docblock
 * and `backend/CLAUDE.md` both say why in as many words: keeping the two derivations independent
 * makes a regression in `CategoriesService`'s orphan fold show up as percentages that visibly
 * fail to reach 100, instead of the shortfall being renormalised out of sight. Scaling here
 * disarmed that detector from the consumer end - the legend would read 100% while its own amounts
 * summed to less than the total printed in the middle of the ring, which is a chart claiming to
 * account for money it is not showing.
 *
 * So the missing points stay missing: the target is the input's own rounded sum. A response that
 * summed to 97 yields a legend reading 97, beside a ring that still closes because Recharts sizes
 * the arcs from `spent`. **The two mechanisms disagreeing is the signal**, and a ring that closes
 * over a legend that does not reach 100 is exactly the visible symptom the backend asked for.
 *
 * An empty input returns an empty array rather than anything summing to 100, since there is no
 * slice to carry it.
 */
export function apportionPercents(values: number[]): number[] {
  if (values.length === 0) return [];

  // The input's own sum rather than a literal 100, so a shortfall survives to be seen. Rounded
  // because the target has to be an integer for integers to add up to it.
  const target = Math.round(values.reduce((sum, value) => sum + value, 0));
  if (!(target > 0)) return values.map(() => 0);

  const floors = values.map(Math.floor);
  const used = floors.reduce((sum, value) => sum + value, 0);

  // Never negative: a sum of floors is an integer no greater than the sum itself, so it cannot
  // exceed that sum rounded. It cannot exceed the number of slices either, since what is missing
  // is the fractional parts.
  let remaining = target - used;

  // Largest fractional part first, index ascending on a tie so the result is deterministic
  // rather than dependent on the sort's stability.
  const byRemainder = values
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
