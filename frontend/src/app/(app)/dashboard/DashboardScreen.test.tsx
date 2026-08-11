import { render, screen } from '@testing-library/react';

import { AddTransactionProvider } from '../AddTransactionProvider';
import { DashboardScreen } from './DashboardScreen';

// 04 Dashboard (Figma node 21:4). The header is `DashboardPage`'s own from PET-19, moved here
// unchanged; what is new is the five-slot grid PET-21 through PET-26 draw into.
//
// The router is mocked because the header's period select is a real control as of PET-72 and
// navigates through `router.replace`. A package specifier, so the `@/` alias trap does not apply.
// Nothing here changes it - `PeriodSelect.test.tsx` owns that behaviour - so this only has to exist.
//
// `useAddTransaction` throws outside its provider by design, and the header's button calls it -
// the same reason `TransactionsScreen.test.tsx` wraps every render.
function renderScreen(screenElement: React.ReactNode) {
  return render(<AddTransactionProvider>{screenElement}</AddTransactionProvider>);
}

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), refresh: jest.fn() }),
}));

// The period every figure on the screen belongs to, and the list the select offers. Both come off the
// response as of PET-72, which is what let this suite drop its fake timers: the header used to
// compose its overline from a start day and the clock, so the month it named was the test's to set.
const PERIOD = { start: '2025-10-01', end: '2025-11-01', label: 'October 2025', current: true };

const PERIODS = [
  PERIOD,
  { start: '2025-09-01', end: '2025-10-01', label: 'September 2025', current: false },
];

const SLOT = (testId: string, label: string) => <div data-testid={testId}>{label}</div>;

const SLOTS = {
  budgetCard: SLOT('budget-card', 'Budget'),
  trendCard: SLOT('trend-card', 'Trend'),
  donutCard: SLOT('donut-card', 'Donut'),
  recentTransactionsCard: SLOT('recent-card', 'Recent'),
  insightCard: SLOT('insight-card', 'Insight'),
  period: PERIOD,
  periods: PERIODS,
};

describe('the header', () => {
  it('shows the designed overline and title', () => {
    renderScreen(<DashboardScreen {...SLOTS} />);

    // The overline and the select's chosen option are the same label, which is what makes them one
    // fact rather than two - so this looks inside the header's own paragraph rather than sweeping
    // the page, where the option below carries the identical string.
    expect(screen.getByText('October 2025', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  });

  it('shows the period select and the Add transaction button', () => {
    // **The inversion of what this suite asserted for four tickets.** The month pill was an inert
    // `<div>` by decision, because A8 said it renders the current period and does nothing "until
    // month navigation is designed"; PET-72 designs it, so the assertion is turned over rather than
    // deleted - a real `<select>` naming itself, with one option per period the account has.
    renderScreen(<DashboardScreen {...SLOTS} />);

    const select = screen.getByRole('combobox', { name: 'Budgeting period' });

    expect(select).toHaveValue(PERIOD.start);
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'October 2025',
      'September 2025',
    ]);
    expect(screen.getByRole('button', { name: 'Add transaction' })).toBeInTheDocument();
  });
});

describe('the five card slots', () => {
  it('renders every one of them', () => {
    renderScreen(<DashboardScreen {...SLOTS} />);

    expect(screen.getByTestId('budget-card')).toBeInTheDocument();
    expect(screen.getByTestId('trend-card')).toBeInTheDocument();
    expect(screen.getByTestId('donut-card')).toBeInTheDocument();
    expect(screen.getByTestId('recent-card')).toBeInTheDocument();
    expect(screen.getByTestId('insight-card')).toBeInTheDocument();
  });

  it('puts all five inside main, below the header', () => {
    const { container } = renderScreen(<DashboardScreen {...SLOTS} />);
    const main = container.querySelector('main');

    for (const testId of [
      'budget-card',
      'trend-card',
      'donut-card',
      'recent-card',
      'insight-card',
    ]) {
      expect(main).toContainElement(screen.getByTestId(testId));
    }
  });

  it('keeps the budget, trend and recent cards in the left column, in order', () => {
    renderScreen(<DashboardScreen {...SLOTS} />);
    const left = screen.getByTestId('budget-card').parentElement;

    expect(left?.children[0]).toBe(screen.getByTestId('budget-card'));
    expect(left?.children[1]).toBe(screen.getByTestId('trend-card'));
    expect(left?.children[2]).toBe(screen.getByTestId('recent-card'));
  });

  it('keeps the donut and insight cards in the right column, in order', () => {
    renderScreen(<DashboardScreen {...SLOTS} />);
    const right = screen.getByTestId('donut-card').parentElement;

    expect(right?.children[0]).toBe(screen.getByTestId('donut-card'));
    expect(right?.children[1]).toBe(screen.getByTestId('insight-card'));
  });
});
