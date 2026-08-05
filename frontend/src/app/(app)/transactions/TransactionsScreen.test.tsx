import { render, screen } from '@testing-library/react';

import type { TransactionsView } from '../../../lib/transactions';

import { EMPTY_COPY, NO_RESULTS_COPY } from './TransactionsEmpty';
import { TransactionsScreen } from './TransactionsScreen';

// The three states of one screen, and the conditional PET-29 will fill in.
//
// The copy is imported rather than retyped, so no assertion here can quietly disagree with the
// strings that ship. The relative specifier on the type import is habit rather than necessity -
// only `jest.mock` needs it - but keeping it matches every other suite under `app/`.

const ROW = {
  id: '0198c2a1-0000-7000-8000-000000000001',
  merchant: 'Whole Foods',
  categoryId: '0198c2a1-0000-7000-8000-0000000000a1',
  amount: 62.4,
  date: '2025-10-08',
  note: null,
  createdAt: '2025-10-08T09:00:00.000Z',
  updatedAt: '2025-10-08T09:00:00.000Z',
};

const EMPTY: TransactionsView = { state: 'empty', total: 0 };
const NO_RESULTS: TransactionsView = { state: 'noResults', total: 0 };
const POPULATED: TransactionsView = { state: 'populated', transactions: [ROW], total: 128 };

const FILTER_BAR = <div data-testid="filter-bar">All categories</div>;
const TABLE = <table data-testid="table" />;

/**
 * Asserts the count badge reads exactly `total`, and that it is the badge rather than any
 * other element carrying that string.
 *
 * `getByText` is an exact match by default, so a badge showing 40 fails to find "0" instead of
 * quietly satisfying it. That is the whole reason this is a helper: the obvious version,
 * `expect(tab.parentElement).toHaveTextContent('0')`, does a **substring** match on the row's
 * concatenated "All transactions0" - so it passes for 40, 10 and 100 as well, and the one
 * assertion covering AC3 could not fail for the thing it names.
 */
function expectBadge(total: string) {
  const label = screen.getByText('All transactions');

  expect(label.parentElement).toContainElement(screen.getByText(total));
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(2025, 9, 8));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('the empty state (frame 07)', () => {
  it('renders the centred card with its heading, copy and button (AC1)', () => {
    render(<TransactionsScreen view={EMPTY} />);

    expect(screen.getByRole('heading', { name: EMPTY_COPY.heading })).toBeInTheDocument();
    expect(screen.getByText(EMPTY_COPY.body)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Add transaction' })).toHaveLength(2);
  });

  it('keeps the search field and the header button, and drops the filter bar (AC2)', () => {
    // The visible difference from frame 06, and the reason this conditional is built here
    // rather than left to whoever adds the bar.
    render(<TransactionsScreen view={EMPTY} filterBar={FILTER_BAR} />);

    expect(screen.getByText('Search transactions')).toBeInTheDocument();
    expect(screen.queryByTestId('filter-bar')).not.toBeInTheDocument();
  });

  it('shows a badge of 0 (AC3)', () => {
    render(<TransactionsScreen view={EMPTY} />);

    expectBadge('0');
  });

  it('renders the empty card instead of the table, even when handed one', () => {
    render(<TransactionsScreen view={EMPTY} table={TABLE} />);

    expect(screen.queryByTestId('table')).not.toBeInTheDocument();
  });
});

describe('the no-results state (AC5)', () => {
  it('keeps the search field and the filter bar visible', () => {
    // A15's whole instruction, and the half of it this ticket keeps: the controls stay, because
    // they are the only way out of this state.
    render(<TransactionsScreen view={NO_RESULTS} filterBar={FILTER_BAR} />);

    expect(screen.getByTestId('filter-bar')).toBeInTheDocument();
    expect(screen.getByText('Search transactions')).toBeInTheDocument();
  });

  it('uses its own copy rather than claiming the account is empty', () => {
    // The half that amends A15 and AC5. Telling somebody with a full history to "log your
    // first expense" is wrong copy, not merely undesigned copy.
    render(<TransactionsScreen view={NO_RESULTS} />);

    expect(screen.getByRole('heading', { name: NO_RESULTS_COPY.heading })).toBeInTheDocument();
    expect(screen.getByText(NO_RESULTS_COPY.body)).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_COPY.body)).not.toBeInTheDocument();
  });

  it('still offers Add transaction, since logging one is a way forward', () => {
    render(<TransactionsScreen view={NO_RESULTS} />);

    expect(screen.getAllByRole('button', { name: 'Add transaction' })).toHaveLength(2);
  });
});

describe('the populated state', () => {
  it("renders PET-29's table and no empty card", () => {
    render(<TransactionsScreen view={POPULATED} filterBar={FILTER_BAR} table={TABLE} />);

    expect(screen.getByTestId('table')).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_COPY.heading)).not.toBeInTheDocument();
    expect(screen.queryByText(NO_RESULTS_COPY.heading)).not.toBeInTheDocument();
  });

  it('shows the real post-filter total on the badge', () => {
    // 128 against one row on purpose: the badge reads `total`, never `transactions.length`.
    render(<TransactionsScreen view={POPULATED} />);

    expectBadge('128');
  });

  it('renders the filter bar', () => {
    render(<TransactionsScreen view={POPULATED} filterBar={FILTER_BAR} />);

    expect(screen.getByTestId('filter-bar')).toBeInTheDocument();
  });
});

describe('the chrome every state shares', () => {
  it('keeps the header overline and title', () => {
    render(<TransactionsScreen view={EMPTY} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Transactions' })).toBeInTheDocument();
    expect(screen.getByText('October 2025')).toBeInTheDocument();
  });

  it('shows both tabs', () => {
    render(<TransactionsScreen view={EMPTY} />);

    expect(screen.getByText('All transactions')).toBeInTheDocument();
    expect(screen.getByText('Categories')).toBeInTheDocument();
  });

  it('leaves the tabs and the search field inert', () => {
    // "Categories" is frame 13, which is PET-36's route and does not exist - a link here would
    // 404 or force a hole into routes.test.ts. The two Add transaction buttons are the only
    // operable things on the page, and both are inert until PET-31.
    render(<TransactionsScreen view={EMPTY} />);

    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('puts the empty card inside main, below the tabs', () => {
    const { container } = render(<TransactionsScreen view={EMPTY} />);
    const main = container.querySelector('main');

    expect(main).toContainElement(screen.getByRole('heading', { name: EMPTY_COPY.heading }));
  });
});
