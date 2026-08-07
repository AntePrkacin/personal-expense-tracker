import { monthLabel, monthOverline } from '@/lib/format';

import { AddTransactionButton } from '../AddTransactionButton';
import { PageHeader } from '../PageHeader';
import { MonthPill } from './MonthPill';

// 04 Dashboard (Figma node 21:4), and 05 in its empty state.
//
// **Separate from `page.tsx` because the route is async and reads the dashboard summary.**
// Storybook cannot render an async Server Component that reads cookies, which is the same
// reason `TransactionsScreen` is its own file - this one takes the five built cards and
// renders them, so the frame is diffable against Figma with no request scope and no mocks.
//
// **The five cards are slots, not imports.** A screen that imports its own cards cannot be
// handed stand-ins, and Storybook is the only place this frame gets reviewed against node
// 21:4. Every slot is **required** rather than optional: all five render in both the
// populated and the empty state, with different content - there is no state in which one is
// absent, so an optional prop would let a call site quietly test a dashboard with a card
// missing. PET-21 shipped `budgetCard`, PET-22 `trendCard`, PET-23 `donutCard` and PET-24
// `recentTransactionsCard`; `insightCard` (PET-25) is still a placeholder `<div />` at the call
// site in `page.tsx`, a one-line change there when its ticket lands.
//
// **Anything a card needs is handed to it in `page.tsx`, because a slot is a node and not a
// component.** Each is typed `React.ReactNode`, matching `TransactionsScreen`'s two, so this
// screen cannot reach into one and `cloneElement` over a typed slot is not a seam worth
// inheriting. The one respect in which these slots differ from that file: `TransactionsScreen`
// takes a `view` prop of its own because TRN-3 makes the filter bar's presence the screen's
// decision. Nothing on frame 05 is this screen's decision - every empty-state treatment is
// internal to a card - so `DashboardScreen` needs no state prop at all, and PET-26's shared
// empty-state condition is resolved in `page.tsx`, beside the read that answers it, and
// travels as a prop on each card as that card is constructed.

type DashboardScreenProps = {
  /** DSH-3 to DSH-6. PET-21's `BudgetCard`. */
  budgetCard: React.ReactNode;
  /** DSH-4. PET-22's `TrendCard`. */
  trendCard: React.ReactNode;
  /** DSH-5. PET-23's `CategoryDonut`. */
  donutCard: React.ReactNode;
  /** DSH-7. PET-24's `RecentTransactionsCard`. */
  recentTransactionsCard: React.ReactNode;
  /** DSH-8. PET-25's placeholder here, filled by that branch. */
  insightCard: React.ReactNode;
};

export function DashboardScreen({
  budgetCard,
  trendCard,
  donutCard,
  recentTransactionsCard,
  insightCard,
}: DashboardScreenProps) {
  // The server clock. The layout's `cookies()` read is what keeps this segment dynamic, so
  // this is evaluated per request rather than once at build time.
  const now = new Date();

  return (
    <>
      <PageHeader
        overline={monthOverline(now)}
        title="Dashboard"
        action={
          <>
            <MonthPill label={monthLabel(now)} />
            {/* Opens modal 09, as of PET-31. The trigger is a thin client wrapper so this
                screen can stay a Server Component: a Server Component cannot hand `ui/Button`
                an onClick, and the modal itself lives once on the shell's layout. */}
            <AddTransactionButton />
          </>
        }
      />

      {/* Node 21:66's own 20px gaps, both axes: gap-5 between the two columns and gap-5
          again between the cards stacked inside each one. The 740:340 split collapses to one
          column below `lg`, per the frame-is-1440px carve-out - Figma never draws a narrower
          viewport, so a fixed two-column layout would overflow rather than reflow. */}
      <main className="flex-1 pb-10">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
          <div className="flex flex-col gap-5">
            {budgetCard}
            {trendCard}
            {recentTransactionsCard}
          </div>
          <div className="flex flex-col gap-5">
            {donutCard}
            {insightCard}
          </div>
        </div>
      </main>
    </>
  );
}
