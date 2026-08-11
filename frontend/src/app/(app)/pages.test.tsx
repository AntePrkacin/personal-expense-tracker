import { screen, within } from '@testing-library/react';

// `render` comes from the shell wrapper: these pages render inside `(app)/layout.tsx` in
// production, so the cards below reach `PreferencesProvider` there. See `shellRender.tsx`.
import { render } from './shellRender';

import { readCategoryLabels } from '../../lib/categories';
import { readDashboard } from '../../lib/dashboard';
import { requireInsights } from '../../lib/insights';
import { readPeriods } from '../../lib/periods';
import { requireProfile } from '../../lib/profile';
import { readTransactionsView } from '../../lib/transactions';

import { AddTransactionProvider } from './AddTransactionProvider';
import { DeleteTransactionProvider } from './DeleteTransactionProvider';
import DashboardPage from './dashboard/page';
import { EditTransactionProvider } from './EditTransactionProvider';
import InsightsPage from './insights/page';
import SettingsPage from './settings/page';
import TransactionsPage from './transactions/page';

// AC1, AC2 and AC3 across all four routed views, in one file, because the thing
// worth asserting is the *set*: that every screen has its designed overline,
// title and action, and that the differences between them are the designed ones.
//
// **All four fetch as of PET-46**, so every page goes through the `renderScreen` helper below and
// every read is mocked. That helper predates the fourth: it works uniformly because awaiting a
// synchronous component's return value is a no-op, which is the property PET-30 relied on when
// Transactions became the first async one. The layout that wraps them is not exercised here -
// SidebarNav.test.tsx covers the sidebar half.
//
// A relative specifier, because `jest.mock` cannot resolve the `@/` alias from
// anywhere in this repo - see the note in frontend/src/app/CLAUDE.md.
jest.mock('../../lib/transactions', () => ({ readTransactionsView: jest.fn() }));

// Dashboard is not, as of PET-21: it awaits `readDashboard()`, the same shape as Transactions,
// so it too goes through `renderScreen` and needs a mock rather than a real request.
jest.mock('../../lib/dashboard', () => ({ readDashboard: jest.fn() }));

// PET-29 gives that page a second read: a row carries only a `categoryId`, so the name and
// colour the table draws are joined on from the category list. Same relative specifier, same
// reason.
jest.mock('../../lib/categories', () => ({ readCategoryLabels: jest.fn() }));

// AI Insights is not a plain Server Component either, as of PET-42-43-44: it awaits
// `requireInsights()`, the same shape as the two above.
jest.mock('../../lib/insights', () => ({ requireInsights: jest.fn() }));

// Settings was the last plain one and stopped being so at PET-46: it awaits `requireProfile()`,
// which reaches `cookies()` and would throw outside a request scope. Note this is the same read
// `(app)/layout.tsx` makes, which is not exercised here.
jest.mock('../../lib/profile', () => ({ requireProfile: jest.fn() }));

// PET-72 adds a fifth read, and it is the one module here that is **partially** mocked. Dashboard
// and AI Insights both await `readPeriods()` for the header's select and its overline, so that one
// has to be a `jest.fn()`; the rest of the module is pure - `parsePeriodParam` is what a page turns
// its `searchParams` into, and `periodHref` is what the select navigates with - and stubbing those
// would replace the seam under test with a fake. So the actual module is spread and one export
// replaced, which is the only mock in this file that is not wholesale.
jest.mock('../../lib/periods', () => ({
  ...jest.requireActual('../../lib/periods'),
  readPeriods: jest.fn(),
}));

// Two of these screens now hold an "Add transaction" trigger that calls
// `useAddTransaction`, which throws outside its provider by design - so every render
// here goes through `renderScreen()` below rather than through `render()` directly. The
// provider is honest rather than convenient: in production no page renders outside the
// shell's layout, which is where it lives. Same call SetupCategoriesScreen.test.tsx
// makes about SetupDraftProvider.
//
// `next/navigation` is mocked because the modal the provider mounts reaches useRouter
// for its refresh. Nothing here opens it, but the provider's subtree is rendered.
// `replace` joins it as of PET-29: the transactions header's search field writes the query
// string, and the filter bar's three selects do the same.
// `redirect` is mocked as **throwing**, matching `lib/transactions.test.ts` and
// `lib/profile.test.ts`: the real one is typed `never`, so a mock returning undefined would let
// execution fall through past the redirect and test the opposite of what the case claims.
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn(), replace: jest.fn(), push: jest.fn() }),
  redirect: jest.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

