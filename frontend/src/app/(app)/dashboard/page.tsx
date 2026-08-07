import { readDashboard } from '@/lib/dashboard';

import { BudgetCard } from './BudgetCard';
import { CategoryDonut } from './CategoryDonut';
import { DashboardScreen } from './DashboardScreen';
import { InsightTeaserCard } from './InsightTeaserCard';
import { RecentTransactionsCard } from './RecentTransactionsCard';
import { TrendCard } from './TrendCard';

// 04 Dashboard (Figma node 21:4), and 05 in its empty state.
//
// PET-19 shipped the header alone; this ticket puts the first real read under it and ships
// the first of the five cards. `lib/dashboard.ts` owns the read and its failure policy,
// deliberately identical to `lib/profile.ts` and `lib/transactions.ts` beside it: only a 401
// means signed out, and everything else throws so a reload retries rather than bouncing into
// the `/dashboard`-to-`/login` loop PET-52 unpicked.
//
// **The grid is complete as of this branch.** `DashboardScreen`'s five props are all
// required - every card renders in both the populated and the empty state, so there is no
// state in which one is absent - and PET-21 shipped the geometry so the grid was reviewable,
// with each remaining card a one-line change at this call site. PET-22 filled `trendCard`,
// PET-23 `donutCard`, PET-24 `recentTransactionsCard` and PET-25 `insightCard`.
//
// **PET-26 resolves the screen's one empty-state condition here, once.** `transactionCount ===
// 0` - not `spent === 0`, which differs, and not five independent per-card checks, which can
// disagree and draw a screen half empty and half zeroed. `isEmpty` is threaded to `BudgetCard`,
// `TrendCard`, `RecentTransactionsCard` and `InsightTeaserCard`, which is what
// `(app)/pages.test.tsx` pins. `CategoryDonut` deliberately does **not** take it: its empty
// input is `categories.length === 0`, a strict superset of this flag rather than a sixth
// spelling of it, and `CategoryDonut.tsx` carries the reasoning.
//
// No `export const dynamic`: the cookie read behind `readDashboard()` opts this route out of
// static rendering on its own, exactly as it does everywhere else in the app.

export default async function DashboardPage() {
  const summary = await readDashboard();
  const isEmpty = summary.transactionCount === 0;

  return (
    <DashboardScreen
      budgetCard={<BudgetCard {...summary} isEmpty={isEmpty} />}
      trendCard={
        <TrendCard
          weeklyBuckets={summary.weeklyBuckets}
          daysLeft={summary.daysLeft}
          isEmpty={isEmpty}
        />
      }
      donutCard={<CategoryDonut categories={summary.categories} spent={summary.spent} />}
      recentTransactionsCard={
        <RecentTransactionsCard
          recentTransactions={summary.recentTransactions}
          categories={summary.categories}
          isEmpty={isEmpty}
        />
      }
      insightCard={<InsightTeaserCard insight={summary.insight} isEmpty={isEmpty} />}
    />
  );
}
