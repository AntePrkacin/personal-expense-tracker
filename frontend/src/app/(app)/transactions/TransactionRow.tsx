import { ShoppingBag } from 'lucide-react';

import { CATEGORY_TILE_NEUTRAL } from '@/components/ui/categoryColour';
import { formatIsoDayMonth, formatNegative } from '@/lib/format';
import type { Transaction } from '@/lib/transactions';

import { TransactionRowMenu } from './TransactionRowMenu';

// One row of the transactions table (TRN-4, TRN-5, Figma node 27:146).
//
// **Its own file rather than a function inside `TransactionsTable`, and the reason was
// PET-33.** The prediction was that the kebab would need open state, making whatever held it a
// client component, and that splitting kept the `'use client'` off the card, the header row and
// the category join. PET-33 landed and the prediction was pessimistic in the useful direction:
// the menu is a popover, which needs no state at all, so the directive went one level smaller
// still - onto `TransactionRowMenu.tsx` - and **this file is still a Server Component**. The
// split earns its place anyway, since the row would otherwise import a client component from
// inside `TransactionsTable`'s own file, but do not read the boundary as being here.
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
              words, and the colour cannot identify a category on its own: two of the ten
              starters share a colour *word* (Subscriptions with Transport, Other with Bills),
              and `ui/categoryColour.ts` then maps orange and yellow both onto `warning`, so
              Shopping, Bills and Other render one hue and Transport and Subscriptions another.

              No text colour stated here: `ui/categoryColour.ts` pairs each background with
              its `-content` partner, so the glyph's `currentColor` is legible on all eight
              and on the neutral fallback. `rounded-field` is daisyUI's field radius, the
              theme's answer for a small tile. */}
          <span
            aria-hidden="true"
            className={`rounded-field flex size-9 shrink-0 items-center justify-center ${category?.tileClass ?? CATEGORY_TILE_NEUTRAL}`}
          >
            {/* Figma's placeholder mark for every category, which is why one glyph serves all
                eight colours. No colour stated: `ui/categoryColour.ts` pairs each background
                with its `-content` partner, and lucide strokes `currentColor`, so the mark
                follows the tile. */}
            <ShoppingBag className="size-4.5" aria-hidden="true" />
          </span>

          {/* **`whitespace-nowrap`, and deliberately not `truncate`.** It was `min-w-0 truncate`,
              which came from the `table-fixed` layout this file used to have: with the column
              widths declared, an over-long merchant had a box to be clipped inside. PET-57 let
              the browser measure the columns instead, so there is no box - `overflow: hidden`
              and `text-overflow: ellipsis` had nothing to act on and never fired, and the
              comment claiming they did was wrong from the moment the widths went. Keeping the
              rows one line each is the part that was actually load-bearing, and the card's own
              `overflow-x-auto` is what a long name reaches for now. `base-content` is inherited
              rather than restated. */}
          <span className="text-sm font-semibold whitespace-nowrap">{transaction.merchant}</span>
        </div>
      </td>

      <td>
        {/* A category the list could not resolve leaves this cell blank rather than reading
            "Uncategorized". That is a real, separately identified category in this account,
            so printing it here would state which category the transaction is in and be
            wrong. Blank is visibly absent instead. */}
        {category === null ? null : (
          <div className="flex items-center gap-2.25">
            {/* The same class string the tile takes, whose `text-*` half really is inert here:
                this is a plain `rounded-full` span with no content and nothing reading
                `currentColor`. That is *not* true of daisyUI's own `status` dot, which draws a
                shadow from it - `ui/categoryColour.ts` exports `CATEGORY_DOT` for those. Both
                marks in this row are one colour by design. */}
            <span
              aria-hidden="true"
              className={`size-2 shrink-0 rounded-full ${category.tileClass}`}
            />
            <span className="text-base-content/70 text-sm whitespace-nowrap">{category.name}</span>
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
        <TransactionRowMenu transaction={transaction} />
      </td>
    </tr>
  );
}
