/**
 * Major units to the integer minor units every money column stores.
 *
 * The rounding is not decoration: 2000.5 * 100 is 200050 exactly, but 4.02 *
 * 100 is 401.99999999999994 in binary floating point, and truncating that would
 * quietly lose a cent. The DTO caps budgets at a billion, so the result stays
 * far inside safe-integer range.
 *
 * Known simplification: "minor units" is assumed to be hundredths. That is
 * wrong for zero-decimal currencies (JPY, KRW) and three-decimal ones (KWD,
 * BHD), where this would inflate or shrink an amount by a factor of a hundred
 * or ten. The API accepts any ISO 4217 code today, so this is a real limitation
 * rather than a hypothetical one - it is recorded with the other currency
 * scaling work in docs/TODO.md, and fixing it means a per-currency exponent
 * table, not a change here.
 */
export function toCents(major: number): number {
  return Math.round(major * 100);
}

/**
 * The inverse, for the way back out: minor units to the major ones the API
 * speaks.
 *
 * No rounding needed and none wanted. Dividing an integer by 100 is exact to
 * the nearest double, and JSON.stringify prints the shortest decimal that
 * round-trips, so 402 leaves as `4.02` rather than `4.0200000000000005`. A
 * `toFixed(2)` here would be worse than useless: it returns a string, which
 * would silently turn every amount in the API into one.
 *
 * Carries the same hundredths assumption as `toCents`, and the same caveat.
 */
export function fromCents(minor: number): number {
  return minor / 100;
}
