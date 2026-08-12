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
// The router is mocked because the header's period select reaches `useRouter` (as the search field
// did before PET-67 moved it into the bar). A package specifier, so the `@/` alias trap does not
// apply. Nothing here drives it - `TransactionPeriodSelect.test.tsx` owns that behaviour - so this
// only has to exist, not to record calls.
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

/**
 * The period the read covers, which is what the header's overline names as of PET-72.
 *
 * On every arm, including the two empty ones: an account with nothing this period still has to be
 * told which period found nothing. `null` is the `period=all` case and has its own assertion below.
 */
const PERIOD = { start: '2025-10-01', end: '2025-11-01', label: 'October 2025' };

/**
 * The account's period history, for the header's select (PET-67).
 *
 * Its first entry is `PERIOD` above, which is the realistic arrangement and one trap: the overline
 * and one `<option>` then carry the identical string, so `getByText('October 2025')` matches two
 * elements and throws. Every assertion about the overline below is scoped to the header's own
 * paragraph for that reason, which is the same precaution `pages.test.tsx` takes over "AI
 * Assistant" naming both a heading and a chat row.
 */
const PERIODS = [
  { ...PERIOD, current: true },
  { start: '2025-09-01', end: '2025-10-01', label: 'September 2025', current: false },
];

const EMPTY: TransactionsView = { state: 'empty', total: 0, period: PERIOD };
const NO_RESULTS: TransactionsView = { state: 'noResults', total: 0, period: PERIOD };
const POPULATED: TransactionsView = {
  state: 'populated',
  transactions: [ROW],
  total: 128,
  period: PERIOD,
};

const FILTER_BAR = <div data-testid="filter-bar">All categories</div>;
const TABLE = <table data-testid="table" />;

type ScreenProps = React.ComponentProps<typeof TransactionsScreen>;

/**
 * Renders the screen inside the shell's Add transaction provider, with its three required props
 * filled in.
 *
 * **It takes props rather than an element as of PET-67**, and that is worth one line: `periods` made
 * four props every case has to supply, three of which every case supplied identically. Passing them
 * once here is what keeps each `it` naming only the thing it is about, and it means the next required
 * prop is one edit rather than twenty-two.
 *
 * The provider is needed as of PET-31, because this screen holds **two** triggers - the header's and
 * the empty card's - and both call `useAddTransaction`, which throws outside a provider by design
 * rather than silently doing nothing. In production the screen never renders outside
 * `(app)/layout.tsx`, which is where the provider lives, so this is the honest arrangement and
 * not a convenience. Same call `SetupCategoriesScreen.test.tsx` makes about `SetupDraftProvider`.
 *
 * The two triggers on one page are also the reason there is one modal on the layout rather than
 * one per button: two would mean two dialogs, two focus traps, and two copies of every
 * field id (`ui/FieldShell`'s required literal prop), which makes `getByLabelText` ambiguous.
 */
function renderScreen(props: Partial<ScreenProps> & Pick<ScreenProps, 'view'>) {
  return render(
    <AddTransactionProvider>
      <TransactionsScreen categoryCount={8} filters={{}} periods={PERIODS} {...props} />
    </AddTransactionProvider>,
  );
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
 * The header's period select (PET-67).
 *
 * By its accessible name, which is an `aria-label`: the design draws no visible label, so there is
 * no text node to find it by. This replaces a `searchField()` helper that is now the filter bar's
 * business - the field arrives inside the `filterBar` slot this suite stubs, so the screen no longer
 * renders one at all and `TransactionFilterBar.test.tsx` owns every assertion about it.
 */
const periodSelect = () => screen.getByRole('combobox', { name: 'Budgeting period' });

/** The overline, scoped past the period select that repeats its text. See `PERIODS`. */
const overlineOf = (container: HTMLElement) => container.querySelector('header p')?.textContent;

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(2025, 9, 8));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('the empty state (frame 07)', () => {
  it('renders the centred card with its heading, copy and button (AC1)', () => {
    renderScreen({ view: EMPTY });

    expect(screen.getByRole('heading', { name: EMPTY_COPY.heading })).toBeInTheDocument();
    expect(screen.getByText(EMPTY_COPY.body)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Add transaction' })).toHaveLength(2);
  });

  it('keeps the period select and the header button, and drops the filter bar (AC2)', () => {
    // The visible difference from frame 06, and the reason this conditional is built here
    // rather than left to whoever adds the bar.
    renderScreen({ view: EMPTY, filterBar: FILTER_BAR });

    expect(periodSelect()).toBeInTheDocument();
    expect(screen.queryByTestId('filter-bar')).not.toBeInTheDocument();
  });

  it('draws no search field at all, because the bar it now lives in is dropped', () => {
    // **The inversion of what this suite pinned for two tickets**, and a real behaviour change
    // rather than a moved assertion: PET-67 put the field in the filter bar, TRN-3 removes that bar
    // here, so an account with nothing logged is offered nothing to search. Defensible on its own
    // terms - there is nothing to search - and it cannot strand a term mid-typing, because no
    // keystroke can reach this state: `lib/transactions.ts` decides `empty` from an account-wide
    // probe, so a user who can type is in `noResults` instead.
    renderScreen({ view: EMPTY, filterBar: FILTER_BAR });

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows a badge of 0 (AC3)', () => {
    renderScreen({ view: EMPTY });

    expectBadge('0');
  });

  it('renders the empty card instead of the table, even when handed one', () => {
    renderScreen({ view: EMPTY, table: TABLE });

    expect(screen.queryByTestId('table')).not.toBeInTheDocument();
  });
});

describe('the no-results state (AC5)', () => {
  it('keeps the period select and the filter bar visible', () => {
    // A15's whole instruction, and the half of it this ticket keeps: the controls stay, because
    // they are the only way out of this state. As of PET-67 the search field is inside that bar,
    // which is what makes keeping the bar here load-bearing rather than tidy - it carries the one
    // control that got the user into this state.
    renderScreen({ view: NO_RESULTS, filterBar: FILTER_BAR });

    expect(screen.getByTestId('filter-bar')).toBeInTheDocument();
    expect(periodSelect()).toBeInTheDocument();
  });

  it('uses its own copy rather than claiming the account is empty', () => {
    // The half that amends A15 and AC5. Telling somebody with a full history to "log your
    // first expense" is wrong copy, not merely undesigned copy.
    renderScreen({ view: NO_RESULTS });

    expect(screen.getByRole('heading', { name: NO_RESULTS_COPY.heading })).toBeInTheDocument();
    expect(screen.getByText(NO_RESULTS_COPY.body)).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_COPY.body)).not.toBeInTheDocument();
  });

  it('still offers Add transaction, since logging one is a way forward', () => {
    renderScreen({ view: NO_RESULTS });

    expect(screen.getAllByRole('button', { name: 'Add transaction' })).toHaveLength(2);
  });
});

