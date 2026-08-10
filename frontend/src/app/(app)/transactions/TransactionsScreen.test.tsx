import { render, screen } from '@testing-library/react';

import type { TransactionsView } from '../../../lib/transactions';

import { AddTransactionProvider } from '../AddTransactionProvider';
import { EMPTY_COPY, NO_RESULTS_COPY } from './TransactionsEmpty';
import { TransactionsScreen } from './TransactionsScreen';

// The three states of one screen, and the conditional PET-29 filled in.
//
// The copy is imported rather than retyped, so no assertion here can quietly disagree with the
// strings that ship. The relative specifier on the type import is habit rather than necessity -
// only `jest.mock` needs it - but keeping it matches every other suite under `app/`.
//
// The router is mocked because the header's search field is real as of PET-29 and reaches
// `useRouter` to write the query string. A package specifier, so the `@/` alias trap does not
// apply. Nothing here types into it - `TransactionSearch.test.tsx` owns that behaviour - so
// this only has to exist, not to record calls.
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), refresh: jest.fn() }),
}));

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
 * Renders the screen inside the shell's Add transaction provider.
 *
 * Needed as of PET-31, because this screen holds **two** triggers - the header's and the empty
 * card's - and both call `useAddTransaction`, which throws outside a provider by design rather
 * than silently doing nothing. In production the screen never renders outside
 * `(app)/layout.tsx`, which is where the provider lives, so this is the honest arrangement and
 * not a convenience. Same call `SetupCategoriesScreen.test.tsx` makes about `SetupDraftProvider`.
 *
 * The two triggers on one page are also the reason there is one modal on the layout rather than
 * one per button: two would mean two dialogs, two focus traps, and two copies of every
 * field id (`ui/FieldShell`'s required literal prop), which makes `getByLabelText` ambiguous.
 */
function renderScreen(screenElement: React.ReactNode) {
  return render(<AddTransactionProvider>{screenElement}</AddTransactionProvider>);
}

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

/**
 * The header's search field.
 *
 * By role rather than by text: it was an inert `<div>` whose placeholder was a text node, and
 * it is an `<input>` now, so `getByText('Search transactions')` silently finds nothing.
 */
const searchField = () => screen.getByRole('textbox', { name: 'Search transactions' });

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(2025, 9, 8));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('the empty state (frame 07)', () => {
  it('renders the centred card with its heading, copy and button (AC1)', () => {
    renderScreen(
      <TransactionsScreen monthStartDay={1} categoryCount={8} filters={{}} view={EMPTY} />,
    );

    expect(screen.getByRole('heading', { name: EMPTY_COPY.heading })).toBeInTheDocument();
    expect(screen.getByText(EMPTY_COPY.body)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Add transaction' })).toHaveLength(2);
  });

  it('keeps the search field and the header button, and drops the filter bar (AC2)', () => {
    // The visible difference from frame 06, and the reason this conditional is built here
    // rather than left to whoever adds the bar.
    renderScreen(
      <TransactionsScreen
        monthStartDay={1}
        categoryCount={8}
        filters={{}}
        view={EMPTY}
        filterBar={FILTER_BAR}
      />,
    );

    expect(searchField()).toBeInTheDocument();
    expect(screen.queryByTestId('filter-bar')).not.toBeInTheDocument();
  });

  it('shows a badge of 0 (AC3)', () => {
    renderScreen(
      <TransactionsScreen monthStartDay={1} categoryCount={8} filters={{}} view={EMPTY} />,
    );

    expectBadge('0');
  });

  it('renders the empty card instead of the table, even when handed one', () => {
    renderScreen(
      <TransactionsScreen
        monthStartDay={1}
        categoryCount={8}
        filters={{}}
        view={EMPTY}
        table={TABLE}
      />,
    );

    expect(screen.queryByTestId('table')).not.toBeInTheDocument();
  });
});

describe('the no-results state (AC5)', () => {
  it('keeps the search field and the filter bar visible', () => {
    // A15's whole instruction, and the half of it this ticket keeps: the controls stay, because
    // they are the only way out of this state.
    renderScreen(
      <TransactionsScreen
        monthStartDay={1}
        categoryCount={8}
        filters={{}}
        view={NO_RESULTS}
        filterBar={FILTER_BAR}
      />,
    );

    expect(screen.getByTestId('filter-bar')).toBeInTheDocument();
    expect(searchField()).toBeInTheDocument();
  });

  it('uses its own copy rather than claiming the account is empty', () => {
    // The half that amends A15 and AC5. Telling somebody with a full history to "log your
    // first expense" is wrong copy, not merely undesigned copy.
    renderScreen(
      <TransactionsScreen monthStartDay={1} categoryCount={8} filters={{}} view={NO_RESULTS} />,
    );

    expect(screen.getByRole('heading', { name: NO_RESULTS_COPY.heading })).toBeInTheDocument();
    expect(screen.getByText(NO_RESULTS_COPY.body)).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_COPY.body)).not.toBeInTheDocument();
  });

  it('still offers Add transaction, since logging one is a way forward', () => {
    renderScreen(
      <TransactionsScreen monthStartDay={1} categoryCount={8} filters={{}} view={NO_RESULTS} />,
    );

    expect(screen.getAllByRole('button', { name: 'Add transaction' })).toHaveLength(2);
  });
});

