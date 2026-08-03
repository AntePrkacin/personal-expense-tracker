import { toCents } from './money';

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
