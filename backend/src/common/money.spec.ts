import { fromCents, toCents } from './money';

describe('toCents', () => {
  it('converts major units to minor ones', () => {
    expect(toCents(2000.5)).toBe(200050);
    expect(toCents(0.5)).toBe(50);
    expect(toCents(1)).toBe(100);
  });

  it('rounds away binary floating-point noise', () => {
    // 4.02 * 100 is 401.99999999999994; truncating would lose a cent, and this
    // is the reason the function rounds rather than floors.
    expect(toCents(4.02)).toBe(402);
    expect(toCents(8.29)).toBe(829);
    expect(toCents(1e9)).toBe(1e11);
  });

  it('keeps the DTO’s upper bound a safe integer', () => {
    // RegisterDto caps monthlyBudget at a billion major units, so the largest
    // value this can ever be handed is a hundred billion cents - two orders of
    // magnitude below Number.MAX_SAFE_INTEGER.
    expect(Number.isSafeInteger(toCents(1_000_000_000))).toBe(true);
  });
});

describe('fromCents', () => {
  it('converts minor units back to major ones', () => {
    expect(fromCents(200050)).toBe(2000.5);
    expect(fromCents(402)).toBe(4.02);
    expect(fromCents(50)).toBe(0.5);
    expect(fromCents(100)).toBe(1);
  });

  it('returns a number, not a fixed-decimal string', () => {
    // A toFixed(2) here would type-poison every amount in the API.
    expect(typeof fromCents(402)).toBe('number');
  });

  it('round-trips every amount the DTOs accept', () => {
    const amounts = [0.01, 0.5, 4.02, 8.29, 2000.5, 999_999.99, 1_000_000_000];

    for (const amount of amounts) {
      expect(fromCents(toCents(amount))).toBe(amount);
    }
  });
});
