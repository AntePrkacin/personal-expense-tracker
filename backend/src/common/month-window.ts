/**
 * The budgeting period, resolved from the profile's `monthStartDay`.
 *
 * Every month-scoped figure in the app goes through here: per-category month
 * stats, the transaction list's period filter, and every dashboard aggregate.
 * There is deliberately no month column anywhere in the schema - month
 * attribution is `transactions.date` read against this window at query time,
 * which is what makes a backdated transaction land in its own month and a
 * changed `monthStartDay` re-bucket history correctly.
 */

/** A half-open period. `start` is included, `end` is not. */
export interface MonthWindow {
  /** `YYYY-MM-DD`, inclusive. */
  start: string;
  /** `YYYY-MM-DD`, exclusive. */
  end: string;
}

/** `{ year, month (0-11), day }` out of a `YYYY-MM-DD` string. */
function parseDate(date: string): { year: number; month: number; day: number } {
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

function formatDate(year: number, month: number, day: number): string {
  const yyyy = String(year).padStart(4, '0');
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Adds `delta` months to a year/month pair, carrying across the year. */
function addMonths(
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
 * The budgeting period containing `today`.
 *
 * Both bounds are `YYYY-MM-DD` strings, `start` inclusive and `end` exclusive,
 * so a query reads `date >= start and date < end`. That shape is deliberate
 * three times over: it compares text against the `text` column the schema
 * actually stores, it lets `transactions_date_idx` serve the range as a scan,
 * and an exclusive upper bound needs no "last day of the month" arithmetic.
 *
 * All arithmetic is on the date parts as integers. Nothing here constructs a
 * `Date`, because round-tripping a calendar date through one shifts it across
 * timezones - the same reason `transactions.date` is text rather than a
 * timestamp.
 *
 * @param monthStartDay Day of month the period begins on. The profile
 * constrains this to 1-28 precisely so every month has the day and there is no
 * clamping case; anything outside that range is a programming error and throws.
 * @param today `YYYY-MM-DD` for "now", formatted in the configured zone by
 * `todayIn` rather than taken from a `Date` here, so specs can pin behaviour
 * across month boundaries without faking timers.
 */
export function monthWindow(monthStartDay: number, today: string): MonthWindow {
  if (
    !Number.isInteger(monthStartDay) ||
    monthStartDay < 1 ||
    monthStartDay > 28
  ) {
    throw new Error(
      `monthStartDay must be an integer between 1 and 28, received ${monthStartDay}.`,
    );
  }

  const { year, month, day } = parseDate(today);

  // Before the start day, the current period began in the previous month.
  const start =
    day >= monthStartDay ? { year, month } : addMonths(year, month, -1);
  const end = addMonths(start.year, start.month, 1);

  return {
    start: formatDate(start.year, start.month, monthStartDay),
    end: formatDate(end.year, end.month, monthStartDay),
  };
}

/**
 * The window immediately before the one containing `today`.
 *
 * "One month earlier", never "30 days earlier": periods are month-length, so
 * subtracting a fixed day count drifts and would eventually skip or repeat one.
 */
export function previousMonthWindow(
  monthStartDay: number,
  today: string,
): MonthWindow {
  const current = monthWindow(monthStartDay, today);
  const { year, month } = parseDate(current.start);
  const start = addMonths(year, month, -1);

  return {
    start: formatDate(start.year, start.month, monthStartDay),
    end: current.start,
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
