import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { AddTransactionProvider } from '../AddTransactionProvider';
import { InsightTeaserCard } from './InsightTeaserCard';

// The card itself (node 21:4's teaser area, DSH-9; node 44:706 for its empty state), filed
// under Shell for the reason `Shell/Recent transactions` gives: a card is one band of the
// dashboard rather than a whole frame. `Screens/04 Dashboard` is where the frame is diffed.
//
// **The unlock state needs `AddTransactionProvider` inside `render`, and `nextjs.appDirectory`
// on the meta.** `useAddTransaction` throws outside its provider by design, and the ready
// state's own story needs neither - its one control is a plain `ui/Button` with an `href`. The
// provider goes inside `render` rather than a decorator for the reason `DashboardScreen.stories.tsx`
// gives: the smoke harness in `shell.stories.test.tsx` never applies `meta.decorators`, so a
// decorator works here and throws under Jest.
const meta: Meta<typeof InsightTeaserCard> = {
  title: 'Shell/AI insight teaser',
  component: InsightTeaserCard,
  tags: ['autodocs'],
  parameters: { nextjs: { appDirectory: true } },
};

export default meta;

type Story = StoryObj<typeof InsightTeaserCard>;

/** AC1, AC2: a ready set's own headline and body, and a real link to Insights. */
export const Ready: Story = {
  args: {
    insight: {
      headline: 'You are on track this month',
      body: "You've spent $1,240 of your $2,000 budget with 11 days to go.",
    },
  },
};

/** AC3, AC4: nothing generated yet, so the card offers Add transaction instead. */
export const Unlock: Story = {
  render: () => (
    <AddTransactionProvider>
      <InsightTeaserCard insight={null} />
    </AddTransactionProvider>
  ),
};
