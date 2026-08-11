import { readDashboard } from '@/lib/dashboard';
import { requireInsights } from '@/lib/insights';
import { parsePeriodParam } from '@/lib/periodParams';
import { readPeriods } from '@/lib/periods';
import { requireProfile } from '@/lib/profile';

import { BudgetCard } from './BudgetCard';
import { CategoryDonut } from './CategoryDonut';
import { DashboardScreen } from './DashboardScreen';
import { InsightCardsSlot } from './InsightCardsSlot';
import { InsightPollProvider } from './InsightPoll';
import { InsightSummarySlot } from './InsightSummarySlot';
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
// **PET-72 gives this route a `?period=` and a third read.** The dashboard answers one period, and
// until now that was always the current one; `lib/periods.ts` owns both the list the header's select
// is built from and the parse of the parameter. The read is unconditional rather than only for a
// non-current period, because the select is drawn in every state and an account with one period still
// has to see which one it is looking at.
//
// **PET-73 adds a fourth read, `requireInsights()`, and moves the insight cards onto this
// screen.** They used to be `/insights`'s, summarising the month - which is what this screen is
// for - while this screen carried `InsightTeaserCard`, whose whole job was rendering the same
// headline and body from `DashboardResponseDto.insight` and linking to the page that repeated
// them. That field is removed, the teaser is deleted, and the banner and the two cards read
// `GET /api/insights` directly.
//
// **It reverses PET-25's reasoning, and the reversal is worth recording.** That ticket argued
// "PET-20's endpoint exists so that one call serves the whole screen" and rejected a second read on
// those grounds. Two things answer it now. The dashboard summary is a snapshot with no way to
// update itself, so an `insight` field on it goes stale exactly where the poll's whole purpose is
// to not be. And PET-72 has already spent that argument itself, by adding `readPeriods()` beside
// `readDashboard()` for the header's select. `docs/TODO.md` records it beside the generate-on-write
// reversal rather than deleting PET-25's argument.
//
// **Only one read decides whether the session is alive.** `requireInsights()` joins as a read that
// redirects and the others keep their existing policies - two opinions about a dead cookie on one
// page is the shape the `/dashboard` to `/login` redirect loop came out of.
//
// No `export const dynamic`: the cookie read behind `readDashboard()` opts this route out of
// static rendering on its own, exactly as it does everywhere else in the app.

export default async function DashboardPage({
  searchParams,
}: {
  // Awaited, which Next 15 onward requires: `searchParams` is a promise, and destructuring it
  // synchronously is the mistake that reads as an empty object rather than as an error.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Dropped rather than trusted if malformed, and forwarded verbatim if well-formed but unknown -
  // `lib/periods.ts` records why those two cases differ.
  const period = parsePeriodParam(await searchParams);

  // **Four reads, and the profile one is free.** `requireProfile()` is `cache()`-memoized per render
  // pass and `(app)/layout.tsx` has already called it to gate this route, so it resolves against that
  // same promise rather than issuing a second `GET /api/profile`. None of them is awaited together:
  // `Promise.all` would start the others before the gate had a chance to redirect a dead session.
  const summary = await readDashboard(period);
  const { periods } = await readPeriods();
  const { currency } = await requireProfile();
  const insights = await requireInsights();
  const isEmpty = summary.transactionCount === 0;

  // **The screen's second condition, resolved once here and threaded as a boolean.** That is
  // PET-26's rule for `isEmpty` and the reason this screen has two conditions rather than five.
  //
  // It exists because insights are generated for the **current period only** - `GET /api/insights`
  // publishes no period at all, which is why the set's own `monthLabel` names the period a set was
  // generated in rather than the one being viewed. Without it, navigating back a period would put
  // October's analysis above September's figures on a screen where every other number is right.
  //
  // Compared against the period the *response* resolved rather than against a clock: the frontend
  // host's zone is not the backend's, which `BudgetCard` and `TrendCard` each have a paragraph
  // about. `periods` carries the flag already, so nothing here does arithmetic on a date.
  const isCurrentPeriod = periods.find((entry) => entry.current)?.start === summary.period.start;

  return (
    <InsightPollProvider set={insights} isCurrentPeriod={isCurrentPeriod} isEmpty={isEmpty}>
      <DashboardScreen
        period={summary.period}
        periods={periods}
        budgetCard={<BudgetCard {...summary} isEmpty={isEmpty} currency={currency} />}
        trendCard={
          <TrendCard
            weeklyBuckets={summary.weeklyBuckets}
            daysLeft={summary.daysLeft}
            isEmpty={isEmpty}
            currency={currency}
          />
        }
        donutCard={
          <CategoryDonut
            categories={summary.categories}
            spent={summary.spent}
            currency={currency}
          />
        }
        recentTransactionsCard={
          <RecentTransactionsCard
            recentTransactions={summary.recentTransactions}
            categories={summary.categories}
            isEmpty={isEmpty}
            currency={currency}
          />
        }
        insightSummary={<InsightSummarySlot />}
        insightCards={<InsightCardsSlot />}
      />
    </InsightPollProvider>
  );
}
