import { CATEGORY_TILE_NEUTRAL } from '@/components/ui/categoryColour';
import { formatIsoDayMonth, formatNegative } from '@/lib/format';
import type { Transaction } from '@/lib/transactions';

// One row of the transactions table (TRN-4, TRN-5, Figma node 27:146).
//
// **Its own file rather than a function inside `TransactionsTable`, and the reason is
// PET-33.** The kebab becomes a popover with open state, which makes whatever holds it a
// client component. Split, that is a `'use client'` on this file alone; merged, it drags the
// card, the header row and the category join into the client bundle with it. Same rule
// `SidebarNav` and `AddTransactionProvider` follow - push the boundary into the smallest
// wrapper - applied before the boundary exists rather than after.
//
// **It takes a resolved category rather than a lookup**, so the join happens once in the
// table instead of once per row, and this file needs no category list to test.
//
// **Not `ui/ListRow`.** That component is the same idea at different values: a 40px
// `rounded-md` tile over a stacked title and subtitle, where this is a 36px `rounded-[10px]`
// tile and four separate columns of 13px type. Its own header comment already scopes it to
// "the dashboard's recent list ... and Recent in {category}" as much as here, and reshaping
// it to serve both would mean a variant prop on a Components-page tile for one screen's sake.

/** The tile's colour and the dot's, plus the name, resolved by `TransactionsTable`. */
export type RowCategory = { name: string; tileClass: string };

/**
 * The tile glyph, traced from this frame's own export (node 27:149).
 *
 * **Deliberately not `ui/ListRow`'s, which is a different drawing rather than the same one
 * at another size.** Both are the placeholder shopping bag Figma uses for every category,
 * but ListRow's export (node 15:13) puts the handle at x=0..8 over a bag spanning 3..17 -
 * left of centre, which that file records as intentional because it is what the export says.
 * This one centres it: a bag at 3..15 under a handle at 5.5..12.5. Scaling ListRow's path to
 * 18px would reproduce its offset handle on a frame that does not draw one, so the two stay
 * separate until a designer says which is right. `docs/TODO.md` records the discrepancy.
 *
 * `overflow-visible` for the reason ListRow's records: the 1.4 round-capped stroke falls half
 * outside the box at the handle's tips, and an SVG viewport clips its own overflow, so
 * without it the arc renders shorn flat.
 */
function CategoryGlyph() {
  return (
    <svg viewBox="0 0 18 18" className="size-4.5 overflow-visible" fill="none" aria-hidden="true">
      <rect x="3" y="6.5" width="12" height="10" rx="2" fill="currentColor" />
      <path
        d="M5.5 7C5.5 3 12.5 3 12.5 7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The row's kebab, drawn and deliberately inert (TRN-8).
 *
 * **A `<span>`, not a `<button>.** MNU-1's menu is PET-33's and does not exist, so a button
 * here would announce itself as operable and do nothing - the call `SearchPill`, `MonthPill`
 * and both tabs already make, and the one `(app)/pages.test.tsx`'s "no operable controls"
 * assertions depend on. No `title`, no `cursor-pointer`, and `aria-hidden` because three
 * unlabelled dots describe nothing a reader is missing.
 *
 * PET-33's diff is this span becoming `<button aria-label="More actions">` plus an `sr-only`
 * label on the header's empty cell. Nothing about the column has to move.
 *
 * The dots are `#98A0AE`, read off the export rather than guessed - Text/Tertiary, the same
 * colour the column headers take.
 */
function KebabGlyph() {
  return (
    <span aria-hidden="true" className="flex flex-col items-center gap-[3px]">
      <span className="bg-text-tertiary size-[3.2px] rounded-full" />
      <span className="bg-text-tertiary size-[3.2px] rounded-full" />
      <span className="bg-text-tertiary size-[3.2px] rounded-full" />
    </span>
  );
}

/**
 * The four cells' shared vertical rhythm.
 *
 * `py-3.25` is the designed 13px. `align-middle` is not decoration: a `<td>`'s initial
 * `vertical-align` is `baseline`, which sits 13px type on the baseline of a 36px tile and
 * misaligns every column against the first.
 */
const CELL = 'py-3.25 align-middle';

type TransactionRowProps = {
  transaction: Transaction;
  /** `null` when the row's `categoryId` matched nothing in the account's list. */
  category: RowCategory | null;
};

export function TransactionRow({ transaction, category }: TransactionRowProps) {
  return (
    <tr>
      {/* No width class anywhere in this file: `table-fixed` on the table means the
          `<thead>` declares every column once and each row inherits it. */}
      <td className={`${CELL} pr-4`}>
        <div className="flex items-center gap-3">
          {/* Hidden for the reason ui/ListRow's tile is: it carries nothing the CATEGORY
              cell does not already say in words, and two starter categories share a colour,
              so the mark cannot identify one on its own. */}
          <span
            aria-hidden="true"
            className={`flex size-9 shrink-0 items-center justify-center rounded-[10px] text-white ${category?.tileClass ?? CATEGORY_TILE_NEUTRAL}`}
          >
            <CategoryGlyph />
          </span>

          {/* min-w-0 is what lets `truncate` work on a flex item, whose default minimum size
              is its content - without it a long merchant name widens the cell instead of
              ellipsing. The cell itself needs no such dance, because `table-fixed` gives it
              a computed width. */}
          <span className="text-strong-s text-text-primary min-w-0 truncate">
            {transaction.merchant}
          </span>
        </div>
      </td>

      <td className={`${CELL} pr-4`}>
        {/* A category the list could not resolve leaves this cell blank rather than reading
            "Uncategorized". That is a real, separately identified category in this account,
            so printing it here would state which category the transaction is in and be
            wrong. Blank is visibly absent instead. */}
        {category === null ? null : (
          <div className="flex items-center gap-2.25">
            <span
              aria-hidden="true"
              className={`size-2 shrink-0 rounded-full ${category.tileClass}`}
            />
            <span className="text-label-m text-text-secondary min-w-0 truncate">
              {category.name}
            </span>
          </div>
        )}
      </td>

      <td className={`${CELL} text-body-s text-text-secondary pr-4`}>
        {formatIsoDayMonth(transaction.date)}
      </td>

      {/* tabular-nums so the column's digits line up down the page, which ui/ListRow's amount
          already does for the same reason. The colour is Text/Primary rather than a danger
          red: every amount in this table is a debit, so red would mark the normal case as an
          error. */}
      <td className={`${CELL} text-strong-s text-text-primary pr-4 text-right tabular-nums`}>
        {formatNegative(transaction.amount)}
      </td>

      <td className={CELL}>
        <KebabGlyph />
      </td>
    </tr>
  );
}
