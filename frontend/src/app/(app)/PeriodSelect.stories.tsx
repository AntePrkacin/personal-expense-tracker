import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { PeriodSelect } from './PeriodSelect';

// The Dashboard and Categories headers' period select (Figma node 21:61), and PET-72's answer to A8.
//
// Type-only Storybook import, for the reason `Sidebar.stories.tsx` records: importing any *value*
// from Storybook breaks the Jest story smoke test with an opaque ESM error.
//
// Filed under "Shell" beside `Page header`, the same call every non-tile makes: this is not one of
// the tiles on the Figma Components page, it is the shell's own.
//
// **`nextjs: { appDirectory: true }` is mandatory**, and no gate will tell you: the control calls
// `useRouter`, which throws `invariant expected app router to be mounted` outside a mounted router.
// `build-storybook` bundles stories without running one and the Jest harness has `next/navigation`
// mocked, so both are blind to it and only opening the story finds it.
//
// **These stories are the only review this control gets**, and there are two things to look at that
// no suite can see. It is a native `<select>`, so its popup is the browser's - which is the whole
// argument for not building a sixth custom picker here, and worth confirming by opening it. And the
// `w-auto` on it is load-bearing: daisyUI ships `select` at `width: clamp(3rem, 20rem, 100%)`, sized
// for a field standing alone in a column, so without it the control reads as a 320px slab in a
// header row. Compare `Long` against `Default` for what the widest real label does to that.

const meta: Meta<typeof PeriodSelect> = {
  title: 'Shell/Period select',
  component: PeriodSelect,
  tags: ['autodocs'],
  parameters: { nextjs: { appDirectory: true } },
};

export default meta;

type Story = StoryObj<typeof PeriodSelect>;

/** The ordinary shape: one period a month, newest first, which is what most accounts have. */
const MONTHLY = [
  { start: '2025-10-01', end: '2025-11-01', label: 'October 2025', current: true },
  { start: '2025-09-01', end: '2025-10-01', label: 'September 2025', current: false },
  { start: '2025-08-01', end: '2025-09-01', label: 'August 2025', current: false },
  { start: '2025-07-01', end: '2025-08-01', label: 'July 2025', current: false },
];

/**
 * An account paid on the 15th that then moved its pay day, which is the case PET-72 exists for.
 *
 * The third entry is the **transition period**: it runs from the last kept boundary to the first
 * paycheck under the new schedule, so it spans two calendar months and its label names both. No
 * arithmetic over a start day produces that string, which is why the label is published per period
 * rather than derived - and this list is the only place a reviewer can see it beside ordinary ones.
 */
const STRETCHED = [
  { start: '2026-01-14', end: '2026-02-14', label: 'January / February 2026', current: true },
  { start: '2025-12-15', end: '2026-01-14', label: 'December 2025 / January 2026', current: false },
  { start: '2025-11-15', end: '2025-12-15', label: 'November / December 2025', current: false },
];

/** The current period selected, which is what a bare `/dashboard` renders. */
export const Default: Story = {
  args: { periods: MONTHLY, selected: MONTHLY[0]!.start, pathname: '/dashboard' },
};

/**
 * A past period selected, which is what `?period=2025-09-01` renders.
 *
 * Worth opening: choosing the current period from here navigates to the **bare** route, because a
 * default is the absent key - so the URL that means "now" is the one with nothing in it.
 */
export const PastPeriod: Story = {
  args: { periods: MONTHLY, selected: MONTHLY[1]!.start, pathname: '/dashboard' },
};

/**
 * The widest label the backend can produce, on the screen with the least room for it.
 *
 * "December 2025 / January 2026" is what a stretched period reads, and the Categories header puts
 * this control beside an "Add category" button rather than beside a lone one. If anything is going
 * to wrap or push the button off the row, it is this.
 */
export const Long: Story = {
  args: {
    periods: STRETCHED,
    selected: STRETCHED[1]!.start,
    pathname: '/transactions/categories',
  },
};

/**
 * A brand-new account, which has exactly one period: the one it is in.
 *
 * The state `MonthPill` was built for and the reason its own comment gave for staying inert - "a
 * real select with one option would also read out 'October, 1 of 1' and go nowhere". It does read
 * that way, and it is still the right control: the alternative is a header that renders a different
 * kind of thing on day one than it does in month two.
 */
export const OnePeriod: Story = {
  args: { periods: [MONTHLY[0]!], selected: MONTHLY[0]!.start, pathname: '/dashboard' },
};
