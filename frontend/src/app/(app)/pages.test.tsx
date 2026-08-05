import { render, screen } from '@testing-library/react';

import { readTransactionsView } from '../../lib/transactions';

import { AddTransactionProvider } from './AddTransactionProvider';
import DashboardPage from './dashboard/page';
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

// Two of these screens now hold an "Add transaction" trigger that calls
// `useAddTransaction`, which throws outside its provider by design - so every render
// here goes through `renderScreen()` below rather than through `render()` directly. The
// provider is honest rather than convenient: in production no page renders outside the
// shell's layout, which is where it lives. Same call SetupCategoriesScreen.test.tsx
// makes about SetupDraftProvider.
//
// `next/navigation` is mocked because the modal the provider mounts reaches useRouter
// for its refresh. Nothing here opens it, but the provider's subtree is rendered.
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }));

/** Renders a page inside the shell's provider, awaiting it whether or not it is async. */
async function renderScreen(Page: () => React.ReactNode | Promise<React.ReactNode>) {
  // Awaiting a synchronous component's return value is a no-op, so one call site covers
  // all four - which is the property PET-30 relied on when Transactions became async.
  return render(<AddTransactionProvider>{await Page()}</AddTransactionProvider>);
}

// The populated state deliberately, even though the empty one is PET-30's subject.
// This file asserts the *header*, and the empty card carries a second "Add
// transaction" button that would make the getByRole below ambiguous. The three states
// are TransactionsScreen.test.tsx's, where they can be asserted without a page around
// them. No `table` is passed, so main holds only the tab bar.
beforeEach(() => {
  (readTransactionsView as jest.Mock).mockResolvedValue({
    state: 'populated',
    transactions: [],
    total: 128,
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
    await renderScreen(TransactionsPage);

    expect(screen.getByText('Search transactions')).toBeInTheDocument();
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

  it('does not expose the search field as a text box', async () => {
    // Same reasoning, applied to a control TRN-1 does describe as real. The list it
    // filters exists now, as of PET-30, but the query that would drive it does not -
    // PET-29 owns turning this into an `<input>` plus the state behind it.
    await renderScreen(TransactionsPage);

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('does not expose either tab as an operable control', async () => {
    // "Categories" opens frame 13, which is PET-36's route and has no page.tsx behind
    // it - and routes.test.ts asserts with `fs` that every declared route does. So a
    // link here would 404 or force a hole into that check.
    await renderScreen(TransactionsPage);

    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Categories').tagName).toBe('SPAN');
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
    await renderScreen(Page);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Amount')).not.toBeInTheDocument();
  });
});
