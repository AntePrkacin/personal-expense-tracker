import { screen } from '@testing-library/react';

import { render } from '../shellRender';

import { TrendCard } from './TrendCard';
import { RANGE_DASH } from './weeks';

// Node 22:55's own numbers (DSH-6): $280, $410, $250, $300 over Week 1 to Week 4, tiling
// 1-29 October.
const FOUR_WEEKS = [
  { startDate: '2025-10-01', endDate: '2025-10-08', total: 280 },
  { startDate: '2025-10-08', endDate: '2025-10-15', total: 410 },
  { startDate: '2025-10-15', endDate: '2025-10-22', total: 250 },
  { startDate: '2025-10-22', endDate: '2025-10-29', total: 300 },
];

// `daysLeft` counts back from the final bucket's `endDate`, so 19 puts the backend's `today` on
// 10 October - bucket index 1. **There are no fake timers in this file except in the one test
// that exists to prove they change nothing**: this card reads no clock, so a suite that had to
// pin one would be pinning the defect.
const DAYS_LEFT_TO_WEEK_2 = 19;

// ---------------------------------------------------------------------------
// **What this file may and may not claim, now that Recharts draws the plot.**
//
// jsdom runs no layout, and `jest.setup.ts`'s ResizeObserver stub hands the chart a fixed,
// invented 400x300 box so it renders at all. So every bar here has a size that came from that
// constant rather than from a browser, and **no assertion below reads a width, a height or a
// proportion**. That is not a gap this file should try to close: PET-22 shipped a chart whose
// `$410` and `$300` bars drew identically while four assertions about their heights passed,
// because they read back the inline style the component had just written rather than the box the
// browser drew. Geometry is a browser check, on the same list as `Modal`'s Escape and
// `BudgetForm`'s caret restore.
//
// What is honestly assertable here is everything that is not geometry: that the right number of
// bars exist, that each wears the fill its bucket earns, that every figure and caption reached
// the DOM, that the screen-reader list says what the tooltip says, and that nothing on the card
// is operable.
// ---------------------------------------------------------------------------

/** Recharts renders each `Cell` as a path; the fill is what carries the tone. */
function barFills(container: HTMLElement): { fill: string | null; opacity: string | null }[] {
  return Array.from(container.querySelectorAll('.recharts-bar-rectangle path')).map((bar) => ({
    fill: bar.getAttribute('fill'),
    opacity: bar.getAttribute('fill-opacity'),
  }));
}

const ACCENT = 'var(--color-accent)';
const PRIMARY = 'var(--color-primary)';
const MUTED = 'var(--color-base-content)';

