import { load } from './fixture';
import { CATEGORY_PLANS, MONTHS, MONTH_TARGETS, OCCURRENCES } from './plan';
import { generate } from './generate';

/**
 * Pins the two claims the whole PET-69 fixture split exists to make true, and
 * that no other test can see: that the committed `fixture.data.json` is
 * internally coherent (nobody hand-edited it into something `load()` would choke on
 * later), and that the calendar bands actually produce the shape
 * `MONTH_TARGETS` was written to describe. Neither is visible from `plan.ts`'s
 * own specs, which pin the tables the generator reads rather than what it
 * produces from them.
 */

describe('the committed fixture', () => {
  const fixture = load();

  it('matches MONTHS and OCCURRENCES', () => {
    expect(fixture.months).toBe(MONTHS);
    expect(fixture.transactions.length).toBeGreaterThan(0);
  });

  it('names only categories CATEGORY_PLANS knows about, both directions', () => {
    const planNames = new Set(Object.keys(CATEGORY_PLANS));
    const fixtureNames = new Set(fixture.categories.map((c) => c.name));
    expect(fixtureNames).toEqual(planNames);

    for (const transaction of fixture.transactions) {
      expect(planNames.has(transaction.category)).toBe(true);
    }
  });

  it('keeps every day inside 1-28', () => {
    for (const transaction of fixture.transactions) {
      expect(transaction.day).toBeGreaterThanOrEqual(1);
      expect(transaction.day).toBeLessThanOrEqual(28);
    }
  });

  it('keeps every month inside 0-11 and every occurrence inside 0..OCCURRENCES-1', () => {
    for (const transaction of fixture.transactions) {
      expect(transaction.month).toBeGreaterThanOrEqual(0);
      expect(transaction.month).toBeLessThanOrEqual(11);
      expect(transaction.occurrence).toBeGreaterThanOrEqual(0);
      expect(transaction.occurrence).toBeLessThan(OCCURRENCES);
    }
  });

  // The drift detector for a hand-edited fixture.data.json: every one of the
  // MONTHS/12 * 12 calendar slots must appear, and none may appear twice -
  // silently dropping or duplicating a slot is otherwise invisible until a
  // seeded account is missing a month nobody noticed.
  it('carries all 36 (month, occurrence) slots exactly once', () => {
    const seen = new Set<string>();
    for (const transaction of fixture.transactions) {
      seen.add(`${transaction.month}:${transaction.occurrence}`);
    }
    expect(seen.size).toBe(MONTHS);
  });

  it("sums the fixture's own category caps to its own profile budget", () => {
    const capsTotal = fixture.categories.reduce((s, c) => s + c.capCents, 0);
    expect(capsTotal).toBe(fixture.profile.monthlyBudgetCents);
  });
});

describe('the calendar band shape', () => {
  // Generated fresh rather than read from the committed fixture, so this
  // holds for the model rather than for one lucky roll of the committed seed.
  const fixture = generate(42);

  const totalCentsByMonthOccurrence = new Map<string, number>();
  for (const transaction of fixture.transactions) {
    const key = `${transaction.month}:${transaction.occurrence}`;
    totalCentsByMonthOccurrence.set(
      key,
      (totalCentsByMonthOccurrence.get(key) ?? 0) + transaction.amountCents,
    );
  }

  function totalsForMonth(month: number): number[] {
    return [...totalCentsByMonthOccurrence.entries()]
      .filter(([key]) => Number(key.split(':')[0]) === month)
      .map(([, total]) => total);
  }

  it('puts December, July and August over budget every time they recur', () => {
    const overBudgetMonths = MONTH_TARGETS.map((target, month) => ({
      target,
      month,
    })).filter(({ target }) => target.overBudget);

    expect(
      overBudgetMonths.map(({ month }) => month).sort((a, b) => a - b),
    ).toEqual([6, 7, 11]);

    for (const { month } of overBudgetMonths) {
      for (const total of totalsForMonth(month)) {
        expect(total).toBeGreaterThan(fixture.profile.monthlyBudgetCents);
      }
    }
  });

  it('never puts a non-over-budget month over budget', () => {
    const nonOverBudgetMonths = MONTH_TARGETS.map((target, month) => ({
      target,
      month,
    })).filter(({ target }) => !target.overBudget);

    for (const { month } of nonOverBudgetMonths) {
      for (const total of totalsForMonth(month)) {
        expect(total).toBeLessThanOrEqual(fixture.profile.monthlyBudgetCents);
      }
    }
  });

  it('lands May (the near-miss) between 97% and 99% of budget', () => {
    const budget = fixture.profile.monthlyBudgetCents;
    for (const total of totalsForMonth(4)) {
      const percent = (total / budget) * 100;
      expect(percent).toBeGreaterThanOrEqual(97);
      expect(percent).toBeLessThanOrEqual(99);
    }
  });
});
