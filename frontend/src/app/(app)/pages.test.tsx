import { render, screen } from '@testing-library/react';

import { readCategoryLabels } from '../../lib/categories';
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
// Three of the four are still plain Server Components with no data of their own.
// **Transactions is not, as of PET-30**: it awaits `readTransactionsView()`, so it is
// mocked here and every page goes through the `renderScreen` helper below - which works
// uniformly, since awaiting a synchronous component's return value is a no-op. The
// layout that wraps them is not exercised here - SidebarNav.test.tsx covers the
// sidebar half.
//
// A relative specifier, because `jest.mock` cannot resolve the `@/` alias from
// anywhere in this repo - see the note in frontend/src/app/CLAUDE.md.
jest.mock('../../lib/transactions', () => ({ readTransactionsView: jest.fn() }));

// PET-29 gives that page a second read: a row carries only a `categoryId`, so the name and
// colour the table draws are joined on from the category list. Same relative specifier, same
// reason.
jest.mock('../../lib/categories', () => ({ readCategoryLabels: jest.fn() }));

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
  ['AI Insights', InsightsPage, 'Your money assistant', 'AI Insights'],
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
    await renderScreen(SettingsPage);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
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

  it('does not expose either tab as an operable control', async () => {
    // "Categories" opens frame 13, which is PET-36's route and has no page.tsx behind
    // it - and routes.test.ts asserts with `fs` that every declared route does. So a
    // link here would 404 or force a hole into that check.
    //
    // **This still holds by decision rather than by absence of features.** PET-29 made every
    // other control on the page real and deliberately left these two, so the assertion is
    // now the record of that choice rather than a description of an unbuilt screen.
    //
    // **The page-wide `queryByRole('link')` that used to sit here is gone, and deliberately
    // not replaced by a count.** It covered two claims at once - the tabs are not links, and a
    // row is not clickable - and PET-34 made the second one false. Worse, it would still
    // *pass*: this file mocks the list to `transactions: []`, so there are no rows to link
    // and the assertion would quietly go vacuous while its comment still claimed to be
    // pinning something. So each tab is now checked directly, which is the claim that
    // survives.
    await renderScreen(TransactionsPage);

    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByText('Categories').tagName).toBe('SPAN');
    expect(screen.getByText('Categories').closest('a')).toBeNull();
    expect(screen.getByText('All transactions').closest('a')).toBeNull();
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

describe('the query string reaching the list read', () => {
  // The one seam nothing else covers: `filters.test.ts` proves the parser and
  // `lib/transactions.test.ts` proves the read, but only this file renders the page that
  // joins them. It matters because the failure is not a filter that does nothing - an
  // invalid value is a 400, which `readTransactions` throws on, and there is no `error.tsx`
  // in this app for it to land in.

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
