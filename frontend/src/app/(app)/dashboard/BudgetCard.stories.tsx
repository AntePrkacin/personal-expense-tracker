import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { BudgetCard } from './BudgetCard';

// The card itself (Figma node 22:55), filed under Shell rather than Screens: a card is one
// band of the dashboard rather than a whole frame, the same distinction `Shell/Page header`
// draws against the four screens it appears on. `Screens/04 Dashboard` is where the whole
// frame is diffed; this is where the card's two chip tones are.
//
// No provider and no `nextjs` parameter: nothing here is interactive, so it needs neither.

const meta: Meta<typeof BudgetCard> = {
  title: 'Shell/Budget card',
  component: BudgetCard,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof BudgetCard>;

/** Node 22:55's own numbers. Under budget, the "On track" chip. */
export const OnTrack: Story = {
  args: {
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
  },
};

/**
 * The overspent state, which the frame does not draw. The chip flips to "Over budget", the
 * bar clamps to full rather than overflowing its track, and the "left" caption shows the
 * magnitude of `remaining` rather than a formatted negative colliding with the chip.
 */
export const OverBudget: Story = {
  args: {
    spent: 2240,
    monthlyBudget: 2000,
    remaining: -240,
    daysLeft: 3,
    transactionCount: 44,
    averagePerDay: 80,
    topCategory: {
      id: '0198c2a1-0000-7000-8000-0000000000a1',
      name: 'Dining out',
      color: 'coral',
      spent: 512,
    },
  },
};

/** The contract's null case: nothing spent yet this period. */
export const NoTopCategory: Story = {
  args: {
    ...OnTrack.args,
    spent: 0,
    remaining: 2000,
    transactionCount: 0,
    averagePerDay: 0,
    topCategory: null,
  },
};
