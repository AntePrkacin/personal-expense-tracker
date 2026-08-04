import {
  amountCaret,
  formatAmountInput,
  formatCurrency,
  formatNegative,
  initials,
  monthLabel,
  monthOverline,
  parseAmountInput,
  shortName,
} from './format';

// The point of these tests is the sign glyph.
//
// Every assertion below writes the expected minus as the escape − rather
// than a pasted character, because U+2212 MINUS SIGN and U+002D HYPHEN-MINUS
// are visually near-identical in most editors and terminals. Pasting the glyph
// works right up until someone retypes it, and then the diff is unreadable.

const MINUS = '−';

describe('formatCurrency', () => {
  it('formats a whole amount with cents', () => {
    expect(formatCurrency(24)).toBe('$24.00');
  });

  it('separates thousands', () => {
    expect(formatCurrency(1240)).toBe('$1,240.00');
  });

  it('keeps two decimal places', () => {
    expect(formatCurrency(18.5)).toBe('$18.50');
    expect(formatCurrency(15.99)).toBe('$15.99');
  });

  it('formats zero unsigned', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('uses U+2212 for a negative input rather than the hyphen Intl emits', () => {
    // Intl.NumberFormat returns "-$24.00" with U+002D. The replacement in
    // formatCurrency is what makes this pass, so this test is what stops the
    // replacement being dropped as redundant.
    expect(formatCurrency(-24)).toBe(`${MINUS}$24.00`);
    expect(formatCurrency(-24)).not.toContain('-');
  });
});

describe('formatNegative', () => {
  it('renders a stored positive amount as a negative one', () => {
    // Transactions are stored as magnitudes; the sign is presentation.
    expect(formatNegative(24)).toBe(`${MINUS}$24.00`);
    expect(formatNegative(1240)).toBe(`${MINUS}$1,240.00`);
  });

  it('ignores the sign of the input', () => {
    // Defensive: an API that starts returning signed amounts must not produce
    // a double negative or flip back to positive.
    expect(formatNegative(-24)).toBe(`${MINUS}$24.00`);
  });

  it('leaves zero unsigned', () => {
    expect(formatNegative(0)).toBe('$0.00');
    expect(formatNegative(-0)).toBe('$0.00');
  });
});

describe('initials', () => {
  it('takes the first letter of each name', () => {
    // The designed value on 04 Dashboard and 17 Settings, from the designed
    // names: "Marko" + "Kovač".
    expect(initials('Marko', 'Kovač')).toBe('MK');
  });

  it('uppercases a lowercase name', () => {
    expect(initials('marko', 'kovač')).toBe('MK');
  });

  it('takes the first letter of a diacritic name from the name, not the ASCII fold', () => {
    // Ž, not Z. Nothing normalises here, and nothing should: the initial is the
    // user's own letter.
    expect(initials('Žan', 'Šimić')).toBe('ŽŠ');
  });

  it('keeps an astral-plane character whole', () => {
    // The reason firstLetter uses Array.from rather than charAt. With charAt
    // this returns two lone surrogates, which render as replacement glyphs.
    expect(initials('𝔐arko', '𝔎ovač')).toBe('𝔐𝔎');
  });

  it('skips a name it has nothing to take', () => {
    // RegisterDto marks both names @IsNotEmpty, so this is defensive. It must
    // not produce "undefined" or throw.
    expect(initials('Marko', '')).toBe('M');
    expect(initials('', '')).toBe('');
  });
});

describe('shortName', () => {
  it('abbreviates the last name', () => {
    expect(shortName('Marko', 'Kovač')).toBe('Marko K.');
  });

  it('uppercases the abbreviated initial', () => {
    expect(shortName('Marko', 'kovač')).toBe('Marko K.');
  });

  it('drops the abbreviation mark when there is no last name', () => {
    // Not "Marko .": a full stop with nothing before it reads as a defect, and
    // the sidebar footer shows this on every screen.
    expect(shortName('Marko', '')).toBe('Marko');
    expect(shortName('Marko', '')).not.toContain('.');
  });

  it('leaves the first name unabbreviated', () => {
    // Only the last name is shortened. A first-name initial would make the
    // footer unreadable, and the design shows the full first name.
    expect(shortName('Marko', 'Kovač')).toContain('Marko');
  });
});

// Every date below is built with the local-time constructor rather than an ISO
// string. `new Date('2025-10-08')` is parsed as UTC, so west of Greenwich it
// formats as October 7 - and on the 1st of a month it would format as the month
// before, which is exactly the assertion these tests make.

describe('monthOverline', () => {
  it('names the month and the year', () => {
    // The designed overline on 04 Dashboard (node 21:58) and 06 Transactions
    // (node 26:139).
    expect(monthOverline(new Date(2025, 9, 8))).toBe('October 2025');
  });

  it('carries the year of the date, not of the month name', () => {
    // December and January are the pair a year-boundary mistake shows up on.
    expect(monthOverline(new Date(2025, 11, 31))).toBe('December 2025');
    expect(monthOverline(new Date(2026, 0, 1))).toBe('January 2026');
  });
});

describe('monthLabel', () => {
  it('names the month alone', () => {
    // The month select reads "October", without the year (DSH-2).
    expect(monthLabel(new Date(2025, 9, 8))).toBe('October');
  });

  it('spells the month out rather than abbreviating it', () => {
    // 'short' would give "Sep", which is not what the frame draws.
    expect(monthLabel(new Date(2025, 8, 8))).toBe('September');
  });
});

describe('formatAmountInput', () => {
  it.each([
    ['', ''],
    ['2000', '2,000'],
    ['999', '999'],
    ['1234567', '1,234,567'],
  ])('groups %s as %s', (raw, expected) => {
    expect(formatAmountInput(raw)).toBe(expected);
  });

  it('is idempotent, which the controlled input depends on', () => {
    // The single most load-bearing property here. BudgetForm assigns the
    // formatted value onto the DOM node before React's own commit compares it
    // with the prop; if formatting its own output changed it, the two would
    // never agree and the caret would be reset on every keystroke.
    expect(formatAmountInput('2,000')).toBe('2,000');
    expect(formatAmountInput(formatAmountInput('1234567'))).toBe('1,234,567');
  });

  it.each([
    ['2000.', '2,000.'],
    ['2000.5', '2,000.5'],
    ['2000.50', '2,000.50'],
    ['.5', '.5'],
    ['0.00', '0.00'],
  ])('keeps %s as %s while it is still being typed', (raw, expected) => {
    // A trailing point and a missing leading zero are both real intermediate
    // states. Completing either one for the user moves the caret under their
    // hands, which is the bug amountCaret exists to avoid.
    expect(formatAmountInput(raw)).toBe(expected);
  });

  it('truncates the fraction rather than rounding it', () => {
    // Rounding would make the value change under the user: typing the third
    // decimal of 2000.555 would silently bump the second one. Truncating is what
    // makes that keystroke a no-op instead.
    expect(formatAmountInput('2000.555')).toBe('2,000.55');
    expect(formatAmountInput('2000.556')).toBe('2,000.55');
  });

  it('keeps only the first decimal point', () => {
    expect(formatAmountInput('1.2.3')).toBe('1.23');
  });

  it.each([
    ['0', '0'],
    ['00', '0'],
    ['007', '7'],
  ])('collapses the leading zeros of %s to %s', (raw, expected) => {
    // A bare '0' has to survive: it is the value AC3 rejects, so it must be
    // reachable in the first place.
    expect(formatAmountInput(raw)).toBe(expected);
  });

  it.each([
    ['-500', '500'],
    ['$2,000', '2,000'],
    ['abc', ''],
    ['12abc34', '1,234'],
  ])('drops everything that is not a digit or a point: %s -> %s', (raw, expected) => {
    // The sign goes because a budget is a magnitude, which is also what
    // RegisterDto's @IsPositive says.
    expect(formatAmountInput(raw)).toBe(expected);
  });

  it('drops non-ASCII digits rather than mis-grouping them', () => {
    // Arabic-Indic digits are numerals a keyboard can genuinely produce, and
    // Number() would happily parse them while the grouping regex would not
    // match them. Dropping them is the honest answer until a locale is stored.
    expect(formatAmountInput('٢٠٠٠')).toBe('');
  });

  it('groups beyond the safe-integer range without losing a digit', () => {
    // Proof that nothing here round-trips through Number: 2^53 is 16 digits, so
    // a numeric intermediate would corrupt this.
    expect(formatAmountInput('123456789012345')).toBe('123,456,789,012,345');
  });

  it('mangles a European-formatted paste, which is a known limit', () => {
    // '2.000,50' means two thousand and fifty cents in most of Europe. The
    // separators here are hard-coded en-US, matching formatCurrency and the two
    // DateTimeFormats, so the comma is stripped and the point is read as the
    // decimal: the user sees 2.00 and has to retype. Pinned rather than fixed,
    // because fixing it means knowing the user's locale, which is the same
    // unstored onboarding currency docs/TODO.md tracks.
    expect(formatAmountInput('2.000,50')).toBe('2.00');
  });
});

describe('parseAmountInput', () => {
  it.each([
    ['2,000', 2000],
    ['2,000.50', 2000.5],
    ['0', 0],
    ['.5', 0.5],
    ['2,000.', 2000],
  ])('reads %s as %d', (value, expected) => {
    expect(parseAmountInput(value)).toBe(expected);
  });

  it.each(['', '.', ',', 'abc'])('answers NaN for %s, which holds no number', (value) => {
    // NaN rather than 0, because an untouched field and a deliberate zero are
    // different answers and isBudgetValid has to reject them for different
    // reasons. Number('') is 0, so leaning on Number alone would conflate them.
    expect(parseAmountInput(value)).toBeNaN();
  });

  it('reaches a value the backend will accept, after truncation', () => {
    // The round trip that matters: whatever the user types, what PET-11 finally
    // posts has to satisfy @IsNumber({ maxDecimalPlaces: 2 }).
    expect(parseAmountInput(formatAmountInput('2000.555'))).toBe(2000.55);
  });
});

describe('amountCaret', () => {
  it('lands after the digit just typed at the end', () => {
    // Typing the last 0 of 2000 turns '2000' into '2,000', so the caret has to
    // move by two, not one.
    expect(amountCaret('2000', 4, '2,000')).toBe(5);
  });

  it('stays put when a separator appears further right', () => {
    // Inserting a 1 in front of 2000 gives '12,000': the caret belongs after the
    // 1, not dragged along by the new comma.
    expect(amountCaret('12000', 1, '12,000')).toBe(1);
  });

  it('does not follow a separator the formatter reinstated', () => {
    expect(amountCaret('2000', 1, '2,000')).toBe(1);
  });

  it('keeps a caret at the very start at the start', () => {
    expect(amountCaret('2000', 0, '2,000')).toBe(0);
  });

  it('clamps past a truncated decimal', () => {
    // The raw string has more significant characters than the formatted one, so
    // an unclamped count would index past the end.
    expect(amountCaret('2000.555', 8, '2,000.55')).toBe(8);
  });

  it('clamps a caret beyond the raw string', () => {
    expect(amountCaret('2000', 99, '2,000')).toBe(5);
  });
});

// Two rough edges of the pair above, pinned so they are documented rather than
// rediscovered. Both need a deliberate keystroke sequence, and both are fixable
// only with a separator-aware keydown handler, which is out of PET-9's scope.
// docs/TODO.md carries them.
describe('the known caret and value roughness', () => {
  /** One keystroke, through exactly the path BudgetForm takes. */
  function press(value: string, caret: number, char: string) {
    const raw = value.slice(0, caret) + char + value.slice(caret);
    const formatted = formatAmountInput(raw);
    return { value: formatted, caret: amountCaret(raw, caret + char.length, formatted) };
  }

  /** Backspace at the caret, same path. */
  function erase(value: string, caret: number) {
    const raw = value.slice(0, caret - 1) + value.slice(caret);
    const formatted = formatAmountInput(raw);
    return { value: formatted, caret: amountCaret(raw, caret - 1, formatted) };
  }

  it('drops a leading zero but still advances the caret past the first digit', () => {
    // Caret at 0 in '2,000', type '0'. The zero is correctly collapsed away, but
    // the caret ends up after the '2' rather than back where it started.
    expect(press('2,000', 0, '0')).toEqual({ value: '2,000', caret: 1 });
  });

  it('turns 2,000 into 0 when the leading digit is erased', () => {
    // ',000' cleans to '000', which collapses to '0'. Numerically right and
    // visually startling: one backspace appears to clear the whole field.
    expect(erase('2,000', 1)).toEqual({ value: '0', caret: 0 });
  });

  it('makes backspacing a separator look like nothing happened', () => {
    // The comma is reinstated by the formatter, so only the caret moves. This is
    // the least bad of the three: no value is lost.
    expect(erase('2,000', 2)).toEqual({ value: '2,000', caret: 1 });
  });
});
