/**
 * Calendar arithmetic on `YYYY-MM-DD` strings, and the clock read that produces
 * one.
 *
 * **This file used to resolve the budgeting period itself, and PET-72 took that
 * job away from it.** `monthWindow` and `previousMonthWindow` lived here and
 * derived a window from one current `profile.monthStartDay`; a period is now the
 * output of a walk over effective-dated `period_rules`, so the tiling moved into
 * `common/period-rules.ts` and the reads compose `PeriodService`. What is left
 * here is the layer underneath: integer date arithmetic with no notion of a
 * budgeting period at all, plus `todayIn`.
 *
 * Nothing in this file constructs a `Date` except `todayIn`, which needs one to
 * ask what day it is. Round-tripping a calendar date through a `Date` shifts it
 * across timezones - the same reason `transactions.date` is text rather than a
 * timestamp.
 */

/**
 * A half-open period. `start` is included, `end` is not.
 *
 * Named for the month window it originally described; it is now the structural
 * shape of any period, which `period-rules.ts`' `Period` extends with a label.
 * Kept here because the two functions below take one and know nothing else.
 */
export interface MonthWindow {
  /** `YYYY-MM-DD`, inclusive. */
  start: string;
  /** `YYYY-MM-DD`, exclusive. */
  end: string;
}

/**
 * `{ year, month (0-11), day }` out of a `YYYY-MM-DD` string.
 *
 * Exported for `period-rules.ts` alone. These three primitives stay here rather
 * than moving with the tiling so that the walk and the day arithmetic cannot
 * drift into two parsers of the same format; nothing outside `common/` should
 * need them.
 */
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

/** `YYYY-MM-DD` from date parts. Exported for `period-rules.ts` alone. */
export function formatDate(year: number, month: number, day: number): string {
  const yyyy = String(year).padStart(4, '0');
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Adds `delta` months to a year/month pair, carrying across the year. Exported
 * for `period-rules.ts` alone.
 */
export function addMonths(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const total = year * 12 + month + delta;
  return {
    year: Math.floor(total / 12),
    month: total - Math.floor(total / 12) * 12,
  };
}

/**
 * Today's calendar date in `timeZone`, as `YYYY-MM-DD`.
 *
 * `en-CA` because its short date format *is* ISO 8601, which avoids assembling
 * the parts by hand. The zone comes from `APP_TIMEZONE` and is validated at
 * boot, so an invalid one cannot reach here.
 *
 * @param now Injectable for tests. Defaults to the real clock.
 */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Whole days from `today` to the end of its period, counting today itself.
 *
 * On the final day of a period this is 1, not 0: the day is not over. A caller
 * wanting "days after today" wants this minus one.
 */
export function daysLeftInWindow(window: MonthWindow, today: string): number {
  return daysBetween(today, window.end);
}

/** Whole days from `from` (inclusive) to `to` (exclusive). */
export function daysBetween(from: string, to: string): number {
  return toDayNumber(to) - toDayNumber(from);
}

/**
 * A date as a count of days since an arbitrary fixed epoch, so two dates can be
 * subtracted. Days-from-civil, the standard branchless algorithm: it shifts the
 * year to start in March so the leap day lands at the end and needs no special
 * case.
 */
function toDayNumber(date: string): number {
  const { year, month, day } = parseDate(date);
  const y = month <= 1 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const monthShifted = month <= 1 ? month + 10 : month - 2;
  const doy = Math.floor((153 * monthShifted + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe;
}

/**
 * The inverse of `toDayNumber`: civil-from-days, run against the same
 * unshifted epoch. Hinnant's version subtracts 719468 up front to land on
 * 1970-01-01; `toDayNumber` never added it, so this does not undo it either -
 * the two would disagree on every date if one shifted and the other did not.
 */
function fromDayNumber(dayNumber: number): {
  year: number;
  month: number;
  day: number;
} {
  const era = Math.floor(dayNumber / 146097);
  const doe = dayNumber - era * 146097; // [0, 146096]
  const yoe = Math.floor(
    (doe -
      Math.floor(doe / 1460) +
      Math.floor(doe / 36524) -
      Math.floor(doe / 146096)) /
      365,
  ); // [0, 399]
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)); // [0, 365]
  const monthShifted = Math.floor((5 * doy + 2) / 153); // [0, 11], March-based
  const day = doy - Math.floor((153 * monthShifted + 2) / 5) + 1;
  // Undoes toDayNumber's own shift: 10 and 11 are January and February of the
  // *next* civil year, everything else is March (0) through December (9).
  const month = monthShifted < 10 ? monthShifted + 2 : monthShifted - 10;
  const year = monthShifted < 10 ? y : y + 1;
  return { year, month, day };
}

/**
 * `date` plus `days`, `YYYY-MM-DD` in, `YYYY-MM-DD` out. `days` may be
 * negative.
 *
 * The one function in this file that has to invert `toDayNumber` rather than
 * only subtract two of them, because a weekly bucket boundary needs an actual
 * calendar date to label itself with, not a day count. Pure integer arithmetic
 * throughout, like the rest of the file - no `Date`, so no timezone to get
 * wrong.
 */
export function addDays(date: string, days: number): string {
  const { year, month, day } = fromDayNumber(toDayNumber(date) + days);
  return formatDate(year, month, day);
}
