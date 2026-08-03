// Display formatting: money, and the two forms a stored name takes on screen.
//
// Both halves are here for the same reason. Transactions are stored as positive
// magnitudes and rendered as negative amounts, and a profile stores two names
// while the UI shows initials and a shortened form. Neither is a property of the
// data, so both live here, once, instead of in every screen that shows them.

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
