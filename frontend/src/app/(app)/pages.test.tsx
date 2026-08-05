import { render, screen } from '@testing-library/react';

import { readTransactionsView } from '../../lib/transactions';

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
// mocked here and every page is rendered through `await Page()` - which works
// uniformly, since awaiting a synchronous component's return value is a no-op. The
// layout that wraps them is not exercised here - SidebarNav.test.tsx covers the
// sidebar half.
//
// A relative specifier, because `jest.mock` cannot resolve the `@/` alias from
// anywhere in this repo - see the note in frontend/src/app/CLAUDE.md.
jest.mock('../../lib/transactions', () => ({ readTransactionsView: jest.fn() }));

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
      render(await Page());

      expect(screen.getByText(overline)).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    },
  );

  it.each(SCREENS)('%s renders exactly one page-level heading', async (_name, Page) => {
    // Transactions now renders an h2 below the header in two of its three states, which
    // is what this assertion is for: the page keeps exactly one h1 either way.
    render(await Page());

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

describe('the header action, which differs on every screen', () => {
  it('Dashboard offers the month select and Add transaction', () => {
    // AC2 and AC3. The month select is Dashboard's alone.
    render(<DashboardPage />);

    expect(screen.getByText('October')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add transaction' })).toBeInTheDocument();
  });

  it('Dashboard shows the month without the year in the select', () => {
    // Two near-identical strings sit in this header. getByText is exact by
    // default, so "October" would not match "October 2025" - this asserts the
    // select really carries the shorter form rather than the overline twice.
    render(<DashboardPage />);

    const select = screen.getByText('October');
    expect(select).not.toHaveTextContent('2025');
  });

  it('Transactions offers the search field and Add transaction, and no month select', async () => {
    // The ticket's AC3 claims a month select here too. TRN-1 and Figma node
    // 26:137 both draw a search field instead, and this pins which one shipped.
    render(await TransactionsPage());

    expect(screen.getByText('Search transactions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add transaction' })).toBeInTheDocument();
    expect(screen.queryByText('October')).not.toBeInTheDocument();
  });

  it('AI Insights offers Regenerate', () => {
    // Absent from the ticket text, present in INS-1 and in node 38:542.
    render(<InsightsPage />);

    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeInTheDocument();
  });

  it('Settings offers no header action at all', () => {
    // AC2's second half. "Save changes" belongs at the foot of the form, not up
    // here, so there is no control in the header to find.
    render(<SettingsPage />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});

describe('the inert header controls', () => {
  it('does not expose the month select as an operable control', () => {
    // A8: only October exists, so it renders the current period and does
    // nothing. It is a <div> rather than a <select> or a <button> so it never
    // announces itself as operable.
    render(<DashboardPage />);

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('October').tagName).toBe('DIV');
  });

  it('does not expose the search field as a text box', async () => {
    // Same reasoning, applied to a control TRN-1 does describe as real. The list it
    // filters exists now, as of PET-30, but the query that would drive it does not -
    // PET-29 owns turning this into an `<input>` plus the state behind it.
    render(await TransactionsPage());

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('does not expose either tab as an operable control', async () => {
    // "Categories" opens frame 13, which is PET-36's route and has no page.tsx behind
    // it - and routes.test.ts asserts with `fs` that every declared route does. So a
    // link here would 404 or force a hole into that check.
    render(await TransactionsPage());

    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Categories').tagName).toBe('SPAN');
  });
});
