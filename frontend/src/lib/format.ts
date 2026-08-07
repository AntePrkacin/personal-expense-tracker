import { dateFromIso, partsFromIso, todayIsoDate } from './date';

// Display formatting: money, the two forms a stored name takes on screen, the
// two forms the current period takes in the page header, the two forms a single
// calendar date takes, and the amount field as it is being typed into.
//
// All six are here for the same reason. Transactions are stored as positive
// magnitudes and rendered as negative amounts, a profile stores two names while
// the UI shows initials and a shortened form, the header shows a month that
// nothing stores at all, and a half-typed budget is a display string before it
// is ever a number. None of them is a property of the data, so they live
// here, once, instead of in every screen that shows them.

/**
 * U+2212 MINUS SIGN, which is what the Figma frames use, not U+002D
 * HYPHEN-MINUS.
 *
 * This substitution is deliberate and has to stay. `Intl.NumberFormat` emits
 * U+002D, so "simplifying" formatNegative down to a plain `Intl` call with a
 * negative input silently swaps the glyph. The test failure then reads
 * `expected "−$24.00", received "-$24.00"`, which is close to invisible in a
 * terminal. Screen readers also announce U+2212 as "minus" while U+002D is
 * ambiguous, so the design's choice is the accessible one too.
 */
const MINUS = '−';

// USD only for now. The currency picked during onboarding (02 Setup) is not
// stored yet; when it is, it gets threaded through here rather than into the
// components.
const CURRENCY = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

/** Formats an amount as currency, e.g. `1240` -> `"$1,240.00"`. */
export function formatCurrency(amount: number): string {
  return CURRENCY.format(amount).replace('-', MINUS);
}

/**
 * A second `Intl` instance at zero fraction digits, `docs/TODO.md`'s cents item answered
 * (PET-21): the design draws every aggregate figure whole - `$1,240`, not `$1,240.00` - while
 * every per-transaction amount keeps its cents through `formatCurrency`/`formatNegative`
 * above. It **rounds**, which is `Intl`'s own behaviour at zero fraction digits and the right
 * one here: it keeps a whole-dollar aggregate as close to the real total as one dollar
 * allows, where truncating would bias every figure on the dashboard downwards.
 */
const CURRENCY_WHOLE = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/**
 * Formats an amount as whole-dollar currency, e.g. `1240` -> `"$1,240"`.
 *
 * For an aggregate a user reconciles by eye - a budget readout, a chart bar, a legend total -
 * never for a per-transaction amount, which is what `formatCurrency` and `formatNegative` stay
 * for. Every caller in this epic hands it a non-negative figure; the `MINUS` substitution below
 * is defensive, matching `formatCurrency`'s own, rather than a sign this app draws anywhere.
 */
export function formatWhole(amount: number): string {
  return CURRENCY_WHOLE.format(amount).replace('-', MINUS);
}

/**
 * Formats a stored (positive) amount as the negative value the UI shows,
 * e.g. `24` -> `"−$24.00"`.
 *
 * Zero is returned unsigned: a negative zero reads as a bug, not as a debit.
 */
export function formatNegative(amount: number): string {
  const magnitude = Math.abs(amount);
  return magnitude === 0 ? formatCurrency(0) : `${MINUS}${formatCurrency(magnitude)}`;
}

/**
 * The first character of a name, uppercased, or `''` for an empty one.
 *
 * `Array.from(...)[0]` rather than `charAt(0)`: `charAt` indexes UTF-16 code
 * units, so it splits any astral-plane character in half and yields a lone
 * surrogate that renders as a replacement glyph. Names are user input from a
 * field with no charset restriction (`RegisterDto` bounds only the length), so
 * that is reachable.
 *
 * `toLocaleUpperCase` rather than `toUpperCase` for the same class of reason: it
 * is the one that respects locale-specific casing.
 */
function firstLetter(name: string): string {
  return (Array.from(name)[0] ?? '').toLocaleUpperCase();
}

