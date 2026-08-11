import { requireInsights } from '@/lib/insights';
import { currentPeriod, readPeriods } from '@/lib/periods';

import { InsightsScreen } from './InsightsScreen';

// 14 AI Insights (Figma node 38:495), with 15 and 16 as its other two states.
//
// The shape `/transactions` set and `/dashboard` copied: async here, fetching, handing the
// resolved response to a synchronous screen. One request serves all three states - the read
// carries the lifecycle and the latest ready set's content together - so there is no probe, and
// unlike `/transactions` no ambiguous-empty case for one to resolve.
//
// **The overline is the period, not "Your money assistant".** INS-1 and frame 38:542 both draw
// the latter, and it is the one screen of the four whose overline is not a month; the 2026-08-08
// review took it the other way, so the four routed views read consistently. The Jira ticket
// carries the amendment.

export default async function InsightsPage() {
  // The overline is built here rather than inside the screen, so the client component takes a
  // string and a suite can pin the period without faking a timer - the same reason `lib/date.ts`'s
  // helpers all take `today` as a parameter.
  //
  // **It is the budgeting period as of PET-47 and the backend's own label as of PET-72**, so it
  // agrees with the banner beneath it about what a month is *and* about where the month ends. It was
  // `periodOverline(monthStartDay, todayIsoDate())`, which composed two months' names from a start
  // day - correct only while every period was one calendar month offset by a fixed day, and wrong
  // for a period a pay-schedule change has stretched. `lib/periods.ts` carries the whole argument.
  //
  // **This is the one of the four headers whose period does not ride on the screen's own read.**
  // `GET /api/insights` publishes no `period`, deliberately: a set is generated for the current
  // period only, and its `monthLabel` is the label of the period it was generated *in*, which is
  // null in the empty state and stale in the ready one the moment a period rolls over. So the label
  // comes from `GET /api/periods`, and it costs the one extra request this page makes. The two reads
  // are independent, so they go in parallel.
  const [set, periods] = await Promise.all([requireInsights(), readPeriods()]);

  // The empty string is unreachable through the API - every account has at least the period it is in
  // - and it is written rather than asserted because a header with a blank overline is a smaller
  // failure than a screen replaced by the error boundary over a label.
  return <InsightsScreen set={set} overline={currentPeriod(periods)?.label ?? ''} />;
}
