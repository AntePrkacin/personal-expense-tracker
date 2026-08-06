import { render, screen } from '@testing-library/react';

import { CATEGORY_TILE_NEUTRAL } from '../../../components/ui/categoryColour';
import { formatIsoDayMonth, formatNegative } from '../../../lib/format';
import type { Transaction } from '../../../lib/transactions';

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
};

/** A `<tr>` is invalid outside a table, and React warns about it. */
function renderRow(category: RowCategory | null = GROCERIES, transaction = TRANSACTION) {
  return render(
    <table>
      <tbody>
        <TransactionRow transaction={transaction} category={category} />
      </tbody>
    </table>,
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
  it('is not operable, because the menu behind it is PET-33’s', () => {
    // MNU-1's menu does not exist, so a button here would announce itself and do nothing -
    // the call SearchPill, MonthPill and both tabs already make. `pages.test.tsx`'s "no
    // operable controls" assertions depend on this staying true.
    renderRow();

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('draws three dots, hidden from the accessible tree', () => {
    const { container } = renderRow();
    const kebab = container.querySelector('[aria-hidden="true"].flex-col');

    expect(kebab?.children).toHaveLength(3);
  });
});

describe('the row makes no navigation claim', () => {
  it('is not a link, because the detail page is PET-34’s', () => {
    // AC7's other half. `lib/routes.test.ts` asserts every declared route has a `page.tsx`,
    // and `/transactions/{id}` has none, so a link here would 404.
    renderRow();

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
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