/**
 * Avatar initials, e.g. `('Marko', 'Kovač')` -> `"MK"`.
 *
 * Derived, never stored: SET-2 says the initials come from the name and that no
 * upload exists, and the tech spec's data model marks `avatarInitials` as
 * derived. SET-6 then requires the sidebar footer and the Settings avatar to
 * agree, which is what makes one shared function the point rather than a
 * convenience.
 */
export function initials(firstName: string, lastName: string): string {
  return `${firstLetter(firstName)}${firstLetter(lastName)}`;
}

/**
 * The shortened name the sidebar footer shows, e.g. `('Marko', 'Kovač')` ->
 * `"Marko K."`.
 *
 * An empty last name yields the first name alone. Formatting it as designed
 * would leave a dangling `"Marko ."`, and the abbreviation mark has nothing to
 * abbreviate. `RegisterDto` marks both names `@IsNotEmpty`, so this is
 * defensive rather than expected, but the failure it prevents is visible on
 * every screen.
 */
export function shortName(firstName: string, lastName: string): string {
  const initial = firstLetter(lastName);
  return initial === '' ? firstName : `${firstName} ${initial}.`;
}

// The period the page header shows, in the two lengths the design draws: the
// overline carries the month and the year ("October 2025", DSH-2 and TRN-1) and
// the month select carries the month alone ("October").
//
// Both are here rather than in the pages because Dashboard and Transactions
// render the identical overline and must not drift, which is the same reason
// initials() is shared with the Settings avatar.
//
// Two limits worth knowing. The locale is hard-coded to en-US, matching
// CURRENCY above; when the onboarding currency is finally threaded through, the
// locale should follow it. And the period is the calendar month, ignoring the
// profile's `monthStartDay` - A9 makes that value define the period, but it is
// PET-45's to read, and the display is correct for its default of 1.

const MONTH_AND_YEAR = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });

const MONTH_ONLY = new Intl.DateTimeFormat('en-US', { month: 'long' });

/** The header overline, e.g. `"October 2025"`. */
export function monthOverline(date: Date): string {
  return MONTH_AND_YEAR.format(date);
}

/** The month select's label, e.g. `"October"`. */
export function monthLabel(date: Date): string {
  return MONTH_ONLY.format(date);
}

// A single calendar date, in the two lengths the design draws it. Long is the Date
// field's closed trigger, "Oct 8, 2025" (09 node 28:402, and the same string on 11).
// Short is the transactions table's DATE column, "Oct 8" (06 node 27:157), which drops
// the year because every row in a period filtered to one month repeats it. The calendar
// popover's own header reuses monthOverline above rather than adding a third.

const SHORT_DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/**
 * A `YYYY-MM-DD` string as the designed label, e.g. `'2025-10-08'` -> `"Oct 8, 2025"`.
 *
 * **It goes through `dateFromIso` rather than `new Date(iso)`, and that is the whole
 * reason this is three lines instead of one.** The date-only grammar parses a bare
 * `'2025-10-08'` as UTC midnight, so formatting it in any zone behind UTC prints
 * "Oct 7, 2025" - a field that silently displays the day before the one the user
 * picked. `lib/date.ts` builds the local midnight from parts instead, and its own
 * suite pins that in `America/New_York`.
 *
 * Returns `''` for a string that is not a calendar date, matching `dateFromIso`'s
 * totality: the trigger then renders its placeholder rather than "Invalid Date",
 * which is what a throw here would put on screen.
 */
export function formatIsoDate(iso: string): string {
  const date = dateFromIso(iso);
  return date === null ? '' : SHORT_DATE.format(date);
}

const DAY_AND_MONTH = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

/**
 * The same date without its year, e.g. `'2025-10-08'` -> `"Oct 8"` (TRN-5).
 *
 * A second formatter rather than a `slice` off the one above: `"Oct 8, 2025".split(',')[0]`
 * reads as equivalent and is a separator assumption, which is exactly the kind of thing
 * that stops being true the moment the locale does - and the locale is already tracked as
 * something the stored currency will eventually drag along.
 *
 * Every note on `formatIsoDate` applies unchanged: through `dateFromIso` rather than
 * `new Date(iso)`, because the date-only grammar parses as UTC midnight and prints the
 * previous day anywhere behind UTC, and `''` rather than "Invalid Date" for a string that
 * is not a calendar date - here that leaves the DATE cell blank, which is the same call
 * the row makes for a category it could not resolve.
 */
