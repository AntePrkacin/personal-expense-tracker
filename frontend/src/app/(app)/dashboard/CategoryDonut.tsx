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
  // **Not** the screen-wide empty state: `categories` is empty whenever the period is, but it
  // is also reachable on its own through the dangling-category race
  // `backend/src/dashboard/dashboard.service.ts` documents, so this card's guard is its own
  // input rather than a prop threaded from `page.tsx`. A strict superset of the shared
  // condition, so the two cannot disagree - `frontend/src/app/CLAUDE.md` records why every
  // other card keeps the screen's flag and this one deliberately does not.
  if (categories.length === 0) {
    return (
      <section className="card bg-base-100 shadow-sm">
        <div className="card-body gap-4">
          <h2 className="text-base font-semibold">Spending by category</h2>

          <div className="relative">
            {/* **Not `aria-hidden`, unlike the populated ring above.** There is no legend
                below to act as this ring's accessible equivalent, so it needs a real name of
                its own instead - `role="img"` naming what there is to see, which is nothing,
                rather than hiding a ring a screen reader would otherwise announce as an
                unlabelled generic. */}
            <div
              role="img"
              aria-label="No spending recorded this period"
              className="border-base-300 mx-auto flex size-46 items-center justify-center rounded-full border-[28px]"
            />

            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              {/* `spent` rather than a literal "$0": the true empty account has `spent: 0` and
                  reads exactly as frame 05 draws it, but the dangling-category race can leave
                  real spend on this card with nowhere to draw it, and this figure must not
                  claim there was none. Muted `base-content/50`, the same tone this file's own
                  fallback slice and legend dot already use for "nothing to spend meaningfully
                  about". */}
              <p className="text-base-content/50 font-display text-2xl font-bold">
                {formatWhole(spent)}
              </p>
              <p className="text-base-content/60 text-xs">Total spent</p>
            </div>
          </div>

          <p className="text-base-content/60 text-center text-sm">
            Your category breakdown appears here once you start spending.
          </p>
        </div>
      </section>
    );
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

        <div className="relative">
          {/* The ring is hidden from assistive technology and the legend below is its accessible
              equivalent. That works here in a way it does not on the trend chart: the legend is a
              strict **superset** of the tooltip, naming every slice with its amount and its
              percentage in real text, so a pointer-only tooltip adds convenience rather than
              information and there is nothing to mirror into an `sr-only` line. */}
          <div aria-hidden="true">
            <CategoryRing slices={slices} />
          </div>

          {/* The centre readout, positioned over the hole rather than drawn by Recharts.
              `pointer-events-none` so it never eats a hover meant for the slice behind it.

              **It sits outside the `aria-hidden` above, and that is the point of the extra
              wrapper.** The superset argument covers the *slices* and not this: the legend names
              every category with its amount and its percentage and never states the period's
              total, so hiding this pair with the ring would put AC2's own figure on no accessible
              surface at all - the gap PET-22's chart paid for with an `sr-only` list. RTL reads
              through `aria-hidden`, so `getByText` passed either way and only the tree says
              which; `CategoryDonut.test.tsx` asserts the containment rather than the text. */}
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
