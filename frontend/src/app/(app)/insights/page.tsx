import { monthOverline } from '@/lib/format';
import { requireInsights } from '@/lib/insights';

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
  const set = await requireInsights();

  // Read here rather than inside the screen, so the client component takes a string and a
  // suite can pin the month without faking a timer - the same reason `lib/date.ts`'s helpers
  // all take `today` as a parameter. Note this is the frontend host's own zone, while the set's
  // own `monthLabel` is the backend's; `docs/TODO.md` records that gap for every figure on the
  // dashboard already, and here the two are labels for different things - the calendar month
  // over the page, the period the analysis covers inside the banner.
  const now = new Date();

  return <InsightsScreen set={set} overline={monthOverline(now)} />;
}
