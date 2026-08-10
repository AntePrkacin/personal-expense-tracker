import { todayIsoDate } from '@/lib/date';
import { periodOverline } from '@/lib/format';
import { requireProfile } from '@/lib/profile';
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

  // The overline is built here rather than inside the screen, so the client component takes a
  // string and a suite can pin the period without faking a timer - the same reason `lib/date.ts`'s
  // helpers all take `today` as a parameter.
  //
  // **It is the budgeting period as of PET-47, not the calendar month**, so it now agrees with the
  // banner beneath it about what a month is: the set's own `monthLabel` is the backend's, resolved
  // against `monthStartDay` through `month-window.ts`, and this used to be the calendar month
  // regardless - two labels for different windows, one above the other. The remaining gap is the
  // zone rather than the boundary: `todayIsoDate()` is the frontend host's and the backend's is
  // `APP_TIMEZONE`, which `docs/TODO.md` already tracks for every figure on the dashboard.
  //
  // The read is free - the shell's gate already made it, and `requireProfile` is `cache()`-memoized.
  const { monthStartDay } = await requireProfile();

  return <InsightsScreen set={set} overline={periodOverline(monthStartDay, todayIsoDate())} />;
}
