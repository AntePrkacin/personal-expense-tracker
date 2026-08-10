import { addMonths } from './calendar';
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

// **Money is not here any more.** `lib/money.ts` owns `formatCurrency`, `formatWhole` and
// `formatNegative`, because PET-47 made them take the profile's currency and a formatter bound to
// one currency at module scope is exactly what that ticket removed. A Server Component calls
// `moneyFormatters(currency)` with a currency threaded from its page; a Client Component calls
// `useMoney()`. Nothing re-exports the old default-bound trio from here: the plan expected
// `app/DecorativePanel.tsx` to keep needing them, and it turned out that file draws its figures as
// literal strings and only *mentions* `formatCurrency` in a comment saying why.
//
// What stays is the amount **field** - `formatAmountInput`, `parseAmountInput` and `amountCaret` -
// which is deliberately currency-blind and must not follow the currency. That module records why.

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
 * Avatar initials, e.g. `'Marko Kovač'` -> `"MK"`.
 *
 * Derived, never stored: SET-2 says the initials come from the name and that no
 * upload exists, and the tech spec's data model marks `avatarInitials` as
 * derived. SET-6 then requires the sidebar footer and the Settings avatar to
 * agree, which is what makes one shared function the point rather than a
 * convenience.
 *
 * **One argument since PET-72**, which collapsed the profile's two name fields
 * into one. It splits on whitespace and takes the first letter of the first two
 * words, so "Marko Kovač" still reads "MK" and a single-word display name reads
 * as one letter rather than as a letter and a blank.
 */
export function initials(fullName: string): string {
  const [first = '', second = ''] = fullName.trim().split(/\s+/);
  return `${firstLetter(first)}${firstLetter(second)}`;
}

/**
 * The shortened name the sidebar footer shows, e.g. `'Marko Kovač'` ->
 * `"Marko K."`.
 *
 * A one-word name yields that word alone. Formatting it as designed would leave
 * a dangling `"Marko ."`, and the abbreviation mark has nothing to abbreviate.
 * `RegisterDto` marks the name `@IsNotEmpty`, so an empty string is defensive
 * rather than expected, but a single word is now **ordinary**: PET-72 collapsed
 * the two name fields into one "Display name" whose placeholder invites a
 * nickname, so "Marko" with no surname is a value the form actively offers.
 */
export function shortName(fullName: string): string {
  const [first = '', second = ''] = fullName.trim().split(/\s+/);
  const initial = firstLetter(second);
  return initial === '' ? first : `${first} ${initial}.`;
}

// The period the page header shows, in the two lengths the design draws: the
// overline carries the month and the year ("October 2025", DSH-2 and TRN-1) and
// the month select carries the month alone ("October").
//
// Both are here rather than in the pages because Dashboard and Transactions
// render the identical overline and must not drift, which is the same reason
// initials() is shared with the Settings avatar.
//
// Two limits worth knowing. The locale is hard-coded to en-US; `docs/TODO.md` carries that
// deviation. And **these two format a calendar month, which is not the same thing as the
// budgeting period** - `periodOverline` and `periodLabel` below are what a screen showing a
// period wants. The paragraph that used to sit here said the period "is the calendar month,
// ignoring the profile's `monthStartDay`" and named PET-45 as the ticket that would fix it;
// PET-47 is the one that did, by adding the pair below rather than by changing these.
//
// **They are not deprecated, and the distinction is the whole point.** `(app)/DateField.tsx`
// draws a real calendar grid and its popover header names the month that grid is *of* - a period
// label over six rows of real weeks would be nonsense. So a caller wanting the month keeps these,
// and a caller wanting the user's budgeting period takes the pair below.

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

