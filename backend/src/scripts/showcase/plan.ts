/**
 * The showcase account's spending model: what it costs, how often, on what, and
 * capped at how much.
 *
 * Split out of `seed-showcase.ts` by PET-69 so it can be read, generated from
 * and measured without booting Nest or opening a database. Nothing in this file
 * knows what a database row looks like, and nothing in it reads the clock - the
 * numbers here describe a month, not a date.
 */

/**
 * The monthly budget, in minor units - $5,000.
 *
 * Written to the profile on every run and used as the denominator for the caps,
 * so the two cannot disagree. Reading the stored budget instead would be worse:
 * a budget changed through `PATCH /api/profile` between runs would leave the
 * showcase telling a different story than the one this file describes.
 */
export const BUDGET_CENTS = 500_000;

/** Whole months of history, the current (partial) one included. */
export const MONTHS = 18;

/**
 * How many of the 17 complete months are seeded over budget.
 *
 * **Four rather than six, and the reason is the caps.** Every over-budget month
 * pulls the 18-month average up by about $30, the caps have to sum to exactly
 * the budget, and the headroom every category gets is whatever the budget has
 * left over that average. At six the average sat at 91% of budget, leaving 9%
 * to share out - so ordinary month-to-month variance put Dining out over its
 * cap in twelve months of eighteen and Uncategorized in thirteen, which is not
 * a budget anybody would keep using. At four the average is nearer 86% and each
 * category carries roughly 15-20% of slack, which is what makes going over mean
 * something when it happens.
 */
export const OVER_BUDGET_MONTHS = 4;

/**
 * A month's ordinary spending, before any irregular expense - 70% to 90% of the
 * budget.
 *
 * This is the whole month, fixed bills included, not the discretionary part. It
 * sits below the budget on purpose: a month goes over because something
 * irregular happened, not because the weekly shop crept up 20%, which is what
 * `IRREGULAR_*` below models.
 */
export const ORDINARY_MIN_CENTS = 350_000;
export const ORDINARY_MAX_CENTS = 450_000;

/**
 * An over-budget month draws its ordinary spending from the top of that range,
 * then takes one major and one minor irregular expense on top.
 *
 * `OVER_BUDGET_FLOOR_CENTS` is the total such a month must clear, and the two
 * constants are load-bearing together: the widest gap the irregulars ever have
 * to cover is `OVER_BUDGET_FLOOR_CENTS - ORDINARY_OVER_MIN_CENTS`, and the
 * cheapest major-plus-minor pair has to be able to cover it or a month picked
 * to be over budget quietly lands under it and the over-cap insight has nothing
 * to fire on. `assertShocksCanClearBudget` checks exactly that rather than
 * leaving it to whoever edits a range next.
 */
export const ORDINARY_OVER_MIN_CENTS = 440_000;
export const OVER_BUDGET_FLOOR_CENTS = 520_000;

/** Transactions a complete month carries, fixed bills and shocks included. */
export const MIN_TRANSACTIONS = 55;
export const MAX_TRANSACTIONS = 72;

/**
 * The smallest transaction the seed will write, in minor units.
 *
 * Without it the run that produced this file's first measurements had a $0.01
 * row in it: the remainder-absorbing transaction went negative against a target
 * the rounded shares had already overshot, and `Math.max(1, ...)` turned that
 * into a cent. `drawAmounts` now pushes the drift onto the largest transaction
 * in the category, where a few cents are invisible, and clamps here.
 */
export const MIN_TRANSACTION_CENTS = 100;

/**
 * Days a transaction can fall on, matching the profile's `monthStartDay` range.
 *
 * 28 so every month has the day, which is the same reason the profile column is
 * constrained to 1-28. It does mean the 29th to the 31st are never used.
 */
export const MAX_DAY_OF_MONTH = 28;

/** The name of the fallback category, which is seeded rather than templated. */
export const FALLBACK_CATEGORY = 'Uncategorized';

