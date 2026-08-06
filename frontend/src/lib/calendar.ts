// Month-grid arithmetic for the date picker in `(app)/DateField.tsx`.
//
// React-free and `Intl`-free, the same split `app/setup/draft.ts` makes: the shape
// and the rules live in a plain module so their suite needs no jsdom, and the
// component above is left with rendering and keyboard handling only.
//
// **No Figma frame backs any of this.** ADD-7 draws the Date field as a closed select
// and the file contains no calendar at all, so the week order, the six-row grid and
// every day-cell state are ours and owe a designer answer along with the rest of what
// assumption A29 covers. `docs/TODO.md` records it.
//
// Two conventions, both inherited from `lib/date.ts` and both worth stating because
// mixing them is the classic bug in calendar code:
//
//   - **Months are 1-12**, never 0-11. The conversion happens only where a `Date` is
//     actually constructed, which in this file is two places.
//   - **The week starts on Monday**, so column 0 is Monday and column 6 is Sunday. That is
//     deliberately *not* `Date.prototype.getDay()`, which numbers from Sunday, and not the
//     `en-US` convention the rest of the app is pinned to either - it is a product decision,
//     since a spending week reads better ending at the weekend. `leadingBlanks` below is the
//     one place the two numberings meet, and nothing else in this file or in `DateField` may
//     use `getDay()` directly. Mixing the two is the classic calendar bug: it renders a grid
//     that is off by one column and looks plausible.

import { isoFromParts, partsFromIso } from './date';

/**
 * The column headings, **Monday first**.
 *
 * Single letters because the popover is 280px wide and three-letter names do not fit
 * seven columns at a readable size. They are ambiguous by design - T and S each
 * appear twice - which is why `DateField` renders them `aria-hidden` and gives each
 * day button its own full accessible date instead. A screen reader reading "M, T, W,
 * T, F, S, S" would be worse than reading nothing.
 *
 * The order has to match `leadingBlanks` below, and this is the pair to change together
 * if the week ever starts somewhere else.
 */
export const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

/** How many rows every grid has. See `monthMatrix` for why it is fixed. */
export const WEEKS_IN_GRID = 6;

/** Days per row. */
const DAYS_IN_WEEK = 7;

/**
 * How many days a 1-12 month has, leap years included.
 *
 * Day 0 of the *next* month is the last day of this one, which is the standard trick
 * and is exact for February without a leap-year rule written out here. It is safe in
 * a way `new Date(iso)` is not, because the arguments are numbers rather than a
 * string, so no UTC parsing is involved.
 */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * How many empty cells come before the 1st of a 1-12 month, 0-6.
 *
 * **Named for what it is rather than for the weekday**, because that is the whole hazard here:
 * `getDay()` numbers from Sunday and this grid numbers from Monday, so a function called
 * `firstWeekdayOfMonth` returning a *column* invites somebody to compare it against `getDay()`
 * and be wrong by one for six days out of seven. `(getDay() + 6) % 7` is the conversion, and
 * this is the only place in the codebase that performs it.
 *
 * So: Monday answers 0 and needs no blanks, Sunday answers 6 and needs six.
 */
export function leadingBlanks(year: number, month: number): number {
  return (new Date(year, month - 1, 1).getDay() + 6) % 7;
}

/**
 * The month `delta` months away from a 1-12 month, rolling the year over.
 *
 * Plain arithmetic on a months-since-year-zero index rather than
 * `date.setMonth(date.getMonth() + delta)`, which is the obvious version and is
 * wrong: adding one month to 31 January lands on 3 March, because the intermediate
 * 31 February rolls over. The picker's chevrons page a *month*, not a date, so the
 * day must not participate in the arithmetic at all.
 */
export function addMonths(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;

  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/**
 * The date `delta` days from a `YYYY-MM-DD` string, or `null` if it was not one.
 *
 * What the picker's arrow keys move by: one day for left and right, seven for up and down.
 * Crossing a month or year boundary is ordinary here, unlike in `addMonths`, because moving
 * a day *should* carry into the next month.
 *
 * `setDate` past the end of a month rolls forward correctly, which is the one place that
 * behaviour is wanted rather than a bug. The result is read back through local getters, so
 * no UTC conversion happens in either direction - the rule `lib/date.ts` sets.
 */
export function addDays(iso: string, delta: number): string | null {
  const parts = partsFromIso(iso);
  if (parts === null) return null;

  const date = new Date(parts.year, parts.month - 1, parts.day + delta);

  return isoFromParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/**
 * The `YYYY-MM-DD` strings for one month's grid: **always six rows of seven**, with
 * `null` in the leading and trailing cells that belong to no day of this month.
 *
 * Six rows rather than the four to six a month actually spans, because the popover
 * must not change height when the chevrons page it. A grid that grew a row would
 * shift the footer buttons under the user's cursor mid-click, and stabilising it in
 * CSS instead would mean a magic min-height that silently stops matching when the
 * cell size changes. Six is always enough and never too few: the worst case is a
 * 31-day month starting on **Sunday** - six leading blanks plus 31 days is 37 cells -
 * and six rows give 42. (Sunday rather than Saturday because the week starts on
 * Monday here, which is exactly the sort of detail that moves when the first day does.)
 *
 * ISO strings rather than day numbers, so `DateField` never re-derives one and cannot
 * disagree with `lib/date.ts` about what day a cell is. `null` rather than the
 * neighbouring months' days, because the design has no styling for an adjacent-month
 * day and inventing one would be inventing more than the file contains.
 */
export function monthMatrix(year: number, month: number): (string | null)[][] {
  const lead = leadingBlanks(year, month);
  const days = daysInMonth(year, month);

  const cells: (string | null)[] = [];

  for (let cell = 0; cell < WEEKS_IN_GRID * DAYS_IN_WEEK; cell += 1) {
    const day = cell - lead + 1;
    cells.push(day >= 1 && day <= days ? isoFromParts(year, month, day) : null);
  }

  const rows: (string | null)[][] = [];
  for (let row = 0; row < WEEKS_IN_GRID; row += 1) {
    rows.push(cells.slice(row * DAYS_IN_WEEK, (row + 1) * DAYS_IN_WEEK));
  }

  return rows;
}
