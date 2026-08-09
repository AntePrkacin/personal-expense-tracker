import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { addDays } from '@/lib/calendar';
import { todayIsoDate } from '@/lib/date';

import { AddTransactionProvider } from '../AddTransactionProvider';
import { PreferencesProvider } from '../PreferencesProvider';
import { BudgetCard } from './BudgetCard';
import { CategoryDonut } from './CategoryDonut';
import { DashboardScreen } from './DashboardScreen';
import { InsightTeaserCard } from './InsightTeaserCard';
import { RecentTransactionsCard } from './RecentTransactionsCard';
import { TrendCard } from './TrendCard';

// 04 Dashboard (Figma node 21:4), diffed against the frame's own numbers (node 22:55).
//
// **All five cards are built as of PET-25.** `Shell/AI insight teaser` is where the fifth,
// `InsightTeaserCard`, is reviewed in all three of its states; this story carries only the ready
// one, matching a screen that has generated a set - the same division `Shell/Spending trend` and
// `Screens/04 Dashboard` already draw for the other cards. Worth knowing that a **running** app
// cannot reach that state yet: nothing in either half calls `POST /api/insights/generate`, so
// every real account draws the teaser's pending copy. This story is the frame diffed against node
// 21:4, which draws a generated set, so it keeps the fixture rather than the reachable state.
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
    color: 'success' as const,
    spent: 397,
  },
};

// Node 21:4's own five categories, shared between the donut and the recent list below exactly
// as the real `DashboardResponseDto` shares one `categories` array between both: every recent
// row's category id is one of these five, the invariant `RecentTransactionsCard`'s join relies
// on rather than a second request.
const CATEGORIES = [
  {
    id: 'c1',
    name: 'Groceries',
    color: 'success' as const,
    icon: 'shopping-basket' as const,
    spent: 397,
    percent: 32.02,
  },
  {
    id: 'c2',
    name: 'Dining out',
    color: 'error' as const,
    icon: 'utensils' as const,
    spent: 298,
    percent: 24.03,
  },
  {
    id: 'c3',
    name: 'Transport',
    color: 'info' as const,
    icon: 'car' as const,
    spent: 223,
    percent: 17.98,
  },
  {
    id: 'c4',
    name: 'Shopping',
    color: 'secondary' as const,
    icon: 'shopping-basket' as const,
    spent: 174,
    percent: 14.03,
  },
  {
    id: 'c5',
    name: 'Other',
    color: 'warning-content' as const,
    icon: 'shopping-basket' as const,
    spent: 148,
    percent: 11.94,
  },
];

// DSH-7's own three rows: "Today" and "Yesterday" are the specification rather than sample
// data, proving the relative caption; the third exercises the short date beyond them.
//
// **Dated off the real clock rather than fixed, and that is the opposite of `TrendCard`'s own
// stories.** Those fixed their buckets and had the card read a `daysLeft` prop instead, because
// the card takes no clock at all. This one has no such prop - `formatRelativeDate`'s `today`
// defaults to `todayIsoDate()`, the same read `RecentTransactionsCard` makes - so riding along
// with it rather than fighting it is what keeps "Today" and "Yesterday" showing whenever this
// story is opened, instead of freezing into stale short dates the day after it was written.
const TODAY = todayIsoDate();

const RECENT_TRANSACTIONS = [
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
    date: addDays(TODAY, -1) ?? TODAY,
    note: null,
    createdAt: `${addDays(TODAY, -1) ?? TODAY}T09:00:00.000Z`,
    updatedAt: `${addDays(TODAY, -1) ?? TODAY}T09:00:00.000Z`,
  },
  {
    id: 't3',
    merchant: 'Amazon',
    categoryId: 'c4',
    amount: 15.99,
    date: addDays(TODAY, -5) ?? TODAY,
    note: null,
    createdAt: `${addDays(TODAY, -5) ?? TODAY}T14:00:00.000Z`,
    updatedAt: `${addDays(TODAY, -5) ?? TODAY}T14:00:00.000Z`,
  },
];

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
    // `PreferencesProvider` is what `(app)/layout.tsx` wraps the shell in, and the cards below
    // format money through it. Mounted here rather than in `decorators` for the reason
    // `frontend/src/app/CLAUDE.md` records: the story smoke test never applies a meta's
    // decorators, so a decorator works in the browser and throws under Jest.
    <PreferencesProvider currency="USD" monthStartDay={1}>
      <AddTransactionProvider>
        {/* `bg-base-200` is what the root layout paints `<body>`; `px-*` stands in for the
          `(app)` shell's own gutter, since neither wraps a story. */}
        <div className="bg-base-200 flex min-h-screen flex-col px-4 sm:px-6 lg:px-10">
          <DashboardScreen
            monthStartDay={1}
            budgetCard={<BudgetCard currency="USD" {...BUDGET} isEmpty={false} />}
            trendCard={
              <TrendCard
                currency="USD"
                weeklyBuckets={[
                  { startDate: '2025-10-01', endDate: '2025-10-08', total: 280 },
                  { startDate: '2025-10-08', endDate: '2025-10-15', total: 410 },
                  { startDate: '2025-10-15', endDate: '2025-10-22', total: 250 },
                  { startDate: '2025-10-22', endDate: '2025-10-29', total: 300 },
                ]}
                daysLeft={BUDGET.daysLeft}
                isEmpty={false}
              />
            }
            donutCard={
              // Summing to `BUDGET.spent` so the donut's centre and the budget card's readout are
              // the same figure on one screen, which is AC2 and is what the real response
              // guarantees.
              <CategoryDonut currency="USD" categories={CATEGORIES} spent={BUDGET.spent} />
            }
            recentTransactionsCard={
              <RecentTransactionsCard
                currency="USD"
                recentTransactions={RECENT_TRANSACTIONS}
                categories={CATEGORIES}
                isEmpty={false}
              />
            }
            insightCard={
              <InsightTeaserCard
                insight={{
                  headline: 'You are on track this month',
                  body: "You've spent $1,240 of your $2,000 budget with 11 days to go.",
                }}
                isEmpty={false}
              />
            }
          />
        </div>
      </AddTransactionProvider>
    </PreferencesProvider>
  ),
};