/**
 * Fixed monthly bills, so the account looks like somebody's actual outgoings.
 *
 * **This is what makes the arithmetic honest.** A $5,000 budget spread evenly
 * over 70 transactions forces a $65 average with nothing under $11 and nothing
 * over $150, because `target / count` pins the mean and the old uniform draw
 * had no tail at either end. Real households spend roughly 40% of the month on
 * a dozen recurring bills and the rest on many small purchases, so the bills
 * are modelled first and the variable pool is whatever is left.
 *
 * **No insight rule reads them**, and none did by the time this list grew from
 * five streaming subscriptions to twelve bills: PET-42-43-44 deleted the
 * recurring-merchant detector, because month counting cannot separate a
 * subscription from a habit. The data stays anyway, and for a better reason
 * than the rule ever was - a $1,450 rent payment is what stops the other 60
 * transactions in the month having to average $65 each.
 *
 * They are deliberately not part of the variable merchant pool, and
 * `assertNoMerchantCollisions` enforces that rather than trusting it: a bill
 * whose merchant is also drawn at random gets a second, unrelated charge under
 * the same name, so the list shows a `Netflix` at $87.32 and the account stops
 * reading as somebody's real outgoings. Each bills on its own day, so the list
 * does not show a dozen identical-looking rows stacked on the 1st either.
 *
 * `varianceCents` is the swing either side of `amountCents`, and the three
 * utility bills carry one because real ones move with the season and the meter.
 * The rest are genuinely flat.
 */
export type FixedBill = {
  merchant: string;
  category: string;
  dayOfMonth: number;
  amountCents: number;
  varianceCents?: number;
};

export const FIXED_BILLS: readonly FixedBill[] = [
  {
    merchant: 'Riverside Property',
    category: 'Loans & debt',
    dayOfMonth: 1,
    amountCents: 145_000,
  },
  {
    merchant: 'Netflix',
    category: 'Entertainment',
    dayOfMonth: 3,
    amountCents: 1_399,
  },
  {
    merchant: 'City Power',
    category: 'Utilities',
    dayOfMonth: 4,
    amountCents: 9_500,
    varianceCents: 2_800,
  },
  {
    merchant: 'Meridian Health',
    category: 'Healthcare',
    dayOfMonth: 5,
    amountCents: 14_500,
  },
  {
    merchant: 'Spotify',
    category: 'Entertainment',
    dayOfMonth: 7,
    amountCents: 1_099,
  },
  {
    merchant: 'Fiberlink',
    category: 'Utilities',
    dayOfMonth: 8,
    amountCents: 5_500,
  },
  {
    merchant: 'Pulse Fitness',
    category: 'Personal care',
    dayOfMonth: 10,
    amountCents: 3_900,
  },
  {
    merchant: 'HBO Max',
    category: 'Entertainment',
    dayOfMonth: 12,
    amountCents: 999,
  },
  {
    merchant: 'Telcom Mobile',
    category: 'Utilities',
    dayOfMonth: 15,
    amountCents: 4_000,
    varianceCents: 900,
  },
  {
    merchant: 'Strava',
    category: 'Entertainment',
    dayOfMonth: 18,
    amountCents: 799,
  },
  {
    merchant: 'City Waterworks',
    category: 'Utilities',
    dayOfMonth: 20,
    amountCents: 3_000,
    varianceCents: 700,
  },
  {
    merchant: 'iCloud',
    category: 'Entertainment',
    dayOfMonth: 24,
    amountCents: 299,
  },
];

