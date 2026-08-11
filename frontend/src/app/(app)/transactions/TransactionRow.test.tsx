import { render, screen } from '@testing-library/react';
import { ShoppingBasket } from 'lucide-react';

import { CATEGORY_TILE_NEUTRAL } from '../../../components/ui/categoryColour';
import { formatIsoDayMonth } from '../../../lib/format';
import { moneyFormatters } from '../../../lib/money';

/** The formatters the row is given, so no assertion restates a shipped money string. */
const { formatNegative } = moneyFormatters('USD');
import type { Transaction } from '../../../lib/transactions';

import { DeleteTransactionProvider } from '../DeleteTransactionProvider';
import { EditTransactionProvider } from '../EditTransactionProvider';
import { TransactionRow, type RowCategory } from './TransactionRow';

// One row, in isolation from the join that resolves its category (TRN-5).
//
// The formatted strings are imported rather than retyped, and that is not tidiness: the
// amount carries U+2212 MINUS SIGN rather than a hyphen, and `expected "−$62.40", received
// "-$62.40"` is close to invisible in a terminal - the trap `lib/format.ts` documents at
// length. Retyping the expectation is how a row would ship with the wrong glyph and a green
// suite.

const TRANSACTION: Transaction = {
  id: '0198c2a1-0000-7000-8000-000000000001',
  merchant: 'Whole Foods',
  categoryId: '0198c2a1-0000-7000-8000-0000000000a1',
  amount: 62.4,
  date: '2025-10-08',
  note: null,
  createdAt: '2025-10-08T09:00:00.000Z',
  updatedAt: '2025-10-08T09:00:00.000Z',
};

/**
 * A resolved category's tile classes, in the shape `ui/categoryColour.ts` hands the table: a
 * semantic background paired with the `-content` colour that sits on it.
 *
 * Split into two halves because only the background identifies a mark in a query - the whole
 * string as `.a b` would be a descendant selector and match nothing. The row is expected to
 * forward both halves verbatim: the tile needs the content colour for its glyph, and on the
 * 8px dot it is simply inert.
 */
const TILE = { background: 'bg-success', content: 'text-success-content' } as const;

const GROCERIES: RowCategory = {
  name: 'Groceries',
  tileClass: `${TILE.background} ${TILE.content}`,
  // Resolved by `TransactionsTable`, so the row takes a component rather than a
  // name. It drew `<ShoppingBag />` for every category until PET-64 - Figma's
  // placeholder - which is what the deliberately close colour pairs could not
  // survive: without a per-category glyph, two of them are one tile.
  Icon: ShoppingBasket,
};

/**
 * A `<tr>` is invalid outside a table, and React warns about it.
 *
 * **The providers are required rather than convenient** as of PET-33: the row's kebab is
 * `TransactionRowMenu`, whose `useDeleteTransaction()` throws outside it - deliberately, so a
 * Delete that quietly stops working fails a test instead of shipping. Wrapped in the real ones
 * rather than mocking the menu away, so this suite still renders what the page renders.
 *
 * PET-32 made it two, and in the same nesting the layout uses: the menu's Edit calls
 * `useEditTransaction()`, and the edit provider itself calls `useDeleteTransaction()`, so it has
 * to be the inner one here too.
 */
function renderRow(
  category: RowCategory | null = GROCERIES,
  transaction = TRANSACTION,
  query = '',
) {
  return render(
    <DeleteTransactionProvider>
      <EditTransactionProvider>
        <table>
          <tbody>
            <TransactionRow
              currency="USD"
              transaction={transaction}
              category={category}
              query={query}
            />
          </tbody>
        </table>
      </EditTransactionProvider>
    </DeleteTransactionProvider>,
  );
}

describe('the four cells', () => {
  it('renders the merchant, the category, a short date and a negative amount', () => {
    renderRow();

    const cells = screen.getAllByRole('cell');

    expect(cells[0]).toHaveTextContent('Whole Foods');
    expect(cells[1]).toHaveTextContent('Groceries');
    expect(cells[2]).toHaveTextContent('Oct 8');
    expect(cells[3]).toHaveTextContent(formatNegative(62.4));
  });

  it('draws the date without its year, unlike the Date field', () => {
    // The DATE column is the only place in the app showing this shorter form (node 27:157).
    expect(screen.queryByText('Oct 8, 2025')).not.toBeInTheDocument();
    renderRow();
    expect(screen.getByText(formatIsoDayMonth('2025-10-08'))).toBeInTheDocument();
  });

  it('renders the amount negative from a positive stored magnitude', () => {
    // ADD-4 and A13: amounts are stored positive and rendered negative everywhere.
    renderRow();

    expect(screen.getByText('−$62.40')).toBeInTheDocument();
    expect(screen.queryByText('$62.40')).not.toBeInTheDocument();
  });

  it('keeps five cells so the row matches the header', () => {
    renderRow();

    expect(screen.getAllByRole('cell')).toHaveLength(5);
  });
});

