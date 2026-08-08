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
    color: 'success' as const,
    spent: 397,
  },
  isEmpty: false,
};

// No fake clock, deliberately: every figure on this card comes off the response, and the
// caption stopped naming a month precisely because a month name could only come from the
// frontend host's clock while `daysLeft` is counted against the profile's `monthStartDay`.
// A `setSystemTime` here would be a claim that this component reads a clock, which it does not.

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

  it('shows the amount left and the days left in the period', () => {
    render(<BudgetCard {...ON_TRACK} />);

    expect(screen.getByText('$760 left')).toBeInTheDocument();
    expect(screen.getByText('8 days left')).toBeInTheDocument();
  });

  it('names no month, because `daysLeft` counts a period a month name cannot describe', () => {
    // The frame draws "8 days left in October". `daysLeft` is counted against the profile's
    // `monthStartDay`, so at 15 the period spans two calendar months and any month name here
    // would be a false statement beside a true count.
    render(<BudgetCard {...ON_TRACK} />);

    expect(screen.queryByText(/days left in/i)).not.toBeInTheDocument();
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

describe('the last day of the period', () => {
  it('says "1 day left", not "1 days left"', () => {
    // `daysLeft` is documented as 1 on the last day and never 0, so this is a state every
    // account reaches once a period rather than an edge case.
    render(<BudgetCard {...ON_TRACK} daysLeft={1} />);

    expect(screen.getByText('1 day left')).toBeInTheDocument();
    expect(screen.queryByText('1 days left')).not.toBeInTheDocument();
  });
});

describe('the two whole-dollar figures, which have to agree with each other', () => {
  it('derives the remainder from the rounded spend rather than rounding it separately', () => {
    // 1240.50 and 759.50 each round up on their own, so three independent `formatWhole` calls
    // print "$1,241 of $2,000" beside "$760 left" - 2001 on a 2000 budget.
    render(<BudgetCard {...ON_TRACK} spent={1240.5} remaining={759.5} />);

    expect(screen.getByText('$1,241')).toBeInTheDocument();
    expect(screen.getByText('of $2,000')).toBeInTheDocument();
    expect(screen.getByText('$759 left')).toBeInTheDocument();
  });
});

describe('an empty account', () => {
  it('renders a dash for the top category rather than deferring it', () => {
    render(<BudgetCard {...ON_TRACK} topCategory={null} />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('the empty state (AC2, PET-26)', () => {
  it('swaps the caption to "Full month ahead" rather than the days-left count', () => {
    render(<BudgetCard {...ON_TRACK} isEmpty={true} daysLeft={31} topCategory={null} />);

    expect(screen.getByText('Full month ahead')).toBeInTheDocument();
    expect(screen.queryByText(/days? left/)).not.toBeInTheDocument();
  });

  it('reads "$0 of {the budget}" off real zero values rather than a hardcoded figure', () => {
    // AC2's "$0 of $2,000" is exactly what a zero `spent` already formats to - the load-bearing
    // fact `docs/plans/2026-08-06_PET-26_dashboard-empty-state.md` names, and the one this test
    // would catch a hardcoded budget breaking.
    render(
      <BudgetCard
        {...ON_TRACK}
        isEmpty={true}
        daysLeft={31}
        spent={0}
        remaining={2000}
        transactionCount={0}
        averagePerDay={0}
        topCategory={null}
      />,
    );

    // "$0" appears twice - the spend readout and the Avg/day tile - so this checks the count
    // rather than picking one, which a `getByText` here cannot disambiguate.
    expect(screen.getAllByText('$0')).toHaveLength(2);
    expect(screen.getByText('of $2,000')).toBeInTheDocument();
    expect(screen.getByText('$2,000 left')).toBeInTheDocument();
  });

  it('needs `isEmpty`, since `daysLeft` alone carries no signal about emptiness', () => {
    // The half that was right in the first version: `daysLeft` counts down identically whether
    // or not anything has ever been spent, so no value of it can put this caption on the card.
    render(<BudgetCard {...ON_TRACK} isEmpty={false} daysLeft={31} />);

    expect(screen.getByText('31 days left')).toBeInTheDocument();
    expect(screen.queryByText('Full month ahead')).not.toBeInTheDocument();
  });

  it('keeps the accurate count for an account that is empty late in its period', () => {
    // The review finding, stated directly. A period starting on the 1st, nothing logged by the
    // 28th: `daysLeft` is 4 and "Full month ahead" would be a false sentence replacing a true
    // one. Every light account passes through this state, so it is not an edge case.
    render(<BudgetCard {...ON_TRACK} isEmpty={true} daysLeft={4} topCategory={null} />);

    expect(screen.getByText('4 days left')).toBeInTheDocument();
    expect(screen.queryByText('Full month ahead')).not.toBeInTheDocument();
  });

  it('holds the frame\'s copy down to the shortest period a "full month" can be', () => {
    // 28 is February's own length rather than a chosen cutoff, which is what makes the claim
    // safe in every month: at `daysLeft` of 28 at most three days have elapsed whatever the
    // period's real length is. One day below it, the card stops claiming.
    const { unmount } = render(
      <BudgetCard {...ON_TRACK} isEmpty={true} daysLeft={28} topCategory={null} />,
    );
    expect(screen.getByText('Full month ahead')).toBeInTheDocument();
    unmount();

    render(<BudgetCard {...ON_TRACK} isEmpty={true} daysLeft={27} topCategory={null} />);
    expect(screen.getByText('27 days left')).toBeInTheDocument();
    expect(screen.queryByText('Full month ahead')).not.toBeInTheDocument();
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