/**
 * What each category is worth, how often it is bought, how lumpy it is, what it
 * is capped at, and who it is bought from.
 *
 * One table rather than four parallel ones, because every field here has to
 * agree with the others: `spendPercent / countPercent` **is** the category's
 * typical transaction size, so Dining out at 17/27 lands near $30 and Travel at
 * 7/2 lands near $170, and a cap has to sit above the spend the first two
 * imply or the category is over on every single month.
 *
 * The percentages are of the **variable** pool, after the fixed bills above
 * have been taken out, and each column sums to 100 - `assertPlanIsCoherent`
 * checks both, plus the caps against the budget, because a table this shape is
 * edited one row at a time and the arithmetic silently stops adding up.
 *
 * `sigma` is the log-normal spread. Groceries at 0.55 is a weekly shop that is
 * much the same size every time; Travel at 1.00 is a coffee at the airport and
 * a hotel bill drawn from the same pool.
 *
 * `monthlyChance` is how often the category happens at all, and only the three
 * genuinely occasional ones carry it. Without it every category fires in all 18
 * months, which put a steady $177 of Travel and $94 of Education into every
 * single one - a tell that survives any amount of work on the amounts, because
 * nobody takes 1.0 trips a month for a year and a half. A category that sits
 * out has both its shares redistributed over the ones that did not, so the
 * month still lands on its target.
 */
export type CategoryPlan = {
  spendPercent: number;
  countPercent: number;
  sigma: number;
  capCents: number;
  monthlyChance?: number;
  merchants: readonly { name: string; weight: number }[];
};

