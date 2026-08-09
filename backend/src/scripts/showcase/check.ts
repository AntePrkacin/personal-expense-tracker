/**
 * Measures a generated account, so the model can be judged on numbers rather
 * than on how it reads.
 *
 * **This exists because the defects this data has actually had were
 * distributional, and no unit test can see one.** A $0.01 transaction is
 * catchable by asserting a floor. $1,300 of Personal care at 650% of its cap, or
 * Dining out over its cap in twelve months of eighteen, are not: nothing is out
 * of range, no invariant is broken, the shape is simply wrong. Both were found
 * by seeding an account and querying SQLite by hand, which is repeatable by
 * nobody and remembered by nobody.
 *
 * `generate()` being pure is what makes this cheap - no database, no Nest, no
 * seeding - and it is also what makes the interesting mode possible: running the
 * generator many times and reporting the **distribution of outcomes**. Whether a
 * category goes over its cap in 5% of months or 60% is a property of the model,
 * and one sampled account cannot tell you which.
 *
 * **It reports rather than asserts, deliberately.** Thresholds cannot be chosen
 * before the numbers are known, and a checker that fails the build while the
 * model is being tuned is a checker somebody deletes. Once the numbers settle,
 * the few lines worth defending become assertions in a spec.
 */
import { FIXED_BILLS, MAX_DAY_OF_MONTH, MONTH_TARGETS } from './plan';
import type { Fixture } from './fixture';

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;
const pct = (part: number, whole: number): string =>
  whole === 0 ? '-' : `${((part / whole) * 100).toFixed(1)}%`;

function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

function padStart(text: string, width: number): string {
  return text.length >= width ? text : ' '.repeat(width - text.length) + text;
}

/** One (month, occurrence) slot of one generated account. */
type MonthKey = string;

const monthKey = (trial: number, month: number, occurrence: number): MonthKey =>
  `${trial}:${month}:${occurrence}`;

/**
 * The whole report, as text.
 *
 * One function rather than a structured result plus a formatter, because there
 * is exactly one consumer and a shape nobody reads twice is a shape worth not
 * inventing. When a line here earns an assertion, it moves to a spec and gets a
 * proper return value then.
 */
