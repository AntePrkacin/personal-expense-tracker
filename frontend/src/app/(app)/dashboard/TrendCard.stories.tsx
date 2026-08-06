import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { TrendCard } from './TrendCard';

// The card itself (Figma node 22:55's trend area, DSH-6), filed under Shell rather than
// Screens: a card is one band of the dashboard rather than a whole frame, the same distinction
// `Shell/Budget card` draws. `Screens/04 Dashboard` is where the whole frame is diffed; this is
// where the states below are.
//
// No provider and no `nextjs` parameter: nothing here is interactive, so it needs neither.
//
// **These bucket dates are fixed October 2025, and that is new.** The first version of this file
// anchored every boundary to `daysAgo(n)` off the real clock, because the card read
// `todayIsoDate()` and a fixed fixture would have put the highlight on a real bar only during
// October 2025. Review of this PR replaced that clock read with `daysLeft` off the same
// response, so *the story decides which week is current* by choosing a number - which is what
// lets the two states below exist at all, since neither of them is reachable by waiting.

/** The four values node 22:55 draws, tiling 1-29 October. */
const FOUR_WEEKS = [
  { startDate: '2025-10-01', endDate: '2025-10-08', total: 280 },
  { startDate: '2025-10-08', endDate: '2025-10-15', total: 410 },
  { startDate: '2025-10-15', endDate: '2025-10-22', total: 250 },
  { startDate: '2025-10-22', endDate: '2025-10-29', total: 300 },
];

const meta: Meta<typeof TrendCard> = {
  title: 'Shell/Spending trend',
  component: TrendCard,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof TrendCard>;

/**
 * Node 22:55's own four values with the period almost over, which is the state the frame draws:
 * every week has happened, and the last of them is the current one.
 */
export const FilledMonth: Story = {
  args: { weeklyBuckets: FOUR_WEEKS, daysLeft: 1 },
};

/**
 * The same period read on 14 October, which is what most accounts look like most of the time and
 * what no frame draws. The two weeks after the accent bar have not started, so they are
 * `base-300` with a dimmed figure rather than `primary` - without that they were pixel-identical
 * to the genuinely spend-free week below, which was the third finding from this PR's review.
 */
export const WeeksStillToCome: Story = {
  args: { weeklyBuckets: FOUR_WEEKS, daysLeft: 15 },
};

/**
 * AC5: a week with no spending still draws its label and a bar, over a visible minimum track
 * rather than being dropped from the axis - `weeklyBucketsOf` on the backend zero-fills it and
 * this card renders that zero rather than inventing a fill of its own. Week 2 here is *behind*
 * the current week, which is what makes it a real zero rather than a week yet to come.
 */
export const WithAZeroWeek: Story = {
  args: {
    weeklyBuckets: [
      { startDate: '2025-10-01', endDate: '2025-10-08', total: 280 },
      { startDate: '2025-10-08', endDate: '2025-10-15', total: 0 },
      { startDate: '2025-10-15', endDate: '2025-10-22', total: 300 },
    ],
    daysLeft: 2,
  },
};

/**
 * The contract's last bucket ending at the period end rather than seven days after its own
 * start - `weeks.ts`'s own suite pins the range test this exercises at the component level:
 * a naive `startDate + 7 days` highlight would miss today entirely for the last two days of a
 * period shorter than a clean multiple of seven. It is also what `todayFromDaysLeft` reads
 * `window.end` off, so this story exercises both halves of the highlight at once.
 */
export const ShortFinalBucket: Story = {
  args: {
    weeklyBuckets: [
      { startDate: '2025-10-01', endDate: '2025-10-08', total: 280 },
      { startDate: '2025-10-08', endDate: '2025-10-15', total: 410 },
      { startDate: '2025-10-15', endDate: '2025-10-22', total: 250 },
      { startDate: '2025-10-22', endDate: '2025-10-24', total: 90 },
    ],
    daysLeft: 1,
  },
};

/**
 * `daysLeft: 0`, the midnight boundary `backend/CLAUDE.md`'s Dashboard section documents: the
 * endpoint resolves the period more than once per request, so `today` can land on `window.end`
 * for an instant and belong to no bucket. Nothing is accented and nothing is dimmed, which is
 * the honest answer rather than a guess, and the next request corrects it.
 */
export const AtThePeriodBoundary: Story = {
  args: { weeklyBuckets: FOUR_WEEKS, daysLeft: 0 },
};

/** The whole-period-empty case, which renders nothing until PET-26 fills it. */
export const NoSpendThisPeriod: Story = {
  args: { weeklyBuckets: [], daysLeft: 8 },
};
