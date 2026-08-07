import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { AddTransactionProvider } from '../AddTransactionProvider';
import { BudgetCard } from './BudgetCard';
import { CategoryDonut } from './CategoryDonut';
import { DashboardScreen } from './DashboardScreen';
import { TrendCard } from './TrendCard';

// 04 Dashboard (Figma node 21:4), diffed against the frame's own numbers (node 22:55).
//
// **Three of the five cards are built.** The remaining two render exactly what `page.tsx`
// renders in production - empty placeholder `<div />`s - so this story is honest about what has
// shipped rather than mocking up cards that do not exist yet. PET-24 and PET-25 each replace one
// placeholder here as they land, and the grid geometry is already reviewable.
//
// `TrendCard`'s own states are `Shell/Spending trend`'s; this story carries only the one that
// matches node 22:55. **Its buckets and `BUDGET.daysLeft` describe the same moment**, which they
// did not before: the trend card used to anchor its boundaries to the real clock while the
// budget card claimed 8 days left, so the two halves of one response disagreed on screen. Both
// now read the one `daysLeft` this fixture states.
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
          trendCard={
            <TrendCard
              weeklyBuckets={[
                { startDate: '2025-10-01', endDate: '2025-10-08', total: 280 },
                { startDate: '2025-10-08', endDate: '2025-10-15', total: 410 },
                { startDate: '2025-10-15', endDate: '2025-10-22', total: 250 },
                { startDate: '2025-10-22', endDate: '2025-10-29', total: 300 },
              ]}
              daysLeft={BUDGET.daysLeft}
            />
          }
          donutCard={
            // The five categories node 21:4 draws, summing to `BUDGET.spent` so the donut's
            // centre and the budget card's readout are the same figure on one screen, which is
            // AC2 and is what the real response guarantees.
            <CategoryDonut
              categories={[
                { id: 'c1', name: 'Groceries', color: '#57B368', spent: 397, percent: 32.02 },
                { id: 'c2', name: 'Dining out', color: '#EF6F6C', spent: 298, percent: 24.03 },
                { id: 'c3', name: 'Transport', color: '#3F8EE6', spent: 223, percent: 17.98 },
                { id: 'c4', name: 'Shopping', color: '#CE6FB8', spent: 174, percent: 14.03 },
                { id: 'c5', name: 'Other', color: '#E7C24A', spent: 148, percent: 11.94 },
              ]}
              spent={BUDGET.spent}
            />
          }
          recentTransactionsCard={<div />}
          insightCard={<div />}
        />
      </div>
    </AddTransactionProvider>
  ),
};
