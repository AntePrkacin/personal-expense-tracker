/**
 * Turns the plan into a month-by-month set of transactions, with no clock and
 * no database in sight.
 *
 * Pure by design, and that is what PET-69 buys: the same function backs the
 * fixture generator, the seeder and the checker, so the data can be measured
 * without seeding anything and generated without connecting to anything.
 */
import { faker } from '@faker-js/faker';
import type { CategoryPlan } from './plan';
import {
  BUDGET_CENTS,
  CATEGORY_PLANS,
  FIXED_BILLS,
  MAJOR_IRREGULAR,
  MAX_DAY_OF_MONTH,
  MAX_TRANSACTIONS,
  MINOR_IRREGULAR,
  MIN_TRANSACTIONS,
  MIN_TRANSACTION_CENTS,
  MONTHS,
  ORDINARY_MAX_CENTS,
  ORDINARY_MIN_CENTS,
  ORDINARY_OVER_MIN_CENTS,
  OVER_BUDGET_FLOOR_CENTS,
  OVER_BUDGET_MONTHS,
  assertNoMerchantCollisions,
  assertPlanIsCoherent,
  assertShocksCanClearBudget,
} from './plan';
import type { Fixture, FixtureTransaction } from './fixture';

/**
 * A standard normal, drawn through faker rather than `Math.random`.
 *
 * Box-Muller. Going through faker is what would let a future `faker.seed(n)`
 * make a whole run reproducible; `Math.random()` sits outside that and would
 * leave the amounts varying even on a seeded run.
 */