/**
 * The props every page here is called with.
 *
 * Only Transactions reads `searchParams`, and it is a promise in Next 16. The other three
 * take no props and ignore it, which is what keeps one call site covering all four.
 */
const PAGE_PROPS = { searchParams: Promise.resolve({}) };

/** Renders a page inside the shell's providers, awaiting it whether or not it is async. */
async function renderScreen(
  Page: (props: typeof PAGE_PROPS) => React.ReactNode | Promise<React.ReactNode>,
) {
  // Awaiting a synchronous component's return value is a no-op, so one call site covers
  // all four - which is the property PET-30 relied on when Transactions became async.
  //
  // All three providers, in the layout's own order, as of PET-32. The second and third are not
  // decoration: a populated transactions table draws a kebab per row whose
  // `useDeleteTransaction()` and `useEditTransaction()` both throw outside them. The `beforeEach`
  // below hands this page an empty `transactions` array and no `table`, so no row reaches them
  // today - which is exactly why they are wired now rather than when a future edit to that mock
  // makes the whole file fail at once.
  //
  // The order is load-bearing for the third one specifically: `EditTransactionProvider` calls
  // `useDeleteTransaction()` in its own body, so outside that provider it throws while rendering
  // rather than on a click.
  return render(
    <AddTransactionProvider>
      <DeleteTransactionProvider>
        <EditTransactionProvider>{await Page(PAGE_PROPS)}</EditTransactionProvider>
      </DeleteTransactionProvider>
    </AddTransactionProvider>,
  );
}

// The populated state deliberately, even though the empty one is PET-30's subject.
// This file asserts the *header*, and the empty card carries a second "Add
// transaction" button that would make the getByRole below ambiguous. The three states
// are TransactionsScreen.test.tsx's, where they can be asserted without a page around
// them. No `table` is passed, so main holds only the tab bar.
beforeEach(() => {
  // Calls accumulate across cases otherwise, which no assertion here noticed until PET-29
  // started counting them. Implementations survive `clearAllMocks`, and both are re-set
  // immediately below in any case.
  jest.clearAllMocks();

  (readTransactionsView as jest.Mock).mockResolvedValue({
    state: 'populated',
    transactions: [],
    total: 128,
    // The header's overline as of PET-72, and no longer derived from the profile: the list read
    // echoes back the period it resolved, so the label and the figures come from one resolution.
    period: PERIOD,
  });

  // Dashboard's and AI Insights' select, and the second's overline too. Two entries, so the control
  // has something to offer - `PeriodSelect.test.tsx` owns what it does with them.
  (readPeriods as jest.Mock).mockResolvedValue({ periods: PERIODS });

  // An empty list is enough: the rows are `TransactionsTable.test.tsx`'s subject, and this
  // file asserts the header. The read still has to succeed, because the page throws on an
  // unavailable one rather than rendering a table with every category cell blank.
  (readCategoryLabels as jest.Mock).mockResolvedValue({ ok: true, data: [] });

  // Zeroes are enough: `BudgetCard.test.tsx`, `TrendCard.test.tsx` and the rest are the cards'
  // own subjects, and this file asserts the header. `transactionCount: 0` also means
  // `page.tsx` resolves `isEmpty: true` and every card but the donut draws PET-26's designed
  // empty treatment here, which is a gap this fixture leaves to those cards' own suites rather
  // than one this file's header assertions need to look past. `readDashboard` throws rather
  // than returning a rejection, matching the shape `lib/dashboard.ts` actually has - there is
  // no `{ ok }` wrapper to mock here.
  (readDashboard as jest.Mock).mockResolvedValue({
    spent: 0,
    monthlyBudget: 2000,
    remaining: 2000,
    daysLeft: 8,
    transactionCount: 0,
    averagePerDay: 0,
    topCategory: null,
    weeklyBuckets: [],
    categories: [],
    recentTransactions: [],
    insight: null,
    period: PERIOD,
  });

  // A `ready` set rather than an empty one, because this file asserts the header and the
  // Regenerate button is absent in the empty state by design (INS-1). One card, which is enough
  // to keep the grid from being the subject here - `InsightsScreen.test.tsx` owns the three
  // states. Like `readDashboard`, `requireInsights` redirects or throws rather than returning a
  // wrapper, so there is no `{ ok }` to mock.
  (requireInsights as jest.Mock).mockResolvedValue({
    state: 'ready',
    monthLabel: 'October 2025',
    summary: { headline: 'On track this month', body: 'Spent $1,240 of $2,000.' },
    insights: [{ tone: 'warning', title: 'Dining out is over budget', body: '$12 over' }],
    generatedAt: '2025-10-08T09:00:00.000Z',
  });

  // The Figma persona, which is what the whole file is drawn with. The Profile card's own
  // behaviour is `SettingsForm.test.tsx`'s subject; this file needs the read only to succeed, and
  // asserts the header above it. `requireProfile` redirects or throws rather than returning a
  // wrapper, so there is no `{ ok }` to mock - the same shape as `readDashboard` above.
  (requireProfile as jest.Mock).mockResolvedValue({
    fullName: 'Marko Kovač',
    email: 'marko@email.com',
    currency: 'USD',
    monthlyBudget: 2000,
    monthStartDay: 1,
  });
});

