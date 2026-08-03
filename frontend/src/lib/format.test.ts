import { formatCurrency, formatNegative, initials, shortName } from './format';

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
