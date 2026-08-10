import {
  amountCaret,
  formatAmountInput,
  formatIsoDate,
  formatIsoDayMonth,
  formatRelativeDate,
  initials,
  monthLabel,
  monthOverline,
  periodLabel,
  periodOverline,
  parseAmountInput,
  shortName,
} from './format';

// **The sign-glyph note this file opened on moved to `money.test.ts` with the assertions it was
// about.** It said every expected minus is written as the escape − rather than as a pasted
// character, because U+2212 MINUS SIGN and U+002D HYPHEN-MINUS are near-identical in most editors
// and terminals - and nothing left here formats a signed amount, so the constant it introduced had
// no remaining reader. The rule still holds wherever a minus is asserted.

/**
 * Runs `body` with the process pinned to `zone`, restoring whatever `TZ` held before it.
 *
 * **The restore has to `delete` rather than assign when `TZ` was unset, which it is here** -
 * `jest.config.ts` pins no zone. Writing `undefined` into a `process.env` key stores the
 * *string* `"undefined"`, which Node's tzset rejects and falls back to UTC on, so every test
 * after the first zone-pinned one would run under UTC rather than the machine's own zone -
 * silently disabling exactly the zone sensitivity these three tests exist to exercise, and
 * `formatRelativeDate`'s real-clock default with them. That was the shape three copies of this
 * block shipped in before it was lifted here.
 */
