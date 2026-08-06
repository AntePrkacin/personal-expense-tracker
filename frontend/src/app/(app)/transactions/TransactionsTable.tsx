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
// arrived with PET-57: daisyUI's `table` class styles the element itself - cell padding,
// `thead` type and colour, and a rule under the header plus one between every pair of rows
// and none after the last - so a grid would be hand-drawing all of that as well as its ARIA.
//
// **The box is daisyUI's own table idiom, and `overflow-x-auto` is the load-bearing half.**
// The wrapper is the stock `overflow-x-auto rounded-box border bg-base-100` div the component
// ships with, and the scroll is not decoration: this is the widest thing on any screen in the
// app, and the `(app)` shell's drawer already gives the content column `min-w-0` so the table
// overflows itself rather than pushing the sidebar off-screen. Remove the class and a narrow
// window stretches the whole layout instead.
//
// Figma's own numbers for this card - a raw 16px radius, no shadow, a Border/Subtle rule
// against a Border/Default edge - stopped binding with the token layer. Radius, border colour
// and row rules are the theme's now, which is the trade PET-57's plan rests on.

/**
 * The four columns the design draws, in order.
 *
 * No widths: they were the designed pixel values plus the 16px a table cannot express as a
 * `gap`, and daisyUI's own `padding-inline` on every cell replaces both halves of that
 * arithmetic. Nothing is `table-fixed` any more either, so the browser measures the columns
 * from their content.
 *
 * `align` carries the one alignment that is a decision rather than a default: daisyUI's
 * `table` left-aligns everything, and AMOUNT is a column of figures.
 */
const COLUMNS = [
  { key: 'merchant', label: 'MERCHANT', align: '' },
  { key: 'category', label: 'CATEGORY', align: '' },
  { key: 'date', label: 'DATE', align: '' },
  { key: 'amount', label: 'AMOUNT', align: 'text-right' },
] as const;

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
    <div className="rounded-box border-base-300 bg-base-100 overflow-x-auto border">
      <table className="table">
        {/* A table needs a name, and the design draws none - the page's `h1` is the only
            heading near it. `sr-only` rather than an `aria-label` because a caption is the
            element HTML has for exactly this, and PET-34's detail page adds a second table
            ("Recent in {category}"), at which point two unnamed tables in one app is a worse
            problem than one. */}
        <caption className="sr-only">Transactions</caption>

        <thead>
          {/* No border and no type classes on this row: daisyUI's `table` draws the rule under
              the header, styles `thead` at 14px/600 in `base-content/60`, and puts a rule
              between every pair of body rows and none after the last - which is what the frame
              draws too, ending at the tenth. */}
          <tr>
            {COLUMNS.map((column) => (
              <th key={column.key} scope="col" className={column.align}>
                {column.label}
              </th>
            ))}
            {/* The kebab column's header. It was present and deliberately empty until PET-33,
                because naming a column after a control that did not exist is the lie the inert
                kebab existed to avoid; the actions are real now, so the name is too.

                `sr-only` rather than visible: the frame draws no fifth heading, and the other
                four are the design's own. Still no `aria-hidden`, for the reason it never had
                one - hiding the header while every row renders a cell would leave a table whose
                two halves disagree about how many columns it has. */}
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>

        {/* The pending affordance is deliberately **not** here. It was, as a `pending` prop,
            and nothing could ever pass it: this is a Server Component, and the flag lives in
            the client components that start the navigation. `FilterNavigation`'s
            `PendingRegion` wraps this card and owns it now. */}
        <tbody>
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