export function formatIsoDayMonth(iso: string): string {
  const date = dateFromIso(iso);
  return date === null ? '' : DAY_AND_MONTH.format(date);
}

/**
 * The whole-day difference from `from` to `to`, or `null` when either is not a calendar date.
 *
 * Both sides go through `partsFromIso` and the subtraction happens on `Date.UTC` of those
 * parts rather than on the local `Date`s `dateFromIso` would hand back. Those are 24 hours
 * apart on most days and 23 or 25 across a DST transition, so a local subtraction would be
 * relying on `Math.round` to absorb the hour - which it does, for a one-hour shift over one
 * day. That is a narrow guarantee to build day arithmetic on: it holds only while the rounding
 * stays, only for one-day gaps, and only for zones whose transition is an hour. `Date.UTC`
 * never observes a transition at all, so this is arithmetic on the calendar parts and nothing
 * about an instant, and the rounding is left in only to absorb float error.
 */
function daysBetween(from: string, to: string): number | null {
  const fromParts = partsFromIso(from);
  const toParts = partsFromIso(to);
  if (fromParts === null || toParts === null) return null;

  const fromUtc = Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day);
  const toUtc = Date.UTC(toParts.year, toParts.month - 1, toParts.day);
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

/**
 * A `YYYY-MM-DD` string as "Today", "Yesterday", or `formatIsoDayMonth(iso)` beyond that -
 * the dashboard's recent-transactions caption (DSH-7).
 *
 * **`today` is a parameter with a default, not a bare clock read.** `todayIsoDate()` answers it,
 * matching the shape `lib/date.ts`'s own helpers take, so a suite can pin "Yesterday" without
 * faking a timer - the one case here where a test that quietly passes at midnight is worse than
 * no test at all.
 *
 * A future date - reachable, since the Add transaction modal's date field allows one - is not a
 * case this handles specially: it falls through to the short date exactly like any other day
 * that is not today or yesterday, rather than inventing a fourth string ("Tomorrow") nothing
 * designs.
 *
 * **This still cannot answer whose "today" it is.** The default reads the *frontend host's*
 * local zone, while every other figure on this screen is scoped to a period the backend resolved
 * through `APP_TIMEZONE`. `docs/TODO.md` records the gap next to the per-user timezone item it
 * already owes; closing it needs a zone the frontend reads too; this formatter has no such
 * setting to reach for.
 *
 * That gap runs in **both** directions and the worse one is the false positive. With the host
 * behind the configured zone, the frontend's `today` is a day earlier than the backend's for
 * the length of the offset - so yesterday's transaction reads "Today" while today's reads its
 * short date. One row is merely missing a word; the other asserts something untrue. Ahead of
 * the configured zone it is the benign direction only, a missing "Today".
 */
