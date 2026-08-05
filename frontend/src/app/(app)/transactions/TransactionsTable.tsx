import { categoryTileClass } from '@/components/ui/categoryColour';
import type { CategoryLabel } from '@/lib/categories';
import type { Transaction } from '@/lib/transactions';

import { TransactionRow, type RowCategory } from './TransactionRow';

// The transactions table (TRN-4 to TRN-6, Figma node 26:172), and PET-30's `table` slot
// filled.
//
// **A real `<table>`, and that is the platform argument `(app)/Modal.tsx` makes about
// `<dialog>` and `ui/Select.tsx` about `<select>`.** The design draws four column headers,
// so a div grid would need `role="table"`, `role="row"`, `role="columnheader"` and
// `role="cell"` spelled out through every level just to let a screen reader say "Date,
// column 3" - reimplementing by hand what the element already publishes. The second reason
// is narrower and just as practical: with `table-fixed` the column widths are declared once,
// on the `<thead>`, and every row inherits them, where a grid would repeat five widths per
// row or reach for `display: contents` and lose the row rules.
//
// **The card is `rounded-lg` with no shadow, and both look like mistakes.** Node 26:172
// binds a raw 16px radius and carries no effect at all, exactly as frame 07's empty card
// does - `components/EmptyState.tsx` documents the same pair and the same trap. Reaching for
// `AccessCard`'s `shadow-card rounded-xl` box, which is the obvious move, is wrong twice
// over and looks right until somebody opens Figma.
//
// **The rules are Border/Subtle, the card's own border is Border/Default.** Two different
// tokens eight hex values apart, read off the export rather than eyeballed.

/**
 * Column widths, and the one piece of arithmetic in this file that has to be written down.
 *
 * **A table has no `gap`.** Figma spaces the columns 16px apart, which becomes `pr-4` on
 * every cell but the last - so each declared width is the *designed* width plus that 16, and
 * `box-sizing: border-box` takes the padding back out of the content box:
 *
 *     CATEGORY 150 + 16 = 166    DATE 120 + 16 = 136    AMOUNT 100 + 16 = 116    kebab 32
 *
 * MERCHANT is deliberately unsized. With `table-fixed` and exactly one column left to
 * measure, it absorbs the remainder: 1052 of card content less 450 of fixed columns is 602,
 * less its own `pr-4` is the 586 the frame draws.
 *
 * A reader who "corrects" `w-[166px]` to the 150 in the design file shifts every column left
 * by 16px, so the numbers are here rather than inferable.
 */
const COLUMNS = [
  { key: 'merchant', label: 'MERCHANT', width: '', align: 'text-left' },
  { key: 'category', label: 'CATEGORY', width: 'w-[166px]', align: 'text-left' },
  { key: 'date', label: 'DATE', width: 'w-[136px]', align: 'text-left' },
  { key: 'amount', label: 'AMOUNT', width: 'w-[116px]', align: 'text-right' },
] as const;

/**
 * The kebab column's header: present, sized, and deliberately empty.
 *
 * No `sr-only` "Actions" label, because there are no actions yet - naming a column after a
 * control PET-33 has not built is the lie the inert kebab exists to avoid. And no
 * `aria-hidden` either: hiding the header while every row still renders a cell would leave a
 * table whose two halves disagree about how many columns it has.
 */
const ACTIONS_COLUMN_WIDTH = 'w-8';

type TransactionsTableProps = {
  transactions: Transaction[];
  /** The account's categories, for the id-to-name-and-colour join below. */
  categories: CategoryLabel[];
};

/**
 * The `categoryId` join, done once for the whole table.
 *
 * A row carries only `categoryId` - PET-28 publishes no name or colour on it - so the name
 * and the tile have to come from `GET /api/categories`. A `Map` rather than a `find` per
 * row, which is the difference between one pass and a hundred over the same ten categories.
 */
function categoryIndex(categories: CategoryLabel[]): Map<string, RowCategory> {
  return new Map(
    categories.map((category) => [
      category.id,
      { name: category.name, tileClass: categoryTileClass(category.color) },
    ]),
  );
}

export function TransactionsTable({ transactions, categories }: TransactionsTableProps) {
  const index = categoryIndex(categories);

  return (
    <div className="bg-surface-card border-border-default rounded-lg border px-6 pt-1.5 pb-2">
      <table className="w-full table-fixed">
        {/* A table needs a name, and the design draws none - the page's `h1` is the only
            heading near it. `sr-only` rather than an `aria-label` because a caption is the
            element HTML has for exactly this, and PET-34's detail page adds a second table
            ("Recent in {category}"), at which point two unnamed tables in one app is a worse
            problem than one. */}
        <caption className="sr-only">Transactions</caption>

        <thead>
          {/* The rule under the header, and the only border-b in this file: the rules
              *between* rows come from `divide-y` on the body, which draws none after the
              last row - matching the frame, which stops at the tenth. */}
          <tr className="border-border-subtle border-b">
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                scope="col"
                // `text-left` is not redundant: a user agent centres `<th>` by default, so
                // three of these four would sit in the middle of their column without it.
                // The weight needs no such reset - `text-overline` sets 500, which beats the
                // UA's bold on specificity.
                className={`text-overline text-text-tertiary pt-3.5 pb-3 ${column.align} ${column.width} ${column.key === 'amount' ? '' : 'pr-4'}`}
              >
                {column.label}
              </th>
            ))}
            <th scope="col" className={`pt-3.5 pb-3 ${ACTIONS_COLUMN_WIDTH}`} />
          </tr>
        </thead>

        {/* The pending affordance is deliberately **not** here. It was, as a `pending` prop,
            and nothing could ever pass it: this is a Server Component, and the flag lives in
            the client components that start the navigation. `FilterNavigation`'s
            `PendingRegion` wraps this card and owns it now. */}
        <tbody className="divide-border-subtle divide-y">
          {transactions.map((transaction) => (
            <TransactionRow
              key={transaction.id}
              transaction={transaction}
              category={index.get(transaction.categoryId) ?? null}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