export function checkFixtures(fixtures: readonly Fixture[]): string {
  const out: string[] = [];
  const trials = fixtures.length;
  const budget = fixtures[0].profile.monthlyBudgetCents;
  const months = fixtures[0].months;

  out.push(
    `Measured ${trials} generated account${trials === 1 ? '' : 's'}, ` +
      `${months} months each, against a ${money(budget)} budget.`,
  );

  // ---- Amounts -------------------------------------------------------------
  const amounts: number[] = [];
  for (const fixture of fixtures) {
    for (const t of fixture.transactions) {
      amounts.push(t.amountCents);
    }
  }
  amounts.sort((a, b) => a - b);

  const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
  out.push('', 'AMOUNTS');
  out.push(
    `  n ${amounts.length}   mean ${money(mean)}   min ${money(amounts[0])}   max ${money(amounts[amounts.length - 1])}`,
  );
  out.push(
    '  ' +
      [0.1, 0.25, 0.5, 0.75, 0.9, 0.99]
        .map(
          (q) =>
            `p${String(q * 100).padStart(2, '0')} ${money(percentile(amounts, q))}`,
        )
        .join('   '),
  );
  out.push(
    `  under $10 ${pct(amounts.filter((a) => a < 1000).length, amounts.length)}` +
      `   over $200 ${pct(amounts.filter((a) => a > 20000).length, amounts.length)}`,
  );

  // ---- Months ----------------------------------------------------------------
  // Every (month, occurrence) slot the generator emits is a complete month -
  // truncation only ever happens once the seeder resolves one slot against
  // today, and which slot that is depends on the real calendar date rather
  // than on anything this pure checker knows. So every slot here counts.
  const monthTotals = new Map<MonthKey, number>();
  const monthCounts = new Map<MonthKey, number>();
  const monthOfKey = new Map<MonthKey, number>();
  for (const [trial, fixture] of fixtures.entries()) {
    for (const t of fixture.transactions) {
      const key = monthKey(trial, t.month, t.occurrence);
      monthTotals.set(key, (monthTotals.get(key) ?? 0) + t.amountCents);
      monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1);
      monthOfKey.set(key, t.month);
    }
  }

  const allTotals = [...monthTotals.values()];
  const overBudget = allTotals.filter((total) => total > budget);
  const meanMonth = allTotals.reduce((s, t) => s + t, 0) / allTotals.length;
  const counts = [...monthCounts.values()];

  out.push('', 'MONTHS');
  out.push(
    `  mean total ${money(meanMonth)} (${pct(meanMonth, budget)} of budget)` +
      `   range ${money(Math.min(...allTotals))} to ${money(Math.max(...allTotals))}`,
  );
  out.push(
    `  over budget ${overBudget.length} of ${allTotals.length} (${pct(overBudget.length, allTotals.length)})` +
      `, ${(overBudget.length / trials).toFixed(1)} per account`,
  );
  out.push(
    `  transactions per month ${Math.min(...counts)} to ${Math.max(...counts)}` +
      `, mean ${(counts.reduce((s, c) => s + c, 0) / counts.length).toFixed(1)}`,
  );

  // ---- Calendar ----------------------------------------------------------
  // The claim `MONTH_TARGETS` exists to make true: December, July and August
  // are the only months that ever go over, and every other month's actual
  // spend lands inside the band it was drawn from. Per-calendar-month rather
  // than per-slot, since that is the shape a demo audience actually sees.
  out.push('', 'CALENDAR (mean % of budget, over-budget rate, by month)');
  for (let month = 0; month < 12; month++) {
    const totals = [...monthTotals.entries()]
      .filter(([key]) => monthOfKey.get(key) === month)
      .map(([, total]) => total);
    const meanPct =
      (totals.reduce((sum, total) => sum + total, 0) / totals.length / budget) *
      100;
    const over = totals.filter((total) => total > budget).length;
    const band = MONTH_TARGETS[month];
    out.push(
      `  ${pad(MONTH_NAMES[month], 4)} band ${padStart(`${band.minPercent}-${band.maxPercent}%`, 10)}` +
        `   mean ${padStart(`${meanPct.toFixed(1)}%`, 7)}` +
        `   over budget ${padStart(pct(over, totals.length), 7)}` +
        (band.overBudget ? '  (over-budget band)' : ''),
    );
  }

  // ---- Categories ----------------------------------------------------------
  const capByName = new Map(
    fixtures[0].categories.map((c) => [c.name, c.capCents]),
  );
  const spendPerCategoryMonth = new Map<string, Map<MonthKey, number>>();
  const txnsPerCategory = new Map<string, number>();
  const totalPerCategory = new Map<string, number>();

  for (const [trial, fixture] of fixtures.entries()) {
    for (const t of fixture.transactions) {
      const byMonth =
        spendPerCategoryMonth.get(t.category) ?? new Map<MonthKey, number>();
      const key = monthKey(trial, t.month, t.occurrence);
      byMonth.set(key, (byMonth.get(key) ?? 0) + t.amountCents);
      spendPerCategoryMonth.set(t.category, byMonth);
      txnsPerCategory.set(
        t.category,
        (txnsPerCategory.get(t.category) ?? 0) + 1,
      );
      totalPerCategory.set(
        t.category,
        (totalPerCategory.get(t.category) ?? 0) + t.amountCents,
      );
    }
  }

  const totalMonths = trials * months;
  let worstOverCap = { name: '-', ratio: 0 };

  out.push('', 'CATEGORIES');
  out.push(
    '  ' +
      pad('name', 16) +
      padStart('mean/mo', 10) +
      padStart('cap', 10) +
      padStart('of cap', 8) +
      padStart('over', 7) +
      padStart('txn/mo', 8) +
      padStart('mean txn', 10),
  );

  const ranked = [...totalPerCategory.entries()].sort((a, b) => b[1] - a[1]);
  for (const [name, total] of ranked) {
    const cap = capByName.get(name) ?? 0;
    const perMonth = total / totalMonths;
    const byMonth = spendPerCategoryMonth.get(name)!;
    const overCapMonths = [...byMonth.values()].filter((v) => v > cap).length;
    const txns = txnsPerCategory.get(name)!;

    for (const spent of byMonth.values()) {
      if (cap > 0 && spent / cap > worstOverCap.ratio) {
        worstOverCap = { name, ratio: spent / cap };
      }
    }

    out.push(
      '  ' +
        pad(name, 16) +
        padStart(money(perMonth), 10) +
        padStart(money(cap), 10) +
        padStart(pct(perMonth, cap), 8) +
        padStart(pct(overCapMonths, totalMonths), 7) +
        padStart((txns / totalMonths).toFixed(1), 8) +
        padStart(money(total / txns), 10),
    );
  }

  out.push(
    '',
    `  worst category-month: ${worstOverCap.name} at ${(worstOverCap.ratio * 100).toFixed(0)}% of its cap`,
  );

  // ---- Merchants -----------------------------------------------------------
  const merchantCounts = new Map<string, number>();
  for (const fixture of fixtures) {
    for (const t of fixture.transactions) {
      merchantCounts.set(t.merchant, (merchantCounts.get(t.merchant) ?? 0) + 1);
    }
  }
  const byFrequency = [...merchantCounts.entries()].sort((a, b) => b[1] - a[1]);

  out.push('', 'MERCHANTS');
  out.push(
    `  ${merchantCounts.size} distinct` +
      `, ${byFrequency.filter(([, n]) => n <= 2 * trials).length} appearing twice a run or less`,
  );
  out.push(
    '  head: ' +
      byFrequency
        .slice(0, 5)
        .map(([name, n]) => `${name} ${(n / totalMonths).toFixed(1)}/mo`)
        .join(', '),
  );

  // ---- Structure -----------------------------------------------------------
  const problems: string[] = [];
  for (const [trial, fixture] of fixtures.entries()) {
    const capsTotal = fixture.categories.reduce((s, c) => s + c.capCents, 0);
    if (capsTotal !== fixture.profile.monthlyBudgetCents) {
      problems.push(
        `trial ${trial}: caps sum to ${money(capsTotal)}, not ${money(fixture.profile.monthlyBudgetCents)}`,
      );
    }
    for (const t of fixture.transactions) {
      if (t.day < 1 || t.day > MAX_DAY_OF_MONTH) {
        problems.push(
          `trial ${trial}: day ${t.day} outside 1-${MAX_DAY_OF_MONTH}`,
        );
        break;
      }
    }
    for (const t of fixture.transactions) {
      if (t.month < 0 || t.month > 11) {
        problems.push(`trial ${trial}: month ${t.month} outside 0-11`);
        break;
      }
    }
    for (const t of fixture.transactions) {
      if (t.occurrence < 0 || t.occurrence * 12 >= fixture.months) {
        problems.push(
          `trial ${trial}: occurrence ${t.occurrence} outside range`,
        );
        break;
      }
    }
    // Every fixed bill, once a month, every month. A bill that also sits in the
    // variable pool would show up here as a count above one.
    for (const bill of FIXED_BILLS) {
      const perMonth = new Map<string, number>();
      for (const t of fixture.transactions) {
        if (t.merchant === bill.merchant) {
          const key = `${t.month}:${t.occurrence}`;
          perMonth.set(key, (perMonth.get(key) ?? 0) + 1);
        }
      }
      const wrong = [...perMonth.entries()].filter(([, n]) => n !== 1);
      if (perMonth.size !== fixture.months || wrong.length > 0) {
        problems.push(
          `trial ${trial}: ${bill.merchant} bills in ${perMonth.size} of ${fixture.months} months` +
            (wrong.length > 0
              ? `, ${wrong.length} of them more than once`
              : ''),
        );
      }
    }
  }

  out.push('', 'STRUCTURE');
  out.push(
    problems.length === 0
      ? '  all invariants hold'
      : problems.map((p) => `  PROBLEM ${p}`).join('\n'),
  );

  return out.join('\n');
}
