import { render, screen } from '@testing-library/react';

import { TrendCard } from './TrendCard';

// Node 22:55's own numbers (DSH-6): $280, $410, $250, $300 over Week 1 to Week 4, tiling
// 1-29 October so `todayIsoDate()` under a faked clock lands inside one of them.
const FOUR_WEEKS = [
  { startDate: '2025-10-01', endDate: '2025-10-08', total: 280 },
  { startDate: '2025-10-08', endDate: '2025-10-15', total: 410 },
  { startDate: '2025-10-15', endDate: '2025-10-22', total: 250 },
  { startDate: '2025-10-22', endDate: '2025-10-29', total: 300 },
];

beforeEach(() => {
  // TrendCard reads `todayIsoDate()` to find the current week, which reads `new Date()` -
  // the same clock-under-fake-timers pattern `DashboardScreen.test.tsx` uses for its header.
  jest.useFakeTimers().setSystemTime(new Date(2025, 9, 10)); // 10 October, in bucket index 1
});

afterEach(() => {
  jest.useRealTimers();
});

describe('the populated chart (AC1, AC2, AC3)', () => {
  it('shows one bar per week, its value above and its week label below', () => {
    render(<TrendCard weeklyBuckets={FOUR_WEEKS} />);

    expect(screen.getByText('$280')).toBeInTheDocument();
    expect(screen.getByText('Week 1')).toBeInTheDocument();
    expect(screen.getByText('$410')).toBeInTheDocument();
    expect(screen.getByText('Week 2')).toBeInTheDocument();
    expect(screen.getByText('$250')).toBeInTheDocument();
    expect(screen.getByText('Week 3')).toBeInTheDocument();
    expect(screen.getByText('$300')).toBeInTheDocument();
    expect(screen.getByText('Week 4')).toBeInTheDocument();
  });

  // **This asserts the arithmetic, not the geometry, and the difference cost a review
  // finding.** jsdom runs no layout - every `offsetHeight` is 0 and no percentage is ever
  // resolved - so the strongest claim available here is that the right percentage reached the
  // right bar. The first version of this card passed exactly these four assertions while
  // drawing `$410` and `$300` as identical bars in a browser, because the percentage resolved
  // against a track the two label rows were also eating into and flex-shrink absorbed the
  // difference. **AC2 is therefore a browser check**, alongside `Modal`'s Escape and the focus
  // trap and `BudgetForm`'s caret restore, and it is the geometry - `getBoundingClientRect()`
  // on the laid-out bars - that has to be measured there rather than the style attribute.
  it('gives each bar the percentage height its bucket earns against the tallest', () => {
    const { container } = render(<TrendCard weeklyBuckets={FOUR_WEEKS} />);
    const bars = container.querySelectorAll<HTMLElement>('.bg-primary, .bg-accent');

    expect(bars).toHaveLength(4);
    expect(bars[1]?.style.height).toBe('100%'); // $410, the tallest
    expect(bars[0]?.style.height).toBe(`${(280 / 410) * 100}%`);
    expect(bars[2]?.style.height).toBe(`${(250 / 410) * 100}%`);
    expect(bars[3]?.style.height).toBe(`${(300 / 410) * 100}%`);
  });

  it('puts the bar alone in its plot area, which is what makes those percentages true', () => {
    // The regression guard for the finding above: the bar's parent must contain the bar and
    // nothing else, so `height: X%` resolves against the whole `h-32` track. A label row moving
    // back inside that box is the change that silently re-clamps every tall bar.
    const { container } = render(<TrendCard weeklyBuckets={FOUR_WEEKS} />);

    for (const bar of container.querySelectorAll<HTMLElement>('.bg-primary, .bg-accent')) {
      const plotArea = bar.parentElement!;
      expect(plotArea.children).toHaveLength(1);
      expect(plotArea.className).toContain('h-32');
      expect(plotArea.textContent).toBe('');
    }
  });

  it('highlights only the current week, the rest staying the un-accented colour', () => {
    const { container } = render(<TrendCard weeklyBuckets={FOUR_WEEKS} />);

    expect(container.querySelectorAll('.bg-accent')).toHaveLength(1);
    expect(container.querySelector<HTMLElement>('.bg-accent')?.style.height).toBe('100%'); // bucket index 1
    expect(container.querySelectorAll('.bg-primary')).toHaveLength(3);
  });
});

describe('display only (AC4)', () => {
  it('has no interactive role anywhere on the chart', () => {
    render(<TrendCard weeklyBuckets={FOUR_WEEKS} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
  });
});

describe('a week with no spending (AC5)', () => {
  const WITH_A_ZERO_WEEK = [
    { startDate: '2025-10-01', endDate: '2025-10-08', total: 280 },
    { startDate: '2025-10-08', endDate: '2025-10-15', total: 0 },
    { startDate: '2025-10-15', endDate: '2025-10-22', total: 250 },
  ];

  it('still draws its label and a bar, rather than being dropped from the axis', () => {
    render(<TrendCard weeklyBuckets={WITH_A_ZERO_WEEK} />);

    expect(screen.getByText('$0')).toBeInTheDocument();
    expect(screen.getByText('Week 2')).toBeInTheDocument();
  });

  it('keeps a visible minimum track rather than collapsing to zero height', () => {
    const { container } = render(<TrendCard weeklyBuckets={WITH_A_ZERO_WEEK} />);
    const zeroBar = container.querySelectorAll<HTMLElement>('.bg-primary, .bg-accent')[1];

    expect(zeroBar).toBeDefined();
    expect(parseFloat(zeroBar!.style.height)).toBeGreaterThan(0);
  });
});

describe('the caption', () => {
  it('names no month, since the buckets are anchored to a window a month name cannot describe', () => {
    // Node 22:55 draws "Weekly · October", but the buckets are anchored to the profile's
    // monthStartDay window exactly like BudgetCard's daysLeft, which already dropped its month
    // name for the same reason.
    render(<TrendCard weeklyBuckets={FOUR_WEEKS} />);

    expect(screen.getByText('Weekly')).toBeInTheDocument();
    expect(screen.queryByText(/Weekly.*October/)).not.toBeInTheDocument();
  });
});

describe('the whole period empty, which PET-26 replaces', () => {
  it('renders nothing rather than an empty axis', () => {
    const { container } = render(<TrendCard weeklyBuckets={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
