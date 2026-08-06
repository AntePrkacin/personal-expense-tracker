import { readDashboard } from '@/lib/dashboard';

import { BudgetCard } from './BudgetCard';
import { DashboardScreen } from './DashboardScreen';
import { TrendCard } from './TrendCard';

// 04 Dashboard (Figma node 21:4), and 05 in its empty state.
//
// PET-19 shipped the header alone; this ticket puts the first real read under it and ships
// the first of the five cards. `lib/dashboard.ts` owns the read and its failure policy,
// deliberately identical to `lib/profile.ts` and `lib/transactions.ts` beside it: only a 401
// means signed out, and everything else throws so a reload retries rather than bouncing into
// the `/dashboard`-to-`/login` loop PET-52 unpicked.
//
// **Three of the five slots are still placeholders, and that is sequencing rather than a
// conditional.** `DashboardScreen`'s five props are all required - every card renders in both
// the populated and the empty state, so there is no state in which one is absent - and PET-21
// shipped the geometry so the grid was reviewable, with each remaining card a one-line change
// at this call site. PET-22 fills `trendCard` here; PET-23 (`donutCard`), PET-24
// (`recentTransactionsCard`) and PET-25 (`insightCard`) are still one line each.
//
// No `export const dynamic`: the cookie read behind `readDashboard()` opts this route out of
// static rendering on its own, exactly as it does everywhere else in the app.

export default async function DashboardPage() {
  const summary = await readDashboard();

  return (
    <DashboardScreen
      budgetCard={<BudgetCard {...summary} />}
      trendCard={<TrendCard weeklyBuckets={summary.weeklyBuckets} />}
      donutCard={<div /> /* PET-23 */}
      recentTransactionsCard={<div /> /* PET-24 */}
      insightCard={<div /> /* PET-25 */}
    />
  );
}
