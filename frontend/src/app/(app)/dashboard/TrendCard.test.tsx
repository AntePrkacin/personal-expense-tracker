import { render, screen } from '@testing-library/react';

import { TrendCard } from './TrendCard';

// Node 22:55's own numbers (DSH-6): $280, $410, $250, $300 over Week 1 to Week 4, tiling
// 1-29 October.
const FOUR_WEEKS = [
  { startDate: '2025-10-01', endDate: '2025-10-08', total: 280 },
  { startDate: '2025-10-08', endDate: '2025-10-15', total: 410 },
  { startDate: '2025-10-15', endDate: '2025-10-22', total: 250 },
  { startDate: '2025-10-22', endDate: '2025-10-29', total: 300 },
];

// `daysLeft` counts back from the final bucket's `endDate`, so 19 puts the backend's `today` on
// 10 October - bucket index 1, the same week the deleted `setSystemTime(new Date(2025, 9, 10))`
// used to select. **There are no fake timers in this file any more**, and that is the point of
// the change rather than a tidy-up: this card reads no clock at all now, so a suite that had to
// pin one was pinning the defect.
const DAYS_LEFT_TO_WEEK_2 = 19;

// The three tones a bar can wear (`barTone`), which is also how the suite finds the bars. Class
// strings, which the repo's own rule allows here: these *are* the visual state under test, the
// same exception daisyUI's state classes get. The muted one is matched with `~=` rather than as
// a class selector because `bg-base-content/20` carries a `/`, which `.` selectors would need
// escaped.
const UPCOMING = '[class~="bg-base-content/20"]';
const BARS = `.bg-primary, .bg-accent, ${UPCOMING}`;

