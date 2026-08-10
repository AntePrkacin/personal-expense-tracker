// Money formatting, parameterised by the currency the profile stores.
//
// This file exists because `lib/format.ts` built its two `Intl.NumberFormat` instances at module
// scope with `currency: 'USD'` written into both, and its own comments had said "when the
// onboarding currency is finally threaded through" since PET-9. PET-47 is that ticket. The three
// functions moved here rather than growing a parameter in place, for two reasons: an `Intl`
// instance per call is genuinely expensive and the memo below is the thing that makes a
// per-currency formatter affordable, and `lib/format.ts` is otherwise strings-in-strings-out with
// no cache in it at all.
//
// **`lib/format.ts` exports no money formatters at all, and this paragraph used to say it did.**
// The claim was written while the thread was mid-flight, when the plan expected
// `app/DecorativePanel.tsx` to keep needing a USD-bound trio; that file turned out to draw its
// figures as literal strings and only *mention* `formatCurrency` in a comment saying why, so the
// re-exports were deleted with nothing left importing them. A review caught the two files asserting
// opposite facts about one export, which is exactly the failure `docs/agents/conventions.md`'s
// single-home rule exists to prevent. There is no default-bound formatter anywhere: every caller
// supplies a currency, from a prop server-side or from `useMoney()` on the client.
//
// What is **not** here is the amount field. `formatAmountInput`, `parseAmountInput` and
// `amountCaret` stay in `lib/format.ts` and stay currency-blind, because they format a value
// mid-keystroke where `Intl` is wrong in four separate ways - that file records all four. They
// also assume a comma group separator and a dot decimal, which is the reason the locale below is
// pinned rather than derived from the currency.

/**
 * U+2212 MINUS SIGN, which is what the Figma frames use, not U+002D HYPHEN-MINUS.
 *
 * This substitution is deliberate and has to stay. `Intl.NumberFormat` emits U+002D, so
 * "simplifying" `formatNegative` down to a plain `Intl` call with a negative input silently swaps
 * the glyph. The test failure then reads `expected "−$24.00", received "-$24.00"`, which is close
 * to invisible in a terminal. Screen readers also announce U+2212 as "minus" while U+002D is
 * ambiguous, so the design's choice is the accessible one too.
 */
const MINUS = '−';

/**
 * The locale every money string is formatted against, pinned rather than derived.
 *
 * A currency does not imply a locale: `Intl.NumberFormat('de-DE', ...)` renders EUR as
 * "3.200,00 €" while `en-US` renders it "€3,200.00". Both are correct and the product owner chose
 * the second, so switching currency changes the **symbol** and nothing about grouping, decimal
 * separator or symbol position.
 *
 * That is not only a copy decision. `formatAmountInput` and `amountCaret` in `lib/format.ts` build
 * the budget field's live grouping by hand, with the comma and the dot written into them, so a
 * locale that followed the currency would desynchronise the field being typed into from the figure
 * rendered beside it. `docs/TODO.md` carries the wider hard-coded-`en-US` deviation this extends.
 */
const LOCALE = 'en-US';

/** A6 chose one currency and PET-47 widened it to three; this stays what a new account gets. */
export const DEFAULT_CURRENCY = 'USD';

/**
 * The currencies the UI offers, in the order the budget field lists them.
 *
 * Read off the team's Claude Design system (`ui_kits/expensa-app/OnboardingScreen.jsx`'s
 * `ONBOARDING_CURRENCIES`), which is the authority for that field. The symbol and the name are
 * written out rather than derived from `Intl.DisplayNames`, because these two strings are **design
 * copy**: the panel draws "US Dollar" beside a "$", and a formatter's idea of a currency's display
 * name is not the designer's.
 *
 * **The backend accepts far more than these three.** `UpdateProfileDto.currency` is validated with
 * `@IsISO4217CurrencyCode()`, so a profile can hold any of them - set through the API, or offered
 * here later by adding a row. Nothing in this module treats the list as exhaustive, which is why
 * `moneyFormatters` takes a `string` rather than a union of these codes: a stored `JPY` has to
 * render as money, not throw, even on a screen that cannot select it.
 */
export const SUPPORTED_CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/**
 * The symbol for a stored code, falling back to the code itself.
 *
 * The fallback is the honest answer for a currency the picker cannot offer: "JPY 3,200" says what
 * is stored, where guessing a glyph would not. Only the budget field's closed trigger needs this -
 * every formatted amount below gets its symbol from `Intl`, which knows all of them.
 */
