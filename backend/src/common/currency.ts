/**
 * The currencies this app will actually accept, and why the list is short.
 *
 * **Every code here has an ISO 4217 exponent of exactly 2**, which is the whole
 * selection criterion. `src/common/money.ts` converts major units to minor by
 * multiplying by 100 and back by dividing, and it says so in its own comment:
 * that is wrong by a factor of a hundred for a zero-decimal currency (JPY, KRW,
 * ISK) and by ten for a three-decimal one (KWD, BHD, TND). Until PET-72 the
 * register and profile DTOs took `@IsISO4217CurrencyCode()`, the whole 180-entry
 * standard, so a user could pick JPY and have every amount they typed inflated
 * a hundredfold - a real defect `docs/TODO.md` recorded rather than a
 * hypothetical one.
 *
 * This closes it from the other end, and that is a deliberate trade. A
 * per-currency exponent table would be the general fix and is still the right
 * one eventually; an allowlist is a fraction of the work, cannot be half-applied,
 * and turns the failure from "silently wrong amounts" into "that currency is not
 * offered". Adding a zero- or three-decimal currency to this list without
 * building that table would reintroduce the bug, which is why the exponent rule
 * is stated here rather than left to be inferred from what happens to be in the
 * array.
 *
 * **It is a closed set in TypeScript, not a table**, unlike the colours and
 * icons PET-64 moved into central. Those moved because an *admin* edits them;
 * this set changes only when somebody writes the exponent table, which is a
 * deploy. The payoff is the one `template-tokens.ts` describes: `@IsIn` against
 * this array publishes a real OpenAPI enum, so the frontend's currency picker is
 * typed off the contract and cannot offer a code the backend would reject.
 *
 * Ordering is the picker's order, not alphabetical: EUR, USD and GBP first
 * because they are what PET-47 offered and what almost every user will want,
 * then the rest alphabetically.
 */
export const SUPPORTED_CURRENCIES = [
  'EUR',
  'USD',
  'GBP',
  'AED',
  'AUD',
  'BAM',
  'BGN',
  'BRL',
  'CAD',
  'CHF',
  'CNY',
  'CZK',
  'DKK',
  'HKD',
  'HUF',
  'ILS',
  'INR',
  'MKD',
  'MXN',
  'NOK',
  'NZD',
  'PLN',
  'RON',
  'RSD',
  'SEK',
  'SGD',
  'TRY',
  'UAH',
  'ZAR',
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/**
 * What an account gets when it says nothing.
 *
 * EUR since PET-72, USD before it. This is a Croatian project whose users are
 * paid in euros, and a default nobody has to change is worth more than the
 * alphabetical accident that put USD first. Written down once here and referenced
 * by the schema default, the register DTO and the frontend's empty onboarding
 * draft, so the three cannot disagree about what a blank form means.
 */
export const DEFAULT_CURRENCY: SupportedCurrency = 'EUR';