/**
 * The period every read here answers with, and the list the select offers.
 *
 * October 2025 is the month the whole Figma file is drawn in. **It is a fixture rather than a
 * derivation as of PET-72**, which is what the frozen clock below used to be for on the headers:
 * three of them composed their overline from the profile's start day and today, so the month they
 * named was this file's to set. Now the label is the backend's and arrives on the response.
 */
const PERIOD = { start: '2025-10-01', end: '2025-11-01', label: 'October 2025', current: true };

const PERIODS = [
  PERIOD,
  { start: '2025-09-01', end: '2025-10-01', label: 'September 2025', current: false },
];

// The clock is still pinned to a day inside that period: the cards below it read one -
// `RecentTransactionsCard`'s relative caption is the clearest - so an unpinned run would drift the
// content under assertions about the header.
beforeAll(() => {
  jest.useFakeTimers().setSystemTime(new Date(2025, 9, 8));
});

afterAll(() => {
  jest.useRealTimers();
});

const SCREENS = [
  ['Dashboard', DashboardPage, 'October 2025', 'Dashboard'],
  ['Transactions', TransactionsPage, 'October 2025', 'Transactions'],
  // The overline is the period rather than INS-1's "Your money assistant", decided at the
  // 2026-08-08 review so the four routed views read consistently. The Jira ticket carries the
  // amendment.
  ['AI Insights', InsightsPage, 'October 2025', 'AI Insights'],
  ['Settings', SettingsPage, 'Manage your account', 'Settings'],
] as const;

