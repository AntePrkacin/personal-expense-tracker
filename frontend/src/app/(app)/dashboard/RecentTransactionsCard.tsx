import { ShoppingBag } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { categoryTileClass } from '@/components/ui/categoryColour';
import { SIDEBAR_HREFS } from '@/components/ui/Sidebar';
import { formatNegative, formatRelativeDate } from '@/lib/format';
import type { DashboardSummary } from '@/lib/dashboard';

// Recent transactions card (Figma node 21:4, DSH-7).
//
// A Server Component: every row is plain markup and the one navigation on the card, "View
// all", is `ui/Button`'s `href` variant, so nothing here needs the client bundle.
//
// **The category join costs no extra request.** A row in `recentTransactions` is a
// `TransactionResponseDto` and carries only `categoryId` - no name, no colour - but `categories`
// on the same response publishes both for every category with `spent > 0` this period, and
// `recentTransactions` is documented as up to three live transactions **in the current
// period**. So every recent row's category necessarily has nonzero spend this period and
// necessarily appears in `categories`: the join below is a lookup over data already in hand,
// not a second read. It still falls back to the neutral tile and drops the name from the
// caption for an unresolved id, rather than trusting an invariant the contract implies but
// does not state - `docs/plans/2026-08-06_PET-24_recent-transactions-card.md` is the argument
// in full.
//
// **The rows are not links.** `frontend/src/app/CLAUDE.md` records at length that a link
// wrapping a whole row takes its accessible name from everything inside it - the transactions
// table's own reason for putting PET-34's link on the merchant cell rather than the row. There
// is no detail route to link to at all here, so the rows stay plain markup and "View all" is
// the card's one control.
export type RecentTransactionsCardProps = Pick<
  DashboardSummary,
  'recentTransactions' | 'categories'
>;

export function RecentTransactionsCard({
  recentTransactions,
  categories,
}: RecentTransactionsCardProps) {
  // Fewer than three rows needs no code: the contract already returns "up to 3", so a shorter
  // array renders shorter and a zero-length one renders nothing - the same division PET-22 and
  // PET-23 both take, and the shared empty condition PET-26 draws frame 05's treatment for.
  if (recentTransactions.length === 0) {
    return null;
  }

  const categoryById = new Map(categories.map((category) => [category.id, category]));

  return (
    <section className="card bg-base-100 shadow-sm">
      <div className="card-body gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Recent transactions</h2>
          <Button label="View all" variant="text" href={SIDEBAR_HREFS.transactions} />
        </div>

        <ul className="flex flex-col gap-3">
          {recentTransactions.map((transaction) => {
            const category = categoryById.get(transaction.categoryId) ?? null;
            // Both halves of the caption can go missing, so it is joined rather than
            // interpolated: `formatRelativeDate` answers `''` for a string that is not a
            // calendar date, which the contract's `@Matches` plus `@IsDateString` make
            // unreachable but the API does not - and an interpolated separator would then
            // render a dangling "Groceries · ". Same call the category makes one line up.
            const caption = [category?.name, formatRelativeDate(transaction.date)]
              .filter(Boolean)
              .join(' · ');

            return (
              <li key={transaction.id} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={`rounded-field flex size-9 shrink-0 items-center justify-center ${categoryTileClass(category?.color)}`}
                >
                  <ShoppingBag className="size-4.5" aria-hidden="true" />
                </span>

                {/* `min-w-0` is load-bearing: a flex item's default `min-width: auto` floors
                    at min-content, so a merchant carrying one long unbreakable token would
                    push the amount off the card rather than truncating - and this card has no
                    `overflow-x-auto` box around it to catch that, where the transactions
                    table's own cell does. `truncate` is what it buys. */}
                <div className="flex min-w-0 grow flex-col">
                  <span className="truncate text-sm font-semibold">{transaction.merchant}</span>
                  {/* An unresolved category drops its name rather than printing "Uncategorized"
                      for a category this account may not even have that name for - the same
                      call the transactions table's own cell makes for a blank one. The date
                      still renders on its own, so the row degrades rather than disappears. */}
                  <span className="text-base-content/60 truncate text-xs">{caption}</span>
                </div>

                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatNegative(transaction.amount)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