describe('the populated chart (AC1, AC3)', () => {
  it('draws one bar per week', () => {
    const { container } = render(
      <TrendCard
        currency="USD"
        weeklyBuckets={FOUR_WEEKS}
        daysLeft={DAYS_LEFT_TO_WEEK_2}
        isEmpty={false}
      />,
    );

    expect(barFills(container)).toHaveLength(4);
  });

  it('renders every value and every week caption', () => {
    const { container } = render(
      <TrendCard
        currency="USD"
        weeklyBuckets={FOUR_WEEKS}
        daysLeft={DAYS_LEFT_TO_WEEK_2}
        isEmpty={false}
      />,
    );
    const text = container.textContent ?? '';

    for (const figure of ['$280', '$410', '$250', '$300']) {
      expect(text).toContain(figure);
    }
    for (const caption of ['Week 1', 'Week 2', 'Week 3', 'Week 4']) {
      expect(text).toContain(caption);
    }
  });

  it('accents exactly one week, the one `daysLeft` counts back to', () => {
    const { container } = render(
      <TrendCard
        currency="USD"
        weeklyBuckets={FOUR_WEEKS}
        daysLeft={DAYS_LEFT_TO_WEEK_2}
        isEmpty={false}
      />,
    );
    const fills = barFills(container);

    expect(fills.filter((bar) => bar.fill === ACCENT)).toHaveLength(1);
    expect(fills[1]?.fill).toBe(ACCENT); // Week 2, the $410 bucket
  });

  // The regression guard for the first finding of this PR's review, and it survives the move to
  // Recharts unchanged because the chart never receives a clock - `TrendCard` resolves every tone
  // on the server from `daysLeft` alone. Moving the system time a year and a continent away must
  // change nothing at all.
  it('reads no clock, so the system time cannot move the highlight', () => {
    jest.useFakeTimers().setSystemTime(new Date(2024, 2, 3));

    try {
      const { container } = render(
        <TrendCard
          currency="USD"
          weeklyBuckets={FOUR_WEEKS}
          daysLeft={DAYS_LEFT_TO_WEEK_2}
          isEmpty={false}
        />,
      );

      expect(barFills(container)[1]?.fill).toBe(ACCENT);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('weeks that have not started (a review finding, no frame behind it)', () => {
  it('mutes every bucket after the current one, so it cannot read as a spend-free week', () => {
    // Week 2 current, so Weeks 3 and 4 are still to come.
    const { container } = render(
      <TrendCard
        currency="USD"
        weeklyBuckets={FOUR_WEEKS}
        daysLeft={DAYS_LEFT_TO_WEEK_2}
        isEmpty={false}
      />,
    );
    const fills = barFills(container);

    expect(fills.filter((bar) => bar.fill === MUTED)).toHaveLength(2);
    expect(fills.filter((bar) => bar.fill === PRIMARY)).toHaveLength(1); // Week 1, behind us
    expect(fills.filter((bar) => bar.fill === ACCENT)).toHaveLength(1); // Week 2
  });

  it('carries the muted tone as an alpha rather than a second colour', () => {
    // `bg-base-content/20` became a fill plus `fill-opacity`, because SVG composites the alpha
    // itself. Whether the composited result is *visible* is a browser check and is recorded as
    // one; that it is translucent at all is assertable here.
    const { container } = render(
      <TrendCard
        currency="USD"
        weeklyBuckets={FOUR_WEEKS}
        daysLeft={DAYS_LEFT_TO_WEEK_2}
        isEmpty={false}
      />,
    );

    expect(barFills(container)[3]).toEqual({ fill: MUTED, opacity: '0.2' });
  });

  it('mutes nothing when the response could not place today at all', () => {
    // `daysLeft: 0` is the documented midnight boundary: `today` lands on `window.end` and
    // belongs to no bucket. Dimming from a window we could not locate would be the guessing
    // this card stopped doing.
    const { container } = render(
      <TrendCard currency="USD" weeklyBuckets={FOUR_WEEKS} daysLeft={0} isEmpty={false} />,
    );
    const fills = barFills(container);

    expect(fills.filter((bar) => bar.fill === ACCENT)).toHaveLength(0);
    expect(fills.filter((bar) => bar.fill === MUTED)).toHaveLength(0);
    expect(fills.filter((bar) => bar.fill === PRIMARY)).toHaveLength(4);
  });
});

describe('the screen-reader list, which is the chart for anyone not using a pointer', () => {
  it('names every week with its date range, its amount and its state', () => {
    render(
      <TrendCard
        currency="USD"
        weeklyBuckets={FOUR_WEEKS}
        daysLeft={DAYS_LEFT_TO_WEEK_2}
        isEmpty={false}
      />,
    );

    expect(
      screen.getByText(`Week 2, Oct 8 ${RANGE_DASH} Oct 14: $410, current week`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`Week 3, Oct 15 ${RANGE_DASH} Oct 21: $250, upcoming week`),
    ).toBeInTheDocument();
    // A week behind us gets no suffix at all - "past week" would be noise on the majority state.
    expect(screen.getByText(`Week 1, Oct 1 ${RANGE_DASH} Oct 7: $280`)).toBeInTheDocument();
  });

  it('hides the plot from assistive technology, so nothing is announced twice', () => {
    const { container } = render(
      <TrendCard
        currency="USD"
        weeklyBuckets={FOUR_WEEKS}
        daysLeft={DAYS_LEFT_TO_WEEK_2}
        isEmpty={false}
      />,
    );

    const chart = container.querySelector('.recharts-responsive-container');
    expect(chart?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('describes no state when no week is current', () => {
    render(<TrendCard currency="USD" weeklyBuckets={FOUR_WEEKS} daysLeft={0} isEmpty={false} />);

    expect(screen.queryByText(/current week/)).not.toBeInTheDocument();
    expect(screen.queryByText(/upcoming week/)).not.toBeInTheDocument();
  });
});

describe('display only (AC4, as amended)', () => {
  // The tooltip is the amendment and it is hover-only: it adds no control, no tab stop and no
  // role. `accessibilityLayer` is deliberately not enabled on the chart, which is what would
  // have added one.
  it('has no interactive role anywhere on the card', () => {
    render(
      <TrendCard
        currency="USD"
        weeklyBuckets={FOUR_WEEKS}
        daysLeft={DAYS_LEFT_TO_WEEK_2}
        isEmpty={false}
      />,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
  });

  // **Both halves of this were false before the review that added it**, and neither came from
  // anything this repo wrote: Recharts 3 defaults `accessibilityLayer` to `true`, which puts
  // `tabindex="0"` and `role="application"` on its own `<svg>`. The tab stop is the sharper
  // failure, because the plot sits inside `aria-hidden` - so it was focusable and simultaneously
  // invisible to the screen reader that would have to explain it, the same footgun
  // `frontend/src/app/CLAUDE.md` records for the Welcome panel. The role is the louder one: it
  // tells assistive technology to leave browse mode and forward every key to a chart that
  // handles none.
  it('puts nothing in the tab order and claims no application role', () => {
    const { container } = render(
      <TrendCard
        currency="USD"
        weeklyBuckets={FOUR_WEEKS}
        daysLeft={DAYS_LEFT_TO_WEEK_2}
        isEmpty={false}
      />,
    );

    expect(container.querySelectorAll('[tabindex]:not([tabindex="-1"])')).toHaveLength(0);
    expect(container.querySelectorAll('[role="application"]')).toHaveLength(0);
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

  it('still draws a bar and still says $0, rather than being dropped from the axis', () => {
    const { container } = render(
      <TrendCard
        currency="USD"
        weeklyBuckets={WITH_A_ZERO_WEEK}
        daysLeft={DAYS_LEFT}
        isEmpty={false}
      />,
    );

    expect(barFills(container)).toHaveLength(3);
    expect(container.textContent).toContain('$0');
    expect(container.textContent).toContain('Week 2');
  });

  it('draws it in the ordinary tone, not the muted one an unstarted week gets', () => {
    const { container } = render(
      <TrendCard
        currency="USD"
        weeklyBuckets={WITH_A_ZERO_WEEK}
        daysLeft={DAYS_LEFT}
        isEmpty={false}
      />,
    );

    expect(barFills(container)[1]?.fill).toBe(PRIMARY);
    expect(screen.queryByText(/upcoming week/)).not.toBeInTheDocument();
  });
});

describe('the caption', () => {
  it('names no month, since the buckets are anchored to a window a month name cannot describe', () => {
    // Node 22:55 draws "Weekly · October", but the buckets are anchored to the profile's
    // monthStartDay window exactly like BudgetCard's daysLeft, which already dropped its month
    // name for the same reason.
    render(
      <TrendCard
        currency="USD"
        weeklyBuckets={FOUR_WEEKS}
        daysLeft={DAYS_LEFT_TO_WEEK_2}
        isEmpty={false}
      />,
    );

    expect(screen.getByText('Weekly')).toBeInTheDocument();
    expect(screen.queryByText(/Weekly.*October/)).not.toBeInTheDocument();
  });
});

describe('the empty state (AC3, PET-26)', () => {
  it('draws the bar glyph and its caption rather than the chart', () => {
    render(<TrendCard currency="USD" weeklyBuckets={[]} daysLeft={8} isEmpty={true} />);

    expect(screen.getByText('No spending to chart yet')).toBeInTheDocument();
    expect(document.querySelector('.recharts-responsive-container')).not.toBeInTheDocument();
  });

  it('follows `isEmpty` rather than `weeklyBuckets.length`, so the screen keeps one condition', () => {
    // The two are documented as identical on a real response, but this card must not re-derive
    // its own opinion from the array - `page.tsx`'s shared flag is what decides, which this
    // proves by handing it a populated array alongside `isEmpty: true`.
    render(
      <TrendCard
        currency="USD"
        weeklyBuckets={FOUR_WEEKS}
        daysLeft={DAYS_LEFT_TO_WEEK_2}
        isEmpty={true}
      />,
    );

    expect(screen.getByText('No spending to chart yet')).toBeInTheDocument();
    expect(screen.queryByText('Week 1')).not.toBeInTheDocument();
  });

  it('still names the card and keeps the "Weekly" overline', () => {
    render(<TrendCard currency="USD" weeklyBuckets={[]} daysLeft={8} isEmpty={true} />);

    expect(screen.getByText('Spending trend')).toBeInTheDocument();
    expect(screen.getByText('Weekly')).toBeInTheDocument();
  });
});
