import { ShoppingBag } from 'lucide-react';
import Link from 'next/link';

import { categoryTileClass } from '@/components/ui/categoryColour';
import { formatCurrency, formatIsoDayMonth, formatNegative } from '@/lib/format';
import type { CategoryContext, TransactionDetail } from '@/lib/transactionDetail';

import { barPercent, chipFor } from './categoryStatus';

// Frame 08's second left-hand card: "{category} this month" over the budget bar, then
// "Recent in {category}" (DET-4, DET-5).
//
// **One card holding two things, because the frame draws one card.** The divider between the
// bar and the list is inside the same surface, and the list's heading is a small caption
// rather than a card title of its own.
//
// **The list is a `<ul>`, not a table.** PET-29 predicted this ticket would add the app's
// second `<table>` and gave `TransactionsTable` an `sr-only` caption in anticipation. The frame
// draws a list - tile, merchant, a category-and-date caption, an amount - with no column
// headers and no fourth field, so a table would invent a header row the design does not have.
// PET-29's caption keeps its own reason for existing: a table with no accessible name is the
// defect it was fixing, and that table is still there.
//
// **Amounts carry cents where the frame draws whole dollars** ("$397 spent", "$103 left of
// $500"). `formatCurrency` goes through `Intl` and forces two decimals; `docs/TODO.md` records
// that deviation as applying app-wide, and one card is the wrong place to fork a second money
// formatter.

type CategoryContextCardProps = {
  category: CategoryContext;
  recentInCategory: TransactionDetail['recentInCategory'];
  /** Appended to each sibling's href so the breadcrumb chain keeps the list's filters. */
  query: string;
};

export function CategoryContextCard({
  category,
  recentInCategory,
  query,
}: CategoryContextCardProps) {
  const chip = chipFor(category);
  const tileClass = categoryTileClass(category.color);

  return (
    <section className="card bg-base-100 text-base-content shadow-sm">
      <div className="card-body gap-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* h2 because PageHeader owns the page's h1, the same level EmptyState defaults to. */}
          <h2 className="font-display text-lg font-semibold">{category.name} this month</h2>
          {chip === null ? null : <span className={chip.className}>{chip.label}</span>}
        </div>

        {/* The whole budget block disappears for an uncapped category rather than being
            explained away. Uncapped is the common case - the preselected fallback ships
            without a cap - so this branch runs more often than the one below it, and there is
            no cap to draw a bar against, no percentage to put in the chip and no remainder to
            name. What survives is the spent figure, which is true either way. */}
        {category.percentUsed === null || category.monthlyCap === null ? (
          <p className="text-base-content/70 mt-4 text-sm">
            {formatCurrency(category.spent)} spent
          </p>
        ) : (
          <>
            {/* aria-hidden, and every figure it encodes is text below it: the percentage in
                the chip, the spent amount and the cap on the row underneath. An announced
                progressbar would restate all three. Same call app/setup/SetupShell.tsx's step
                indicator makes against its own "STEP 1 OF 3" overline.

                A div rather than daisyUI's `progress`, which is the <progress> element and
                publishes role="progressbar" whatever we do - `aria-hidden` on it would leave a
                hidden interactive-ish node rather than a decorative bar. */}
            <div className="bg-base-300 mt-5 h-2 w-full overflow-hidden rounded-full">
              <div
                aria-hidden="true"
                className="bg-primary h-full rounded-full"
                style={{ width: `${barPercent(category.percentUsed)}%` }}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-base-content/70">{formatCurrency(category.spent)} spent</span>
              {/* `remaining` is null once the category is over, and `over` carries the excess
                  instead - they are never both set. The frame draws only the under case, so
                  the over string is ours and owes A29 sign-off. */}
              <span className="text-base-content/70">
                {category.over === null
                  ? `${formatCurrency(category.remaining ?? 0)} left of ${formatCurrency(category.monthlyCap)}`
                  : `${formatCurrency(category.over)} over ${formatCurrency(category.monthlyCap)}`}
              </span>
            </div>
          </>
        )}

        <div className="border-base-300 mt-6 border-t" />

        <h3 className="text-base-content/60 mt-4 text-sm">Recent in {category.name}</h3>

        {recentInCategory.length === 0 ? (
          // Not drawn anywhere. Reached whenever a category holds exactly one transaction,
          // which is every category the day it is first used, because the backend excludes
          // the transaction being viewed from this list.
          <p className="text-base-content/70 mt-3 text-sm">Nothing else in {category.name} yet.</p>
        ) : (
          <ul className="mt-1 flex flex-col">
            {recentInCategory.map((sibling) => (
              <li
                key={sibling.id}
                className="border-base-300 flex items-center gap-3 border-b py-3 last:border-b-0"
              >
                <span
                  aria-hidden="true"
                  className={`rounded-field flex size-9 shrink-0 items-center justify-center ${tileClass}`}
                >
                  <ShoppingBag className="size-4.5" aria-hidden="true" />
                </span>

                <div className="flex min-w-0 flex-col">
                  {/* The link is on the merchant alone, for the reason
                      frontend/src/app/CLAUDE.md gives about the table's rows: a link wrapping
                      the whole row takes its accessible name from every cell inside it, so
                      this one would announce as "Whole Foods Groceries · Oct 3 −$44.10". */}
                  <Link
                    href={`/transactions/${sibling.id}${query}`}
                    className="link link-hover text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid"
                  >
                    {sibling.merchant}
                  </Link>
                  <span className="text-base-content/60 text-sm">
                    {category.name} · {formatIsoDayMonth(sibling.date)}
                  </span>
                </div>

                {/* ms-auto rather than a justify-between on the row, so a long merchant name
                    pushes against the amount instead of the caption stretching to meet it. */}
                <span className="ms-auto text-sm font-semibold tabular-nums">
                  {formatNegative(sibling.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
