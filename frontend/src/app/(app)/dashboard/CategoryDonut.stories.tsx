import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { CategoryDonut } from './CategoryDonut';

// The card itself (Figma node 21:4's donut area, DSH-8), filed under Shell rather than Screens
// for the reason `Shell/Spending trend` is: a card is one band of the dashboard rather than a
// whole frame. `Screens/04 Dashboard` is where the frame is diffed.
//
// **The ring always closes, and these stories are where that is looked at.** jsdom runs no
// layout, so the suite beside this file can prove the slice count, the fills and the legend's
// arithmetic but never the geometry. Opening these is half the check; the browser walk measuring
// the rendered arcs is the other half.

/** Node 21:4's own five categories. Their percentages naively round to 99, which is the point. */
const FIVE_CATEGORIES = [
  { id: 'c1', name: 'Groceries', color: '#57B368', spent: 397, percent: 32.4 },
  { id: 'c2', name: 'Dining out', color: '#EF6F6C', spent: 298, percent: 24.3 },
  { id: 'c3', name: 'Transport', color: '#3F8EE6', spent: 223, percent: 18.2 },
  { id: 'c4', name: 'Shopping', color: '#CE6FB8', spent: 174, percent: 14.2 },
  { id: 'c5', name: 'Other', color: '#E7C24A', spent: 148, percent: 10.9 },
];

const meta: Meta<typeof CategoryDonut> = {
  title: 'Shell/Spending by category',
  component: CategoryDonut,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof CategoryDonut>;

/**
 * The frame's own five categories. Worth hovering: the tooltip names the slice, which is the one
 * thing the ring cannot say on its own, and its percentage is the same integer as the legend
 * row's rather than a second rounding of the same number.
 *
 * The legend reads 33 / 24 / 18 / 14 / 11 and sums to 100. Rounding each value on its own would
 * give 32 / 24 / 18 / 14 / 11, which sums to 99 under a ring that visibly closes.
 */
export const FiveCategories: Story = {
  args: { categories: FIVE_CATEGORIES, spent: 1240 },
};

/**
 * One category taking the whole circle, which is every account's first period. The ring is a
 * single closed annulus rather than a slice with a gap where the rest would be.
 */
export const SingleCategory: Story = {
  args: {
    categories: [{ id: 'c1', name: 'Groceries', color: '#57B368', spent: 86.4, percent: 100 }],
    spent: 86.4,
  },
};

/**
 * A colour outside the eight, which today only the fallback category's own `#98A0AE` produces.
 * It renders grey and **keeps its slice**: dropping an unresolvable category would leave the ring
 * open, which is the one thing this card must not do.
 *
 * This is also the shape an account reaches after the orphan fold on the backend, where spend
 * belonging to a category deleted out from under it lands in Uncategorized rather than vanishing.
 */
export const WithUncategorized: Story = {
  args: {
    categories: [
      { id: 'c1', name: 'Groceries', color: '#57B368', spent: 60, percent: 60 },
      { id: 'c2', name: 'Uncategorized', color: '#98A0AE', spent: 40, percent: 40 },
    ],
    spent: 100,
  },
};

/**
 * Percentages that would naively round to **101** rather than 99, so the apportionment is seen
 * taking a point away as well as handing one out.
 */
export const RoundingOverflows: Story = {
  args: {
    categories: [
      { id: 'a', name: 'Groceries', color: '#57B368', spent: 306, percent: 30.6 },
      { id: 'b', name: 'Dining out', color: '#EF6F6C', spent: 306, percent: 30.6 },
      { id: 'c', name: 'Transport', color: '#3F8EE6', spent: 196, percent: 19.6 },
      { id: 'd', name: 'Shopping', color: '#CE6FB8', spent: 192, percent: 19.2 },
    ],
    spent: 1000,
  },
};

/**
 * Many small slices, which is where a naive rounding drifts furthest from 100 and where the ring
 * has the most seams to close.
 */
export const ManySmallCategories: Story = {
  args: {
    categories: [
      { id: 'a', name: 'Groceries', color: '#57B368', spent: 120, percent: 24 },
      { id: 'b', name: 'Dining out', color: '#EF6F6C', spent: 95, percent: 19 },
      { id: 'c', name: 'Transport', color: '#3F8EE6', spent: 78, percent: 15.6 },
      { id: 'd', name: 'Shopping', color: '#CE6FB8', spent: 61, percent: 12.2 },
      { id: 'e', name: 'Health', color: '#34B9AE', spent: 55, percent: 11 },
      { id: 'f', name: 'Bills', color: '#8A79F1', spent: 48, percent: 9.6 },
      { id: 'g', name: 'Other', color: '#F29A3D', spent: 43, percent: 8.6 },
    ],
    spent: 500,
  },
};

/** The whole-period-empty case, which renders nothing until PET-26 fills it. */
export const NoSpendThisPeriod: Story = {
  args: { categories: [], spent: 0 },
};