export function standardNormal(): number {
  const u1 = faker.number.float({ min: Number.EPSILON, max: 1 });
  const u2 = faker.number.float({ min: 0, max: 1 });
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Splits `totalCents` across `count` log-normally distributed transactions.
 *
 * **Log-normal rather than the uniform draw this replaced**, which produced a
 * flat spread between 20% and 180% of the running average: measured over 220k
 * transactions, 0.25% came out under $10 and 0.15% over $200, so the account
 * had no coffees and no dentist bills, only a wall of $30-to-$120 rows. Real
 * spending inside one category is roughly log-normal - a long right tail, a
 * median well below the mean - and `sigma` is how heavy that tail is.
 *
 * The shape is drawn first and scaled to the target afterwards, so the exact
 * sum survives however lumpy the draw was.
 *
 * **The rounding drift goes onto the largest transaction, not the last one.**
 * Handing it to the last is the obvious way to write this and it is what put a
 * $0.01 row in the first seeded account: the rounded shares can overshoot the
 * target between them, and the row left holding the difference is then asked
 * for a negative amount and clamped to the floor. On the largest row a few
 * cents either way are invisible, and no row can be pushed under
 * `MIN_TRANSACTION_CENTS` by arithmetic that has nothing to do with it.
 */
export function drawAmounts(
  totalCents: number,
  count: number,
  sigma: number,
): number[] {
  if (count <= 0) {
    return [];
  }

  const weights = Array.from({ length: count }, () =>
    Math.exp(sigma * standardNormal()),
  );
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  const amounts = weights.map((weight) =>
    Math.max(
      MIN_TRANSACTION_CENTS,
      Math.round((weight / totalWeight) * totalCents),
    ),
  );

  const drift = totalCents - amounts.reduce((sum, amount) => sum + amount, 0);
  const largest = amounts.indexOf(Math.max(...amounts));
  amounts[largest] = Math.max(MIN_TRANSACTION_CENTS, amounts[largest] + drift);

  return amounts;
}

/**
 * One merchant, drawn against its weight.
 *
 * The weights are what give each category a handful of regulars and a long
 * tail, rather than the two-merchants-used-50/50 the round-robin pool produced.
 * A grocery list that alternates between the same two names for 18 months reads
 * as generated at a glance, which is the one thing a showcase account cannot
 * afford to do.
 */
export function pickMerchant(
  merchants: readonly { name: string; weight: number }[],
): string {
  const total = merchants.reduce((sum, merchant) => sum + merchant.weight, 0);
  let roll = faker.number.int({ min: 1, max: total });

  for (const merchant of merchants) {
    roll -= merchant.weight;
    if (roll <= 0) {
      return merchant.name;
    }
  }

  return merchants[merchants.length - 1].name;
}

/**
 * How many transactions each category gets this month.
 *
 * Largest-remainder rather than plain rounding, so the parts add back to
 * `total` exactly: rounding each share independently drifts by a few
 * transactions, and the month's count would then disagree with the count the
 * variable target was divided by.
 *
 * The shares are normalised against the sum of the plans actually passed in
 * rather than against 100, because a month where Travel sat out hands this a
 * list whose `countPercent` no longer reaches 100 - and dividing by 100 there
 * would quietly seed fewer transactions than the month was supposed to have.
 */
export function shareOut(
  total: number,
  plans: readonly [string, CategoryPlan][],
): Map<string, number> {
  const totalPercent = plans.reduce(
    (sum, [, plan]) => sum + plan.countPercent,
    0,
  );
  const exact = plans.map(([name, plan]) => ({
    name,
    value: (total * plan.countPercent) / totalPercent,
  }));

  const counts = new Map(
    exact.map((entry) => [entry.name, Math.floor(entry.value)]),
  );
  let remaining =
    total - [...counts.values()].reduce((sum, value) => sum + value, 0);

  const byRemainder = [...exact].sort(
    (a, b) => (b.value % 1) - (a.value % 1) || b.value - a.value,
  );

  for (const entry of byRemainder) {
    if (remaining <= 0) {
      break;
    }
    counts.set(entry.name, counts.get(entry.name)! + 1);
    remaining -= 1;
  }

  return counts;
}

/**
 * The whole account, month by month.
 *
 * **Every month is generated in full, including the current one**, which is the
 * change PET-69's split forces and an improvement on what it replaces. The old
 * code scaled the current month's count and target by
 * `elapsed = lastDay / MAX_DAY_OF_MONTH`, because it knew what day it was; a
 * pure generator does not, and must not, or the output could not be a fixture.
 * So the current month comes out whole here and the **seeder** truncates it to
 * the seeding day. Because transactions are spread over days 1-28, dropping the
 * days after today removes proportionally as many of them, and the pro-rata
 * behaviour falls out of the truncation rather than being computed.
 *
 * Pass a `seed` to make the run reproducible. Every source of randomness in this
 * file and in `plan.ts` goes through faker, with no `Math.random` anywhere, so
 * the same seed really does give the same account.
 */
export function generate(seed: number): Fixture {
  assertPlanIsCoherent();
  assertNoMerchantCollisions();
  assertShocksCanClearBudget();

  faker.seed(seed);

  const planned = Object.entries(CATEGORY_PLANS);

  // Drawn from the complete months only. The month containing the seeding day
  // is truncated by the seeder, so putting the overspend there would mean an
  // over-budget month that lands under budget whenever the seed runs early in
  // the month.
  const overBudgetMonths = new Set(
    faker.helpers
      .shuffle(Array.from({ length: MONTHS - 1 }, (_, i) => i + 1))
      .slice(0, OVER_BUDGET_MONTHS),
  );

  const rows: FixtureTransaction[] = [];

  for (let monthsAgo = 0; monthsAgo < MONTHS; monthsAgo++) {
    const isOverBudget = overBudgetMonths.has(monthsAgo);

    const count = faker.number.int({
      min: MIN_TRANSACTIONS,
      max: MAX_TRANSACTIONS,
    });
    const ordinaryTarget = faker.number.int({
      min: isOverBudget ? ORDINARY_OVER_MIN_CENTS : ORDINARY_MIN_CENTS,
      max: ORDINARY_MAX_CENTS,
    });

    let fixedCents = 0;

    for (const bill of FIXED_BILLS) {
      const swing = bill.varianceCents ?? 0;
      const amountCents = Math.max(
        MIN_TRANSACTION_CENTS,
        bill.amountCents +
          (swing === 0 ? 0 : faker.number.int({ min: -swing, max: swing })),
      );
      fixedCents += amountCents;

      rows.push({
        monthsAgo,
        day: bill.dayOfMonth,
        merchant: bill.merchant,
        category: bill.category,
        amountCents,
      });
    }

    // The overspend, as one or two irregular expenses rather than as 15% on
    // every category. An over-budget month spread evenly puts nothing over its
    // cap, so the donut, the category cards and the over-cap insight have
    // nothing to show - which is the point of seeding an over-budget month at
    // all. Concentrating it also happens to be how real months go over.
    const shocks: FixtureTransaction[] = [];

    if (isOverBudget) {
      const major = faker.helpers.arrayElement(MAJOR_IRREGULAR);
      const minor = faker.helpers.arrayElement(MINOR_IRREGULAR);

      // What the pair can deliver between them, and what the month needs to
      // clear the budget. `assertShocksCanClearBudget` has already established
      // that the floor never exceeds the capacity, so the Math.min is a
      // belt-and-braces rather than a real branch.
      const capacityMin = major.minCents + minor.minCents;
      const capacityMax = major.maxCents + minor.maxCents;
      const floorCents = Math.max(
        capacityMin,
        OVER_BUDGET_FLOOR_CENTS - ordinaryTarget,
      );
      const shockCents = faker.number.int({
        min: Math.min(floorCents, capacityMax),
        max: capacityMax,
      });

      // Split in proportion to what each can absorb, then clamped to its own
      // range. Clamping can only push a piece up (the major takes at most its
      // own maximum, which leaves the minor no more than its own), so the pair
      // still sums to at least `shockCents` and the month stays over budget.
      const majorCents = Math.min(
        major.maxCents,
        Math.max(
          major.minCents,
          Math.round((shockCents * major.maxCents) / capacityMax),
        ),
      );
      const minorCents = Math.min(
        minor.maxCents,
        Math.max(minor.minCents, shockCents - majorCents),
      );

      for (const [expense, amountCents] of [
        [major, majorCents],
        [minor, minorCents],
      ] as const) {
        shocks.push({
          monthsAgo,
          day: faker.number.int({ min: 1, max: MAX_DAY_OF_MONTH }),
          merchant: expense.merchant,
          category: expense.category,
          amountCents: Math.max(MIN_TRANSACTION_CENTS, amountCents),
        });
      }
    }

    rows.push(...shocks);

    // Whatever the bills and the shocks did not take. The bills come out of the
    // month's target rather than sitting on top of it, so the totals still land
    // where the over-budget months need them.
    const variableTarget = Math.max(1, ordinaryTarget - fixedCents);
    const variableCount = Math.max(
      1,
      count - FIXED_BILLS.length - shocks.length,
    );

    // Which categories happen at all this month. Only the three occasional ones
    // can sit out; everything else has no `monthlyChance` and is always here.
    const present = planned.filter(
      ([, plan]) =>
        plan.monthlyChance === undefined ||
        faker.number.float({ min: 0, max: 1 }) < plan.monthlyChance,
    );
    const perCategory = shareOut(variableCount, present);

    // Only categories that actually drew a transaction share the target, so a
    // short month cannot lose the 2% Travel was owed into a category with
    // nowhere to put it - the month would then quietly undershoot.
    const active = present.filter(([name]) => (perCategory.get(name) ?? 0) > 0);
    const activeSpend = active.reduce(
      (sum, [, plan]) => sum + plan.spendPercent,
      0,
    );

    for (const [name, plan] of active) {
      const categoryCount = perCategory.get(name)!;
      const categoryTarget = Math.round(
        (variableTarget * plan.spendPercent) / activeSpend,
      );

      for (const amountCents of drawAmounts(
        categoryTarget,
        categoryCount,
        plan.sigma,
      )) {
        rows.push({
          monthsAgo,
          day: faker.number.int({ min: 1, max: MAX_DAY_OF_MONTH }),
          merchant: pickMerchant(plan.merchants),
          category: name,
          amountCents,
        });
      }
    }
  }

  return {
    seed,
    months: MONTHS,
    profile: {
      firstName: 'Showcase',
      lastName: 'User',
      currency: 'USD',
      monthlyBudgetCents: BUDGET_CENTS,
      monthStartDay: 1,
    },
    categories: planned.map(([name, plan]) => ({
      name,
      capCents: plan.capCents,
    })),
    transactions: rows,
  };
}
