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
export const MONTHS = 36;

/**
 * How many times each calendar month recurs across `MONTHS` of history.
 *
 * `MONTH_TARGETS` gives every calendar month one band, and each of the three
 * Decembers, three Julys and so on draws independently from the same band -
 * which is what makes December always read as December rather than as
 * whichever `monthsAgo` the dice picked. `assertMonthsIsAMultipleOfTwelve`
 * guards the one precondition that makes the division exact: 18 would have
 * left four months with only 1.5 occurrences, which is not a number of times
 * anything happens.
 */
export const OCCURRENCES = MONTHS / 12;

/**
 * One band per calendar month (`0` is January, matching `parseDate`), each a
 * percentage-of-budget range the month's **total** spend should land in.
 *
 * **This replaces picking `OVER_BUDGET_MONTHS` at random.** A demo where
 * somebody asks "why is this month red" now has an answer beyond "the dice":
 * December runs hot for Christmas, July and August for the summer holiday, and
 * May is the deliberate near-miss - the month the account *just* made it.
 * `overBudget` is derived from the band lying entirely above 100%, not stored
 * twice, so the two cannot disagree.
 *
 * The bands average a shade under 91%, shaved down from an earlier draft that
 * averaged 93.5% - `seed:check --trials=200` is what caught the reason
 * this matters: at 93.5% every category has only 6.5% of headroom against
 * ordinary variance, which is what put Gifts over its cap in 25.7% of months
 * and Uncategorized in 22.4%, both far above the 4-11% every other category
 * saw. `assertMonthTargetsAreCoherent` checks there are twelve bands and that
 * exactly three are over budget, since a fourth would eat into the headroom
 * the same way the old `OVER_BUDGET_MONTHS = 6` did.
 */
export type MonthTarget = {
  minPercent: number;
  maxPercent: number;
  overBudget: boolean;
};

export const MONTH_TARGETS: readonly MonthTarget[] = [
  { minPercent: 70, maxPercent: 79, overBudget: false }, // Jan - post-Christmas recovery
  { minPercent: 72, maxPercent: 81, overBudget: false }, // Feb - post-Christmas recovery
  { minPercent: 82, maxPercent: 89, overBudget: false }, // Mar
  { minPercent: 76, maxPercent: 84, overBudget: false }, // Apr
  { minPercent: 97, maxPercent: 99, overBudget: false }, // May - the near-miss showcase
  { minPercent: 88, maxPercent: 93, overBudget: false }, // Jun - pre-holiday creep
  { minPercent: 105, maxPercent: 112, overBudget: true }, // Jul - holiday
  { minPercent: 105, maxPercent: 112, overBudget: true }, // Aug - holiday
  { minPercent: 80, maxPercent: 88, overBudget: false }, // Sep
  { minPercent: 80, maxPercent: 88, overBudget: false }, // Oct
  { minPercent: 86, maxPercent: 92, overBudget: false }, // Nov - pre-Christmas
  { minPercent: 108, maxPercent: 115, overBudget: true }, // Dec - Christmas
];

/**
 * What an over-budget month spends before its shock, as a percentage of
 * budget - drawn well under every over-budget band's `minPercent` so the shock
 * always has real ground to cover.
 *
 * The gap `assertShocksCanClearBudget` has to guarantee the shocks can close is
 * `max(band.maxPercent) - ORDINARY_OVER_LEVEL_MIN_PERCENT`, the widest case:
 * the highest band (`Dec` at 115%) paired with the lowest ordinary draw. At
 * 90% that gap is 25 points of a $5,000 budget, roughly $1,250 - up from the
 * $850 the previous two-tier ranges could guarantee, which is why they widen
 * alongside this.
 */
export const ORDINARY_OVER_LEVEL_MIN_PERCENT = 90;
export const ORDINARY_OVER_LEVEL_MAX_PERCENT = 95;

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
 *
 * **The caps were rebalanced once already, non-uniformly, against
 * `seed:check --trials=200` - and the result is measured, not perfect.**
 * Every category's monthly total moves with the same calendar band (a
 * category is a near-fixed share of one month-wide draw), so a cap's real
 * margin is against the highest **ordinary** band a category ever sees, not
 * against its all-months mean - a category near a shock target additionally
 * carries a roughly 5-8% baseline from being the one `MAJOR_IRREGULAR` or
 * `MINOR_IRREGULAR` picks that month. `Healthcare`, `Utilities`,
 * `Entertainment`, `Education` and `Transportation` land inside the 4-11%
 * target this way. **They do not all fit**: caps sum to exactly the budget,
 * `Loans & debt` alone is 30% of it and cannot spare a cent without going over
 * on the rent alone, and giving every remaining category the same headroom
 * those five have would ask for more than the other 70% holds. `Groceries`,
 * `Dining out`, `Family & pets`, `Personal care`, `Uncategorized`, `Travel`
 * and `Gifts` are cut roughly in half to two-thirds from where they started -
 * see the table `seed:check` prints for the exact figures - and sit above
 * 11% anyway. That is a property of a $5,000 budget with a $1,450 rent in it,
 * not a number left untuned.
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
    capCents: 73_000,
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
    capCents: 50_000,
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
    capCents: 31_000,
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
    capCents: 12_000,
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
    capCents: 10_000,
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
    capCents: 28_500,
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
    capCents: 15_000,
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
 * whatever gap the calendar bands ask of them, however the dice land.
 *
 * **Widened once already, for the calendar bands.** The two-tier ranges only
 * had to clear an $850 gap against `OVER_BUDGET_FLOOR_CENTS`; December's 115%
 * band against a 90% ordinary floor asks for roughly $1,250, so every maximum
 * here moved up until the cheapest pair - Education and Personal care - could
 * still cover it. `assertShocksCanClearBudget` checks the margin rather than
 * leaving it to arithmetic nobody re-does when a band moves.
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
    maxCents: 130_000,
  },
  {
    category: 'Transportation',
    merchant: 'Autoservis Mrak',
    minCents: 25_000,
    maxCents: 120_000,
  },
  {
    category: 'Healthcare',
    merchant: 'Smile Dental',
    minCents: 20_000,
    maxCents: 100_000,
  },
  {
    category: 'Education',
    merchant: 'Algebra Courses',
    minCents: 20_000,
    maxCents: 90_000,
  },
];