export const CATEGORY_PLANS: Record<string, CategoryPlan> = {
  Groceries: {
    spendPercent: 25,
    countPercent: 22,
    sigma: 0.55,
    capCents: 70_000,
    merchants: [
      { name: 'Konzum', weight: 12 },
      { name: 'Lidl', weight: 9 },
      { name: 'Kaufland', weight: 6 },
      { name: 'Spar', weight: 5 },
      { name: 'dm', weight: 5 },
      { name: 'Plodine', weight: 4 },
      { name: 'Studenac', weight: 4 },
      { name: 'Müller', weight: 3 },
      { name: 'Tommy', weight: 3 },
      { name: 'Mlinar Bakery', weight: 3 },
      { name: 'Green Market', weight: 2 },
      { name: 'Fish Market', weight: 1 },
    ],
  },
  'Dining out': {
    spendPercent: 17,
    countPercent: 27,
    sigma: 0.8,
    capCents: 48_000,
    merchants: [
      { name: 'Cogito Coffee', weight: 10 },
      { name: 'Submarine', weight: 6 },
      { name: 'Pizzeria Napoli', weight: 5 },
      { name: 'Wolt', weight: 5 },
      { name: 'Bolt Food', weight: 4 },
      { name: 'Kebab Corner', weight: 4 },
      { name: 'Burger Bar', weight: 3 },
      { name: 'Noodle House', weight: 3 },
      { name: 'Bistro Central', weight: 3 },
      { name: 'Rougemarin Bakery', weight: 2 },
      { name: 'Sushi Ya', weight: 2 },
    ],
  },
  Transportation: {
    spendPercent: 13,
    countPercent: 11,
    sigma: 0.6,
    capCents: 42_000,
    merchants: [
      { name: 'INA', weight: 8 },
      { name: 'ZET Transit', weight: 6 },
      { name: 'Shell', weight: 6 },
      { name: 'OMV', weight: 5 },
      { name: 'Bolt', weight: 5 },
      { name: 'Petrol', weight: 4 },
      { name: 'Uber', weight: 4 },
      { name: 'City Parking', weight: 4 },
      { name: 'Vulco Tyres', weight: 1 },
      { name: 'Autoservis Mrak', weight: 1 },
    ],
  },
  'Family & pets': {
    spendPercent: 8,
    countPercent: 7,
    sigma: 0.8,
    capCents: 24_500,
    merchants: [
      { name: 'Pet Centar', weight: 7 },
      { name: 'Baby Center', weight: 5 },
      { name: 'Vet Clinic', weight: 4 },
      { name: 'Zoo Shop', weight: 3 },
      { name: 'Kinder Play', weight: 3 },
      { name: 'Toy Planet', weight: 3 },
    ],
  },
  Travel: {
    spendPercent: 7,
    countPercent: 2,
    sigma: 1.0,
    capCents: 20_000,
    monthlyChance: 0.45,
    merchants: [
      { name: 'Booking.com', weight: 6 },
      { name: 'Airbnb', weight: 5 },
      { name: 'Ryanair', weight: 4 },
      { name: 'Croatia Airlines', weight: 3 },
      { name: 'Jadrolinija', weight: 3 },
      { name: 'Hertz', weight: 2 },
      { name: 'Trainline', weight: 2 },
      { name: 'Hostelworld', weight: 1 },
    ],
  },
  Entertainment: {
    spendPercent: 6,
    countPercent: 6,
    sigma: 0.75,
    capCents: 24_500,
    merchants: [
      { name: 'CineStar', weight: 6 },
      { name: 'Steam', weight: 5 },
      { name: 'Cineplexx', weight: 4 },
      { name: 'PlayStation Store', weight: 3 },
      { name: 'Ticketshop', weight: 3 },
      { name: 'Vinyl Corner', weight: 2 },
      { name: 'Escape Room', weight: 2 },
      { name: 'Bowling Center', weight: 2 },
    ],
  },
  'Personal care': {
    spendPercent: 5,
    countPercent: 6,
    sigma: 0.65,
    capCents: 19_500,
    merchants: [
      { name: 'Barber Shop', weight: 6 },
      { name: 'Salon Bella', weight: 4 },
      { name: 'Beauty Depot', weight: 4 },
      { name: 'Nails & Co', weight: 2 },
      { name: 'Spa Retreat', weight: 1 },
    ],
  },
  Healthcare: {
    spendPercent: 5,
    countPercent: 3,
    sigma: 0.9,
    capCents: 36_000,
    merchants: [
      { name: 'City Pharmacy', weight: 8 },
      { name: 'Smile Dental', weight: 4 },
      { name: 'Poliklinika Sunce', weight: 3 },
      { name: 'LabPlus Diagnostics', weight: 2 },
      { name: 'Optika Anda', weight: 2 },
      { name: 'Physio Studio', weight: 2 },
    ],
  },
  Gifts: {
    spendPercent: 4,
    countPercent: 3,
    sigma: 0.85,
    capCents: 10_000,
    monthlyChance: 0.6,
    merchants: [
      { name: 'Flower Shop', weight: 5 },
      { name: 'Present & Co', weight: 4 },
      { name: 'Gift Gallery', weight: 3 },
      { name: 'Red Cross', weight: 2 },
      { name: 'UNICEF', weight: 2 },
    ],
  },
  Education: {
    spendPercent: 3,
    countPercent: 2,
    sigma: 0.9,
    capCents: 13_000,
    monthlyChance: 0.5,
    merchants: [
      { name: 'Udemy', weight: 5 },
      { name: 'Coursera', weight: 4 },
      { name: 'Algebra Courses', weight: 3 },
      { name: 'Knjižara Znanje', weight: 3 },
      { name: 'Language School', weight: 2 },
    ],
  },
  Utilities: {
    spendPercent: 1,
    countPercent: 3,
    sigma: 0.6,
    capCents: 29_000,
    merchants: [
      { name: 'Waste Services', weight: 4 },
      { name: 'Telcom Top-up', weight: 3 },
      { name: 'Chimney Service', weight: 1 },
    ],
  },
  'Loans & debt': {
    spendPercent: 1,
    countPercent: 2,
    sigma: 0.7,
    capCents: 150_000,
    merchants: [
      { name: 'Erste Card Club', weight: 4 },
      { name: 'PBZ Card', weight: 3 },
      { name: 'Student Loan Service', weight: 2 },
    ],
  },
  [FALLBACK_CATEGORY]: {
    spendPercent: 5,
    countPercent: 6,
    sigma: 0.8,
    capCents: 13_500,
    merchants: [
      { name: 'ATM Withdrawal', weight: 6 },
      { name: 'Kiosk Tisak', weight: 5 },
      { name: 'Parking Meter', weight: 3 },
      { name: 'Vending Machine', weight: 3 },
      { name: 'Postal Service', weight: 2 },
    ],
  },
};

