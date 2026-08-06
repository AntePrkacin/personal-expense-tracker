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

const GROCERIES: RowCategory = { name: 'Groceries', tileClass: 'bg-category-4-green' };

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

    // Both marks, one class: the 36px tile and the 8px dot are the same colour by design.
    expect(container.querySelectorAll('.bg-category-4-green')).toHaveLength(2);
  });

  it('hides the tile and the dot from the accessible tree', () => {
    // Neither carries anything the CATEGORY cell does not say in words, and two starter
    // categories share a colour, so the mark cannot identify one on its own.
    const { container } = renderRow();

    for (const mark of container.querySelectorAll('.bg-category-4-green')) {
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
      const { container } = renderRow(null);

      expect(container.querySelector(`.${CATEGORY_TILE_NEUTRAL}`)).toBeInTheDocument();
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
  it('truncates rather than widening the column', () => {
    renderRow(GROCERIES, { ...TRANSACTION, merchant: 'A'.repeat(120) });

    // jsdom computes no layout, so the class is the assertion - as it is for every other
    // truncation in this repo. `min-w-0` beside it is the load-bearing half: a flex item's
    // default minimum size is its content, so `truncate` alone does nothing here.
    const merchant = screen.getByText('A'.repeat(120));

    expect(merchant).toHaveClass('truncate');
    expect(merchant).toHaveClass('min-w-0');
  });
});

describe('a date the backend could not have sent', () => {
  it('leaves the cell blank rather than rendering "Invalid Date"', () => {
    renderRow(GROCERIES, { ...TRANSACTION, date: 'not a date' });

    expect(screen.getAllByRole('cell')[2]).toBeEmptyDOMElement();
  });
});