// The **budgeting period** the page header shows, in the same two lengths, and the answer to the
// `docs/TODO.md` entry that had been open since PET-19: "The header period ignores the profile's
// month start day".
//
// A9 makes `monthStartDay` define the period every "This month" filter and every days-left figure
// is scoped to, so a header formatting the calendar month is only correct at the default of 1.
// PET-30 gave that a visible symptom rather than only a wrong label: with `monthStartDay: 15` the
// list read resolves `period=current` to 15 Oct - 15 Nov while the overline said "October", so a
// transaction inside the calendar month but outside the period was absent from a page whose title
// named that month, and if it was the only one the screen reported no transactions under a heading
// saying otherwise.
//
// **The fix is the one that TODO entry proposed: name both months.** A period spanning 15 October
// to 15 November has no single month name, and inventing one is what produced the defect. So above
// a `monthStartDay` of 1 the label is "October / November", and the header stops claiming a
// boundary the data does not have.
//
// **These do not resolve a window, and must not start.** Every *figure* on every screen is scoped
// to a period the backend resolved through `src/common/month-window.ts` against `APP_TIMEZONE`;
// this is the label for that period and nothing else. The month arithmetic below mirrors that
// module's rule - a period runs day N to day N, so today at or after N is in the period starting
// this month - and it is a deliberate second copy of a rule bounded to two branches, because the
// alternative is a field on four separate responses. If a period ever stops being derivable from
// one number, this is the thing that has to become an API field rather than the thing to extend.
//
// **`today` defaults to the frontend host's zone, which is the skew this app already has.**
// `formatRelativeDate` below carries the same default and the same caveat, and `TrendCard` records
// what it costs: the frontend's idea of today and the backend's can differ by the full zone offset,
// so on the boundary day this can name the neighbouring period until the two agree. That is the
// pre-existing gap `docs/TODO.md` tracks rather than a new one - the old code read `new Date()` at
// four call sites for the same purpose - and it is a parameter rather than a bare clock read for
// `todayIsoDate`'s own reason: it is what lets the boundary cases be tested at all.

/** The two calendar months a period touches, as `Date`s on the 1st, in order. */
function periodMonths(monthStartDay: number, today: string): { start: Date; end: Date } | null {
  const parts = partsFromIso(today);
  if (parts === null) return null;

  // `>=` rather than `>`, matching the backend: the boundary day belongs to the period it opens.
  const startsThisMonth = parts.day >= monthStartDay;
  const start = startsThisMonth ? parts : addMonths(parts.year, parts.month, -1);
  const end = startsThisMonth ? addMonths(parts.year, parts.month, 1) : parts;

  // Built from parts on the 1st rather than parsed from a string, which is `lib/date.ts`'s rule:
  // a date-only string parses as UTC midnight and formats as the previous day anywhere behind UTC.
  return {
    start: new Date(start.year, start.month - 1, 1),
    end: new Date(end.year, end.month - 1, 1),
  };
}

/**
 * The header overline for the user's budgeting period, e.g. `"October 2025"` at a
 * `monthStartDay` of 1 and `"October / November 2025"` above it.
 *
 * The year appears **once** when the period stays inside one, and on both halves when it does not
 * ("December 2025 / January 2026"), because that is the one case where a single trailing year
 * would be wrong about the first month rather than merely terse.
 *
 * Falls back to the calendar month for a `monthStartDay` outside 1-28, which
 * `UpdateProfileDto` makes unreachable - `@IsInt @Min(1) @Max(28)` - and which is a fallback
 * rather than a throw because this is a page heading: taking the screen out through the error
 * boundary over a label is the worse of the two failures.
 */
export function periodOverline(monthStartDay: number, today: string = todayIsoDate()): string {
  const months = periodMonths(monthStartDay, today);
  if (months === null || monthStartDay <= 1 || monthStartDay > 28) {
    return monthOverline(dateFromIso(today) ?? new Date());
  }

  const sameYear = months.start.getFullYear() === months.end.getFullYear();
  const first = sameYear ? monthLabel(months.start) : monthOverline(months.start);

  return `${first} / ${monthOverline(months.end)}`;
}

/**
 * The same period without its year, e.g. `"October"` or `"October / November"`.
 *
 * What the Dashboard's month pill and the Categories tab's "{period} spending" heading draw. Every
 * note on `periodOverline` applies unchanged.
 */
export function periodLabel(monthStartDay: number, today: string = todayIsoDate()): string {
  const months = periodMonths(monthStartDay, today);
  if (months === null || monthStartDay <= 1 || monthStartDay > 28) {
    return monthLabel(dateFromIso(today) ?? new Date());
  }

  return `${monthLabel(months.start)} / ${monthLabel(months.end)}`;
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
// The group separator is hard-coded, matching the two DateTimeFormats above - **and it must not
// follow the stored currency**, which is the opposite of what this comment promised until PET-47.
// It named a `CURRENCY` constant that no longer exists in this file, and it predicted the separator
// would follow the currency once one was stored. One is stored now, and both `lib/money.ts` and
// `frontend/CLAUDE.md` record the decision that these three functions stay `en-US`: they format a
// value mid-keystroke, so a locale-derived separator would desynchronise the field being typed into
// from the figure rendered beside it.

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