/**
 * The one-off expenses that put a month over budget.
 *
 * A month does not go over because every category drifted up 15% - it goes over
 * because the car needed a clutch. Modelling it that way rather than inflating
 * the whole month is what puts the overspend in one or two categories where the
 * over-cap insight, the donut and the category cards can all show it, and it
 * leaves the weekly shop looking like the weekly shop in a bad month too.
 *
 * The merchants are drawn from the variable pool above on purpose: these are
 * places you use anyway, occasionally for a lot. `assertPlanIsCoherent` checks
 * each one really is in its category's pool, since a typo here would introduce
 * a merchant that appears only in over-budget months.
 *
 * **Each carries its own range, and that is the whole point of the two tiers.**
 * The first version of this split an arbitrary $800-to-$1,900 shock evenly over
 * two categories picked at random, which put $1,300 through Personal care and
 * read as 650% of a $200 cap - a haircut budget wearing a car repair. A range
 * per expense keeps every overspend the size that expense actually is, and
 * drawing one major plus one minor is what guarantees the pair can always cover
 * the gap to `OVER_BUDGET_FLOOR_CENTS` however the dice land.
 */
export type IrregularExpense = {
  category: string;
  merchant: string;
  minCents: number;
  maxCents: number;
};

export const MAJOR_IRREGULAR: readonly IrregularExpense[] = [
  {
    category: 'Travel',
    merchant: 'Booking.com',
    minCents: 30_000,
    maxCents: 100_000,
  },
  {
    category: 'Transportation',
    merchant: 'Autoservis Mrak',
    minCents: 25_000,
    maxCents: 90_000,
  },
  {
    category: 'Healthcare',
    merchant: 'Smile Dental',
    minCents: 20_000,
    maxCents: 70_000,
  },
  {
    category: 'Education',
    merchant: 'Algebra Courses',
    minCents: 20_000,
    maxCents: 60_000,
  },
];

export const MINOR_IRREGULAR: readonly IrregularExpense[] = [
  {
    category: 'Family & pets',
    merchant: 'Vet Clinic',
    minCents: 12_000,
    maxCents: 45_000,
  },
  {
    category: 'Utilities',
    merchant: 'Chimney Service',
    minCents: 9_000,
    maxCents: 32_000,
  },
  {
    category: 'Gifts',
    merchant: 'Gift Gallery',
    minCents: 8_000,
    maxCents: 30_000,
  },
  {
    category: 'Entertainment',
    merchant: 'Ticketshop',
    minCents: 8_000,
    maxCents: 28_000,
  },
  {
    category: 'Personal care',
    merchant: 'Spa Retreat',
    minCents: 7_000,
    maxCents: 25_000,
  },
];

/**
 * Fails when `CATEGORY_PLANS` has stopped adding up.
 *
 * Every one of these is an arithmetic property that nothing else in the file
 * re-derives, so getting one wrong is silent: caps that miss the budget leave
 * the allocation summary reporting an unallocated remainder the demo never
 * meant to show, and shares that miss 100 quietly scale the whole month off its
 * target. The table is edited one row at a time, which is exactly when a column
 * stops summing.
 */
export function assertPlanIsCoherent(
  categoryPlans: Record<string, CategoryPlan> = CATEGORY_PLANS,
  budgetCents: number = BUDGET_CENTS,
  irregulars: readonly IrregularExpense[] = [
    ...MAJOR_IRREGULAR,
    ...MINOR_IRREGULAR,
  ],
): void {
  const plans = Object.values(categoryPlans);
  const sum = (pick: (plan: CategoryPlan) => number): number =>
    plans.reduce((total, plan) => total + pick(plan), 0);

  const spend = sum((plan) => plan.spendPercent);
  const count = sum((plan) => plan.countPercent);
  const caps = sum((plan) => plan.capCents);

  if (spend !== 100 || count !== 100) {
    throw new Error(
      `CATEGORY_PLANS must split 100% of spend and 100% of transactions; ` +
        `got ${spend}% and ${count}%.`,
    );
  }
  if (caps !== budgetCents) {
    throw new Error(
      `CATEGORY_PLANS caps must sum to the $${budgetCents / 100} budget; ` +
        `got $${caps / 100}.`,
    );
  }

  // An irregular expense whose merchant is not in its own category's pool would
  // be a name that appears only in over-budget months, which is exactly the kind
  // of pattern a demo account should not have and a typo would produce.
  const stray = irregulars.filter(
    (expense) =>
      !categoryPlans[expense.category]?.merchants.some(
        (merchant) => merchant.name === expense.merchant,
      ),
  );

  if (stray.length > 0) {
    throw new Error(
      `These irregular expenses name a merchant their own category does not ` +
        `carry: ${stray.map((e) => `${e.merchant} (${e.category})`).join(', ')}.`,
    );
  }
}

