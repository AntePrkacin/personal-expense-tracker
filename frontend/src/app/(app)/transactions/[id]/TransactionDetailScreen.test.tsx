import { render, screen, within } from '@testing-library/react';

import type { TransactionDetail } from '../../../../lib/transactionDetail';

import { TransactionDetailScreen } from './TransactionDetailScreen';

// Frame 08, organised by acceptance criterion. The actions are a slot, so this suite passes a
// stand-in and never mounts either provider - their own suites cover what the buttons do.

const DETAIL: TransactionDetail = {
  transaction: {
    id: '0198c2a1-0000-7000-8000-000000000001',
    merchant: 'Whole Foods',
    categoryId: '0198c2a1-0000-7000-8000-0000000000a1',
    amount: 62.4,
    date: '2025-10-08',
    note: 'Weekly groceries run — produce and pantry staples.',
    createdAt: '2025-10-08T09:00:00.000Z',
    updatedAt: '2025-10-08T09:00:00.000Z',
  },
  category: {
    id: '0198c2a1-0000-7000-8000-0000000000a1',
    name: 'Groceries',
    color: '#57B368',
    icon: null,
    note: null,
    isFallback: false,
    monthlyCap: 500,
    spent: 397,
    transactionCount: 3,
    percentUsed: 79.4,
    remaining: 103,
    over: null,
    status: 'near',
  },
  recentInCategory: [],
};

function renderScreen(detail: TransactionDetail = DETAIL, backHref = '/transactions', query = '') {
  return render(
    <TransactionDetailScreen
      detail={detail}
      backHref={backHref}
      query={query}
      actions={<button type="button">Edit</button>}
    />,
  );
}

describe('the header (AC1)', () => {
  it('shows the merchant as the page-level heading', () => {
    renderScreen();

    expect(screen.getByRole('heading', { level: 1, name: 'Whole Foods' })).toBeInTheDocument();
  });

  it('has exactly one level-1 heading', () => {
    // The reason PageHeader gained a second shape rather than a second component. Every other
    // heading on this page is a card title at level 2 or the recent-list caption at 3.
    renderScreen();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('captions the title with the full date and the category chip', () => {
    // Scoped to the header, because the frame deliberately draws both again in the Details
    // card - an unscoped getByText finds two of each and fails on the ambiguity rather than
    // on the caption being wrong.
    const { container } = renderScreen();
    const header = within(container.querySelector('header')!);

    expect(header.getByText('Oct 8, 2025')).toBeInTheDocument();
    expect(header.getByText('Groceries')).toBeInTheDocument();
  });

  it('shows no time anywhere on the page', () => {
    // PET-34's amendment to AC1 and the frame's "· 2:32 PM": no column stores a time, so
    // nothing here may print one. The regex is deliberately broad - any clock-shaped string.
    const { container } = renderScreen();

    expect(container.textContent).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it('renders the actions slot', () => {
    renderScreen();

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });
});

describe('the breadcrumb (AC7)', () => {
  it('links back to the transactions list', () => {
    renderScreen();

    expect(screen.getByRole('link', { name: 'All transactions' })).toHaveAttribute(
      'href',
      '/transactions',
    );
  });

  it('keeps the filters the user arrived with', () => {
    renderScreen(DETAIL, '/transactions?period=all&sort=date_asc');

    expect(screen.getByRole('link', { name: 'All transactions' })).toHaveAttribute(
      'href',
      '/transactions?period=all&sort=date_asc',
    );
  });
});

describe('the amount card (AC2)', () => {
  it('shows the amount as a debit', () => {
    renderScreen();

    expect(screen.getByText('−$62.40')).toBeInTheDocument();
  });

  it('names no account', () => {
    // DET-3 draws "Debited from Everyday account". No account exists in the schema, so PET-34
    // dropped the caption rather than hardcoding a claim the app cannot make.
    const { container } = renderScreen();

    expect(container.textContent).not.toMatch(/account/i);
  });
});

describe('the details card', () => {
  it('shows merchant, category and date', () => {
    renderScreen();

    expect(screen.getByText('Merchant')).toBeInTheDocument();
    expect(screen.getByText('Category')).toBeInTheDocument();
    expect(screen.getByText('Date')).toBeInTheDocument();
  });

  it('shows exactly three rows', () => {
    // The amendment that removes AC6. DET-6 draws six; Time, Payment and Status are captured
    // by no form and stored in no column, so they are gone rather than blank.
    const { container } = renderScreen();

    expect(container.querySelectorAll('dl > div')).toHaveLength(3);
  });

  it.each(['Time', 'Payment', 'Status'])('does not render a %s row', (label) => {
    renderScreen();

    expect(screen.queryByText(label)).not.toBeInTheDocument();
  });
});

describe('the note card (AC5)', () => {
  it('shows the note when there is one', () => {
    renderScreen();

    expect(screen.getByRole('heading', { name: 'Note' })).toBeInTheDocument();
    expect(
      screen.getByText('Weekly groceries run — produce and pantry staples.'),
    ).toBeInTheDocument();
  });

  it('renders no Note card at all when the note is null', () => {
    // A21, and "at all" is the assertion: an empty card with a heading would be a card
    // reporting that there is nothing to report.
    renderScreen({ ...DETAIL, transaction: { ...DETAIL.transaction, note: null } });

    expect(screen.queryByRole('heading', { name: 'Note' })).not.toBeInTheDocument();
  });

  it('renders no Note card for a note that is only whitespace', () => {
    // Not reachable through the current form - a cleared note is sent as null - but a note of
    // "   " could exist from any earlier write, and it would draw an empty card.
    renderScreen({ ...DETAIL, transaction: { ...DETAIL.transaction, note: '   ' } });

    expect(screen.queryByRole('heading', { name: 'Note' })).not.toBeInTheDocument();
  });
});

describe('the category context (AC3, AC4)', () => {
  it('renders the card for the transaction category', () => {
    renderScreen();

    expect(
      screen.getByRole('heading', { level: 2, name: 'Groceries this month' }),
    ).toBeInTheDocument();
  });

  it('passes the query through to the sibling links', () => {
    renderScreen(
      {
        ...DETAIL,
        recentInCategory: [
          { ...DETAIL.transaction, id: 'sibling-1', merchant: 'Costco', note: null },
        ],
      },
      '/transactions?period=all',
      '?period=all',
    );

    expect(screen.getByRole('link', { name: 'Costco' })).toHaveAttribute(
      'href',
      '/transactions/sibling-1?period=all',
    );
  });
});
