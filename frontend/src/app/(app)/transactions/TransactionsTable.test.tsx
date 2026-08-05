import { render, screen } from '@testing-library/react';

import type { CategoryLabel } from '../../../lib/categories';
import type { Transaction } from '../../../lib/transactions';

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

function renderTable(transactions: Transaction[] = [transaction()], pending?: boolean) {
  return render(
    <TransactionsTable transactions={transactions} categories={CATEGORIES} pending={pending} />,
  );
}

describe('the columns', () => {
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
      '',
    ]);
  });

  it('keeps a fifth, empty header over the kebab column', () => {
    // Present and unlabelled on purpose: an `sr-only` "Actions" would name a control PET-33
    // has not built, and `aria-hidden` would leave the header and the rows disagreeing about
    // how many columns the table has.
    const headers = screen.queryAllByRole('columnheader');

    expect(headers).toHaveLength(0);
    renderTable();
    expect(screen.getAllByRole('columnheader')).toHaveLength(5);
    expect(screen.getAllByRole('columnheader')[4]).toBeEmptyDOMElement();
  });

  it('declares each width once, on the header', () => {
    // `table-fixed` is what makes that inheritance work, and the widths are the designed
    // ones plus the 16px a table cannot express as a gap. A row carries no width class.
    const { container } = renderTable();

    expect(container.querySelector('table')).toHaveClass('table-fixed');
    expect(screen.getAllByRole('columnheader')[1]).toHaveClass('w-[166px]');
    expect(screen.getAllByRole('columnheader')[2]).toHaveClass('w-[136px]');
    expect(screen.getAllByRole('columnheader')[3]).toHaveClass('w-[116px]');
    expect(screen.getAllByRole('cell')[1]).not.toHaveClass('w-[166px]');
  });

  it('left-aligns the headers a user agent would centre, and right-aligns AMOUNT', () => {
    renderTable();

    const headers = screen.getAllByRole('columnheader');

    expect(headers[0]).toHaveClass('text-left');
    expect(headers[3]).toHaveClass('text-right');
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
    const { container } = renderTable([transaction(), UBER]);

    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.getByText('Transport')).toBeInTheDocument();
    expect(container.querySelectorAll('.bg-category-4-green')).toHaveLength(2);
    expect(container.querySelectorAll('.bg-category-6-blue')).toHaveLength(2);
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

describe('the pending state', () => {
  it('says so while a filter change is in flight', () => {
    // Ours rather than designed (A29): without it, the gap between the last keystroke and
    // the new rows is a screen where nothing changes, which reads as a broken search.
    const { container } = renderTable([transaction()], true);
    const body = container.querySelector('tbody');

    expect(body).toHaveAttribute('aria-busy', 'true');
    expect(body).toHaveClass('opacity-60');
  });

  it('sets no aria-busy at rest', () => {
    // `aria-busy="false"` on every idle render would be noise; the attribute is absent.
    const { container } = renderTable();

    expect(container.querySelector('tbody')).not.toHaveAttribute('aria-busy');
  });
});

describe('the card', () => {
  it('is rounded-lg with no shadow, which both look like mistakes', () => {
    // Node 26:172 binds a raw 16px radius and carries no effect at all, exactly as frame
    // 07's empty card does. Reaching for AccessCard's `shadow-card rounded-xl` is the
    // obvious move and is wrong twice over.
    const { container } = renderTable();
    const card = container.firstElementChild;

    expect(card).toHaveClass('rounded-lg');
    expect(card).not.toHaveClass('rounded-xl');
    expect(card).not.toHaveClass('shadow-card');
  });

  it('separates rows with Border/Subtle, not the card’s own Border/Default', () => {
    // Two different tokens, and the export says which goes where.
    const { container } = renderTable([transaction(), UBER]);

    expect(container.querySelector('tbody')).toHaveClass('divide-border-subtle');
    expect(container.firstElementChild).toHaveClass('border-border-default');
  });
});