/**
 * Fails when the cheapest pair of irregular expenses cannot put a month over
 * budget.
 *
 * The gap an over-budget month has to close is at most
 * `OVER_BUDGET_FLOOR_CENTS - ORDINARY_OVER_MIN_CENTS`, and the pair drawn to
 * close it is one major plus one minor - so the worst case is the cheapest of
 * each. Narrowing a range without checking this is silent: the run still
 * succeeds, the month simply lands under budget, and six of the seventeen
 * months stop being the thing they were picked to be.
 */
export function assertShocksCanClearBudget(
  major: readonly IrregularExpense[] = MAJOR_IRREGULAR,
  minor: readonly IrregularExpense[] = MINOR_IRREGULAR,
  floorCents: number = OVER_BUDGET_FLOOR_CENTS,
  ordinaryOverMinCents: number = ORDINARY_OVER_MIN_CENTS,
): void {
  const cheapest =
    Math.min(...major.map((expense) => expense.maxCents)) +
    Math.min(...minor.map((expense) => expense.maxCents));
  const widestGap = floorCents - ordinaryOverMinCents;

  if (cheapest < widestGap) {
    throw new Error(
      `The cheapest major-plus-minor irregular pair tops out at ` +
        `$${cheapest / 100}, which cannot close the $${widestGap / 100} gap ` +
        `an over-budget month may have to. Widen a range, or raise ` +
        `ORDINARY_OVER_MIN_CENTS.`,
    );
  }
}

/**
 * Fails when a fixed bill's merchant also sits in the variable pool.
 *
 * A merchant in both places gets a second charge in some months, at an amount
 * drawn from that category's variable pool rather than from the bill - so the
 * transaction list ends up showing a `Fiberlink` at $23.40 beside the real $55
 * one, and a fixed bill stops reading as fixed. The old file stated this rule
 * in a comment and left it to whoever edited the list next; the lists are long
 * enough now that an overlap is easy to introduce and impossible to see.
 */
export function assertNoMerchantCollisions(
  categoryPlans: Record<string, CategoryPlan> = CATEGORY_PLANS,
  bills: readonly FixedBill[] = FIXED_BILLS,
): void {
  const variable = new Set(
    Object.values(categoryPlans).flatMap((plan) =>
      plan.merchants.map((merchant) => merchant.name),
    ),
  );

  const collisions = bills
    .map((bill) => bill.merchant)
    .filter((name) => variable.has(name));

  if (collisions.length > 0) {
    throw new Error(
      `These merchants bill on a fixed schedule and are also in the variable ` +
        `pool, so they would draw a second charge at an unrelated amount: ` +
        `${collisions.join(', ')}.`,
    );
  }
}

/** One plan by category name, or a failure that says which one is missing. */
export function requirePlan(name: string): CategoryPlan {
  const plan = CATEGORY_PLANS[name];

  if (!plan) {
    throw new Error(
      `The showcase seed has no plan for the "${name}" category. Either a ` +
        `category template was added or renamed, or this account's categories ` +
        `were edited through the API. Add a row to CATEGORY_PLANS in ` +
        `src/scripts/seed-showcase.ts (and rebalance the percentages and caps, ` +
        `which must still sum to 100, 100 and the budget).`,
    );
  }

  return plan;
}