export function currencySymbol(code: string): string {
  return SUPPORTED_CURRENCIES.find((entry) => entry.code === code)?.symbol ?? code;
}

/** The three money strings this app renders, bound to one currency. */
export type MoneyFormatters = {
  /** An amount with its cents, e.g. `1240` -> `"$1,240.00"`. For a per-transaction figure. */
  formatCurrency: (amount: number) => string;
  /** An amount rounded to whole units, e.g. `1240` -> `"$1,240"`. For an aggregate. */
  formatWhole: (amount: number) => string;
  /** A stored (positive) amount as the negative the UI shows, e.g. `24` -> `"−$24.00"`. */
  formatNegative: (amount: number) => string;
};

/**
 * One `MoneyFormatters` per currency code, built once.
 *
 * **A module-scope cache on a server is worth a sentence, because it is usually how a request
 * leaks into the next one.** Nothing user-scoped is stored here: the key is a currency code and
 * the values are pure functions over `Intl` instances, so two users sharing an entry share only
 * the fact that EUR renders the same way for both. The entries are also bounded by how many
 * distinct codes the process ever sees, which is three plus whatever the API allowed.
 *
 * Constructing an `Intl.NumberFormat` is the expensive part - the dashboard formats dozens of
 * amounts per render - so this is what makes a per-currency formatter no more costly than the two
 * module-scope singletons it replaces.
 */
const CACHE = new Map<string, MoneyFormatters>();

/**
 * The three money formatters for one currency.
 *
 * Takes a `string` rather than a union deliberately; see `SUPPORTED_CURRENCIES`. An **invalid**
 * code falls back to `DEFAULT_CURRENCY` rather than throwing: `Intl.NumberFormat` answers a
 * `RangeError` for one, and the backend's `@IsISO4217CurrencyCode()` means that should be
 * unreachable - but the failure it would produce is the whole dashboard replaced by the error
 * boundary over a display concern, which is a bad trade for three lines.
 */
export function moneyFormatters(currency: string): MoneyFormatters {
  const cached = CACHE.get(currency);
  if (cached !== undefined) return cached;

  const built = build(currency);
  CACHE.set(currency, built);
  return built;
}

function build(currency: string): MoneyFormatters {
  const withCents = numberFormat(currency, 2);

  // A second instance at zero fraction digits, `docs/TODO.md`'s cents item answered (PET-21): the
  // design draws every aggregate figure whole - `$1,240`, not `$1,240.00` - while every
  // per-transaction amount keeps its cents. It **rounds**, which is `Intl`'s own behaviour at zero
  // fraction digits and the right one here: it keeps a whole figure as close to the real total as
  // one unit allows, where truncating would bias every figure on the dashboard downwards.
  const whole = numberFormat(currency, 0);

  const formatCurrency = (amount: number) => withCents.format(amount).replace('-', MINUS);

  return {
    formatCurrency,

    // Every caller in this app hands this a non-negative figure; the `MINUS` substitution matches
    // `formatCurrency`'s rather than describing a sign this app draws anywhere.
    formatWhole: (amount: number) => whole.format(amount).replace('-', MINUS),

    // Zero is returned unsigned: a negative zero reads as a bug, not as a debit.
    formatNegative: (amount: number) => {
      const magnitude = Math.abs(amount);
      return magnitude === 0 ? formatCurrency(0) : `${MINUS}${formatCurrency(magnitude)}`;
    },
  };
}

function numberFormat(currency: string, maximumFractionDigits: number): Intl.NumberFormat {
  const options: Intl.NumberFormatOptions = { style: 'currency', currency };
  if (maximumFractionDigits === 0) options.maximumFractionDigits = 0;

  try {
    return new Intl.NumberFormat(LOCALE, options);
  } catch (error) {
    // **The catch is for an unrecognised-but-well-formed ISO code, and it must not swallow more than
    // that.** A review found it hiding a programming error: four Storybook modules omitted the
    // required `currency` prop, `Intl` threw `TypeError: Currency code is required with currency
    // style`, and this fell back to the default - so the stories silently rendered USD and neither
    // `tsc` nor any suite could see it, because `StoryObj` typing does not reject a missing arg.
    //
    // A missing or malformed code is a bug in the caller, so it is rethrown; a `RangeError` from a
    // code the runtime does not know is the case this exists for and still degrades quietly.
    if (!(error instanceof RangeError)) throw error;

    return new Intl.NumberFormat(LOCALE, { ...options, currency: DEFAULT_CURRENCY });
  }
}
