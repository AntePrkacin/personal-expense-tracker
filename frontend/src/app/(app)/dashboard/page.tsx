import { readDashboard } from '@/lib/dashboard';

import { BudgetCard } from './BudgetCard';
import { DashboardScreen } from './DashboardScreen';

// 04 Dashboard (Figma node 21:4), and 05 in its empty state.
//
// PET-19 shipped the header alone; this ticket puts the first real read under it and ships
// the first of the five cards. `lib/dashboard.ts` owns the read and its failure policy,
// deliberately identical to `lib/profile.ts` and `lib/transactions.ts` beside it: only a 401
// means signed out, and everything else throws so a reload retries rather than bouncing into
// the `/dashboard`-to-`/login` loop PET-52 unpicked.
//
// **Four of the five slots are placeholders, and that is sequencing rather than a
// conditional.** `DashboardScreen`'s five props are all required - every card renders in both
// the populated and the empty state, so there is no state in which one is absent - and this
// ticket ships the geometry now so the grid is reviewable, with each remaining card a
// one-line change at this call site: PET-22 (`trendCard`), PET-23 (`donutCard`), PET-24
// (`recentTransactionsCard`) and PET-25 (`insightCard`).
//
// No `export const dynamic`: the cookie read behind `readDashboard()` opts this route out of
// static rendering on its own, exactly as it does everywhere else in the app.

export default async function DashboardPage() {
  const summary = await readDashboard();

  return (
    <DashboardScreen
      budgetCard={<BudgetCard {...summary} />}
      trendCard={<div /> /* PET-22 */}
      donutCard={<div /> /* PET-23 */}
      recentTransactionsCard={<div /> /* PET-24 */}
      insightCard={<div /> /* PET-25 */}
    />
  );
}
