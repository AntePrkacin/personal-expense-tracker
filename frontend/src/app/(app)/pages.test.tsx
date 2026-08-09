import { screen, within } from '@testing-library/react';

// `render` comes from the shell wrapper: these pages render inside `(app)/layout.tsx` in
// production, so the cards below reach `PreferencesProvider` there. See `shellRender.tsx`.
import { render } from './shellRender';

import { readCategoryLabels } from '../../lib/categories';
import { readDashboard } from '../../lib/dashboard';
import { requireInsights } from '../../lib/insights';
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
  });

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
    firstName: 'Marko',
    lastName: 'Kovač',
    email: 'marko@email.com',
    currency: 'USD',
    monthlyBudget: 2000,
    monthStartDay: 1,
  });
});

// October 2025 is the month the whole Figma file is drawn in, so pinning the
// clock lets these assert the designed strings literally rather than recomputing
// them, which would pass against a broken derivation.
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

      expect(screen.getByText(overline)).toBeInTheDocument();
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
  it('Dashboard offers the month select and Add transaction', async () => {
    // AC2 and AC3. The month select is Dashboard's alone.
    await renderScreen(DashboardPage);

    expect(screen.getByText('October')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add transaction' })).toBeInTheDocument();
  });

  it('Dashboard shows the month without the year in the select', async () => {
    // Two near-identical strings sit in this header. getByText is exact by
    // default, so "October" would not match "October 2025" - this asserts the
    // select really carries the shorter form rather than the overline twice.
    await renderScreen(DashboardPage);

    const select = screen.getByText('October');
    expect(select).not.toHaveTextContent('2025');
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
    expect(screen.queryByText('October')).not.toBeInTheDocument();
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
  it('does not expose the month select as an operable control', async () => {
    // A8: only October exists, so it renders the current period and does
    // nothing. It is a <div> rather than a <select> or a <button> so it never
    // announces itself as operable.
    await renderScreen(DashboardPage);

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('October').tagName).toBe('DIV');
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
      firstName: 'Marko',
      lastName: 'Kovač',
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
      firstName: 'Marko',
      lastName: 'Kovač',
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

describe("the profile's month start day reaches the header (PET-47)", () => {
  // The other half of the thread, and the closing of a `docs/TODO.md` entry open since PET-19.
  // The clock is pinned to 8 October 2025 for the whole file, so at a start day of 15 today falls
  // in the period that opened on 15 September - which is exactly the case the old header got
  // wrong, naming "October" over figures drawn from 15 Sep to 15 Oct.
  //
  // Asserted at the page level for the same reason the currency tests above are: every screen
  // suite passes `monthStartDay={1}` by hand, so a page that stopped reading the profile would
  // leave all of them green.

  function withMonthStartDay(monthStartDay: number) {
    (requireProfile as jest.Mock).mockResolvedValue({
      firstName: 'Marko',
      lastName: 'Kovač',
      email: 'marko@email.com',
      currency: 'USD',
      monthlyBudget: 2000,
      monthStartDay,
    });
  }

  it.each([
    ['Dashboard', DashboardPage],
    ['Transactions', TransactionsPage],
    ['AI Insights', InsightsPage],
  ])('%s names both months of the period when the start day is not the 1st', async (_n, Page) => {
    withMonthStartDay(15);

    await renderScreen(Page);

    expect(screen.getByText('September / October 2025')).toBeInTheDocument();
    expect(screen.queryByText('October 2025')).not.toBeInTheDocument();
  });

  it('still names one month at the default, so no untouched account sees a change', async () => {
    // The regression that matters most: almost every account is on the default, and this fix must
    // be invisible to all of them.
    withMonthStartDay(1);

    await renderScreen(DashboardPage);

    expect(screen.getByText('October 2025')).toBeInTheDocument();
    expect(screen.queryByText('September / October 2025')).not.toBeInTheDocument();
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
