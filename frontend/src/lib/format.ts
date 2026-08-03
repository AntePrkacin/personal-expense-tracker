// Money formatting for display.
//
// Transactions are stored as positive magnitudes and rendered as negative
// amounts, so the negation is a presentation rule rather than a property of the
// data. It lives here, once, instead of in every screen that shows money.

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
