import { render, screen } from '@testing-library/react';

import { categoryTileClass } from '../../../components/ui/categoryColour';
import type { CategoryLabel } from '../../../lib/categories';
import type { Transaction } from '../../../lib/transactions';

import { DeleteTransactionProvider } from '../DeleteTransactionProvider';
import { EditTransactionProvider } from '../EditTransactionProvider';
import { TransactionsTable } from './TransactionsTable';

// The card, the columns and the join (TRN-4 to TRN-6).

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: '0198c2a1-0000-7000-8000-000000000001',
    merchant: 'Whole Foods',
    categoryId: '0198c2a1-0000-7000-8000-0000000000a1',
    amount: 62.4,
    date: '2025-10-08',
    note: null,
    createdAt: '2025-10-08T09:00:00.000Z',
    updatedAt: '2025-10-08T09:00:00.000Z',
    ...overrides,
  };
}

const CATEGORIES: CategoryLabel[] = [
  { id: '0198c2a1-0000-7000-8000-0000000000a1', name: 'Groceries', color: '#57B368' },
  { id: '0198c2a1-0000-7000-8000-0000000000a2', name: 'Transport', color: '#3F8EE6' },
];

const UBER = transaction({
  id: '0198c2a1-0000-7000-8000-000000000002',
  merchant: 'Uber',
  categoryId: '0198c2a1-0000-7000-8000-0000000000a2',
  amount: 18.5,
  date: '2025-10-08',
});

/**
 * The providers are required as of PET-33, for the reason `TransactionRow.test.tsx` gives: every
 * row draws a kebab whose `useDeleteTransaction()` throws outside it. PET-32 added the second and
 * the nesting the layout uses, since the edit provider consumes the delete one.
 */
function renderTable(transactions: Transaction[] = [transaction()]) {
  return render(
    <DeleteTransactionProvider>
      <EditTransactionProvider>
        <TransactionsTable transactions={transactions} categories={CATEGORIES} />
      </EditTransactionProvider>
    </DeleteTransactionProvider>,
  );
}

/**
 * The background half of a stored colour's tile classes, as a bare selector.
 *
 * `categoryTileClass` returns a background paired with its `-content` partner, and only the
 * background identifies the colour - so this takes the first class rather than the string,
 * which as a `.a b` selector would mean something else entirely.
 */
function tileBackground(hex: string): string {
  return categoryTileClass(hex).split(' ')[0]!;
}

describe('the columns', () => {
  it('has an accessible name, so a second table on a page stays distinguishable', () => {
    // A `<caption>` rather than an `aria-label`: it is the element HTML has for this, and
    // PET-34's detail page adds "Recent in {category}" beside it.
    renderTable();

    expect(screen.getByRole('table', { name: 'Transactions' })).toBeInTheDocument();
  });

  it('publishes real table semantics rather than a grid of divs', () => {
    // The reason a <table> was chosen: a screen reader gets "Date, column 3" from the
    // element, where a div grid needs four ARIA roles spelled out to say the same thing.
    renderTable();

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(2);
  });

  it('draws the four designed headers in order', () => {
    renderTable();

    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'MERCHANT',
      'CATEGORY',
      'DATE',
      'AMOUNT',
      'Actions',
    ]);
  });

  it('names the fifth header now that there are actions under it', () => {
    // **Inverted rather than deleted.** It asserted an *empty* fifth header for one ticket,
    // because an `sr-only` "Actions" would have named a control PET-33 had not built. PET-33
    // built it, so the name is honest and its absence would be the bug.
    //
    // The rest of the old reasoning stands: still five headers, and still no `aria-hidden`,
    // which would leave the header and the rows disagreeing about how many columns there are.
    renderTable();

    const headers = screen.getAllByRole('columnheader');

    expect(headers).toHaveLength(5);
    expect(headers[4]).toHaveTextContent('Actions');
    expect(headers[4]).not.toHaveAttribute('aria-hidden');
  });

  it('keeps the fifth header out of the visible design, which draws four', () => {
    // `sr-only`, because frame 26:172 draws no fifth heading. A visible one would add a column
    // title the design does not have.
    renderTable();

    expect(screen.getAllByRole('columnheader')[4]!.querySelector('.sr-only')).toHaveTextContent(
      'Actions',
    );
  });

  it('names every header as a column rather than as a row', () => {
    // `scope="col"` is what a screen reader reads back as "Date, column 3". The designed
    // widths and the 16px-gap arithmetic that used to be asserted here died with the token
    // system: daisyUI's `table` owns cell padding, and the browser measures the columns.
    renderTable();

    for (const header of screen.getAllByRole('columnheader')) {
      expect(header).toHaveAttribute('scope', 'col');
    }
  });
});

describe('the rows', () => {
  it('renders one per transaction, in the order given', () => {
    // The order is the backend's - AC1's "newest first" is `sort=date_desc` on the request,
    // not a sort here, which would be a second authority on the same question.
    renderTable([transaction(), UBER]);

    const merchants = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.textContent);

    expect(merchants[0]).toContain('Whole Foods');
    expect(merchants[1]).toContain('Uber');
  });

  it('joins each row’s categoryId to a name and a colour', () => {
    // A row carries only `categoryId`; PET-28 publishes no name or colour on it.
    //
    // The two selectors are derived from `categoryTileClass` rather than typed out, so this
    // asserts that the join reached the right colour without restating which theme colour
    // green happens to map to - that is `categoryColour.test.ts`'s to pin, and it changed
    // once already when PET-57 moved the map onto semantic colours. Each colour appears
    // twice per row, on the tile and on the dot.
    const { container } = renderTable([transaction(), UBER]);
    const green = tileBackground('#57B368');
    const blue = tileBackground('#3F8EE6');

    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.getByText('Transport')).toBeInTheDocument();
    expect(container.querySelectorAll(`.${green}`)).toHaveLength(2);
    expect(container.querySelectorAll(`.${blue}`)).toHaveLength(2);
  });

  it('renders a row whose category is missing rather than dropping it', () => {
    // Reachable when a category is deleted between the two parallel reads. Losing the row
    // would be worse than losing its category name.
    renderTable([transaction({ categoryId: '0198c2a1-0000-7000-8000-00000000ffff' })]);

    expect(screen.getByText('Whole Foods')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(2);
  });

  it('renders nothing but the header for an empty list', () => {
    // Not a state the screen reaches - `TransactionsScreen` shows the empty card instead -
    // but the table must not crash if it ever is.
    renderTable([]);

    expect(screen.getAllByRole('row')).toHaveLength(1);
  });
});

describe('the card', () => {
  it('can scroll a table wider than its column, rather than widening the page', () => {
    // The one class on the wrapper that is behaviour rather than looks, and the reason it is
    // asserted where radius and border colour are not: this is the widest thing in the app,
    // the shell's drawer gives the content column `min-w-0` so the overflow lands here, and
    // without it a narrow window stretches the whole layout sideways instead. jsdom computes
    // no layout, so the class is the only available evidence.
    const { container } = renderTable();

    expect(container.firstElementChild).toHaveClass('overflow-x-auto');
  });
});
