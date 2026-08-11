import { ReceiptText } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { categoryIcon, categoryTileClass } from '@/components/ui/categoryColour';
import { SIDEBAR_HREFS } from '@/components/ui/Sidebar';
import { formatRelativeDate } from '@/lib/format';
import { moneyFormatters } from '@/lib/money';
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
> & {
  /**
   * The screen's shared PET-26 condition, not `recentTransactions.length === 0`.
   *
   * The two are documented as identical - the field is up to three transactions **in the
   * current period**, so an empty array and a transaction-free period are the same fact - but
   * this card takes the flag rather than re-deriving it, the same call `TrendCard` makes about
   * `weeklyBuckets`: a card computing its own opinion from a field it happens to hold is a sixth
   * spelling of the one condition `page.tsx` already resolved.
   */
  isEmpty: boolean;
  /**
   * The profile's currency, threaded from the page rather than read here.
   *
   * A Server Component cannot reach `PreferencesProvider`, which is client-side, so the server
   * half of the app takes the currency as a prop while the client half uses `useMoney()`.
   * `lib/money.ts` records the split.
   */
  currency: string;
};

export function RecentTransactionsCard({
  recentTransactions,
  categories,
  isEmpty,
  currency,
}: RecentTransactionsCardProps) {
  const { formatNegative } = moneyFormatters(currency);

  // **The header is identical in both states, and the review of PET-26 is what made it so.**
  // The first version dropped "View all" from the empty branch, on frame 05's rule that no empty
  // treatment carries an interactive control of its own. That rule reads correctly for a new
  // account and fails for the state it cannot see: `isEmpty` is the **period's** flag, so a
  // returning user with months of history opens `/dashboard` on the first day of a new period and
  // gets "No transactions yet" with the one route to their actual history deleted from the card.
  // Of the two halves that is the worse one - the copy is at least scoped to a card about this
  // period, while a missing link is a dead end - so the control stays and the rule is amended
  // here rather than in the four other treatments, which have no navigation to lose.
  const header = (
    <div className="flex items-center justify-between">
      <h2 className="text-base font-semibold">Recent transactions</h2>
      <Button label="View all" variant="text" href={SIDEBAR_HREFS.transactions} />
    </div>
  );

  if (isEmpty) {
    return (
      <section className="card bg-base-100 shadow-sm">
        <div className="card-body gap-4">
          {header}

          {/* The circle and its tint are `components/EmptyState.tsx`'s own treatment, scaled
              down: `size-14` (56px) against that component's `size-18` (72px), because this
              glyph sits inside a card that keeps its own header rather than replacing the whole
              card - `frontend/src/app/CLAUDE.md` records why `EmptyState` itself is the wrong
              component for any of frame 05's four treatments. */}
          <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
            <div
              aria-hidden="true"
              className="bg-primary/10 text-primary flex size-14 shrink-0 items-center justify-center rounded-full"
            >
              <ReceiptText className="size-6" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold">No transactions yet</p>
            <p className="text-base-content/60 max-w-70 text-xs">
              Your recent expenses will appear here as you add them.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const categoryById = new Map(categories.map((category) => [category.id, category]));

  return (
    <section className="card bg-base-100 shadow-sm">
      <div className="card-body gap-4">
        {header}

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

            // Per row rather than per category, unlike `TransactionsTable`'s index:
            // this list is capped at three, so a `Map` of resolved components
            // would cost more to build than the three lookups it saves.
            const Icon = categoryIcon(category?.icon);

            return (
              <li key={transaction.id} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={`rounded-field flex size-9 shrink-0 items-center justify-center ${categoryTileClass(category?.color)}`}
                >
                  {/* **The third tile site, and the one PET-64's own blast radius missed.**
                      It drew `<ShoppingBag />` for every category, exactly as the
                      transactions table and the detail page's sibling list did - the plan
                      inventoried those two and stopped. Leaving it would have made this the
                      one place a reader still cannot tell Personal care from Gifts, which is
                      the whole reason the per-category icon shipped with the palette.
                      `DashboardCategoryDto` gained `icon` for this tile alone; the donut's
                      slices are bare colour and need none. */}
                  {Icon === null ? null : <Icon className="size-4.5" aria-hidden="true" />}
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