describe('the populated chart (AC1, AC2, AC3)', () => {
  it('shows one bar per week, its value above and its week label below', () => {
    render(<TrendCard weeklyBuckets={FOUR_WEEKS} daysLeft={DAYS_LEFT_TO_WEEK_2} />);

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
    const { container } = render(
      <TrendCard weeklyBuckets={FOUR_WEEKS} daysLeft={DAYS_LEFT_TO_WEEK_2} />,
    );
    const bars = container.querySelectorAll<HTMLElement>(BARS);

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
    const { container } = render(
      <TrendCard weeklyBuckets={FOUR_WEEKS} daysLeft={DAYS_LEFT_TO_WEEK_2} />,
    );

    for (const bar of container.querySelectorAll<HTMLElement>(BARS)) {
      const plotArea = bar.parentElement!;
      expect(plotArea.children).toHaveLength(1);
      expect(plotArea.className).toContain('h-32');
      expect(plotArea.textContent).toBe('');
    }
  });

  it('accents exactly one week, the one `daysLeft` counts back to', () => {
    const { container } = render(
      <TrendCard weeklyBuckets={FOUR_WEEKS} daysLeft={DAYS_LEFT_TO_WEEK_2} />,
    );

    expect(container.querySelectorAll('.bg-accent')).toHaveLength(1);
    expect(container.querySelector<HTMLElement>('.bg-accent')?.style.height).toBe('100%'); // $410
  });

  // The regression guard for the first finding of this PR's review. The card used to call
  // `todayIsoDate()`, so which bar was accented depended on the frontend host's clock and its
  // zone - and on the first day of a period a UTC host against `APP_TIMEZONE=Europe/Zagreb`
  // placed `today` before `buckets[0].startDate`, leaving *nothing* accented. Moving the system
  // clock a year and a continent away must now change nothing at all.
  it('reads no clock, so the system time cannot move the highlight', () => {
    jest.useFakeTimers().setSystemTime(new Date(2024, 2, 3));

    try {
      const { container } = render(
        <TrendCard weeklyBuckets={FOUR_WEEKS} daysLeft={DAYS_LEFT_TO_WEEK_2} />,
      );

      expect(container.querySelector<HTMLElement>('.bg-accent')?.style.height).toBe('100%');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('weeks that have not started (a review finding, no frame behind it)', () => {
  it('mutes every bucket after the current one, so it cannot read as a spend-free week', () => {
    // Week 2 current, so Weeks 3 and 4 are still to come.
    const { container } = render(
      <TrendCard weeklyBuckets={FOUR_WEEKS} daysLeft={DAYS_LEFT_TO_WEEK_2} />,
    );

    expect(container.querySelectorAll(UPCOMING)).toHaveLength(2);
    expect(container.querySelectorAll('.bg-primary')).toHaveLength(1); // Week 1, behind us
    expect(container.querySelectorAll('.bg-accent')).toHaveLength(1); // Week 2
  });

  it('mutes nothing when the response could not place today at all', () => {
    // `daysLeft: 0` is the documented midnight boundary: `today` lands on `window.end` and
    // belongs to no bucket. Dimming from a window we could not locate would be the guessing
    // this card stopped doing.
    const { container } = render(<TrendCard weeklyBuckets={FOUR_WEEKS} daysLeft={0} />);

    expect(container.querySelectorAll('.bg-accent')).toHaveLength(0);
    expect(container.querySelectorAll(UPCOMING)).toHaveLength(0);
    expect(container.querySelectorAll('.bg-primary')).toHaveLength(4);
  });
});

describe('the two states a screen reader would otherwise miss (a review finding)', () => {
  it('names the current week in text, since the accent colour carries it alone', () => {
    render(<TrendCard weeklyBuckets={FOUR_WEEKS} daysLeft={DAYS_LEFT_TO_WEEK_2} />);

    expect(screen.getByText('Current week')).toBeInTheDocument();
    expect(screen.getAllByText('Upcoming week')).toHaveLength(2);
  });

  it('says neither when no week is current', () => {
    render(<TrendCard weeklyBuckets={FOUR_WEEKS} daysLeft={0} />);

    expect(screen.queryByText('Current week')).not.toBeInTheDocument();
    expect(screen.queryByText('Upcoming week')).not.toBeInTheDocument();
  });
});

describe('display only (AC4)', () => {
  it('has no interactive role anywhere on the chart', () => {
    render(<TrendCard weeklyBuckets={FOUR_WEEKS} daysLeft={DAYS_LEFT_TO_WEEK_2} />);

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

  // 2 puts today on 20 October, inside the last bucket - so the zero week is *behind* the
  // current one and is a real spend-free week rather than one that has not happened.
  const DAYS_LEFT = 2;

  it('still draws its label and a bar, rather than being dropped from the axis', () => {
    render(<TrendCard weeklyBuckets={WITH_A_ZERO_WEEK} daysLeft={DAYS_LEFT} />);

    expect(screen.getByText('$0')).toBeInTheDocument();
    expect(screen.getByText('Week 2')).toBeInTheDocument();
  });

  it('keeps a visible minimum track rather than collapsing to zero height', () => {
    const { container } = render(
      <TrendCard weeklyBuckets={WITH_A_ZERO_WEEK} daysLeft={DAYS_LEFT} />,
    );
    const zeroBar = container.querySelectorAll<HTMLElement>(BARS)[1];

    expect(zeroBar).toBeDefined();
    expect(parseFloat(zeroBar!.style.height)).toBeGreaterThan(0);
  });

  it('draws it in the ordinary tone, not the muted one an unstarted week gets', () => {
    const { container } = render(
      <TrendCard weeklyBuckets={WITH_A_ZERO_WEEK} daysLeft={DAYS_LEFT} />,
    );

    expect(container.querySelectorAll<HTMLElement>(BARS)[1]?.className).toContain('bg-primary');
    expect(screen.queryByText('Upcoming week')).not.toBeInTheDocument();
  });
});

describe('the caption', () => {
  it('names no month, since the buckets are anchored to a window a month name cannot describe', () => {
    // Node 22:55 draws "Weekly · October", but the buckets are anchored to the profile's
    // monthStartDay window exactly like BudgetCard's daysLeft, which already dropped its month
    // name for the same reason.
    render(<TrendCard weeklyBuckets={FOUR_WEEKS} daysLeft={DAYS_LEFT_TO_WEEK_2} />);

    expect(screen.getByText('Weekly')).toBeInTheDocument();
    expect(screen.queryByText(/Weekly.*October/)).not.toBeInTheDocument();
  });
});

describe('the whole period empty, which PET-26 replaces', () => {
  it('renders nothing rather than an empty axis', () => {
    const { container } = render(<TrendCard weeklyBuckets={[]} daysLeft={8} />);

    expect(container).toBeEmptyDOMElement();
  });
});
