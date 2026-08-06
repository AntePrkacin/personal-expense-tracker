import { render, screen } from '@testing-library/react';

import { BudgetCard } from './BudgetCard';

// Node 22:55's own numbers, so assertions read the designed strings literally.
const ON_TRACK = {
  spent: 1240,
  monthlyBudget: 2000,
  remaining: 760,
  daysLeft: 8,
  transactionCount: 38,
  averagePerDay: 54,
  topCategory: {
    id: '0198c2a1-0000-7000-8000-0000000000a1',
    name: 'Groceries',
    color: 'green',
    spent: 397,
  },
};

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(2025, 9, 8));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('the on-track state (AC1, AC2, AC3, AC4)', () => {
  it('shows the readout and the budget without cents', () => {
    render(<BudgetCard {...ON_TRACK} />);

    expect(screen.getByText('$1,240')).toBeInTheDocument();
    expect(screen.getByText('of $2,000')).toBeInTheDocument();
  });

  it('shows the "On track" chip', () => {
    render(<BudgetCard {...ON_TRACK} />);

    expect(screen.getByText('On track')).toBeInTheDocument();
    expect(screen.queryByText('Over budget')).not.toBeInTheDocument();
  });

  it("sets the bar's value and max off spent and the budget", () => {
    render(<BudgetCard {...ON_TRACK} />);

    const bar = screen.getByRole('progressbar', { name: 'Monthly budget spent' });
    expect(bar).toHaveAttribute('value', '1240');
    expect(bar).toHaveAttribute('max', '2000');
  });

  it('shows the amount left and the days left in the current month', () => {
    render(<BudgetCard {...ON_TRACK} />);

    expect(screen.getByText('$760 left')).toBeInTheDocument();
    expect(screen.getByText('8 days left in October')).toBeInTheDocument();
  });

  it('shows the three stat tiles: count, average per day and the top category', () => {
    render(<BudgetCard {...ON_TRACK} />);

    expect(screen.getByText('38')).toBeInTheDocument();
    expect(screen.getByText('Transactions')).toBeInTheDocument();
    expect(screen.getByText('$54')).toBeInTheDocument();
    expect(screen.getByText('Avg / day')).toBeInTheDocument();
    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.getByText('Top category')).toBeInTheDocument();
  });
});

describe('an empty account', () => {
  it('renders a dash for the top category rather than deferring it', () => {
    render(<BudgetCard {...ON_TRACK} topCategory={null} />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('the overspent state, which the frame does not draw', () => {
  const OVER_BUDGET = { ...ON_TRACK, spent: 2240, remaining: -240 };

  it('flips the chip to "Over budget"', () => {
    render(<BudgetCard {...OVER_BUDGET} />);

    expect(screen.getByText('Over budget')).toBeInTheDocument();
    expect(screen.queryByText('On track')).not.toBeInTheDocument();
  });

  it('clamps the bar to the max rather than overflowing its track', () => {
    render(<BudgetCard {...OVER_BUDGET} />);

    const bar = screen.getByRole('progressbar', { name: 'Monthly budget spent' });
    expect(bar).toHaveAttribute('value', '2000');
    expect(bar).toHaveAttribute('max', '2000');
  });

  it('shows the magnitude of remaining rather than a formatted negative', () => {
    // "−$240 left" would read as a double negative once the chip already says "Over budget".
    render(<BudgetCard {...OVER_BUDGET} />);

    expect(screen.getByText('$240 left')).toBeInTheDocument();
    expect(screen.queryByText(/−/)).not.toBeInTheDocument();
  });
});
