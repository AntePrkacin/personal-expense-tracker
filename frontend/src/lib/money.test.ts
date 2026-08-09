import { currencySymbol, DEFAULT_CURRENCY, moneyFormatters, SUPPORTED_CURRENCIES } from './money';

// The money formatters, and the three things about them that are easy to break silently: the
// minus glyph, the rounding, and the fact that a currency the picker cannot offer still has to
// render rather than throw.

describe('moneyFormatters', () => {
  describe('formatCurrency', () => {
    it.each([
      ['USD', '$1,240.50'],
      ['EUR', '€1,240.50'],
      ['GBP', '£1,240.50'],
    ])('renders %s with its own symbol and en-US grouping', (currency, expected) => {
      expect(moneyFormatters(currency).formatCurrency(1240.5)).toBe(expected);
    });

    it('keeps en-US grouping rather than following the currency to its home locale', () => {
      // The decision this pins is a product one and it is invisible in a diff: `de-DE` would
      // render the same amount "1.240,50 €". Grouping and the decimal separator stay en-US
      // because `formatAmountInput` and `amountCaret` build the budget field's live grouping by
      // hand with a comma and a dot written into them, so a locale that followed the currency
      // would desynchronise the field being typed into from the figure rendered beside it.
      expect(moneyFormatters('EUR').formatCurrency(1240.5)).not.toContain('1.240');
    });

    it('substitutes U+2212 MINUS SIGN for the U+002D Intl emits', () => {
      // The failure this guards reads `expected "−$24.00", received "-$24.00"` in a terminal,
      // where the two glyphs are near-indistinguishable. Asserted by code point for that reason.
      const formatted = moneyFormatters('USD').formatCurrency(-24);

      expect(formatted).toBe('−$24.00');
      expect(formatted.codePointAt(0)).toBe(0x2212);
    });
  });

  describe('formatWhole', () => {
    it('rounds rather than truncating, so an aggregate stays as close to the real total as it can', () => {
      expect(moneyFormatters('USD').formatWhole(1240.5)).toBe('$1,241');
      expect(moneyFormatters('USD').formatWhole(1240.4)).toBe('$1,240');
    });

    it('carries the currency through like the others', () => {
      expect(moneyFormatters('GBP').formatWhole(1240.5)).toBe('£1,241');
    });
  });

  describe('formatNegative', () => {
    it('renders a stored positive magnitude as the negative the UI shows', () => {
      expect(moneyFormatters('EUR').formatNegative(24)).toBe('−€24.00');
    });

    it('returns zero unsigned, because a negative zero reads as a bug rather than a debit', () => {
      expect(moneyFormatters('USD').formatNegative(0)).toBe('$0.00');
    });

    it('takes the magnitude, so a negative input does not double the sign', () => {
      expect(moneyFormatters('USD').formatNegative(-24)).toBe('−$24.00');
    });
  });

  describe('the per-currency memo', () => {
    it('returns the same object for the same code', () => {
      // Identity rather than equality, because what this protects is the `Intl.NumberFormat`
      // construction: the dashboard formats dozens of amounts per render, and this memo is what
      // makes a per-currency formatter no more costly than the module-scope singletons it
      // replaced. Two calls building two instances would pass every other test in this file.
      expect(moneyFormatters('USD')).toBe(moneyFormatters('USD'));
    });

    it('does not confuse two currencies', () => {
      expect(moneyFormatters('USD')).not.toBe(moneyFormatters('EUR'));
    });
  });

  describe('a currency the picker cannot offer', () => {
    it('still formats, because the backend accepts every ISO 4217 code', () => {
      // `UpdateProfileDto.currency` is validated with `@IsISO4217CurrencyCode()`, so a profile can
      // hold a code this app never offers - set through the API. It has to render as money.
      // Note JPY has no minor unit, which `Intl` knows and this deliberately does not override.
      expect(moneyFormatters('JPY').formatCurrency(1240.5)).toBe('¥1,241');
    });

    it('falls back to the default rather than throwing on an invalid code', () => {
      // `new Intl.NumberFormat(_, { currency: 'NOPE' })` is a `RangeError`, and an uncaught one
      // here replaces the whole dashboard with the error boundary over a display concern. This
      // should be unreachable behind the backend's validation, which is why it falls back quietly
      // rather than reporting anything.
      expect(() => moneyFormatters('NOPE')).not.toThrow();
      expect(moneyFormatters('NOPE').formatCurrency(1240.5)).toBe('$1,240.50');
    });
  });
});

describe('SUPPORTED_CURRENCIES', () => {
  it('offers the three the design draws, in its order', () => {
    // Read off `ui_kits/expensa-app/OnboardingScreen.jsx`'s `ONBOARDING_CURRENCIES`. The names are
    // design copy rather than `Intl.DisplayNames` output, so they are pinned here.
    expect(SUPPORTED_CURRENCIES).toEqual([
      { code: 'USD', symbol: '$', name: 'US Dollar' },
      { code: 'EUR', symbol: '€', name: 'Euro' },
      { code: 'GBP', symbol: '£', name: 'British Pound' },
    ]);
  });

  it('starts on the default, which is what a new account gets', () => {
    expect(SUPPORTED_CURRENCIES[0].code).toBe(DEFAULT_CURRENCY);
  });
});

describe('currencySymbol', () => {
  it('answers the design symbol for an offered currency', () => {
    expect(currencySymbol('EUR')).toBe('€');
  });

  it('answers the code itself for one that is stored but not offered', () => {
    // The honest answer for the closed trigger: "JPY" says what is stored, where guessing a glyph
    // would not. Every formatted amount gets its symbol from `Intl`, which knows all of them.
    expect(currencySymbol('JPY')).toBe('JPY');
  });
});
