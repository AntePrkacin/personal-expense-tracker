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
// **There is no shared row component to reach for.** `ui/ListRow` was the near-miss - a
// stacked title and subtitle beside a tile, where this is four separate columns - and PET-57
// deleted it along with the other decorative wrappers, so a dashboard recent list writes its
// own daisyUI classes in place. Nothing here is worth extracting until a second screen draws
// this same five-cell row.

/** The tile's colour and the dot's, plus the name, resolved by `TransactionsTable`. */
export type RowCategory = { name: string; tileClass: string };

/**
 * The tile glyph, traced from this frame's own export (node 27:149).
 *
 * The placeholder shopping bag Figma uses for every category, centred: a bag at 3..15 under a
 * handle at 5.5..12.5. `ui/ListRow` used to draw the same mark from a different export, with
 * the handle left of centre, and `docs/TODO.md` recorded the discrepancy - PET-57 deleted that
 * component, so this is the only copy and there is nothing left to disagree with.
 *
 * `overflow-visible` because the 1.4 round-capped stroke falls half outside the box at the
 * handle's tips, and an SVG viewport clips its own overflow, so without it the arc renders
 * shorn flat.
 *
 * `currentColor` on both shapes is what makes the tile's own content colour reach the glyph:
 * `ui/categoryColour.ts` pairs every background with its `-content` partner, so the mark
 * follows the theme with nothing stated here.
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
 * PET-33's diff is this span becoming `btn btn-ghost btn-square btn-sm` with an
 * `aria-label="More actions"`, plus an `sr-only` label on the header's empty cell. Nothing
 * about the column has to move.
 *
 * The dots are `base-content/40`: quieter than the row's own text and quieter than the column
 * headers, which is the weight the frame's grey had against everything around it.
 */
function KebabGlyph() {
  return (
    <span aria-hidden="true" className="flex flex-col items-center gap-[3px]">
      <span className="bg-base-content/40 size-[3.2px] rounded-full" />
      <span className="bg-base-content/40 size-[3.2px] rounded-full" />
      <span className="bg-base-content/40 size-[3.2px] rounded-full" />
    </span>
  );
}

type TransactionRowProps = {
  transaction: Transaction;
  /** `null` when the row's `categoryId` matched nothing in the account's list. */
  category: RowCategory | null;
};

export function TransactionRow({ transaction, category }: TransactionRowProps) {
  return (
    <tr>
      {/* No padding and no width classes anywhere in this file: daisyUI's `table` sets the
          padding on every `th` and `td` and centres them vertically, which is what the designed
          13px rhythm and the `align-middle` reset used to do by hand, and the browser measures
          the columns now that nothing is `table-fixed`. The AMOUNT cell's `text-right` below is
          the one exception, and it is a decision rather than a default. */}
      <td>
        <div className="flex items-center gap-3">
          {/* Hidden because it carries nothing the CATEGORY cell does not already say in
              words, and two starter categories share a colour, so the mark cannot identify
              one on its own.

              No text colour stated here: `ui/categoryColour.ts` pairs each background with
              its `-content` partner, so the glyph's `currentColor` is legible on all eight
              and on the neutral fallback. `rounded-field` is daisyUI's field radius, the
              theme's answer for a small tile. */}
          <span
            aria-hidden="true"
            className={`rounded-field flex size-9 shrink-0 items-center justify-center ${category?.tileClass ?? CATEGORY_TILE_NEUTRAL}`}
          >
            <CategoryGlyph />
          </span>

          {/* min-w-0 is what lets `truncate` work on a flex item, whose default minimum size
              is its content - without it a long merchant name widens the cell instead of
              ellipsing. `base-content` is inherited rather than restated. */}
          <span className="min-w-0 truncate text-sm font-semibold">{transaction.merchant}</span>
        </div>
      </td>

      <td>
        {/* A category the list could not resolve leaves this cell blank rather than reading
            "Uncategorized". That is a real, separately identified category in this account,
            so printing it here would state which category the transaction is in and be
            wrong. Blank is visibly absent instead. */}
        {category === null ? null : (
          <div className="flex items-center gap-2.25">
            {/* The same class string the tile takes, whose `text-*` half is simply inert on a
                dot with no content. Both marks are one colour by design. */}
            <span
              aria-hidden="true"
              className={`size-2 shrink-0 rounded-full ${category.tileClass}`}
            />
            <span className="text-base-content/70 min-w-0 truncate text-sm">{category.name}</span>
          </div>
        )}
      </td>

      <td className="text-base-content/70 text-sm">{formatIsoDayMonth(transaction.date)}</td>

      {/* tabular-nums so the column's digits line up down the page. The colour is the row's own
          `base-content` rather than `text-error`: every amount in this table is a debit, so a
          danger colour would mark the normal case as a fault, which is exactly the misuse
          `frontend/CLAUDE.md` warns about for the status colours. */}
      <td className="text-right text-sm font-semibold tabular-nums">
        {formatNegative(transaction.amount)}
      </td>

      <td>
        <KebabGlyph />
      </td>
    </tr>
  );
}
