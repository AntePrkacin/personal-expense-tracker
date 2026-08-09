import { faker } from '@faker-js/faker';
import { drawAmounts, generate, pickMerchant, shareOut } from './generate';
import { CATEGORY_PLANS, MIN_TRANSACTION_CENTS } from './plan';
import type { CategoryPlan } from './plan';

// Every draw in these functions goes through faker, so seeding makes the whole
// suite deterministic. Without it a floor or a sum assertion is a coin flip that
// passes locally and fails in CI once a year.
beforeEach(() => faker.seed(1));

describe('drawAmounts', () => {
  it('returns exactly the number of amounts asked for', () => {
    expect(drawAmounts(100_000, 12, 0.7)).toHaveLength(12);
  });

  it('returns nothing for a count of zero', () => {
    expect(drawAmounts(100_000, 0, 0.7)).toEqual([]);
  });

  // The sum is what the over-budget months rest on: a month that does not land
  // on its target is a month that may not go over budget at all.
  it.each([1, 2, 5, 13, 40])('sums to the target exactly for %i', (count) => {
    const amounts = drawAmounts(250_000, count, 0.8);
    expect(amounts.reduce((sum, a) => sum + a, 0)).toBe(250_000);
  });

  // The regression test for the $0.01 row. The rounded shares can overshoot the
  // target between them, and the row left holding the difference was asked for a
  // negative amount; the drift now goes onto the largest row instead.
  it('never emits an amount below the floor, over many draws', () => {
    for (let i = 0; i < 300; i++) {
      const amounts = drawAmounts(
        faker.number.int({ min: 5_000, max: 400_000 }),
        faker.number.int({ min: 1, max: 30 }),
        faker.helpers.arrayElement([0.55, 0.7, 0.85, 1.0]),
      );
      expect(Math.min(...amounts)).toBeGreaterThanOrEqual(
        MIN_TRANSACTION_CENTS,
      );
    }
  });

  // A tiny target over many rows cannot honour both the floor and the sum. The
  // floor wins, because a $0.00 transaction is a visible defect and a month a
  // few cents off its target is not.
  it('prefers the floor to the sum when they conflict', () => {
    const amounts = drawAmounts(300, 10, 0.7);
    expect(Math.min(...amounts)).toBe(MIN_TRANSACTION_CENTS);
  });

  it('produces a right-skewed spread, not a flat one', () => {
    const amounts = drawAmounts(1_000_000, 400, 0.9).sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)];
    const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    // The property the log-normal draw exists for: a long right tail pulls the
    // mean above the median. The uniform draw it replaced had them equal.
    expect(median).toBeLessThan(mean);
  });
});

describe('shareOut', () => {
  const plan = (countPercent: number): CategoryPlan =>
    ({ countPercent }) as CategoryPlan;

  it('splits the total across the plans exactly', () => {
    const counts = shareOut(50, [
      ['a', plan(50)],
      ['b', plan(30)],
      ['c', plan(20)],
    ]);
    expect([...counts.values()].reduce((s, v) => s + v, 0)).toBe(50);
  });

  it('gives each plan roughly its share', () => {
    const counts = shareOut(100, [
      ['a', plan(50)],
      ['b', plan(30)],
      ['c', plan(20)],
    ]);
    expect(counts.get('a')).toBe(50);
    expect(counts.get('b')).toBe(30);
    expect(counts.get('c')).toBe(20);
  });

  // The regression test for the sit-out months. A month where Travel does not
  // happen hands this a list whose countPercent no longer reaches 100, and
  // dividing by a hard-coded 100 would silently seed fewer transactions than the
  // month was supposed to have.
  it('normalises against the plans passed in, not against 100', () => {
    const counts = shareOut(60, [
      ['a', plan(20)],
      ['b', plan(10)],
    ]);
    expect([...counts.values()].reduce((s, v) => s + v, 0)).toBe(60);
    expect(counts.get('a')).toBe(40);
    expect(counts.get('b')).toBe(20);
  });

  it('still totals exactly when the shares do not divide evenly', () => {
    const counts = shareOut(7, [
      ['a', plan(33)],
      ['b', plan(33)],
      ['c', plan(34)],
    ]);
    expect([...counts.values()].reduce((s, v) => s + v, 0)).toBe(7);
  });
});

describe('pickMerchant', () => {
  it('only ever returns a name from the list', () => {
    const merchants = [
      { name: 'a', weight: 5 },
      { name: 'b', weight: 1 },
    ];
    for (let i = 0; i < 200; i++) {
      expect(['a', 'b']).toContain(pickMerchant(merchants));
    }
  });

  it('respects the weights', () => {
    const merchants = [
      { name: 'heavy', weight: 9 },
      { name: 'light', weight: 1 },
    ];
    const picks = Array.from({ length: 2000 }, () => pickMerchant(merchants));
    const heavy = picks.filter((name) => name === 'heavy').length;
    expect(heavy / picks.length).toBeGreaterThan(0.8);
  });
});

describe('generate', () => {
  it('is reproducible for a given seed', () => {
    expect(generate(42)).toEqual(generate(42));
  });

  it('differs between seeds, so the seed is really an input', () => {
    expect(generate(42)).not.toEqual(generate(43));
  });

  it('emits every month in full, including the current one', () => {
    const fixture = generate(42);
    const byMonth = new Map<string, number>();
    for (const t of fixture.transactions) {
      const key = `${t.month}:${t.occurrence}`;
      byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
    }

    expect(byMonth.size).toBe(fixture.months);
    // The most recent occurrence of January (month 0, occurrence 0) is not
    // truncated here - that is the seeder's job - so it must be the same size
    // as any other month rather than a partial one.
    expect(byMonth.get('0:0')).toBeGreaterThan(40);
  });

  it('carries a cap for every category it files a transaction under', () => {
    const fixture = generate(42);
    const capped = new Set(fixture.categories.map((c) => c.name));
    for (const t of fixture.transactions) {
      expect(capped.has(t.category)).toBe(true);
    }
  });

  it('names only categories the plan knows about', () => {
    const fixture = generate(42);
    for (const category of fixture.categories) {
      expect(CATEGORY_PLANS[category.name]).toBeDefined();
    }
  });

  it('keeps every day inside the 1-28 range the profile allows', () => {
    for (const t of generate(42).transactions) {
      expect(t.day).toBeGreaterThanOrEqual(1);
      expect(t.day).toBeLessThanOrEqual(28);
    }
  });
});
