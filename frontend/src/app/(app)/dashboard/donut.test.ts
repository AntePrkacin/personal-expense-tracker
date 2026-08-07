import { apportionPercents, sortedCategories } from './donut';

const category = (name: string, spent: number, percent = 0) => ({
  id: `id-${name}`,
  name,
  color: '#57B368',
  spent,
  percent,
});

describe('sortedCategories', () => {
  it('orders largest spend first (AC3)', () => {
    const sorted = sortedCategories([
      category('Transport', 223),
      category('Groceries', 397),
      category('Dining out', 298),
    ]);

    expect(sorted.map((c) => c.name)).toEqual(['Groceries', 'Dining out', 'Transport']);
  });

  it('breaks a tie on name, the same rule topCategory documents', () => {
    // Without this the two could order either way between renders, and PET-21's "Top category"
    // stat and this legend's first row could name different categories on one screen.
    const sorted = sortedCategories([
      category('Shopping', 100),
      category('Dining out', 100),
      category('Groceries', 100),
    ]);

    expect(sorted.map((c) => c.name)).toEqual(['Dining out', 'Groceries', 'Shopping']);
  });

  it('breaks that tie by code unit, the collation the backend uses', () => {
    // The case that separates the two candidate comparators, and it is ordinary data rather than
    // exotic data. `topCategoryOf` compares with `<`, so `Bills` (B is 66) wins the tie against
    // `arcade` (a is 97) and the stat names Bills. `localeCompare` puts `arcade` first, which
    // would print one category in the stat and a different one in the legend's first row.
    const sorted = sortedCategories([category('arcade', 100), category('Bills', 100)]);

    expect(sorted.map((c) => c.name)).toEqual(['Bills', 'arcade']);
    expect('Bills'.localeCompare('arcade')).toBeGreaterThan(0);
  });

  it('breaks it by code unit for an accented name too', () => {
    // The same disagreement, reached from the other direction: locale collation sorts `Éclairs`
    // next to `E`, code units put every accented character after `Z`.
    const sorted = sortedCategories([category('Éclairs', 100), category('Zoo', 100)]);

    expect(sorted.map((c) => c.name)).toEqual(['Zoo', 'Éclairs']);
  });

  it('does not mutate its input, which the legend and the ring both read', () => {
    const input = [category('Transport', 10), category('Groceries', 90)];
    sortedCategories(input);

    expect(input.map((c) => c.name)).toEqual(['Transport', 'Groceries']);
  });

  it('handles an empty list', () => {
    expect(sortedCategories([])).toEqual([]);
  });
});

describe('apportionPercents', () => {
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

  // The case this function exists for. Independent rounding gives 32+24+18+14+11 = 99.
  it('makes a set that naively rounds to 99 sum to 100', () => {
    const naive = [32.4, 24.3, 18.2, 14.2, 10.9].map(Math.round);
    expect(sum(naive)).toBe(99);

    const apportioned = apportionPercents([32.4, 24.3, 18.2, 14.2, 10.9]);

    expect(sum(apportioned)).toBe(100);
    // Flooring gives 32+24+18+14+10 = 98, so **two** points are missing, not one, and they go to
    // the two largest remainders: `.9` (which was going to round up anyway) and `.4`. So the
    // slice that visibly gains a point over its own rounding is the 32.4, not the 10.9.
    expect(apportioned).toEqual([33, 24, 18, 14, 11]);
  });

  it('makes a set that naively rounds to 101 sum to 100', () => {
    const naive = [30.6, 30.6, 19.6, 19.2].map(Math.round);
    expect(sum(naive)).toBe(101);

    expect(sum(apportionPercents([30.6, 30.6, 19.6, 19.2]))).toBe(100);
  });

  it('leaves an already-exact set alone', () => {
    expect(apportionPercents([50, 25, 15, 10])).toEqual([50, 25, 15, 10]);
  });

  it('gives a single category the whole circle', () => {
    expect(apportionPercents([100])).toEqual([100]);
  });

  it('breaks a remainder tie on index, so the result is deterministic', () => {
    // Three equal thirds: every remainder is identical, so which slice gets the spare point is
    // decided by position rather than by the sort's stability. Written as real percentages rather
    // than as three 1s, which this used to be - that shorthand only summed to 100 because the
    // function renormalised, and it now says three categories genuinely splitting 3% of a period.
    const apportioned = apportionPercents([100 / 3, 100 / 3, 100 / 3]);

    expect(sum(apportioned)).toBe(100);
    expect(apportioned).toEqual([34, 33, 33]);
  });

  it('keeps every value within one of its own unrounded share', () => {
    const values = [32.4, 24.3, 18.2, 14.2, 10.9];
    const apportioned = apportionPercents(values);

    apportioned.forEach((value, index) => {
      expect(Math.abs(value - values[index]!)).toBeLessThan(1);
    });
  });

  it('leaves a shortfall visible rather than renormalising it away', () => {
    // The backend guarantees the input sums to 100, and `categoriesOf` keeps `totalCents` as its
    // denominator precisely so a regression in the orphan fold shows up here as percentages that
    // fail to reach 100. Scaling to the set's own total would erase that signal from the consumer
    // end and leave a legend reading 100% over amounts that sum to less than the centre readout.
    expect(sum(apportionPercents([48.5, 29.1, 19.4]))).toBe(97);
  });

  it('rounds an overshoot the same way, rather than clamping to 100', () => {
    expect(sum(apportionPercents([50.4, 30.4, 22.4]))).toBe(103);
  });

  it('still sums to exactly 100 for every well-formed response', () => {
    // The property that actually ships. The two above are what happens when the guarantee breaks.
    expect(sum(apportionPercents([32.4, 24.3, 18.2, 14.2, 10.9]))).toBe(100);
    expect(sum(apportionPercents([30.6, 30.6, 19.6, 19.2]))).toBe(100);
  });

  it('handles many small slices without losing a point', () => {
    const many = Array.from({ length: 17 }, () => 100 / 17);
    expect(sum(apportionPercents(many))).toBe(100);
  });

  it('returns an empty array for no categories, rather than anything summing to 100', () => {
    expect(apportionPercents([])).toEqual([]);
  });

  it('returns zeroes rather than NaN when every value is zero', () => {
    // Unreachable through the API, which filters `spent > 0`, but a bare division would put
    // NaN into every legend row the day that filter moved.
    expect(apportionPercents([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('always returns integers', () => {
    for (const value of apportionPercents([32.4, 24.3, 18.2, 14.2, 10.9])) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});