export const MINOR_IRREGULAR: readonly IrregularExpense[] = [
  {
    category: 'Family & pets',
    merchant: 'Vet Clinic',
    minCents: 12_000,
    maxCents: 65_000,
  },
  {
    category: 'Utilities',
    merchant: 'Chimney Service',
    minCents: 9_000,
    maxCents: 52_000,
  },
  {
    category: 'Gifts',
    merchant: 'Gift Gallery',
    minCents: 8_000,
    maxCents: 50_000,
  },
  {
    category: 'Entertainment',
    merchant: 'Ticketshop',
    minCents: 8_000,
    maxCents: 48_000,
  },
  {
    category: 'Personal care',
    merchant: 'Spa Retreat',
    minCents: 7_000,
    maxCents: 45_000,
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
 * Fails when `MONTHS` cannot be split into a whole number of occurrences per
 * calendar month.
 *
 * `monthsAgoFor` is a bijection onto `0..MONTHS-1` only when every calendar
 * month recurs the same whole number of times; 18 would have left four months
 * with 1.5 occurrences, which silently produces a lopsided year rather than a
 * clean error.
 */
export function assertMonthsIsAMultipleOfTwelve(months: number = MONTHS): void {
  if (months % 12 !== 0) {
    throw new Error(
      `MONTHS must be a multiple of 12 so every calendar month recurs the ` +
        `same number of times; got ${months}.`,
    );
  }
}

/**
 * Fails when `MONTH_TARGETS` has stopped describing one band per calendar
 * month with exactly three of them over budget.
 *
 * A thirteenth entry, or a fourth `overBudget` band, is silent otherwise: the
 * generator still runs, it simply gives the year a different shape than the
 * one this file documents - one calendar month with no band, or one budget
 * with less headroom than `assertShocksCanClearBudget` was tuned against.
 */
export function assertMonthTargetsAreCoherent(
  monthTargets: readonly MonthTarget[] = MONTH_TARGETS,
): void {
  if (monthTargets.length !== 12) {
    throw new Error(
      `MONTH_TARGETS must carry exactly 12 bands, one per calendar month; ` +
        `got ${monthTargets.length}.`,
    );
  }

  const overBudget = monthTargets.filter((target) => target.overBudget);
  if (overBudget.length !== 3) {
    throw new Error(
      `MONTH_TARGETS must mark exactly 3 months over budget; got ` +
        `${overBudget.length}.`,
    );
  }

  const mismatched = monthTargets.filter(
    (target) => target.overBudget !== target.minPercent > 100,
  );
  if (mismatched.length > 0) {
    throw new Error(
      `A MONTH_TARGETS band's overBudget flag disagrees with its own range: ` +
        `${mismatched.map((t) => `${t.minPercent}-${t.maxPercent}%`).join(', ')}.`,
    );
  }
}

/**
 * Fails when the cheapest pair of irregular expenses cannot close the widest
 * gap a calendar-banded over-budget month may ask of it.
 *
 * The gap is `max(band.maxPercent) - ORDINARY_OVER_LEVEL_MIN_PERCENT` for the
 * over-budget bands, applied against the budget - December's 115% against a
 * 90% ordinary floor is the worst case among the three today - and the pair
 * drawn to close it is one major plus one minor, so the worst case is the
 * cheapest of each. Narrowing a range without checking this is silent: the run
 * still succeeds, the month simply lands under its band, and one of the three
 * over-budget months stops being the thing it was picked to be.
 */
export function assertShocksCanClearBudget(
  major: readonly IrregularExpense[] = MAJOR_IRREGULAR,
  minor: readonly IrregularExpense[] = MINOR_IRREGULAR,
  monthTargets: readonly MonthTarget[] = MONTH_TARGETS,
  budgetCents: number = BUDGET_CENTS,
  ordinaryOverLevelMinPercent: number = ORDINARY_OVER_LEVEL_MIN_PERCENT,
): void {
  const cheapest =
    Math.min(...major.map((expense) => expense.maxCents)) +
    Math.min(...minor.map((expense) => expense.maxCents));

  const widestMaxPercent = Math.max(
    ...monthTargets
      .filter((target) => target.overBudget)
      .map((target) => target.maxPercent),
  );
  const widestGap = Math.round(
    ((widestMaxPercent - ordinaryOverLevelMinPercent) / 100) * budgetCents,
  );

  if (cheapest < widestGap) {
    throw new Error(
      `The cheapest major-plus-minor irregular pair tops out at ` +
        `$${cheapest / 100}, which cannot close the $${widestGap / 100} gap ` +
        `an over-budget month may have to. Widen a range, or raise ` +
        `ORDINARY_OVER_LEVEL_MIN_PERCENT.`,
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
