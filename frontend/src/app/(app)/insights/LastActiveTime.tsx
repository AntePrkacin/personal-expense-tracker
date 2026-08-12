'use client';

import { calendarDateOfInstant, formatRelativeDate } from '@/lib/format';

import { useHydrated } from './useHydrated';

// One History row's "Today", "Yesterday" or "Oct 8", rendered after hydration and never during it.
//
// **This is `MessageTime.tsx` for the other surface, and it exists because a review of PR #92 found
// the two disagreeing about the same instant.** Both go through `calendarDateOfInstant` into
// `formatRelativeDate`, which is what `formatMessageTimestamp`'s docblock says makes them unable to
// disagree - and the claim was false, because *which zone* each resolved `today` in had come apart.
// PET-76 made the chat row client-only, so its `today` is the reader's; this caption was still
// server-rendered inside a Server Component, so its `today` was the frontend host's. With the
// frontend at `TZ=UTC` and the reader in `Europe/Zagreb`, a message at `2026-08-12T23:00:00Z` read at
// `01:00Z` showed "Last active Yesterday" in the list and "Today, 1:00 AM" on its own row. One fact,
// two answers, on two screens of one feature.
//
// **The History screen is a Server Component and stays one**, which is why this is a module of its
// own rather than a `'use client'` on that file: the screen is a list of links and holds nothing, and
// the smallest-wrapper rule `SidebarNav` and `TrendChart` follow says the boundary belongs on the one
// thing that needs it. That is also the whole difference from `MessageTime`'s situation - there the
// surrounding screen was *already* a client component, so the bug was a hydration mismatch React
// could see; here there is no client pass at all, so the server's zone was simply the answer, with
// nothing to warn and nothing to correct it. **The wrong zone is the same defect whether or not
// anything hydrates**, and that is the sentence to carry into the next server-rendered date.
//
// The `<time dateTime>` wrapper renders in both passes, empty then filled, exactly as `MessageTime`'s
// does and for the same two reasons: the instant is in the markup from the first byte for anything
// machine-reading the page, and the pop-in happens inside a box already laid out. **"Last active"
// stays in the screen** rather than moving in here, because it is that caption's copy and because
// `<time>` should contain a time and not a sentence about one.
//
// The cost is `MessageTime`'s, restated: **the relative day is absent for one frame** on a
// server-rendered list. Accepted for the same reason - being confidently wrong about it is worse -
// and the row's title, its link and its layout are all there from the first byte.

export type LastActiveTimeProps = {
  /** The ISO instant a conversation was last active. */
  instant: string;
  /**
   * Today, for the relative wording.
   *
   * A parameter with a default rather than a bare clock read, the shape `formatRelativeDate` and
   * every helper in `lib/date.ts` take, so a story and a suite can pin "Today" without faking a
   * timer. Left undefined - which is what the route does - it is the **reader's** own zone, read
   * after hydration, which is the whole point of this component.
   */
  today?: string;
};

export function LastActiveTime({ instant, today }: LastActiveTimeProps) {
  const hydrated = useHydrated();

  return (
    <time dateTime={instant}>
      {hydrated ? formatRelativeDate(calendarDateOfInstant(instant), today) : ''}
    </time>
  );
}
