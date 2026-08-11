import type { Period } from '@/lib/periods';

import { AddTransactionButton } from '../AddTransactionButton';
import { PageHeader } from '../PageHeader';
import { PeriodSelect } from '../PeriodSelect';

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
// missing. PET-21 shipped `budgetCard`, PET-22 `trendCard`, PET-23 `donutCard`, PET-24
// `recentTransactionsCard` and PET-25 `insightCard` - so **every slot is filled at the call site
// in `page.tsx`** and nothing here is a placeholder any more.
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
  /** DSH-8. PET-25's `InsightTeaserCard`. */
  insightCard: React.ReactNode;
  /**
   * The period every figure on this screen belongs to, from the dashboard response's own
   * `period` object.
   *
   * **This replaces `monthStartDay`, and the swap is the point of PET-72 on this screen.** That prop
   * existed so the header could derive a period's name from a start day and today, through
   * `periodOverline` and `periodLabel`. No arithmetic over a start day can produce "December 2025 /
   * January 2026", because the fact that makes it two months is a `period_rules` row this app cannot
   * see - so the label is the backend's, and it arrives beside the figures it describes rather than
   * being computed alongside them. It also closes the skew the old prop documented: the label and the
   * figures now come from one resolution against `APP_TIMEZONE`, where the label used to come from
   * the frontend host's clock.
   */
  period: { start: string; end: string; label: string };
  /** Every period the account has, newest first, for the header's select. */
  periods: readonly Period[];
};

export function DashboardScreen({
  budgetCard,
  trendCard,
  donutCard,
  recentTransactionsCard,
  insightCard,
  period,
  periods,
}: DashboardScreenProps) {
  return (
    <>
      <PageHeader
        // The response's own label, uppercased by `PageHeader`'s overline treatment. No clock read
        // here any more: this screen used to call `todayIsoDate()` purely to name the period, which
        // was the frontend host's zone against figures scoped to `APP_TIMEZONE`.
        overline={period.label}
        title="Dashboard"
        action={
          <>
            <PeriodSelect periods={periods} selected={period.start} pathname="/dashboard" />
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
