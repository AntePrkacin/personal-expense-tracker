import {
  BUDGET_CENTS,
  CATEGORY_PLANS,
  FIXED_BILLS,
  MAJOR_IRREGULAR,
  MINOR_IRREGULAR,
  assertNoMerchantCollisions,
  assertPlanIsCoherent,
  assertShocksCanClearBudget,
} from './plan';
import type { CategoryPlan, FixedBill, IrregularExpense } from './plan';

/**
 * **These specs are about the asserts, not about the tables.**
 *
 * Checking that the committed tables pass is nearly worthless on its own: they
 * pass, or the seed would already be failing on every run. What is worth pinning
 * is that each assert actually *fires* on a table broken the way somebody would
 * really break it, because that is the only thing standing between a one-row
 * edit and a demo account whose caps quietly stop summing to its budget.
 */

const plan = (over: Partial<CategoryPlan> = {}): CategoryPlan => ({
  spendPercent: 50,
  countPercent: 50,
  sigma: 0.7,
  capCents: BUDGET_CENTS / 2,
  merchants: [{ name: 'Somewhere', weight: 1 }],
  ...over,
});

describe('assertPlanIsCoherent', () => {
  it('passes on the committed tables', () => {
    expect(() => assertPlanIsCoherent()).not.toThrow();
  });

  it('fires when the spend shares do not reach 100', () => {
    expect(() =>
      assertPlanIsCoherent(
        { A: plan({ spendPercent: 40 }), B: plan() },
        BUDGET_CENTS,
        [],
      ),
    ).toThrow(/100% of spend/);
  });

  it('fires when the transaction shares do not reach 100', () => {
    expect(() =>
      assertPlanIsCoherent(
        { A: plan({ countPercent: 40 }), B: plan() },
        BUDGET_CENTS,
        [],
      ),
    ).toThrow(/100% of spend and 100% of transactions/);
  });

  // The one that matters most in practice: caps are edited one row at a time,
  // and a total that misses the budget shows up as an unallocated remainder on
  // a screen nobody is looking at during a demo.
  it('fires when the caps miss the budget, and says by how much', () => {
    expect(() =>
      assertPlanIsCoherent(
        { A: plan({ capCents: 1_000 }), B: plan() },
        BUDGET_CENTS,
        [],
      ),
    ).toThrow(/caps must sum to the \$5000 budget; got \$2510/);
  });

  it('fires when an irregular expense names a merchant its category lacks', () => {
    const irregular: IrregularExpense = {
      category: 'A',
      merchant: 'Nowhere',
      minCents: 1,
      maxCents: 2,
    };
    expect(() =>
      assertPlanIsCoherent({ A: plan(), B: plan() }, BUDGET_CENTS, [irregular]),
    ).toThrow(/Nowhere \(A\)/);
  });

  it('fires when an irregular expense names a category that does not exist', () => {
    const irregular: IrregularExpense = {
      category: 'Missing',
      merchant: 'Somewhere',
      minCents: 1,
      maxCents: 2,
    };
    expect(() =>
      assertPlanIsCoherent({ A: plan(), B: plan() }, BUDGET_CENTS, [irregular]),
    ).toThrow(/Somewhere \(Missing\)/);
  });
});

describe('assertShocksCanClearBudget', () => {
  it('passes on the committed tables', () => {
    expect(() => assertShocksCanClearBudget()).not.toThrow();
  });

  // Narrowing a range is silent otherwise: the run still succeeds, the month
  // simply lands under budget, and a month picked to be over stops being it.
  it('fires when the cheapest pair cannot close the widest gap', () => {
    const major: IrregularExpense[] = [
      { category: 'A', merchant: 'M', minCents: 1, maxCents: 10_000 },
    ];
    const minor: IrregularExpense[] = [
      { category: 'B', merchant: 'N', minCents: 1, maxCents: 5_000 },
    ];
    expect(() =>
      assertShocksCanClearBudget(major, minor, 520_000, 440_000),
    ).toThrow(/cannot close the \$800 gap/);
  });

  it('passes when the pair is exactly big enough', () => {
    const major: IrregularExpense[] = [
      { category: 'A', merchant: 'M', minCents: 1, maxCents: 60_000 },
    ];
    const minor: IrregularExpense[] = [
      { category: 'B', merchant: 'N', minCents: 1, maxCents: 20_000 },
    ];
    expect(() =>
      assertShocksCanClearBudget(major, minor, 520_000, 440_000),
    ).not.toThrow();
  });

  it('measures the cheapest of each list, not the first', () => {
    const major: IrregularExpense[] = [
      { category: 'A', merchant: 'M', minCents: 1, maxCents: 90_000 },
      { category: 'A', merchant: 'M', minCents: 1, maxCents: 10_000 },
    ];
    const minor: IrregularExpense[] = [
      { category: 'B', merchant: 'N', minCents: 1, maxCents: 20_000 },
    ];
    expect(() =>
      assertShocksCanClearBudget(major, minor, 520_000, 440_000),
    ).toThrow(/tops out at \$300/);
  });
});

describe('assertNoMerchantCollisions', () => {
  it('passes on the committed tables', () => {
    expect(() => assertNoMerchantCollisions()).not.toThrow();
  });

  it('fires when a fixed bill is also in the variable pool', () => {
    const bills: FixedBill[] = [
      {
        merchant: 'Somewhere',
        category: 'A',
        dayOfMonth: 1,
        amountCents: 1_000,
      },
    ];
    expect(() => assertNoMerchantCollisions({ A: plan() }, bills)).toThrow(
      /Somewhere/,
    );
  });

  it('names every colliding merchant, not just the first', () => {
    const plans = {
      A: plan({ merchants: [{ name: 'One', weight: 1 }] }),
      B: plan({ merchants: [{ name: 'Two', weight: 1 }] }),
    };
    const bills: FixedBill[] = [
      { merchant: 'One', category: 'A', dayOfMonth: 1, amountCents: 1 },
      { merchant: 'Two', category: 'B', dayOfMonth: 2, amountCents: 1 },
    ];
    expect(() => assertNoMerchantCollisions(plans, bills)).toThrow(/One, Two/);
  });
});

describe('the committed tables', () => {
  // Not an assert's job, but cheap and it pins the shape the checker reports
  // against: every category the generator can file under is one the seeder can
  // find, and every bill lands in a real category.
  it('files every fixed bill under a category the plan knows', () => {
    for (const bill of FIXED_BILLS) {
      expect(CATEGORY_PLANS[bill.category]).toBeDefined();
    }
  });

  it('keeps every irregular expense inside its own category', () => {
    for (const expense of [...MAJOR_IRREGULAR, ...MINOR_IRREGULAR]) {
      expect(CATEGORY_PLANS[expense.category]).toBeDefined();
    }
  });

  it('gives every category at least one merchant', () => {
    for (const [name, categoryPlan] of Object.entries(CATEGORY_PLANS)) {
      expect(categoryPlan.merchants.length).toBeGreaterThan(0);
      expect(name).not.toBe('');
    }
  });
});
