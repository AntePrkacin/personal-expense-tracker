// Display formatting: money, the two forms a stored name takes on screen, and
// the two forms the current period takes in the page header.
//
// All three are here for the same reason. Transactions are stored as positive
// magnitudes and rendered as negative amounts, a profile stores two names while
// the UI shows initials and a shortened form, and the header shows a month that
// nothing stores at all. None of them is a property of the data, so they live
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
