import { categoryDotClass, categoryFillVar } from '@/components/ui/categoryColour';
import { formatWhole } from '@/lib/format';
import type { DashboardSummary } from '@/lib/dashboard';

import { CategoryRing, type RingSlice } from './CategoryRing';
import { apportionPercents, sortedCategories } from './donut';

// Spending-by-category donut with its legend (Figma node 21:4, DSH-8).
//
// A Server Component. `CategoryRing` carries the `'use client'` and nothing else on the card
// needs it: the centre total and every legend row are ordinary server-rendered HTML, which is
// what lets the suite assert on them and what makes the legend the ring's accessible equivalent.
//
// **This is the epic's most contract-served card and the one with the least arithmetic in it.**
// The percentages arrive computed - nothing here divides a month, which
// `backend/src/dashboard/dto/dashboard-response.dto.ts` calls out as a bug by the backend's own
// money note - and the arc geometry belongs to Recharts. What is left is a sort, a rounding and
// a colour lookup.
//
// **The ring always closes, and that is a requirement rather than an emergent property.** Two
// things guarantee it, at two different layers. The arcs are sized from `spent` and Recharts
// normalises against their sum, so the geometry closes whatever the numbers say. And the numbers
// themselves now sum to 100, because `CategoriesService.withSpend` folds spend belonging to no
// live category into the Uncategorized fallback - the invariant that every transaction in the
// period is counted in exactly one row. An earlier version of this card's plan deliberately let
// the ring *not* close, on the reasoning that a visible gap is more honest than a hidden
// shortfall; that was answered by removing the shortfall instead.
//
// **AC5 needs no filter here.** `dashboard.service.ts` already drops `spent > 0` rows, and the
// field is documented as "every nonzero category this period". A defensive
// `.filter(c => c.spent > 0)` would later read as evidence the API might send zeroes.

export type CategoryDonutProps = Pick<DashboardSummary, 'categories' | 'spent'>;

export function CategoryDonut({ categories, spent }: CategoryDonutProps) {
  // The same condition PET-26 will draw frame 05's treatment for. Note this is **not** the
  // screen-wide empty state: `categories` is empty whenever the period is, but it is also
  // reachable on its own, so PET-26's guard for this one card is `categories.length === 0`
  // rather than the shared condition. A strict superset, so the two cannot disagree.
  if (categories.length === 0) {
    return null;
  }

  const sorted = sortedCategories(categories);
  const percents = apportionPercents(sorted.map((category) => category.percent));

  const slices: RingSlice[] = sorted.map((category, index) => ({
    id: category.id,
    name: category.name,
    spent: category.spent,
    percent: percents[index] ?? 0,
    fill: categoryFillVar(category.color),
  }));

  return (
    <section className="card bg-base-100 shadow-sm">
      <div className="card-body gap-4">
        <h2 className="text-base font-semibold">Spending by category</h2>

        {/* The ring is hidden from assistive technology and the legend below is its accessible
            equivalent. That works here in a way it does not on the trend chart: the legend is a
            strict **superset** of the tooltip, naming every slice with its amount and its
            percentage in real text, so a pointer-only tooltip adds convenience rather than
            information and there is nothing to mirror into an `sr-only` line. */}
        <div className="relative" aria-hidden="true">
          <CategoryRing slices={slices} />

          {/* The centre readout, positioned over the hole rather than drawn by Recharts.
              `pointer-events-none` so it never eats a hover meant for the slice behind it. */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <p className="font-display text-2xl font-bold">{formatWhole(spent)}</p>
            <p className="text-base-content/60 text-xs">Total spent</p>
          </div>
        </div>

        {/* AC2 holds by construction: this is the same `spent` field `BudgetCard` prints, off the
            same response, from the one request PET-20 built the endpoint around. Through the same
            `formatWhole`, so the equality is visible rather than merely true. */}
        <ul className="flex flex-col gap-2">
          {sorted.map((category, index) => (
            <li key={category.id} className="flex items-center gap-2 text-sm">
              {/* aria-hidden: the row's own text already names the category, the same call
                  `CategoryChip` and `ui/Input`'s `$` prefix make about a decorative mark. */}
              <span
                className={`size-2.5 shrink-0 rounded-full ${categoryDotClass(category.color)}`}
                aria-hidden="true"
              />
              <span className="grow truncate">{category.name}</span>
              <span className="font-medium">{formatWhole(category.spent)}</span>
              {/* The apportioned integer, read from the same array the ring's slices took theirs
                  from, so a row and its slice cannot disagree by a point. */}
              <span className="text-base-content/60 w-9 text-right">{percents[index] ?? 0}%</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