describe('the four routed views', () => {
  it.each(SCREENS)(
    '%s opens with its designed overline and title',
    async (_name, Page, overline, title) => {
      // AC1.
      await renderScreen(Page);

      // Scoped to the header's own paragraph: Dashboard's period select carries an `<option>` with
      // the identical label as of PET-72, so a bare `getByText` matches twice there and nowhere else
      // - which would make this shared case fail on one screen for a reason about a different one.
      expect(screen.getByText(overline, { selector: 'p' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    },
  );

  it.each(SCREENS)('%s renders exactly one page-level heading', async (_name, Page) => {
    // Transactions now renders an h2 below the header in two of its three states, which
    // is what this assertion is for: the page keeps exactly one h1 either way.
    await renderScreen(Page);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

describe('the header action, which differs on every screen', () => {
  it('Dashboard offers the period select and Add transaction', async () => {
    // AC2 and AC3. The period select is Dashboard's alone among the four.
    await renderScreen(DashboardPage);

    expect(screen.getByRole('combobox', { name: 'Budgeting period' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add transaction' })).toBeInTheDocument();
  });

  it('Dashboard offers one option per period the account has', async () => {
    // **This asserted the opposite shape until PET-72**, and the old version is worth recording: it
    // pinned that the pill read "October" while the overline read "October 2025", because the design
    // draws a shorter label in the control than above it. There is one label per period now, so the
    // two deliberately match - a period a pay-day change stretched has no short form that is not
    // month arithmetic. What is worth pinning instead is that the list is the account's own history
    // rather than the one period being viewed.
    await renderScreen(DashboardPage);

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'October 2025',
      'September 2025',
    ]);
  });

  it('Transactions offers the search field and Add transaction, and no month select', async () => {
    // The ticket's AC3 claims a month select here too. TRN-1 and Figma node
    // 26:137 both draw a search field instead, and this pins which one shipped.
    //
    // By role rather than by text as of PET-29: the placeholder used to be a text node in an
    // inert <div>, and `getByText` on it now silently finds nothing.
    await renderScreen(TransactionsPage);

    expect(screen.getByRole('textbox', { name: 'Search transactions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add transaction' })).toBeInTheDocument();
    // No period select either, which PET-72 makes worth stating by role rather than by text: this
    // screen chooses its period through the filter bar's own pill under `<main>`, so the assertion
    // is scoped to the header rather than sweeping a page that really does hold three comboboxes.
    const header = screen.getByRole('banner');

    expect(within(header).queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('AI Insights offers Regenerate', async () => {
    // Absent from the ticket text, present in INS-1 and in node 38:542.
    await renderScreen(InsightsPage);

    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeInTheDocument();
  });

  it('Settings offers no header action at all', async () => {
    // AC2's second half. "Save changes" belongs at the foot of the form, not up
    // here, so there is no control in the header to find.
    //
    // **Scoped to the `<header>` as of PET-46, and the criterion it pins is unchanged.** It used
    // to sweep the whole page for buttons and links, which was the same assertion only while the
    // `<main>` below was empty - so the moment this screen grew its form and its Save button, a
    // page-wide sweep would have failed for a reason having nothing to do with the header. What
    // AC2 says is that the header carries no action, and that is what this now measures.
    const { container } = await renderScreen(SettingsPage);
    const header = container.querySelector('header');

    expect(header).not.toBeNull();
    expect(within(header!).queryAllByRole('button')).toHaveLength(0);
    expect(within(header!).queryAllByRole('link')).toHaveLength(0);
  });
});

describe('the inert header controls', () => {
  it('does expose the period select as an operable control, which reverses A8', async () => {
    // **The last of the drawn-but-dead header controls, and PET-72 is the ticket A8 was waiting
    // for.** That assumption said the pill renders the current period and does nothing "until month
    // navigation is designed", so it shipped as a `<div>` rather than as a control announcing itself
    // as operable - and this case pinned exactly that, with `queryByRole('combobox')` empty. The
    // assertion inverts rather than being deleted: a `<div>` creeping back here would be a
    // regression now, the same way it is for the search field below.
    await renderScreen(DashboardPage);

    const select = screen.getByRole('combobox', { name: 'Budgeting period' });

    expect(select.tagName).toBe('SELECT');
    expect(select).toHaveValue(PERIOD.start);
  });

  it('does expose the search field as a text box, which reverses PET-30', async () => {
    // This asserted the opposite for three tickets, and the reason it did has gone: the
    // field was inert because there was no list to filter and then because there was no
    // query to drive it. PET-29 is the ticket that owned both, so the assertion inverts
    // rather than being deleted - a `<div>` creeping back here would be a regression.
    await renderScreen(TransactionsPage);

    expect(screen.getByRole('textbox', { name: 'Search transactions' })).toBeInTheDocument();
    // Still not `type="search"`: Chrome and Safari draw their own cancel button on one, and
    // this frame does not.
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('exposes both tabs as links, without claiming to be a tablist', async () => {
    // **The inversion of a four-ticket-old assertion, and worth reading as such.** Both tabs
    // were inert because "Categories" opened frame 13, which had no `page.tsx` behind it while
    // `routes.test.ts` asserts with `fs` that every declared route does. PET-36 built that
    // route, so the constraint is gone.
    //
    // The half that survives is `role="tab"`. These two navigate between routes rather than
    // swapping a panel in place, so the bar is a `<nav>` of links and the ARIA tab pattern -
    // which promises an `aria-controls` relationship to a `tabpanel` in the same document -
    // would be a lie. Pinning the absence is what stops a future "use the real tablist"
    // landing without the panel it implies.
    await renderScreen(TransactionsPage);

    expect(screen.queryByRole('tab')).not.toBeInTheDocument();

    expect(screen.getByRole('link', { name: /All transactions/ })).toHaveAttribute(
      'href',
      '/transactions',
    );
    expect(screen.getByRole('link', { name: /Categories/ })).toHaveAttribute(
      'href',
      '/transactions/categories',
    );
  });

  it('exposes exactly the three filter selects the design draws', async () => {
    // The Dashboard assertion above pins that a `combobox` on *that* page would be a bug.
    // Here three of them are the feature, so the count is what is worth holding: a fourth
    // means a control nobody designed.
    await renderScreen(TransactionsPage);

    expect(
      screen.getAllByRole('combobox').map((select) => select.getAttribute('aria-label')),
    ).toEqual(['Category', 'Period', 'Sort']);
  });

  it.each(SCREENS)('%s mounts no modal until a trigger is used', async (_name, Page) => {
    // **The two assertions above depend on this**, which is worth stating because the
    // dependency is invisible. `AddTransactionProvider` renders the modal only while it is
    // open, and the modal contains a real `<select>` and a real `<input>` - so an
    // always-mounted version would put a combobox and a textbox on Dashboard and
    // Transactions and break the searches above for reasons having nothing to do with the
    // header pills they are about.
    //
    // A closed `<dialog>` would not be enough either: it is `display: none`, so
    // `queryByRole` cannot see inside it, but `queryAllByText` and `queryAllByLabelText`
    // **can** - which is why "renders nothing" rather than "is closed" is the requirement,
    // and why the label query is here beside the role one.
    // PET-33 adds a second dialog to the shell and the same requirement to it, which is why
    // the text query below joins the label one: the delete confirmation has no form, so
    // `queryByLabelText` would never have noticed an always-mounted copy of it.
    // PET-32 adds a third, and it is the sharpest case of all: the edit modal draws the *same
    // five labels* as the Add modal, so an always-mounted one would make `getByLabelText('Amount')`
    // ambiguous rather than merely present - which is why the count is asserted below rather than
    // only the absence.
    await renderScreen(Page);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryAllByLabelText('Amount')).toHaveLength(0);
    expect(screen.queryAllByText('Note (optional)')).toHaveLength(0);
    expect(screen.queryByText('Delete this transaction?')).not.toBeInTheDocument();
  });
});

describe("Dashboard's empty state is one condition, not five (PET-26)", () => {
  // `page.tsx` resolves `isEmpty` once, off `transactionCount`, and threads the same boolean to
  // `BudgetCard`, `TrendCard`, `RecentTransactionsCard` and `InsightTeaserCard`. The risk this
  // pins against is a page that computed the flag five different ways - `spent === 0` for one
  // card, the card's own array length for another - which can disagree in principle even though
  // they happen to agree on every response the backend can send today. So this fixture is
  // deliberately inconsistent: `transactionCount: 0` beside a nonzero `spent` and real-looking
  // `weeklyBuckets` and `recentTransactions`, which is unreachable through the real contract but
  // is exactly the input that would expose a card quietly reading its own field instead of the
  // shared one.
  it('keys every card off `transactionCount`, not off its own field', async () => {
    (readDashboard as jest.Mock).mockResolvedValue({
      spent: 50,
      monthlyBudget: 2000,
      remaining: 1950,
      // 31 rather than 8: `BudgetCard`'s caption needs a `daysLeft` proving the period has
      // barely started before it will draw the frame's copy, so a late-period value would make
      // the assertion below fail for a reason that has nothing to do with the threading this
      // test is about. `BudgetCard.test.tsx` owns that condition.
      daysLeft: 31,
      transactionCount: 0,
      averagePerDay: 0,
      topCategory: null,
      weeklyBuckets: [{ startDate: '2025-10-01', endDate: '2025-10-08', total: 50 }],
      categories: [],
      recentTransactions: [
        {
          id: 't1',
          merchant: 'Whole Foods',
          categoryId: 'cat-1',
          amount: 50,
          date: '2025-10-08',
          note: null,
          createdAt: '2025-10-08T12:00:00.000Z',
          updatedAt: '2025-10-08T12:00:00.000Z',
        },
      ],
      insight: null,
      period: PERIOD,
    });

    await renderScreen(DashboardPage);

    expect(screen.getByText('Full month ahead')).toBeInTheDocument();
    expect(screen.getByText('No spending to chart yet')).toBeInTheDocument();
    expect(screen.getByText('No transactions yet')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Insights unlock after your first expense.' }),
    ).toBeInTheDocument();
  });
});

describe("the profile's currency reaches the figures (PET-47)", () => {
  // **The one test that proves the whole server-side thread**, which nothing else does. Every
  // card has its own suite passing `currency="USD"` by hand, so a `page.tsx` that stopped reading
  // the profile - or read it and forgot to pass it on - would leave all of those green while the
  // app rendered a euro account in dollars. This renders the real page against a real profile and
  // asserts the symbol that could only have come through it.
  //
  // Deliberately at the page level rather than per card, and deliberately EUR rather than USD:
  // the default is what a broken thread falls back to, so asserting dollars proves nothing.
  it('renders the dashboard in the profile currency', async () => {
    (requireProfile as jest.Mock).mockResolvedValue({
      fullName: 'Marko Kovač',
      email: 'marko@email.com',
      currency: 'EUR',
      monthlyBudget: 2000,
      monthStartDay: 1,
    });
    (readDashboard as jest.Mock).mockResolvedValue({
      spent: 1240,
      monthlyBudget: 2000,
      remaining: 760,
      daysLeft: 8,
      transactionCount: 12,
      averagePerDay: 155,
      topCategory: null,
      weeklyBuckets: [],
      categories: [],
      recentTransactions: [],
      insight: null,
      period: PERIOD,
    });

    await renderScreen(DashboardPage);

    // `getAllBy`, because two cards draw the period's spend - the budget card's headline and the
    // donut's centre readout - and both arriving in euros is the point rather than an annoyance.
    expect(screen.getAllByText('€1,240').length).toBeGreaterThan(1);
    expect(screen.getByText('of €2,000')).toBeInTheDocument();
    expect(screen.queryAllByText('$1,240')).toHaveLength(0);
  });

  it('renders the transactions table in the profile currency', async () => {
    (requireProfile as jest.Mock).mockResolvedValue({
      fullName: 'Marko Kovač',
      email: 'marko@email.com',
      currency: 'GBP',
      monthlyBudget: 2000,
      monthStartDay: 1,
    });
    (readTransactionsView as jest.Mock).mockResolvedValue({
      state: 'populated',
      transactions: [
        {
          id: 't1',
          merchant: 'Whole Foods',
          categoryId: 'cat-1',
          amount: 86.4,
          date: '2025-10-08',
          note: null,
          createdAt: '2025-10-08T12:00:00.000Z',
          updatedAt: '2025-10-08T12:00:00.000Z',
        },
      ],
      total: 1,
    });

    await renderScreen(TransactionsPage);

    expect(screen.getByText('−£86.40')).toBeInTheDocument();
  });
});

describe("the period's label reaches the header, from the read rather than the profile (PET-72)", () => {
  // **This block replaces PET-47's, and the replacement is the point of the ticket on these three
  // screens.** That one proved the profile's `monthStartDay` reached the header, by setting it to 15
  // against a clock pinned to 8 October and asserting the overline read "September / October 2025" -
  // the period the day actually falls in. The thread it proved is gone: a period is anchored to a
  // paycheck now, a pay-schedule change stretches one across the gap, and no arithmetic over a start
  // day can name the result. So the label rides on the response, and what is worth proving is that
  // each page renders the label it was *given* rather than one it composed.
  //
  // Asserted at the page level for the reason the currency cases above are: every screen suite hands
  // in a period fixture by hand, so a page that dropped the field would leave all of them green.

  /** A period no month arithmetic could name: the stretched one a pay-day change produces. */
  const STRETCHED = {
    start: '2025-12-15',
    end: '2026-01-14',
    label: 'December 2025 / January 2026',
    current: true,
  };

  it('Dashboard names the period the dashboard read answered with', async () => {
    (readDashboard as jest.Mock).mockResolvedValue({
      spent: 0,
      monthlyBudget: 2000,
      remaining: 2000,
      daysLeft: 8,
      transactionCount: 0,
      averagePerDay: 0,
      topCategory: null,
      weeklyBuckets: [],
      categories: [],
      recentTransactions: [],
      insight: null,
      period: STRETCHED,
    });

    await renderScreen(DashboardPage);

    expect(screen.getByText(STRETCHED.label, { selector: 'p' })).toBeInTheDocument();
  });

  it('Transactions names the period the list read answered with', async () => {
    (readTransactionsView as jest.Mock).mockResolvedValue({
      state: 'populated',
      transactions: [],
      total: 3,
      period: STRETCHED,
    });

    await renderScreen(TransactionsPage);

    expect(screen.getByText(STRETCHED.label)).toBeInTheDocument();
  });

  it('Transactions names every period when the list spans all of them', async () => {
    // `period=all` is the one filter whose response carries **no** period, which the contract states
    // in as many words: a list covering every period has no single label. So this is the one overline
    // in the app that is not the backend's, and it is the same string the filter pill offers.
    (readTransactionsView as jest.Mock).mockResolvedValue({
      state: 'populated',
      transactions: [],
      total: 3,
      period: null,
    });

    await renderScreen(TransactionsPage);

    expect(screen.getByText('All time', { selector: 'p' })).toBeInTheDocument();
  });

  it('AI Insights names the current period, which is the one its set is for', async () => {
    // The one header of the four whose label does not ride on its own screen's read.
    // `GET /api/insights` publishes no period - a set is generated for the current period only, and
    // its `monthLabel` names the period it was generated *in* - so this page asks `/api/periods` and
    // takes the entry flagged current.
    (readPeriods as jest.Mock).mockResolvedValue({
      periods: [{ ...PERIOD, current: false }, STRETCHED],
    });

    await renderScreen(InsightsPage);

    expect(screen.getByText(STRETCHED.label)).toBeInTheDocument();
    expect(screen.queryByText(PERIOD.label)).not.toBeInTheDocument();
  });
});

describe('the query string reaching the list read', () => {
  // The one seam nothing else covers: `filters.test.ts` proves the parser and
  // `lib/transactions.test.ts` proves the read, but only this file renders the page that
  // joins them. It matters because the failure is not a filter that does nothing - an
  // invalid value is a 400, which `readTransactions` throws on, so the screen is replaced by
  // `app/error.tsx` rather than rendered with one filter missing.

  async function renderWith(searchParams: Record<string, string | string[]>) {
    return render(
      <AddTransactionProvider>
        {await TransactionsPage({ searchParams: Promise.resolve(searchParams) })}
      </AddTransactionProvider>,
    );
  }

  it('forwards the filters the URL carries', async () => {
    await renderWith({ search: 'Whole', sort: 'date_asc' });

    expect(readTransactionsView).toHaveBeenCalledWith({ search: 'Whole', sort: 'date_asc' });
  });

  it('forwards nothing at all for a bare /transactions', async () => {
    await renderWith({});

    expect(readTransactionsView).toHaveBeenCalledWith({});
  });

  it('drops every value the backend would reject rather than passing it on', async () => {
    await renderWith({ sort: 'lol', period: 'yearly', categoryId: 'groceries' });

    expect(readTransactionsView).toHaveBeenCalledWith({});
  });

  it('reads the categories the rows are joined against', async () => {
    await renderWith({});

    expect(readCategoryLabels).toHaveBeenCalledTimes(1);
  });
});

describe('when the categories read fails', () => {
  // The branch with the longest comment in `page.tsx` and, until now, no test. It is also the
  // one most likely to be "simplified" into a redirect later, which is the mistake that comment
  // warns against - `lib/categories.ts` must never redirect, because its other caller is the
  // route handler answering the Add transaction modal's fetch, where a redirect hands an open
  // modal an HTML login page with a 200 on it. So the policy lives here and is asserted here.

  async function renderTransactions() {
    return render(
      <AddTransactionProvider>
        {await TransactionsPage({ searchParams: Promise.resolve({}) })}
      </AddTransactionProvider>,
    );
  }

  it('redirects to login on a 401, matching the transactions read beside it', async () => {
    // Two guarded reads on one page is fine; two *opinions* about whether the session is alive
    // is the shape the /dashboard-to-/login loop came out of, so both must answer identically.
    (readCategoryLabels as jest.Mock).mockResolvedValue({
      ok: false,
      reason: 'unauthenticated',
    });

    await expect(renderTransactions()).rejects.toThrow('NEXT_REDIRECT');
  });

  it('throws on an unavailable backend rather than redirecting', async () => {
    // A reload retries; a redirect to /login would bounce a live session straight back.
    (readCategoryLabels as jest.Mock).mockResolvedValue({ ok: false, reason: 'unavailable' });

    await expect(renderTransactions()).rejects.toThrow(/Could not load your categories/);
  });

  it('does not render a table with every category cell blank', async () => {
    // The tempting alternative to throwing. It produces a screen that looks broken and says
    // nothing about why, on a page whose transactions loaded perfectly well.
    (readCategoryLabels as jest.Mock).mockResolvedValue({ ok: false, reason: 'unavailable' });

    await expect(renderTransactions()).rejects.toThrow();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