describe('the populated state', () => {
  it("renders PET-29's table and no empty card", () => {
    renderScreen({ view: POPULATED, filterBar: FILTER_BAR, table: TABLE });

    expect(screen.getByTestId('table')).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_COPY.heading)).not.toBeInTheDocument();
    expect(screen.queryByText(NO_RESULTS_COPY.heading)).not.toBeInTheDocument();
  });

  it('shows the real post-filter total on the badge', () => {
    // 128 against one row on purpose: the badge reads `total`, never `transactions.length`.
    renderScreen({ view: POPULATED });

    expectBadge('128');
  });

  it('renders the filter bar', () => {
    renderScreen({ view: POPULATED, filterBar: FILTER_BAR });

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
    renderScreen({ view: POPULATED, table: TABLE });

    expect(screen.getByTestId('table').parentElement).toHaveClass('transition-opacity');
  });
});

describe('the chrome every state shares', () => {
  it('keeps the header overline and title', () => {
    const { container } = renderScreen({ view: EMPTY });

    expect(screen.getByRole('heading', { level: 1, name: 'Transactions' })).toBeInTheDocument();
    // Scoped rather than `getByText`, which now matches the select's option of the same name too.
    expect(overlineOf(container)).toBe('October 2025');
  });

  it('shows both tabs', () => {
    renderScreen({ view: EMPTY });

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
    renderScreen({ view: EMPTY });

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
    renderScreen({ view: POPULATED });

    expect(screen.getByText('Categories').parentElement).toContainElement(screen.getByText('8'));
  });

  it('holds exactly one select of its own, the header period (PET-67)', () => {
    // **The inversion of "holds no select of its own, because the filter bar arrives through a
    // slot".** That assertion was right for two tickets and its reason has expired rather than
    // been overturned: the header genuinely drew no control the design did not, and the design is
    // what the product owner has now overridden. Still worth pinning as a count, because the bar's
    // own comboboxes belong to `TransactionFilterBar` and this suite stubs it - so a second select
    // appearing here means the header grew a control nobody decided on.
    renderScreen({ view: EMPTY });

    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(periodSelect()).toBeInTheDocument();
  });

  it('offers every period the account has, plus All time', () => {
    // The whole history rather than the three named values the pill it replaced offered, which is
    // the point of the swap. "All time" is the one appended entry, because `period=all` is the one
    // filter whose response carries no period to name.
    renderScreen({ view: EMPTY });

    expect(
      Array.from(periodSelect().querySelectorAll('option')).map((option) => option.textContent),
    ).toEqual(['October 2025', 'September 2025', 'All time']);
  });

  it('selects the period the response covers rather than the URL', () => {
    // `PeriodSelect`'s own rule: a bare /transactions carries no period and still has to show the
    // current one rather than an empty box.
    renderScreen({ view: POPULATED });

    expect(periodSelect()).toHaveValue('2025-10-01');
  });

  it('selects All time when the response names no period', () => {
    // `period: null` is exactly `?period=all`. Without the appended entry this is a value matching
    // no option, which browsers draw as blank or as the wrong first one.
    renderScreen({ view: { ...POPULATED, period: null } });

    expect(periodSelect()).toHaveValue('all');
  });

  it('keeps the period select in the header, outside the state conditional', () => {
    // **The replacement for the same assertion about the search field**, and the reason is now the
    // simpler one: this control has no conditional at all, so it must not end up inside the branch
    // that swaps the table for the empty card. The caret argument that made the old version
    // load-bearing moved to `TransactionsScreen`'s own comment, along with why the field is safe in
    // the bar now.
    const { container } = renderScreen({ view: EMPTY });

    expect(container.querySelector('main')).not.toContainElement(periodSelect());
    expect(container.querySelector('header')).toContainElement(periodSelect());
  });

  it('puts the empty card inside main, below the tabs', () => {
    const { container } = renderScreen({ view: EMPTY });
    const main = container.querySelector('main');

    expect(main).toContainElement(screen.getByRole('heading', { name: EMPTY_COPY.heading }));
  });
});
