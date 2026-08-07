import { render, screen } from '@testing-library/react';

import { RecentTransactionsCard } from './RecentTransactionsCard';

// DSH-7's own mock, whose "Today" and "Yesterday" are the specification rather than sample
// data: they exist to prove relative formatting for recent days, with a short date beyond
// that. The fixed system time below is what makes both reachable in a suite.
const CATEGORIES = [
  { id: 'cat-groceries', name: 'Groceries', color: '#57B368', spent: 24, percent: 40 },
  { id: 'cat-transport', name: 'Transport', color: '#3F8EE6', spent: 18.5, percent: 31 },
  { id: 'cat-entertainment', name: 'Entertainment', color: '#8A79F1', spent: 15.99, percent: 27 },
];

const THREE_ROWS = [
  {
    id: 't1',
    merchant: 'Whole Foods',
    categoryId: 'cat-groceries',
    amount: 24,
    date: '2025-10-08',
    note: null,
    createdAt: '2025-10-08T12:00:00.000Z',
    updatedAt: '2025-10-08T12:00:00.000Z',
  },
  {
    id: 't2',
    merchant: 'Uber',
    categoryId: 'cat-transport',
    amount: 18.5,
    date: '2025-10-07',
    note: null,
    createdAt: '2025-10-07T12:00:00.000Z',
    updatedAt: '2025-10-07T12:00:00.000Z',
  },
  {
    id: 't3',
    merchant: 'Netflix',
    categoryId: 'cat-entertainment',
    amount: 15.99,
    date: '2025-10-03',
    note: null,
    createdAt: '2025-10-03T12:00:00.000Z',
    updatedAt: '2025-10-03T12:00:00.000Z',
  },
];

// 8 October 2025, the day `THREE_ROWS`' own dates read against. Local midnight, matching
// `lib/date.ts`'s own convention, so `formatRelativeDate`'s default `today` lands on the day
// this fixture was written for rather than whatever day the suite happens to run.
function withToday(run: () => void) {
  jest.useFakeTimers().setSystemTime(new Date(2025, 9, 8));
  try {
    run();
  } finally {
    jest.useRealTimers();
  }
}

describe('the rows (AC1, AC3)', () => {
  it('renders one row per transaction, in the order the response gave them', () => {
    withToday(() => {
      render(
        <RecentTransactionsCard
          recentTransactions={THREE_ROWS}
          categories={CATEGORIES}
          isEmpty={false}
        />,
      );

      expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual([
        expect.stringContaining('Whole Foods'),
        expect.stringContaining('Uber'),
        expect.stringContaining('Netflix'),
      ]);
    });
  });

  it('renders no more rows than the response carries, and invents no placeholders', () => {
    withToday(() => {
      render(
        <RecentTransactionsCard
          recentTransactions={[THREE_ROWS[0]!]}
          categories={CATEGORIES}
          isEmpty={false}
        />,
      );

      expect(screen.getAllByRole('listitem')).toHaveLength(1);
    });
  });
});

describe('the caption (AC2, AC3)', () => {
  it('reads "Today" for a transaction dated today', () => {
    withToday(() => {
      render(
        <RecentTransactionsCard
          recentTransactions={THREE_ROWS}
          categories={CATEGORIES}
          isEmpty={false}
        />,
      );

      expect(screen.getByText('Groceries · Today')).toBeInTheDocument();
    });
  });

  it('reads "Yesterday" for a transaction dated the day before', () => {
    withToday(() => {
      render(
        <RecentTransactionsCard
          recentTransactions={THREE_ROWS}
          categories={CATEGORIES}
          isEmpty={false}
        />,
      );

      expect(screen.getByText('Transport · Yesterday')).toBeInTheDocument();
    });
  });

  it('reads the short date beyond yesterday', () => {
    withToday(() => {
      render(
        <RecentTransactionsCard
          recentTransactions={THREE_ROWS}
          categories={CATEGORIES}
          isEmpty={false}
        />,
      );

      expect(screen.getByText('Entertainment · Oct 3')).toBeInTheDocument();
    });
  });
});

