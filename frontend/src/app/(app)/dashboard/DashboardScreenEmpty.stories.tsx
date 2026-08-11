import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { AddTransactionProvider } from '../AddTransactionProvider';
import { BudgetCard } from './BudgetCard';
import { CategoryDonut } from './CategoryDonut';
import { DashboardScreen } from './DashboardScreen';
import { InsightTeaserCard } from './InsightTeaserCard';
import { RecentTransactionsCard } from './RecentTransactionsCard';
import { TrendCard } from './TrendCard';

// 05 Dashboard — Empty (Figma node 44:706), a genuinely new account: `transactionCount: 0`.
//
// **A second stories module beside `DashboardScreen.stories.tsx` rather than a second story in
// it**, the same call `TransactionsList.stories.tsx` makes against `TransactionsScreen.stories.tsx`:
// a module carries one title and this one is frame 05's. The two frames are different screens in
// the design file and are reviewed as such.
//
// **`isEmpty` is threaded to four of the five cards, exactly as `page.tsx` does.**
// `CategoryDonut` takes none - its guard is `categories.length === 0`, a strict superset of the
// screen's own flag rather than a sixth spelling of it - so this story hands it an empty
// `categories` array instead, which is what a real `transactionCount: 0` response also carries.
//
// **`daysLeft` is 31, and after the review of PET-26 that is load-bearing rather than filler.**
// Frame 05 draws a brand-new account, so this story has to be at the *start* of a period for
// `BudgetCard` to draw the frame's "Full month ahead" at all - the caption needs both `isEmpty`
// and a `daysLeft` that proves the period has barely begun, since an empty account four days from
// the end of its period is a different and undesigned state. `Shell/Budget card`'s own
// `EmptyLateInPeriod` is where that one is reviewed; this frame stays what the designer drew.
//
// **`monthlyBudget` still comes off the fixture rather than a literal `$2,000`**, because AC2's
// "$0 of $2,000" is exactly what a zero `spent` formats to against whatever budget the account
// set during onboarding - a hardcoded caption here would be the bug PET-26's plan warns against
// looking like the design.
//
// Every other note `DashboardScreen.stories.tsx` carries applies here too: the provider lives
// inside `render` because the smoke harness never applies `meta.decorators`, and
// `nextjs: { appDirectory: true }` is mandatory because the header's `AddTransactionButton` and
// the teaser's unlock button both reach `useRouter` through the modal they open.

// The period the header names and the list its select offers, both straight off the response as of
// PET-72 - so the frame's own "October 2025" is drawn whatever month this story is opened in, where
// the old `monthStartDay` prop derived it from the clock. The second entry is what makes the control
// worth opening in Storybook at all: a select with one option cannot be reviewed.
const PERIOD = { start: '2025-10-01', end: '2025-11-01', label: 'October 2025', current: true };

const PERIODS = [
  PERIOD,
  { start: '2025-09-01', end: '2025-10-01', label: 'September 2025', current: false },
  { start: '2025-08-01', end: '2025-09-01', label: 'August 2025', current: false },
];

const meta: Meta<typeof DashboardScreen> = {
  title: 'Screens/05 Dashboard — Empty',
  component: DashboardScreen,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen', nextjs: { appDirectory: true } },
};

export default meta;

type Story = StoryObj<typeof DashboardScreen>;

export const Empty: Story = {
  render: () => (
    <AddTransactionProvider>
      {/* `bg-base-200` is what the root layout paints `<body>`; `px-*` stands in for the
          `(app)` shell's own gutter, since neither wraps a story. */}
      <div className="bg-base-200 flex min-h-screen flex-col px-4 sm:px-6 lg:px-10">
        <DashboardScreen
          period={PERIOD}
          periods={PERIODS}
          budgetCard={
            <BudgetCard
              currency="USD"
              spent={0}
              monthlyBudget={2000}
              daysLeft={31}
              transactionCount={0}
              averagePerDay={0}
              topCategory={null}
              isEmpty={true}
            />
          }
          trendCard={<TrendCard currency="USD" weeklyBuckets={[]} daysLeft={31} isEmpty={true} />}
          donutCard={<CategoryDonut currency="USD" categories={[]} spent={0} />}
          recentTransactionsCard={
            <RecentTransactionsCard
              currency="USD"
              recentTransactions={[]}
              categories={[]}
              isEmpty={true}
            />
          }
          insightCard={<InsightTeaserCard insight={null} isEmpty={true} />}
        />
      </div>
    </AddTransactionProvider>
  ),
};