function inZone(zone: string, body: () => void) {
  const original = process.env.TZ;
  process.env.TZ = zone;

  try {
    body();
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

// **The three money formatters moved to `lib/money.ts` at PET-47**, where they take the profile's
// currency, and their suite moved with them to `money.test.ts` - including the cases this file used
// to own: the two-decimal-place pinning, the unsigned zero on all three, and the U+2212
// substitution that is the whole point of the comment at the top of this file. Nothing re-exports
// them from here any more, because after the thread landed the last consumer turned out to be a
// comment in `app/DecorativePanel.tsx` explaining why that file uses literal strings instead.

describe('initials', () => {
  it('takes the first letter of each of the first two words', () => {
    // The designed value on 04 Dashboard and 17 Settings, from the designed
    // name: "Marko Kovač".
    expect(initials('Marko Kovač')).toBe('MK');
  });

  it('uppercases a lowercase name', () => {
    expect(initials('marko kovač')).toBe('MK');
  });

  it('takes the first letter of a diacritic name from the name, not the ASCII fold', () => {
    // Ž, not Z. Nothing normalises here, and nothing should: the initial is the
    // user's own letter.
    expect(initials('Žan Šimić')).toBe('ŽŠ');
  });

  it('keeps an astral-plane character whole', () => {
    // The reason firstLetter uses Array.from rather than charAt. With charAt
    // this returns two lone surrogates, which render as replacement glyphs.
    expect(initials('𝔐arko 𝔎ovač')).toBe('𝔐𝔎');
  });

  it('takes one letter from a single-word name', () => {
    // **Ordinary rather than defensive since PET-72**, which collapsed the two
    // name fields into one whose placeholder invites a nickname - so "Marko"
    // with no surname is a value the form actively offers.
    expect(initials('Marko')).toBe('M');
  });

  it('ignores surrounding and repeated whitespace', () => {
    // The stored name is untrimmed by design, so a value with stray spaces
    // reaches here - and splitting on a single space would take an empty first
    // word and produce nothing at all.
    expect(initials('  Marko   Kovač  ')).toBe('MK');
  });

  it('produces nothing for a blank name rather than throwing', () => {
    // `RegisterDto` marks the name @IsNotEmpty, so this is defensive. It must
    // not produce "undefined" or throw.
    expect(initials('')).toBe('');
    expect(initials('   ')).toBe('');
  });

  it('ignores a third word', () => {
    // Two letters is what the 36px disc holds, and what the frame draws.
    expect(initials('Ana Marija Kovač')).toBe('AM');
  });
});

describe('shortName', () => {
  it('abbreviates the second word', () => {
    expect(shortName('Marko Kovač')).toBe('Marko K.');
  });

  it('uppercases the abbreviated initial', () => {
    expect(shortName('Marko kovač')).toBe('Marko K.');
  });

  it('drops the abbreviation mark for a single-word name', () => {
    // Not "Marko .": a full stop with nothing before it reads as a defect, and
    // the sidebar footer shows this on every screen. Ordinary rather than
    // defensive since PET-72 - see `initials` above.
    expect(shortName('Marko')).toBe('Marko');
    expect(shortName('Marko')).not.toContain('.');
  });

  it('leaves the first word unabbreviated', () => {
    // Only the second is shortened. A first-name initial would make the
    // footer unreadable, and the design shows the full first name.
    expect(shortName('Marko Kovač')).toContain('Marko');
  });

  it('ignores a third word', () => {
    expect(shortName('Ana Marija Kovač')).toBe('Ana M.');
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

describe('periodOverline', () => {
  // The budgeting period's own label, and the answer to the `docs/TODO.md` entry open since
  // PET-19. `today` is passed explicitly throughout rather than faked with timers, which is
  // exactly what the parameter exists for.

  it('names one month at the default start day, matching the old behaviour', () => {
    // At 1 the period *is* the calendar month, so this has to be byte-identical to what the four
    // headers drew before PET-47 - otherwise the fix is a visible change for every account that
    // never touched the setting, which is almost all of them.
    expect(periodOverline(1, '2025-10-08')).toBe('October 2025');
    expect(periodOverline(1, '2025-10-08')).toBe(monthOverline(new Date(2025, 9, 8)));
  });

  it('names both months above the default, with the year once', () => {
    // 20 October at a start day of 15 is inside the period running 15 Oct - 15 Nov.
    expect(periodOverline(15, '2025-10-20')).toBe('October / November 2025');
  });

  it('names the period the day belongs to, not the month it is in', () => {
    // The whole defect: 10 October at a start day of 15 is in the period that opened on
    // 15 September, so a header saying "October" names a window the figures below are not from.
    expect(periodOverline(15, '2025-10-10')).toBe('September / October 2025');
  });

  it('puts the boundary day in the period it opens, matching the backend', () => {
    // `>=`, the same comparison `src/common/month-window.ts` makes. The day before belongs to the
    // previous period, and getting this backwards is a one-character error that is wrong for
    // exactly one day a month.
    expect(periodOverline(15, '2025-10-15')).toBe('October / November 2025');
    expect(periodOverline(15, '2025-10-14')).toBe('September / October 2025');
  });

  it('carries both years across a year boundary', () => {
    // The one case a single trailing year would be actively wrong about rather than merely terse:
    // "December / January 2026" claims December 2026.
    expect(periodOverline(15, '2025-12-20')).toBe('December 2025 / January 2026');
    expect(periodOverline(15, '2026-01-10')).toBe('December 2025 / January 2026');
  });

  it('handles the last day a period may start on', () => {
    // 28 is the backend's cap, chosen so every month has the day and there is no clamping case.
    expect(periodOverline(28, '2025-02-28')).toBe('February / March 2025');
    expect(periodOverline(28, '2025-02-27')).toBe('January / February 2025');
  });

  it('falls back to the calendar month for a start day the DTO cannot produce', () => {
    // `@IsInt @Min(1) @Max(28)` makes these unreachable. A fallback rather than a throw because
    // this is a page heading, and taking the screen out through the error boundary over a label
    // is the worse of the two failures.
    expect(periodOverline(0, '2025-10-20')).toBe('October 2025');
    expect(periodOverline(31, '2025-10-20')).toBe('October 2025');
  });
});

describe('periodLabel', () => {
  it('names one month at the default start day', () => {
    expect(periodLabel(1, '2025-10-08')).toBe('October');
  });

  it('names both months above it, and never a year', () => {
    // The month pill and the Categories tab's "{period} spending" heading both draw this, and
    // neither has room for a year - which is what makes it a second function rather than a slice
    // off the overline.
    expect(periodLabel(15, '2025-10-20')).toBe('October / November');
    expect(periodLabel(15, '2025-12-20')).toBe('December / January');
  });

  it('agrees with periodOverline about which period today is in', () => {
    // The two must never disagree: they appear on the same screen, one in the overline and one in
    // the pill beneath it.
    expect(periodLabel(15, '2025-10-14')).toBe('September / October');
    expect(periodOverline(15, '2025-10-14')).toBe('September / October 2025');
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
    inZone('America/New_York', () => {
      expect(formatIsoDate('2025-10-08')).toBe('Oct 8, 2025');
      expect(formatIsoDate('2025-01-01')).toBe('Jan 1, 2025');
    });
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
    inZone('America/New_York', () => {
      expect(formatIsoDayMonth('2025-10-08')).toBe('Oct 8');
      expect(formatIsoDayMonth('2025-01-01')).toBe('Jan 1');
    });
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

  // The regression `formatIsoDate` and `formatIsoDayMonth` both pin, reached through this
  // function: the **fall-through** branch is the zone-sensitive one, because it is the only
  // path here that builds a `Date`. "Today" and "Yesterday" come out of `Date.UTC` arithmetic
  // over parsed parts and would read the same under every zone, so asserting those two here -
  // which an earlier version of this test did - could not fail for the reason it named.
  it('keeps the day it was given in a zone behind UTC', () => {
    inZone('America/New_York', () => {
      expect(formatRelativeDate('2025-10-05', TODAY)).toBe('Oct 5');
      expect(formatRelativeDate('2025-01-01', '2025-01-08')).toBe('Jan 1');
    });
  });

  // What `daysBetween`'s `Date.UTC` diff really buys, and the assertion that fails without it.
  // Local midnight to local midnight is 23 hours across New York's spring transition and 25
  // across its autumn one, so an implementation subtracting the local `Date`s `dateFromIso`
  // hands back and truncating either way answers 0 or 2 rather than 1 - "Today" for the
  // previous day, or a short date for it.
  it.each([
    ['2025-03-09', '2025-03-10', 'spring forward, a 23-hour local day'],
    ['2025-11-02', '2025-11-03', 'autumn back, a 25-hour local day'],
  ])('reads "Yesterday" from %s to %s (%s)', (iso, today) => {
    inZone('America/New_York', () => {
      expect(formatRelativeDate(iso, today)).toBe('Yesterday');
    });
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
