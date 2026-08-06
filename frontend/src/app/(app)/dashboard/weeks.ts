import { addDays } from '@/lib/calendar';
import type { DashboardSummary } from '@/lib/dashboard';

// The one piece of real arithmetic on the trend card: which bucket is the current week.
//
// Its own module rather than a helper inside `TrendCard.tsx`, because AC3's range test is worth
// pinning without a render, and the short-final-bucket case - the contract's last bucket ending
// at the period end rather than seven days after its start - is exactly the kind of thing that
// passes every test written against a tidy 28-day fixture and fails for the last few days of a
// shorter month.

type WeeklyBucket = DashboardSummary['weeklyBuckets'][number];

/**
 * The date the backend was standing on when it built these buckets, as `YYYY-MM-DD`, or `null`.
 *
 * **This exists so the card never reads a clock**, which is the whole of the fix for the review
 * finding recorded below. `daysLeft` is `daysBetween(today, window.end)`
 * (`backend/src/common/month-window.ts`), and the final bucket's `endDate` **is** `window.end` -
 * `weeklyBucketsOf` ends its last bucket at the period end rather than seven days after its own
 * start, which is the same contract detail `currentWeekIndex`'s range test depends on. So
 * `window.end` minus `daysLeft` is exactly the `today` the backend resolved against
 * `APP_TIMEZONE`, arithmetic rather than a second opinion, and both halves arrive on the one
 * `GET /api/dashboard` response the card is already built from.
 *
 * **What it replaces was not the harmless edge the first version of this file claimed.** That
 * version called `lib/date.ts`'s `todayIsoDate()` and described the disagreement as "one week
 * off for up to an hour twice a month". It was wrong three ways. The gap is the full zone offset
 * (two hours under CEST, not one), it straddles *every* bucket boundary rather than the month's
 * (five chances a period, not two), and on the **first day of a period** the frontend's `today`
 * falls before `buckets[0].startDate`, so `currentWeekIndex` answered `null` and **no bar was
 * highlighted at all** - AC3 failing outright rather than pointing one week off. Nothing pins
 * `TZ` on the frontend host, so a UTC container against the default `Europe/Zagreb` is the
 * ordinary deployment rather than a contrived one.
 *
 * **Total, and `null` is an ordinary answer.** `daysLeft` can read 0 at the midnight boundary
 * (`backend/CLAUDE.md`'s Dashboard section), which puts `today` on `window.end` and outside every
 * bucket - `currentWeekIndex` then says "no highlight" honestly, exactly as it does for a `today`
 * past the last bucket, and the next request corrects itself. The guards are the same call
 * `parseDraft` and `partsFromIso` make: this reads a network response, so a shape it cannot use
 * must not throw inside a card.
 */
export function todayFromDaysLeft(buckets: WeeklyBucket[], daysLeft: number): string | null {
  const periodEnd = buckets[buckets.length - 1]?.endDate;

  if (periodEnd === undefined || !Number.isInteger(daysLeft) || daysLeft < 0) {
    return null;
  }

  return addDays(periodEnd, -daysLeft);
}

/**
 * The index of `buckets` that contains `today`, or `null` if none does.
 *
 * **A half-open range test, `startDate <= today < endDate`, string-compared on `YYYY-MM-DD`.**
 * ISO dates sort correctly as text, so this needs no `Date` at all - which is deliberate, since
 * `lib/date.ts` and `lib/format.ts` both record that `new Date(iso)` parses a date-only string as
 * UTC midnight and reads a day early behind UTC. It must not be written as `startDate + 7 days`:
 * the contract documents the final bucket as short, ending at the period end rather than seven
 * days after its start, so a computed end would place `today` outside every range for the last
 * few days of a period shorter than a clean multiple of seven and the highlight would silently
 * vanish. Comparing against each bucket's own `endDate` is what keeps that case correct without a
 * special final-bucket branch.
 *
 * **`null` for the empty array and for a `today` outside every bucket, and both are ordinary.**
 * `weeklyBuckets` is `[]` exactly when `transactionCount === 0` - `TrendCard.tsx` renders nothing
 * for that account rather than calling this at all - and `today` can fall after the last bucket
 * for the same reason `daysLeft` can momentarily read 0 at the midnight boundary
 * (`backend/CLAUDE.md`'s Dashboard section): the endpoint resolves the period more than once
 * per request, so the window and `today` can land on either side of it for an instant. Neither
 * case is a defect this function should paper over; it says "no highlight" honestly and the next
 * request corrects itself.
 *
 * **`today` must come from `todayFromDaysLeft` above, never from a clock.** `weeklyBuckets`'
 * boundaries come from `monthWindow`, which resolves its own `today` against `APP_TIMEZONE`
 * (`backend/src/common/month-window.ts`). Passing `lib/date.ts`'s `todayIsoDate()` here compares
 * those boundaries against whichever zone the frontend host runs in, which is the defect that
 * function's doc comment records. This one stays a pure range test over two strings, so it is
 * indifferent to where its argument came from - which is exactly what makes the caller's choice
 * the thing to get right.
 */
export function currentWeekIndex(buckets: WeeklyBucket[], today: string): number | null {
  const index = buckets.findIndex(
    ({ startDate, endDate }) => startDate <= today && today < endDate,
  );
  return index === -1 ? null : index;
}