describe('the category', () => {
  it('paints the tile and the dot with that category’s colour', () => {
    const { container } = renderRow();

    // Both marks, one class string: the tile and the dot are the same colour by design.
    expect(container.querySelectorAll(`.${TILE.background}`)).toHaveLength(2);
  });

  it('forwards the map’s whole class string, so the glyph gets its content colour', () => {
    // The tile used to hard-code `text-white`, which was right for eight fixed hues and wrong
    // the moment the colours became theme colours - `warning` is a light fill in the light
    // theme. The content colour arrives paired with the background instead, and this pins
    // that the row passes the string through rather than picking classes out of it.
    const { container } = renderRow();
    const tile = container.querySelector(`.${TILE.background}`);

    expect(tile).toHaveClass(TILE.content);
  });

  it('hides the tile and the dot from the accessible tree', () => {
    // Neither carries anything the CATEGORY cell does not say in words, and the colour cannot
    // identify a category on its own: two of the ten starters share a colour word, and
    // `ui/categoryColour.ts` maps orange and yellow both onto `warning` on top of that.
    const { container } = renderRow();

    for (const mark of container.querySelectorAll(`.${TILE.background}`)) {
      expect(mark).toHaveAttribute('aria-hidden', 'true');
    }
  });

  describe('when the row’s category is not in the account’s list', () => {
    it('leaves the category cell blank rather than saying "Uncategorized"', () => {
      // That is a real, separately identified category here, so printing it would state
      // which category this transaction is in and be wrong.
      renderRow(null);

      expect(screen.getAllByRole('cell')[1]).toBeEmptyDOMElement();
      expect(screen.queryByText('Uncategorized')).not.toBeInTheDocument();
    });

    it('falls back to the neutral tile rather than to no colour at all', () => {
      // A tile with no background class is transparent, builds cleanly and reads as a
      // rendering glitch - the failure Tailwind makes silent.
      //
      // The constant is imported and split rather than typed out, for the reason `TILE` above
      // gives: it is a pair of classes now, so `.${CATEGORY_TILE_NEUTRAL}` would be a
      // descendant selector and quietly match nothing.
      const { container } = renderRow(null);
      const [background] = CATEGORY_TILE_NEUTRAL.split(' ');

      expect(container.querySelector(`.${background}`)).toHaveClass(
        ...CATEGORY_TILE_NEUTRAL.split(' '),
      );
    });

    it('still renders the other three cells', () => {
      renderRow(null);

      expect(screen.getByText('Whole Foods')).toBeInTheDocument();
      expect(screen.getByText('Oct 8')).toBeInTheDocument();
    });
  });
});

describe('the kebab', () => {
  // **These two assertions are inverted rather than deleted**, the call PET-29 made when the
  // search field stopped being inert. For one ticket this was a `<span>` and the suite pinned
  // that it announced nothing, because MNU-1's menu did not exist and a control that does
  // nothing is worse than no control. PET-33 built the menu, so a `<span>` creeping back here
  // would now be the regression - which is only visible if the assertion turns round.

  it('is a real control now, which reverses PET-29', () => {
    renderRow();

    expect(
      screen.getByRole('button', { name: `Actions for ${TRANSACTION.merchant}` }),
    ).toBeInTheDocument();
  });

  it('still publishes no menu role, because the keyboard contract behind one is not built', () => {
    // The half of the old assertion that survives unchanged. `role="menu"` promises arrow-key
    // navigation; `TransactionRowMenu.tsx` records why this is a list of buttons instead.
    renderRow();

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('the row navigates now, and only from the merchant', () => {
  // The inverted assertion. For four tickets this pinned `queryByRole('link')` empty, and
  // `frontend/src/app/CLAUDE.md` records that it held **by decision** rather than by absence
  // of features - the detail page did not exist, so a link would have 404d. PET-34 built it,
  // which makes the old pin the thing that would now hide a regression.

  it('links the merchant to the transaction detail page', () => {
    renderRow();

    expect(screen.getByRole('link', { name: TRANSACTION.merchant })).toHaveAttribute(
      'href',
      `/transactions/${TRANSACTION.id}`,
    );
  });

  it('carries the list filters so the breadcrumb can come back to this view', () => {
    renderRow(GROCERIES, TRANSACTION, '?period=all&search=whole');

    expect(screen.getByRole('link', { name: TRANSACTION.merchant })).toHaveAttribute(
      'href',
      `/transactions/${TRANSACTION.id}?period=all&search=whole`,
    );
  });

  it('is the row’s only link, so the row is not one', () => {
    // The half of the old assertion that survives, and the reason it is worth keeping. A link
    // wrapping the whole row would take its accessible name from every cell and announce as
    // "Whole Foods Groceries Oct 8 −$62.40" - and four cell-links would announce the same
    // destination four times.
    renderRow();

    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('names the link with the merchant alone', () => {
    // The accessible name is the whole argument for putting it on this cell, so it is pinned
    // rather than left to the markup.
    renderRow();

    expect(screen.getByRole('link').textContent).toBe(TRANSACTION.merchant);
  });
});

describe('a long merchant name', () => {
  it('stays on one line and lets the card scroll instead', () => {
    renderRow(GROCERIES, { ...TRANSACTION, merchant: 'A'.repeat(120) });

    // jsdom computes no layout, so the class is the assertion. **This asserted `truncate` and
    // `min-w-0`, and both were dead**: they were written for the `table-fixed` layout PET-57
    // removed, and with the browser measuring the columns there is no box for `overflow: hidden`
    // and `text-overflow: ellipsis` to clip against. What the row actually needs is to stay one
    // line - the card's own `overflow-x-auto` is what a long name reaches for - so the negative
    // below is the half that would have caught the drift.
    const merchant = screen.getByText('A'.repeat(120));

    expect(merchant).toHaveClass('whitespace-nowrap');
    expect(merchant).not.toHaveClass('truncate');
  });
});

describe('a date the backend could not have sent', () => {
  it('leaves the cell blank rather than rendering "Invalid Date"', () => {
    renderRow(GROCERIES, { ...TRANSACTION, date: 'not a date' });

    expect(screen.getAllByRole('cell')[2]).toBeEmptyDOMElement();
  });
});
