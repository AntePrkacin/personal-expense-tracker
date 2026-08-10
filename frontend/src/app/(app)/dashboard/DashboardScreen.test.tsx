import { render, screen } from '@testing-library/react';

import { AddTransactionProvider } from '../AddTransactionProvider';
import { DashboardScreen } from './DashboardScreen';

// 04 Dashboard (Figma node 21:4). The header is `DashboardPage`'s own from PET-19, moved here
// unchanged; what is new is the five-slot grid PET-21 through PET-26 draw into.
//
// `useAddTransaction` throws outside its provider by design, and the header's button calls it -
// the same reason `TransactionsScreen.test.tsx` wraps every render.
function renderScreen(screenElement: React.ReactNode) {
  return render(<AddTransactionProvider>{screenElement}</AddTransactionProvider>);
}

const SLOT = (testId: string, label: string) => <div data-testid={testId}>{label}</div>;

const SLOTS = {
  budgetCard: SLOT('budget-card', 'Budget'),
  trendCard: SLOT('trend-card', 'Trend'),
  donutCard: SLOT('donut-card', 'Donut'),
  recentTransactionsCard: SLOT('recent-card', 'Recent'),
  insightCard: SLOT('insight-card', 'Insight'),
};

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(2025, 9, 8));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('the header', () => {
  it('shows the designed overline and title', () => {
    renderScreen(<DashboardScreen monthStartDay={1} {...SLOTS} />);

    expect(screen.getByText('October 2025')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  });

  it('shows the inert month pill and the Add transaction button', () => {
    renderScreen(<DashboardScreen monthStartDay={1} {...SLOTS} />);

    expect(screen.getByText('October').tagName).toBe('DIV');
    expect(screen.getByRole('button', { name: 'Add transaction' })).toBeInTheDocument();
  });
});

describe('the five card slots', () => {
  it('renders every one of them', () => {
    renderScreen(<DashboardScreen monthStartDay={1} {...SLOTS} />);

    expect(screen.getByTestId('budget-card')).toBeInTheDocument();
    expect(screen.getByTestId('trend-card')).toBeInTheDocument();
    expect(screen.getByTestId('donut-card')).toBeInTheDocument();
    expect(screen.getByTestId('recent-card')).toBeInTheDocument();
    expect(screen.getByTestId('insight-card')).toBeInTheDocument();
  });

  it('puts all five inside main, below the header', () => {
    const { container } = renderScreen(<DashboardScreen monthStartDay={1} {...SLOTS} />);
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
    renderScreen(<DashboardScreen monthStartDay={1} {...SLOTS} />);
    const left = screen.getByTestId('budget-card').parentElement;

    expect(left?.children[0]).toBe(screen.getByTestId('budget-card'));
    expect(left?.children[1]).toBe(screen.getByTestId('trend-card'));
    expect(left?.children[2]).toBe(screen.getByTestId('recent-card'));
  });

  it('keeps the donut and insight cards in the right column, in order', () => {
    renderScreen(<DashboardScreen monthStartDay={1} {...SLOTS} />);
    const right = screen.getByTestId('donut-card').parentElement;

    expect(right?.children[0]).toBe(screen.getByTestId('donut-card'));
    expect(right?.children[1]).toBe(screen.getByTestId('insight-card'));
  });
});
