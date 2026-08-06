import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { isoFromParts } from '@/lib/date';

import { TrendCard } from './TrendCard';

// The card itself (Figma node 22:55's trend area, DSH-6), filed under Shell rather than
// Screens: a card is one band of the dashboard rather than a whole frame, the same distinction
// `Shell/Budget card` draws. `Screens/04 Dashboard` is where the whole frame is diffed; this is
// where the three states below are.
//
// No provider and no `nextjs` parameter: nothing here is interactive, so it needs neither.

/**
 * `days` before today, as `YYYY-MM-DD`.
 *
 * The card reads the real clock (`todayIsoDate()`, unfaked here - Storybook has no fake-timer
 * harness the way Jest does), so these stories anchor their bucket boundaries to *today*
 * instead of a fixed October 2025, which is what lets AC3's highlight land on a real bar
 * whenever the story is opened rather than only in whichever month the fixture happened to
 * name. `days` negative reaches into tomorrow, which is what closes the current, open bucket.
 */
function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return isoFromParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

const meta: Meta<typeof TrendCard> = {
  title: 'Shell/Spending trend',
  component: TrendCard,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof TrendCard>;

/** Node 22:55's own four values, tiling the four weeks up to and including today. */
export const FilledMonth: Story = {
  args: {
    weeklyBuckets: [
      { startDate: daysAgo(28), endDate: daysAgo(21), total: 280 },
      { startDate: daysAgo(21), endDate: daysAgo(14), total: 410 },
      { startDate: daysAgo(14), endDate: daysAgo(7), total: 250 },
      { startDate: daysAgo(7), endDate: daysAgo(-1), total: 300 },
    ],
  },
};

/**
 * AC5: a week with no spending still draws its label and a bar, over a visible minimum track
 * rather than being dropped from the axis - `weeklyBucketsOf` on the backend zero-fills it and
 * this card renders that zero rather than inventing a fill of its own.
 */
export const WithAZeroWeek: Story = {
  args: {
    weeklyBuckets: [
      { startDate: daysAgo(21), endDate: daysAgo(14), total: 280 },
      { startDate: daysAgo(14), endDate: daysAgo(7), total: 0 },
      { startDate: daysAgo(7), endDate: daysAgo(-1), total: 300 },
    ],
  },
};

/**
 * The contract's last bucket ending at the period end rather than seven days after its own
 * start - `weeks.ts`'s own suite pins the range test this exercises at the component level:
 * a naive `startDate + 7 days` highlight would miss today entirely for the last two days of a
 * period shorter than a clean multiple of seven.
 */
export const ShortFinalBucket: Story = {
  args: {
    weeklyBuckets: [
      { startDate: daysAgo(23), endDate: daysAgo(16), total: 280 },
      { startDate: daysAgo(16), endDate: daysAgo(9), total: 410 },
      { startDate: daysAgo(9), endDate: daysAgo(2), total: 250 },
      { startDate: daysAgo(2), endDate: daysAgo(-1), total: 90 },
    ],
  },
};

/** The whole-period-empty case, which renders nothing until PET-26 fills it. */
export const NoSpendThisPeriod: Story = {
  args: {
    weeklyBuckets: [],
  },
};
