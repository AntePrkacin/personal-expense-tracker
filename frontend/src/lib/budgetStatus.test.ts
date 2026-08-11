import { BUDGET_TONE, budgetStatus } from './budgetStatus';

// The band edges, pinned on the numbers rather than re-derived, because the whole module is a
// mirror of `statusFor` in `backend/src/categories/categories.service.ts` and the edges are
// where a mirror silently stops being one.

describe('budgetStatus', () => {
  it('is on track below three quarters of the budget', () => {
    expect(budgetStatus(0, 2000)).toBe('on_track');
    expect(budgetStatus(1499.99, 2000)).toBe('on_track');
  });

  it('turns near at exactly 75%, on cents', () => {
    expect(budgetStatus(1500, 2000)).toBe('near');
    expect(budgetStatus(1999.99, 2000)).toBe('near');
  });

  it('is full at exactly the budget, not over', () => {
    expect(budgetStatus(2000, 2000)).toBe('full');
  });

  it('is over one cent past the budget', () => {
    expect(budgetStatus(2000.01, 2000)).toBe('over');
  });

  it('compares on cents, so float summation noise cannot move a band edge', () => {
    // The Categories tab sums `spent` from per-category floats, so a figure that is exactly
    // 75% in cents can arrive as 1499.9999999999998. One round to cents recovers the integer
    // the backend computed with; comparing the raw floats would band this `on_track`.
    const summed = 1000.35 + 499.65 - Number.EPSILON * 1000;

    expect(summed).toBeLessThan(1500);
    expect(budgetStatus(summed, 2000)).toBe('near');
  });

  it('bands a sub-dollar budget on its cents rather than its rounded dollars', () => {
    // `monthlyBudget` is only `@IsPositive()`, so $0.40 is a real budget. On rounded whole
    // dollars it would be 0 and everything would be "over"; on cents it has real bands.
    expect(budgetStatus(0.1, 0.4)).toBe('on_track');
    expect(budgetStatus(0.3, 0.4)).toBe('near');
    expect(budgetStatus(0.4, 0.4)).toBe('full');
    expect(budgetStatus(30, 0.4)).toBe('over');
  });
});

describe('BUDGET_TONE', () => {
  it('keeps the bar the same colour as the badge in every band', () => {
    // The tone map is one object per band precisely so chip and bar cannot disagree; this pins
    // that the map itself holds the invariant, since nothing else checks class strings.
    for (const tone of Object.values(BUDGET_TONE)) {
      const badgeColour = tone.badge.match(/badge-(success|warning|orange|error)/)?.[1];
      const barColour = tone.bar.match(/progress-(success|warning|orange|error)/)?.[1];

      expect(badgeColour).toBeDefined();
      expect(barColour).toBe(badgeColour);
    }
  });
});