describe('the populated state', () => {
  it("renders PET-29's table and no empty card", () => {
    renderScreen(
      <TransactionsScreen
        monthStartDay={1}
        categoryCount={8}
        filters={{}}
        view={POPULATED}
        filterBar={FILTER_BAR}
        table={TABLE}
      />,
    );

    expect(screen.getByTestId('table')).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_COPY.heading)).not.toBeInTheDocument();
    expect(screen.queryByText(NO_RESULTS_COPY.heading)).not.toBeInTheDocument();
  });

  it('shows the real post-filter total on the badge', () => {
    // 128 against one row on purpose: the badge reads `total`, never `transactions.length`.
    renderScreen(
      <TransactionsScreen monthStartDay={1} categoryCount={8} filters={{}} view={POPULATED} />,
    );

    expectBadge('128');
  });

  it('renders the filter bar', () => {
    renderScreen(
      <TransactionsScreen
        monthStartDay={1}
        categoryCount={8}
        filters={{}}
        view={POPULATED}
        filterBar={FILTER_BAR}
      />,
    );

    expect(screen.getByTestId('filter-bar')).toBeInTheDocument();
  });

  it('wraps the table in the pending region, so a filter change can dim it', () => {
    // **The assertion that would have caught the bug this replaced.** `TransactionsTable` used
    // to take a `pending` prop, and nothing could pass it: the flag lives in the client
    // components that navigate and the table is a Server Component between them. The
    // affordance was documented, tested against a hand-set prop, and wired to nothing.
    //
    // `transition-opacity` is the region's marker in both states - see FilterNavigation.test
    // for why the busy state itself is a browser check rather than a jsdom one.
    renderScreen(
      <TransactionsScreen
        monthStartDay={1}
        categoryCount={8}
        filters={{}}
        view={POPULATED}
        table={TABLE}
      />,
    );

    expect(screen.getByTestId('table').parentElement).toHaveClass('transition-opacity');
  });
});

describe('the chrome every state shares', () => {
  it('keeps the header overline and title', () => {
    renderScreen(
      <TransactionsScreen monthStartDay={1} categoryCount={8} filters={{}} view={EMPTY} />,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Transactions' })).toBeInTheDocument();
    expect(screen.getByText('October 2025')).toBeInTheDocument();
  });

  it('shows both tabs', () => {
    renderScreen(
      <TransactionsScreen monthStartDay={1} categoryCount={8} filters={{}} view={EMPTY} />,
    );

    expect(screen.getByText('All transactions')).toBeInTheDocument();
    expect(screen.getByText('Categories')).toBeInTheDocument();
  });

  it('makes both tabs real links and marks this one current (PET-36)', () => {
    // **The inversion of what this suite asserted for four tickets.** Both tabs were inert
    // because "Categories" opens frame 13, which had no route behind it; PET-36 built it, so
    // the reason is gone and the assertion is turned over rather than deleted.
    //
    // Still no `role="tab"`, and that part is not an oversight: these navigate to two routes
    // rather than swapping a panel in place, so the bar is a `<nav>` of links. Asserting the
    // absence keeps a future "let's use the real tablist" from landing without the tabpanel
    // relationship that role promises.
    renderScreen(
      <TransactionsScreen monthStartDay={1} categoryCount={8} filters={{}} view={EMPTY} />,
    );

    expect(screen.queryByRole('tab')).not.toBeInTheDocument();

    const active = screen.getByRole('link', { name: /All transactions/ });
    const other = screen.getByRole('link', { name: /Categories/ });

    expect(active).toHaveAttribute('href', '/transactions');
    expect(active).toHaveAttribute('aria-current', 'page');

    expect(other).toHaveAttribute('href', '/transactions/categories');
    expect(other).not.toHaveAttribute('aria-current');
  });

  it('shows the category count on the other tab (PET-36)', () => {
    // The badge the Categories tab carries while this route is the one being rendered. 8
    // against a view holding one transaction, so this cannot be reading the wrong number.
    renderScreen(
      <TransactionsScreen monthStartDay={1} categoryCount={8} filters={{}} view={POPULATED} />,
    );

    expect(screen.getByText('Categories').parentElement).toContainElement(screen.getByText('8'));
  });

  it('makes the search field a real text box', () => {
    // The opposite of what this suite asserted for three tickets. It was an inert <div>
    // because there was no list to filter; there is one now.
    renderScreen(
      <TransactionsScreen monthStartDay={1} categoryCount={8} filters={{}} view={EMPTY} />,
    );

    expect(searchField()).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('holds no select of its own, because the filter bar arrives through a slot', () => {
    // This screen renders whatever it is handed; the three real comboboxes belong to
    // `TransactionFilterBar`, which this suite stubs. If one ever appears here, the header
    // has grown a control the design does not draw.
    renderScreen(
      <TransactionsScreen monthStartDay={1} categoryCount={8} filters={{}} view={EMPTY} />,
    );

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows the term the URL is filtered by', () => {
    renderScreen(
      <TransactionsScreen
        monthStartDay={1}
        categoryCount={8}
        filters={{ search: 'Uber' }}
        view={NO_RESULTS}
      />,
    );

    expect(searchField()).toHaveValue('Uber');
  });

  it('keeps the search field in the header, outside the state conditional', () => {
    // Load-bearing rather than cosmetic: the field survives a filter change with its focus
    // and caret intact only because its position in the tree is identical in all three
    // states. Under `<main>` it would sit inside the branch that swaps, and React would
    // remount it after every debounce.
    const { container } = renderScreen(
      <TransactionsScreen monthStartDay={1} categoryCount={8} filters={{}} view={EMPTY} />,
    );

    expect(container.querySelector('main')).not.toContainElement(searchField());
    expect(container.querySelector('header')).toContainElement(searchField());
  });

  it('puts the empty card inside main, below the tabs', () => {
    const { container } = renderScreen(
      <TransactionsScreen monthStartDay={1} categoryCount={8} filters={{}} view={EMPTY} />,
    );
    const main = container.querySelector('main');

    expect(main).toContainElement(screen.getByRole('heading', { name: EMPTY_COPY.heading }));
  });
});
