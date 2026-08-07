import {
  amountCaret,
  formatAmountInput,
  formatCurrency,
  formatIsoDate,
  formatIsoDayMonth,
  formatNegative,
  formatRelativeDate,
  formatWhole,
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

describe('formatWhole', () => {
  it('drops the cents, e.g. the dashboard budget readout', () => {
    // The design draws "$1,240", never "$1,240.00" - node 21:4's real budget card and frame
    // 01's sample card both. formatCurrency keeps the cents for a per-transaction amount.
    expect(formatWhole(1240)).toBe('$1,240');
  });

  it('separates thousands, matching formatCurrency', () => {
    expect(formatWhole(12400)).toBe('$12,400');
  });

  it('formats zero unsigned', () => {
    expect(formatWhole(0)).toBe('$0');
  });

  it('rounds rather than truncating', () => {
    // Rounding keeps a whole-dollar aggregate as close to the real total as one dollar
    // allows; truncating would bias every figure on the dashboard downwards.
    expect(formatWhole(54.4)).toBe('$54');
    expect(formatWhole(54.6)).toBe('$55');
  });

  it('uses U+2212 for a negative input rather than the hyphen Intl emits', () => {
    // Defensive, matching formatCurrency's own case: nothing in this epic hands formatWhole a
    // negative figure, but a caller that started would get the design's glyph rather than
    // Intl's hyphen.
    expect(formatWhole(-1240)).toBe(`${MINUS}$1,240`);
    expect(formatWhole(-1240)).not.toContain('-');
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

describe('formatIsoDate', () => {
  it('renders the string the Date trigger draws', () => {
    // Node 28:402's own value, so this asserts the designed label rather than a
    // recomputed one.
    expect(formatIsoDate('2025-10-08')).toBe('Oct 8, 2025');
  });

  it('abbreviates the month and does not pad the day', () => {
    // "Oct" not "October", "8" not "08". Both are what 'short' plus 'numeric' give,
    // and both are what the frame draws.
    expect(formatIsoDate('2025-01-05')).toBe('Jan 5, 2025');
  });

  // The regression this function exists to prevent. `new Date('2025-10-08')` is UTC
  // midnight, so a formatter fed the bare string prints the 7th anywhere behind UTC -
  // a field quietly showing the day before the one the user picked. lib/date.ts's own
  // suite pins the parsing half; this pins that formatting goes through it.
  it('keeps the day it was given in a zone behind UTC', () => {
    const original = process.env.TZ;
    process.env.TZ = 'America/New_York';

    try {
      expect(formatIsoDate('2025-10-08')).toBe('Oct 8, 2025');
      expect(formatIsoDate('2025-01-01')).toBe('Jan 1, 2025');
    } finally {
      process.env.TZ = original;
    }
  });

  it('renders a leap day', () => {
    expect(formatIsoDate('2024-02-29')).toBe('Feb 29, 2024');
  });

  it.each(['', '2025-02-30', 'not a date', '2025-10-08T00:00:00Z'])(
    'is empty for %p, so the trigger shows its placeholder rather than "Invalid Date"',
    (iso) => {
      expect(formatIsoDate(iso)).toBe('');
    },
  );
});

describe('formatIsoDayMonth', () => {
  it('renders the string the table draws', () => {
    // Node 27:157's own value. The DATE column drops the year, which the trigger keeps.
    expect(formatIsoDayMonth('2025-10-08')).toBe('Oct 8');
  });

  it.each([
    ['2025-10-02', 'Oct 2'],
    ['2025-01-05', 'Jan 5'],
    ['2024-02-29', 'Feb 29'],
  ])('renders %s as %s', (iso, expected) => {
    expect(formatIsoDayMonth(iso)).toBe(expected);
  });

  it('differs from the long form only by the year', () => {
    // Pinned as a relationship rather than two strings, because the pair is the point:
    // two formatters exist so nothing slices a separator out of the other's output.
    expect(formatIsoDate('2025-10-08')).toBe(`${formatIsoDayMonth('2025-10-08')}, 2025`);
  });

  // The same regression formatIsoDate's suite pins, and it has to be pinned separately:
  // this function has its own `dateFromIso` call, so a new `new Date(iso)` here would
  // print the previous day in every zone behind UTC with the other test still green.
  it('keeps the day it was given in a zone behind UTC', () => {
    const original = process.env.TZ;
    process.env.TZ = 'America/New_York';

    try {
      expect(formatIsoDayMonth('2025-10-08')).toBe('Oct 8');
      expect(formatIsoDayMonth('2025-01-01')).toBe('Jan 1');
    } finally {
      process.env.TZ = original;
    }
  });

  it.each(['', '2025-02-30', 'not a date', '2025-10-08T00:00:00Z'])(
    'is empty for %p, so the cell is blank rather than "Invalid Date"',
    (iso) => {
      expect(formatIsoDayMonth(iso)).toBe('');
    },
  );
});

describe('formatRelativeDate', () => {
  const TODAY = '2025-10-08';

  it('reads "Today" for the day itself', () => {
    expect(formatRelativeDate(TODAY, TODAY)).toBe('Today');
  });

  it('reads "Yesterday" for one day back', () => {
    expect(formatRelativeDate('2025-10-07', TODAY)).toBe('Yesterday');
  });

  it('reads the short date beyond yesterday', () => {
    expect(formatRelativeDate('2025-10-05', TODAY)).toBe('Oct 5');
  });

  // AC2's mock draws a same-day boundary crossing into a new month, so "Yesterday" has to
  // survive it rather than only working within one calendar page.
  it('reads "Yesterday" across a month boundary', () => {
    expect(formatRelativeDate('2025-09-30', '2025-10-01')).toBe('Yesterday');
  });

  it('reads "Yesterday" across a year boundary', () => {
    expect(formatRelativeDate('2024-12-31', '2025-01-01')).toBe('Yesterday');
  });

  // The Add transaction modal's date field allows a future date, and it is deliberately not
  // a fifth case here: "Tomorrow" is not in the design, so a day ahead falls through to the
  // same short date a week ahead would get.
  it('reads the short date for a future day, rather than inventing "Tomorrow"', () => {
    expect(formatRelativeDate('2025-10-09', TODAY)).toBe('Oct 9');
  });

  it('is empty for a string that is not a calendar date', () => {
    expect(formatRelativeDate('not a date', TODAY)).toBe('');
  });

  // The regression `formatIsoDate` and `formatIsoDayMonth` both pin: the day this function
  // reports must not shift in a zone behind UTC. `daysBetween` diffs `Date.UTC` of the parsed
  // parts rather than the local `Date`s `dateFromIso` would hand back, so a DST transition
  // between the two dates cannot round a 24-hour gap up or down to the wrong day count.
  it('keeps the day it was given in a zone behind UTC', () => {
    const original = process.env.TZ;
    process.env.TZ = 'America/New_York';

    try {
      expect(formatRelativeDate(TODAY, TODAY)).toBe('Today');
      expect(formatRelativeDate('2025-10-07', TODAY)).toBe('Yesterday');
    } finally {
      process.env.TZ = original;
    }
  });

  it('defaults to the real today, so a fixture is not required to call it', () => {
    jest.useFakeTimers().setSystemTime(new Date(2025, 9, 8));

    try {
      expect(formatRelativeDate('2025-10-08')).toBe('Today');
    } finally {
      jest.useRealTimers();
    }
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
