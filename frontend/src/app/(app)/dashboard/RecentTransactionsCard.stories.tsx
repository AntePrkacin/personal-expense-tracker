import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { addDays } from '@/lib/calendar';
import { todayIsoDate } from '@/lib/date';

import { RecentTransactionsCard } from './RecentTransactionsCard';

// The card itself (Figma node 21:4's recent-list area, DSH-7), filed under Shell rather than
// Screens for the reason `Shell/Spending trend` and `Shell/Spending by category` both are: a
// card is one band of the dashboard rather than a whole frame. `Screens/04 Dashboard` is where
// the frame is diffed.
//
// **The dates below are read off the real clock, not fixed.** `formatRelativeDate`'s `today`
// defaults to `todayIsoDate()`, the same read this card makes with no override of its own -
// unlike `TrendCard`, which takes a `daysLeft` prop precisely so its stories could pin a moment.
// This card has no such prop, so a fixed October 2025 fixture would show "Today" and
// "Yesterday" only in the month it was written and freeze into stale short dates after - riding
// along with the clock is what keeps both states reachable whenever this story is opened.
const TODAY = todayIsoDate();
const YESTERDAY = addDays(TODAY, -1) ?? TODAY;
const THREE_DAYS_AGO = addDays(TODAY, -3) ?? TODAY;

/** Node 21:4's own three categories for the rows below. */
const CATEGORIES = [
  { id: 'c1', name: 'Groceries', color: '#57B368', spent: 397, percent: 32.4 },
  { id: 'c3', name: 'Transport', color: '#3F8EE6', spent: 223, percent: 18.2 },
  { id: 'c4', name: 'Shopping', color: '#CE6FB8', spent: 174, percent: 14.2 },
];

/** DSH-7's own mock: "Whole Foods, Groceries · Today, -$24.00" and the two rows beneath it. */
const THREE_ROWS = [
  {
    id: 't1',
    merchant: 'Whole Foods',
    categoryId: 'c1',
    amount: 24,
    date: TODAY,
    note: null,
    createdAt: `${TODAY}T18:00:00.000Z`,
    updatedAt: `${TODAY}T18:00:00.000Z`,
  },
  {
    id: 't2',
    merchant: 'Uber',
    categoryId: 'c3',
    amount: 18.5,
    date: YESTERDAY,
    note: null,
    createdAt: `${YESTERDAY}T09:00:00.000Z`,
    updatedAt: `${YESTERDAY}T09:00:00.000Z`,
  },
  {
    id: 't3',
    merchant: 'Amazon',
    categoryId: 'c4',
    amount: 15.99,
    date: THREE_DAYS_AGO,
    note: null,
    createdAt: `${THREE_DAYS_AGO}T14:00:00.000Z`,
    updatedAt: `${THREE_DAYS_AGO}T14:00:00.000Z`,
  },
];

const meta: Meta<typeof RecentTransactionsCard> = {
  title: 'Shell/Recent transactions',
  component: RecentTransactionsCard,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof RecentTransactionsCard>;

/** The frame's own three rows, newest first: today, yesterday, then a short date. */
export const ThreeRows: Story = {
  args: { recentTransactions: THREE_ROWS, categories: CATEGORIES },
};

/** AC6: fewer than three needs no code, so a shorter array renders shorter with no placeholder rows. */
export const OneRow: Story = {
  args: { recentTransactions: [THREE_ROWS[0]!], categories: CATEGORIES },
};

/**
 * A `categoryId` unresolved against `categories`, unreachable through today's contract - every
 * recent row's category is documented as appearing there - but drawn anyway rather than trusted
 * away. The neutral tile renders and the caption drops the name, keeping only the date.
 */
export const UnresolvedCategory: Story = {
  args: {
    recentTransactions: [{ ...THREE_ROWS[0]!, categoryId: 'no-such-category' }],
    categories: CATEGORIES,
  },
};

/** The whole-period-empty case, which renders nothing until PET-26 fills it. */
export const NoSpendThisPeriod: Story = {
  args: { recentTransactions: [], categories: CATEGORIES },
};
