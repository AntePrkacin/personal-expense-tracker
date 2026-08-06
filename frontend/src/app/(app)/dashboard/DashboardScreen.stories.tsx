import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { AddTransactionProvider } from '../AddTransactionProvider';
import { BudgetCard } from './BudgetCard';
import { DashboardScreen } from './DashboardScreen';

// 04 Dashboard (Figma node 21:4), diffed against the frame's own numbers (node 22:55).
//
// **This ticket ships one of the five cards.** The other four render exactly what `page.tsx`
// renders in production - empty placeholder `<div />`s - so this story is honest about what
// PET-21 ships rather than mocking up cards that do not exist yet. PET-22 through PET-25 each
// replace one placeholder here as they land, and the grid geometry is already reviewable.
//
// **The provider is inside `render` rather than in a decorator**, the same reason
// `TransactionsScreen.stories.tsx` gives: the smoke harness in `screens.stories.test.tsx` never
// applies `meta.decorators`, so a decorator works in Storybook and throws under Jest. The
// header's `AddTransactionButton` calls `useAddTransaction`, which throws outside a provider by
// design.
//
// **`nextjs: { appDirectory: true }` is mandatory, and no gate will tell you.** The provider
// mounts modal 09 on open, which reaches `useRouter` for its refresh - throwing `invariant
// expected app router to be mounted` outside one. `build-storybook` bundles this story without
// running it and `screens.stories.test.tsx` renders it with `next/navigation` already mocked,
// so both gates stay green and only opening the story finds the throw.

const BUDGET = {
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
};

const meta: Meta<typeof DashboardScreen> = {
  title: 'Screens/04 Dashboard',
  component: DashboardScreen,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen', nextjs: { appDirectory: true } },
};

export default meta;

type Story = StoryObj<typeof DashboardScreen>;

export const Default: Story = {
  render: () => (
    <AddTransactionProvider>
      {/* `bg-base-200` is what the root layout paints `<body>`; `px-*` stands in for the
          `(app)` shell's own gutter, since neither wraps a story. */}
      <div className="bg-base-200 flex min-h-screen flex-col px-4 sm:px-6 lg:px-10">
        <DashboardScreen
          budgetCard={<BudgetCard {...BUDGET} />}
          trendCard={<div />}
          donutCard={<div />}
          recentTransactionsCard={<div />}
          insightCard={<div />}
        />
      </div>
    </AddTransactionProvider>
  ),
};
