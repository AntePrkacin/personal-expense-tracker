/**
 * Calendar helpers for the showcase seed.
 *
 * Split out by PET-69 so they are reachable from a spec: `seed-showcase.ts`
 * exports nothing and runs `bootstrap()` at import, so importing it from a test
 * boots Nest and seeds a database.
 */

/** `{ year, month (0-11), day }` out of a `YYYY-MM-DD` string. */
export function parseDate(date: string): {
  year: number;
  month: number;
  day: number;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error(`Expected a YYYY-MM-DD date, received "${date}".`);
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day: Number(match[3]),
  };
}

/**
 * `YYYY-MM-DD`, `monthsAgo` calendar months before `from`.
 *
 * The year carry is done here rather than by handing a negative month to
 * `new Date(...)`, which would also work: no calendar date in this file is ever
 * round-tripped through a Date, because doing that shifts it across timezones.
 * Same reason `transactions.date` is text - see src/common/month-window.ts.
 */
export function dateMonthsAgo(
  from: { year: number; month: number },
  monthsAgo: number,
  day: number,
): string {
  const total = from.year * 12 + from.month - monthsAgo;
  const year = Math.floor(total / 12);
  const month = total - year * 12;

  const yyyy = String(year).padStart(4, '0');
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Whether a fixture transaction has happened yet, given the seeding day.
 *
 * **This is where the current month becomes partial**, and it replaces the
 * `elapsed` scaling generation used to do. Everything in a past month has
 * happened; in the month containing the seeding day, only what falls on or
 * before that day has. Because the generator spreads transactions over days
 * 1-28, dropping the rest removes proportionally as many of them, so the count
 * and the spend scale down together with no arithmetic anywhere.
 *
 * The seeding day itself is **included**. Excluding it was considered and
 * rejected: it makes the whole current month empty when the seed is run on the
 * 1st, which leaves the Dashboard's current-month cards with nothing to show on
 * exactly the day somebody is most likely to be demoing a fresh seed.
 *
 * A seeding day past the 28th keeps the whole month, since the generator emits
 * no day above `MAX_DAY_OF_MONTH`. No clamping case, the same reason the profile
 * constrains `monthStartDay` to 1-28.
 */
export function hasHappened(
  transaction: { monthsAgo: number; day: number },
  today: { day: number },
  maxDayOfMonth: number,
): boolean {
  if (transaction.monthsAgo > 0) {
    return true;
  }
  return transaction.day <= Math.min(today.day, maxDayOfMonth);
}