export function formatRelativeDate(iso: string, today: string = todayIsoDate()): string {
  const diff = daysBetween(iso, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return formatIsoDayMonth(iso);
}

// The amount field as it is being typed into (02 Setup's "Monthly budget", and
// later every Amount field). Three functions: the display string, the number
// behind it, and where the caret belongs after reformatting.
//
// This is deliberately NOT formatCurrency, and the difference is not stylistic.
// formatCurrency goes through Intl, which forces two decimals, rounds, drops a
// trailing separator and emits a currency symbol. Every one of those is wrong
// mid-keystroke: a user typing "24." would watch it become "$24.00" under the
// caret. So none of this touches `Number` on the way out, and the `$` belongs to
// `Input variant="currency"` rather than to the string.
//
// The group separator is hard-coded, matching CURRENCY and the two DateTimeFormats
// above. When the onboarding currency is finally stored and threaded through,
// this follows it along with them.

/** Digits and the decimal point: the characters a caret can meaningfully sit between. */
const SIGNIFICANT = /[0-9.]/;

/** How many significant characters `text` holds. */
function countSignificant(text: string): number {
  let count = 0;
  for (const char of text) if (SIGNIFICANT.test(char)) count += 1;
  return count;
}

/**
 * The display form of a partly-typed amount, e.g. `'2000.5'` -> `'2,000.5'`.
 *
 * Everything that is not a digit or a decimal point is dropped, including the
 * separators it just emitted, so this is **idempotent**: formatting its own
 * output is a no-op. `amountCaret` and the controlled input in
 * `app/setup/BudgetForm.tsx` both depend on that, because the caret is restored
 * by making the DOM value equal the prop before React compares them.
 *
 * A sign is dropped too. A budget is a magnitude, which is what the backend's
 * `@IsPositive` on `RegisterDto.monthlyBudget` says as well.
 *
 * The fraction is **truncated** to two digits rather than rounded, which is what
 * makes a third decimal keystroke a no-op instead of a value that changes under
 * the user: typing `5` onto `2,000.55` yields the raw `2000.555`, which formats
 * straight back to `2,000.55`. Two digits is `@IsNumber({ maxDecimalPlaces: 2 })`
 * on the same field.
 *
 * A trailing `.` survives, because `'24.'` is a real intermediate state and
 * deleting the point the user just typed is the most infuriating possible
 * behaviour. `'.5'` keeps its missing leading zero for the same reason:
 * inserting a significant character mid-keystroke is exactly the caret bug this
 * function exists to avoid, and `parseAmountInput('.5')` is `0.5` regardless.
 */
export function formatAmountInput(raw: string): string {
  const [integer = '', ...rest] = raw.replace(/[^0-9.]/g, '').split('.');

  // Only the first point counts, so '1.2.3' is '1.23' rather than rejected.
  const hasPoint = rest.length > 0;
  const fraction = rest.join('').slice(0, 2);

  // '007' -> '7', while a lone '0' survives: AC3's zero case has to stay
  // reachable, and so does the '0' in '0.50'.
  const digits = integer.replace(/^0+(?=\d)/, '');
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return hasPoint ? `${grouped}.${fraction}` : grouped;
}

/**
 * The number a display string stands for, e.g. `'2,000.50'` -> `2000.5`, or
 * `NaN` when it holds no number at all.
 *
 * `NaN` rather than `0` for an empty field, because those are different answers:
 * `isBudgetValid` in `app/setup/draft.ts` has to reject `''` and `'0'` alike but
 * for different reasons, and a caller that cannot tell them apart would treat an
 * untouched field as a deliberate zero.
 *
 * The digit test is what makes that work: `Number('')` is `0` and `Number('.')`
 * is `NaN`, so leaning on `Number` alone would answer `0` for a field nobody has
 * typed in.
 */
export function parseAmountInput(value: string): number {
  const bare = value.replace(/,/g, '');
  return /\d/.test(bare) ? Number(bare) : NaN;
}

/**
 * Where the caret belongs in `formatted`, given where it sat in `raw`.
 *
 * Counts the significant characters before the old caret and returns the index
 * just after that many of them in the new string, so an inserted or removed
 * group separator does not drag the caret with it. Without this, typing into the
 * middle of `2,000` sends the caret to the end on every keystroke, because
 * React's controlled-input commit reassigns `value` and the browser then
 * collapses the selection.
 *
 * Correct as long as `formatAmountInput` only ever *drops* significant
 * characters and never inserts or reorders them, which is true, and the clamp
 * covers the dropping.
 */
export function amountCaret(raw: string, caret: number, formatted: string): number {
  const from = Math.max(0, Math.min(caret, raw.length));
  const wanted = Math.min(countSignificant(raw.slice(0, from)), countSignificant(formatted));
  if (wanted === 0) return 0;

  let seen = 0;
  for (let index = 0; index < formatted.length; index += 1) {
    if (SIGNIFICANT.test(formatted[index]!)) {
      seen += 1;
      if (seen === wanted) return index + 1;
    }
  }
  return formatted.length;
}