describe('the tile and the amount (AC4)', () => {
  it('gives each tile its category colour', () => {
    withToday(() => {
      const { container } = render(
        <RecentTransactionsCard
          recentTransactions={THREE_ROWS}
          categories={CATEGORIES}
          isEmpty={false}
        />,
      );

      const tiles = Array.from(container.querySelectorAll('[aria-hidden="true"].rounded-field'));
      expect(tiles.map((tile) => tile.className)).toEqual([
        expect.stringContaining('bg-success'),
        expect.stringContaining('bg-info'),
        expect.stringContaining('bg-primary'),
      ]);
    });
  });

  it('renders every amount negative, matching the stored positive magnitude', () => {
    withToday(() => {
      render(
        <RecentTransactionsCard
          recentTransactions={THREE_ROWS}
          categories={CATEGORIES}
          isEmpty={false}
        />,
      );

      expect(screen.getByText('−$24.00')).toBeInTheDocument();
      expect(screen.getByText('−$18.50')).toBeInTheDocument();
      expect(screen.getByText('−$15.99')).toBeInTheDocument();
    });
  });
});

describe('an unresolved category', () => {
  // Unreachable through today's contract - `recentTransactions` is documented as living inside
  // `categories`' own set - but the card falls back rather than trusting that, the same
  // defensiveness `categoryTileClass` itself carries for a colour outside the eight.
  it('drops the name from the caption and leaves the date, rather than guessing or throwing', () => {
    withToday(() => {
      render(
        <RecentTransactionsCard
          recentTransactions={[{ ...THREE_ROWS[0]!, categoryId: 'no-such-category' }]}
          categories={CATEGORIES}
          isEmpty={false}
        />,
      );

      expect(screen.getByText('Today')).toBeInTheDocument();
      expect(screen.queryByText(/Groceries/)).not.toBeInTheDocument();
    });
  });

  it('renders the neutral tile rather than an unpainted one', () => {
    withToday(() => {
      const { container } = render(
        <RecentTransactionsCard
          recentTransactions={[{ ...THREE_ROWS[0]!, categoryId: 'no-such-category' }]}
          categories={CATEGORIES}
          isEmpty={false}
        />,
      );

      const tile = container.querySelector('[aria-hidden="true"].rounded-field');
      expect(tile?.className).toContain('bg-base-300');
    });
  });
});

describe('"View all" (AC5)', () => {
  it('is a real link to the transactions list', () => {
    withToday(() => {
      render(
        <RecentTransactionsCard
          recentTransactions={THREE_ROWS}
          categories={CATEGORIES}
          isEmpty={false}
        />,
      );

      expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute(
        'href',
        '/transactions',
      );
    });
  });
});

describe('the empty state (AC3, PET-26)', () => {
  it('draws the icon and its copy rather than an empty list', () => {
    render(
      <RecentTransactionsCard recentTransactions={[]} categories={CATEGORIES} isEmpty={true} />,
    );

    expect(screen.getByText('No transactions yet')).toBeInTheDocument();
    expect(
      screen.getByText('Your recent expenses will appear here as you add them.'),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('follows `isEmpty` rather than `recentTransactions.length`', () => {
    // Documented as identical on a real response, but this card takes the shared flag rather
    // than re-deriving its own opinion from the array - proven by handing it real rows anyway.
    render(
      <RecentTransactionsCard
        recentTransactions={THREE_ROWS}
        categories={CATEGORIES}
        isEmpty={true}
      />,
    );

    expect(screen.getByText('No transactions yet')).toBeInTheDocument();
    expect(screen.queryByText('Whole Foods')).not.toBeInTheDocument();
  });

  it('carries no "View all" of its own, unlike the populated header', () => {
    render(
      <RecentTransactionsCard recentTransactions={[]} categories={CATEGORIES} isEmpty={true} />,
    );

    expect(screen.queryByRole('link', { name: 'View all' })).not.toBeInTheDocument();
  });
});
