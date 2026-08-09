// MUST stay first. It picks the target and scrubs the environment before
// app.module.ts is loaded, and app.module.ts reads its configuration the moment
// it is imported. See the comment in seed-showcase.env.ts.
import { SEED_MODE } from './seed-showcase.env';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { faker } from '@faker-js/faker';
import { eq } from 'drizzle-orm';
import type { INestApplicationContext } from '@nestjs/common';
import { AppModule } from '../app.module';
import { LoginTokenService } from '../auth/login-token.service';
import { VerificationService } from '../auth/verification.service';
import { todayIn } from '../common/month-window';
import { newId } from '../common/ids';
import { UserDatabaseService } from '../database/user-database.service';
import { categories, profile, transactions } from '../database/user/schema';
import { InsightsService } from '../insights/insights.service';
import { TemplatesService } from '../templates/templates.service';
import { UsersService } from '../users/users.service';

/**
 * Fills one account with 18 months of plausible spending, so a demo has
 * something to show. Run it through `mise run seed:showcase` (local files) or
 * `mise run seed:showcase:cloud` (Turso Cloud); `docs/guides/seeding-dummy-data.md`
 * is the procedure.
 *
 * It boots the real AppModule and goes through the real services rather than
 * writing rows directly, so the showcase user is provisioned exactly the way a
 * registration provisions one - central directory row, own database, migrations,
 * profile, starter categories and the fallback. A hand-built fixture would drift
 * from that the first time provisioning changed.
 *
 * Re-running is safe and idempotent: an existing user is reused, the profile is
 * re-asserted, and the transactions are replaced wholesale inside one
 * transaction rather than appended to.
 */

/**
 * The showcase account.
 *
 * A deliverable address, not a placeholder: it is an alias on the project's own
 * domain that forwards to `spendifico@gmail.com`, the same inbox
 * `login@spendifico.eu` lands in. So in cloud mode with MailPace configured, a
 * login link for this account really does arrive and really can be clicked -
 * which is what makes the showcase demonstrable from a phone rather than only
 * from the terminal that has the logs.
 */
const SHOWCASE_EMAIL = 'dummy@spendifico.eu';

/**
 * The monthly budget, in minor units - $5,000.
 *
 * Written to the profile on every run and used as the denominator for the caps,
 * so the two cannot disagree. Reading the stored budget instead would be worse:
 * a budget changed through `PATCH /api/profile` between runs would leave the
 * showcase telling a different story than the one this file describes.
 */
const BUDGET_CENTS = 500_000;

/** Whole months of history, the current (partial) one included. */
const MONTHS = 18;

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
const OVER_BUDGET_MONTHS = 4;

/**
 * A month's ordinary spending, before any irregular expense - 70% to 90% of the
 * budget.
 *
 * This is the whole month, fixed bills included, not the discretionary part. It
 * sits below the budget on purpose: a month goes over because something
 * irregular happened, not because the weekly shop crept up 20%, which is what
 * `IRREGULAR_*` below models.
 */
const ORDINARY_MIN_CENTS = 350_000;
const ORDINARY_MAX_CENTS = 450_000;

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
const ORDINARY_OVER_MIN_CENTS = 440_000;
const OVER_BUDGET_FLOOR_CENTS = 520_000;

/** Transactions a complete month carries, fixed bills and shocks included. */
const MIN_TRANSACTIONS = 55;
const MAX_TRANSACTIONS = 72;

/**
 * The smallest transaction the seed will write, in minor units.
 *
 * Without it the run that produced this file's first measurements had a $0.01
 * row in it: the remainder-absorbing transaction went negative against a target
 * the rounded shares had already overshot, and `Math.max(1, ...)` turned that
 * into a cent. `drawAmounts` now pushes the drift onto the largest transaction
 * in the category, where a few cents are invisible, and clamps here.
 */
const MIN_TRANSACTION_CENTS = 100;

/**
 * Days a transaction can fall on, matching the profile's `monthStartDay` range.
 *
 * 28 so every month has the day, which is the same reason the profile column is
 * constrained to 1-28. It does mean the 29th to the 31st are never used.
 */
const MAX_DAY_OF_MONTH = 28;

/** The name of the fallback category, which is seeded rather than templated. */
const FALLBACK_CATEGORY = 'Uncategorized';

/**
 * How long the seed waits for the insight run it starts, as attempts times an
 * interval - roughly 15 seconds.
 *
 * Generously above the sub-second a rule-based run really takes, because the
 * cost of waiting too long is a slower script and the cost of giving up too
 * early is a demo account with no insights on it.
 */
const INSIGHT_POLL_ATTEMPTS = 60;
const INSIGHT_POLL_INTERVAL_MS = 250;

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
type FixedBill = {
  merchant: string;
  category: string;
  dayOfMonth: number;
  amountCents: number;
  varianceCents?: number;
};

const FIXED_BILLS: readonly FixedBill[] = [
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
type CategoryPlan = {
  spendPercent: number;
  countPercent: number;
  sigma: number;
  capCents: number;
  monthlyChance?: number;
  merchants: readonly { name: string; weight: number }[];
};

const CATEGORY_PLANS: Record<string, CategoryPlan> = {
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
type IrregularExpense = {
  category: string;
  merchant: string;
  minCents: number;
  maxCents: number;
};

const MAJOR_IRREGULAR: readonly IrregularExpense[] = [
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

const MINOR_IRREGULAR: readonly IrregularExpense[] = [
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

/** `{ year, month (0-11), day }` out of a `YYYY-MM-DD` string. */
function parseDate(date: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error(`Expected a YYYY-MM-DD date, received "${date}".`);
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day: Number(match[3]),
  };
}

/**
 * `YYYY-MM-DD`, `monthsAgo` calendar months before `from`.
 *
 * The year carry is done here rather than by handing a negative month to
 * `new Date(...)`, which would also work: no calendar date in this file is ever
 * round-tripped through a Date, because doing that shifts it across timezones.
 * Same reason `transactions.date` is text - see src/common/month-window.ts.
 */
function dateMonthsAgo(
  from: { year: number; month: number },
  monthsAgo: number,
  day: number,
): string {
  const total = from.year * 12 + from.month - monthsAgo;
  const year = Math.floor(total / 12);
  const month = total - year * 12;

  const yyyy = String(year).padStart(4, '0');
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * What registration would have collected, bar the categories. Major units, like
 * a real onboarding payload: `VerificationService` runs it through `toCents`.
 */
const ONBOARDING_PROFILE = {
  firstName: 'Showcase',
  lastName: 'User',
  currency: 'USD',
  monthlyBudget: BUDGET_CENTS / 100,
  monthStartDay: 1,
};

/**
 * Every category template there is, as the onboarding payload's `categories`.
 *
 * **Ids, not names, since PET-64**, and read out of central rather than out of
 * a constant - which is the whole point of this script provisioning through the
 * real services. A hard-coded list here would drift from the templates the
 * moment an admin edited one, and registration would answer 400 on ids that no
 * longer exist.
 */
async function onboardingPayload(
  app: INestApplicationContext,
): Promise<typeof ONBOARDING_PROFILE & { categories: string[] }> {
  const { categories: templates } = await app
    .get(TemplatesService)
    .categories();

  if (templates.length === 0) {
    throw new Error(
      'No category templates in central. The boot seed should have written ' +
        'them; check that DATABASE_DIR points where you think it does.',
    );
  }

  return {
    ...ONBOARDING_PROFILE,
    categories: templates.map((template) => template.id),
  };
}

/**
 * The showcase user, provisioned for whichever mode this run is targeting.
 *
 * Provisioning is driven through a real login token rather than reached past,
 * so the account is built exactly the way verification builds one.
 *
 * **Two states need provisioning, not one, and reading `onboardingPayload`
 * alone finds only the first.** A never-verified account still carries its
 * payload, which is the obvious case. But an account verified in *local* mode
 * has no `db_url` - local provisioning never calls the Platform API - and no
 * payload either, because provisioning clears it strictly last. In cloud mode
 * that account looks finished and has no database at all, so the seed would
 * declare it ready and then die opening it. That is not hypothetical: it is
 * what the first cloud run did, against a `dummy@spendifico.eu` a local run had
 * left in `backend/databases/`.
 *
 * Re-stashing the payload puts such an account back into the state verification
 * knows how to finish, which is the same "a resent link completes a
 * half-provisioned account" path the backend already guarantees. Every step of
 * it is idempotent: the database is skipped when `db_url` is set, the profile
 * insert is `onConflictDoNothing`, and the category seed is skipped when any
 * row exists. The payload is rewritten rather than reused, so a stale one from
 * an interrupted run cannot decide this account's categories.
 */
async function ensureShowcaseUser(
  app: INestApplicationContext,
): Promise<string> {
  const usersService = app.get(UsersService);
  const verificationService = app.get(VerificationService);
  const loginTokenService = app.get(LoginTokenService);

  const payload = await onboardingPayload(app);

  let user = await usersService.findByEmail(SHOWCASE_EMAIL);
  if (!user) {
    await usersService.createPending(SHOWCASE_EMAIL, payload);
    user = await usersService.findByEmail(SHOWCASE_EMAIL);
  }

  if (!user) {
    throw new Error(`Could not read back the showcase user ${SHOWCASE_EMAIL}.`);
  }

  const verifiable = await usersService.findById(user.id);
  if (!verifiable) {
    throw new Error(`Could not read back the showcase user ${SHOWCASE_EMAIL}.`);
  }

  const missingCloudDatabase =
    SEED_MODE === 'cloud' && verifiable.dbUrl === null;

  if (verifiable.onboardingPayload || missingCloudDatabase) {
    await usersService.stashOnboardingPayload(user.id, payload);
    const rawToken = await loginTokenService.issue(user.id);
    await verificationService.verify(rawToken);
  }

  return user.id;
}

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
function assertPlanIsCoherent(): void {
  const plans = Object.values(CATEGORY_PLANS);
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
  if (caps !== BUDGET_CENTS) {
    throw new Error(
      `CATEGORY_PLANS caps must sum to the $${BUDGET_CENTS / 100} budget; ` +
        `got $${caps / 100}.`,
    );
  }

  // An irregular expense whose merchant is not in its own category's pool would
  // be a name that appears only in over-budget months, which is exactly the kind
  // of pattern a demo account should not have and a typo would produce.
  const stray = [...MAJOR_IRREGULAR, ...MINOR_IRREGULAR].filter(
    (expense) =>
      !CATEGORY_PLANS[expense.category]?.merchants.some(
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
function assertShocksCanClearBudget(): void {
  const cheapest =
    Math.min(...MAJOR_IRREGULAR.map((expense) => expense.maxCents)) +
    Math.min(...MINOR_IRREGULAR.map((expense) => expense.maxCents));
  const widestGap = OVER_BUDGET_FLOOR_CENTS - ORDINARY_OVER_MIN_CENTS;

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
function assertNoMerchantCollisions(): void {
  const variable = new Set(
    Object.values(CATEGORY_PLANS).flatMap((plan) =>
      plan.merchants.map((merchant) => merchant.name),
    ),
  );

  const collisions = FIXED_BILLS.map((bill) => bill.merchant).filter((name) =>
    variable.has(name),
  );

  if (collisions.length > 0) {
    throw new Error(
      `These merchants bill on a fixed schedule and are also in the variable ` +
        `pool, so they would draw a second charge at an unrelated amount: ` +
        `${collisions.join(', ')}.`,
    );
  }
}

/** One plan by category name, or a failure that says which one is missing. */
function requirePlan(name: string): CategoryPlan {
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

/**
 * A standard normal, drawn through faker rather than `Math.random`.
 *
 * Box-Muller. Going through faker is what would let a future `faker.seed(n)`
 * make a whole run reproducible; `Math.random()` sits outside that and would
 * leave the amounts varying even on a seeded run.
 */
function standardNormal(): number {
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
function drawAmounts(
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
function pickMerchant(
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
function shareOut(
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

async function seed(app: INestApplicationContext): Promise<void> {
  const config = app.get(ConfigService);
  const userDatabaseService = app.get(UserDatabaseService);

  assertPlanIsCoherent();
  assertNoMerchantCollisions();
  assertShocksCanClearBudget();

  const userId = await ensureShowcaseUser(app);
  const userDb = await userDatabaseService.getUserDb(userId);

  // Re-asserted rather than assumed. On a re-run the account is already
  // verified, so nothing above touched the profile, and a budget or a month
  // start day changed through PATCH /api/profile in between would leave the
  // caps below distributing against a number the profile no longer holds.
  // monthStartDay is pinned to 1 for the same reason the months below are
  // calendar months: with any other value the two disagree.
  await userDb
    .update(profile)
    .set({ monthlyBudgetCents: BUDGET_CENTS, monthStartDay: 1 })
    .where(eq(profile.id, userId));

  const allCategories = await userDb.select().from(categories);
  const fallbackCategory = allCategories.find((c) => c.isFallback);
  if (!fallbackCategory) {
    throw new Error(`User ${userId} has no fallback category.`);
  }

  // **Throws rather than falling back**, which reverses what this file used to
  // do. Both named lookups used `?? pickableCategories[0]`, on the reasoning
  // that a re-run against an account whose categories were edited through the
  // API should not die - and the cost of that was a miss degrading *silently*
  // into a demo whose grocery merchants or subscription story sat on an
  // arbitrary category, with every run reporting success. PET-64 made that
  // reachable rather than theoretical, by dropping "Subscriptions" from the
  // template list entirely. A seed that cannot tell its own story should say so.
  //
  // Since PET-64 the whole plan is name-keyed, so this is one loop rather than
  // two named constants, and it fails on any template the table has not been
  // told about rather than only on the two the old file happened to use.
  const planned = allCategories.map(
    (category) => [category, requirePlan(category.name)] as const,
  );
  const idByName = new Map(allCategories.map((c) => [c.name, c.id]));

  // Caps come out of the table now rather than an even split, which put every
  // category at $384.62 - Groceries and Healthcare on the same allowance, and a
  // mortgage on a quarter of what it costs. assertPlanIsCoherent has already
  // checked they sum to the budget, so `unallocated` still lands on zero.
  for (const [category, plan] of planned) {
    await userDb
      .update(categories)
      .set({ monthlyCapCents: plan.capCents })
      .where(eq(categories.id, category.id));
  }

  // Today in the app's own zone, not the machine's, so a run just either side
  // of local midnight agrees with every month-scoped figure the dashboard
  // computes - all of which resolve their window against APP_TIMEZONE.
  const today = parseDate(todayIn(config.get<string>('APP_TIMEZONE')!));

  // Drawn from the complete months only. The current month is partial by
  // definition, so seeding it over budget would mean seeding spending that has
  // not happened yet - which is the whole reason for the clamp further down.
  const overBudgetMonths = new Set(
    faker.helpers
      .shuffle(Array.from({ length: MONTHS - 1 }, (_, i) => i + 1))
      .slice(0, OVER_BUDGET_MONTHS),
  );

  const rows: (typeof transactions.$inferInsert)[] = [];

  for (let monthsAgo = 0; monthsAgo < MONTHS; monthsAgo++) {
    const isCurrentMonth = monthsAgo === 0;
    const isOverBudget = overBudgetMonths.has(monthsAgo);

    // Never past today. Without the clamp the current month is seeded across
    // all 28 days, so on the 7th the dashboard reads a full month of spending,
    // averagePerDay (which divides by days elapsed) is four times reality, and
    // the trend chart draws buckets for weeks that have not happened.
    const lastDay = isCurrentMonth
      ? Math.min(today.day, MAX_DAY_OF_MONTH)
      : MAX_DAY_OF_MONTH;

    // And the volume is scaled to match, for the same reason: 70 transactions
    // crammed into the first week is a full month's spending wearing a clamp.
    const elapsed = lastDay / MAX_DAY_OF_MONTH;

    const count = Math.max(
      1,
      Math.round(
        faker.number.int({ min: MIN_TRANSACTIONS, max: MAX_TRANSACTIONS }) *
          elapsed,
      ),
    );
    const ordinaryTarget = Math.round(
      faker.number.int({
        min: isOverBudget ? ORDINARY_OVER_MIN_CENTS : ORDINARY_MIN_CENTS,
        max: ORDINARY_MAX_CENTS,
      }) * elapsed,
    );

    // Bills land on their own day, so the current month gets only the ones
    // whose day has already passed - the same clamp as everything else. Their
    // amounts are *not* scaled by `elapsed`: a rent payment on the 1st is the
    // whole rent whether the month is a third gone or finished, and scaling it
    // is what would make the current month's category totals nonsense.
    const dueBills = FIXED_BILLS.filter((bill) => bill.dayOfMonth <= lastDay);
    let fixedCents = 0;

    for (const bill of dueBills) {
      const swing = bill.varianceCents ?? 0;
      const amountCents = Math.max(
        1,
        bill.amountCents +
          (swing === 0 ? 0 : faker.number.int({ min: -swing, max: swing })),
      );
      fixedCents += amountCents;

      rows.push({
        id: newId(),
        merchant: bill.merchant,
        categoryId: idByName.get(bill.category)!,
        amountCents,
        date: dateMonthsAgo(today, monthsAgo, bill.dayOfMonth),
      });
    }

    // The overspend, as one or two irregular expenses rather than as 15% on
    // every category. An over-budget month spread evenly puts nothing over its
    // cap, so the donut, the category cards and the over-cap insight have
    // nothing to show - which is the point of seeding an over-budget month at
    // all. Concentrating it also happens to be how real months go over.
    const shocks: {
      categoryId: string;
      merchant: string;
      amountCents: number;
    }[] = [];

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
          categoryId: idByName.get(expense.category)!,
          merchant: expense.merchant,
          amountCents: Math.max(MIN_TRANSACTION_CENTS, amountCents),
        });
      }
    }

    for (const shock of shocks) {
      rows.push({
        id: newId(),
        merchant: shock.merchant,
        categoryId: shock.categoryId,
        amountCents: shock.amountCents,
        date: dateMonthsAgo(
          today,
          monthsAgo,
          faker.number.int({ min: 1, max: lastDay }),
        ),
      });
    }

    // Whatever the bills and the shocks did not take. The bills come out of the
    // month's target rather than sitting on top of it, so the totals still land
    // where the over-budget months need them.
    const variableTarget = Math.max(1, ordinaryTarget - fixedCents);
    const variableCount = Math.max(1, count - dueBills.length - shocks.length);

    // Which categories happen at all this month. Only the three occasional ones
    // can sit out; everything else has no `monthlyChance` and is always here.
    const present = planned.filter(
      ([, plan]) =>
        plan.monthlyChance === undefined ||
        faker.number.float({ min: 0, max: 1 }) < plan.monthlyChance,
    );
    const perCategory = shareOut(
      variableCount,
      present.map(
        ([category, plan]) => [category.name, plan] as [string, CategoryPlan],
      ),
    );

    // Only categories that actually drew a transaction share the target, so a
    // short month cannot lose the 2% Travel was owed into a category with
    // nowhere to put it - the month would then quietly undershoot.
    const active = present.filter(
      ([category]) => (perCategory.get(category.name) ?? 0) > 0,
    );
    const activeSpend = active.reduce(
      (sum, [, plan]) => sum + plan.spendPercent,
      0,
    );

    for (const [category, plan] of active) {
      const categoryCount = perCategory.get(category.name)!;
      const categoryTarget = Math.round(
        (variableTarget * plan.spendPercent) / activeSpend,
      );

      for (const amountCents of drawAmounts(
        categoryTarget,
        categoryCount,
        plan.sigma,
      )) {
        rows.push({
          id: newId(),
          merchant: pickMerchant(plan.merchants),
          categoryId: category.id,
          amountCents,
          date: dateMonthsAgo(
            today,
            monthsAgo,
            faker.number.int({ min: 1, max: lastDay }),
          ),
        });
      }
    }
  }

  // One transaction, so a failure part-way through leaves the account with the
  // history it had rather than with whichever chunk landed before the error.
  // The usual objection to db.transaction() here - the embedded driver refuses
  // overlapping transactions - does not apply: this is a one-shot script and
  // nothing else is on the connection.
  await userDb.transaction(async (tx) => {
    await tx.delete(transactions);
    const chunkSize = 100;
    for (let i = 0; i < rows.length; i += chunkSize) {
      await tx.insert(transactions).values(rows.slice(i, i + chunkSize));
    }
  });

  console.log(
    `Seeded ${SHOWCASE_EMAIL} with ${rows.length} transactions across ${MONTHS} months (${SEED_MODE} mode).`,
  );

  await generateInsights(app, userId);
}

/**
 * Generates the showcase account's insight set, and **waits for the run to
 * finish** rather than for it to start.
 *
 * Needed at all because the rows above are written straight to `transactions`
 * rather than through `TransactionsService`, so none of them emits the
 * transaction-changed event that regenerates a set on every ordinary write. Left
 * out, the showcase account demos the empty state - the one frame it has the
 * least business showing.
 *
 * **`generate()` alone is not enough, and is worse than leaving it out.** It
 * returns as soon as the placeholder `generating` row is committed and floats the
 * real work, while `bootstrap()`'s `finally` closes every replica underneath it.
 * The account would be left holding a bare `generating` row: a wedged skeleton
 * screen for the five minutes until the read's staleness cutoff reclaims it, and
 * no insights after that either. So this polls `getSet` until the state settles,
 * which is the only completion signal the service's public surface offers.
 */
async function generateInsights(
  app: INestApplicationContext,
  userId: string,
): Promise<void> {
  const insights = app.get(InsightsService);

  try {
    await insights.generate(userId);
  } catch (error) {
    // The same call the ceiling below makes, for the same reason, and it was
    // missing here: `generate()` throws `ConflictException` when a `generating`
    // row younger than the staleness cutoff exists, which is exactly what an
    // interrupted previous `seed:showcase` leaves behind. Unguarded, re-running
    // the seed inside that window let the exception escape all the way to
    // `bootstrap`, printing "Seeding failed." and exiting 1 **after** every
    // transaction had already been written - reporting a successful seed as a
    // failure, which is the one thing the loop below is careful not to do.
    console.warn(
      `Insight generation for ${SHOWCASE_EMAIL} could not be started: ` +
        `${error instanceof Error ? error.message : String(error)} ` +
        `The transactions are seeded; regenerate from the Insights page.`,
    );
    return;
  }

  // Rule-based generation settles in well under a second; the ceiling is a
  // wedged-run guard, not an expected wait.
  for (let attempt = 0; attempt < INSIGHT_POLL_ATTEMPTS; attempt++) {
    const set = await insights.getSet(userId);
    if (set.state !== 'generating') {
      console.log(
        `Generated ${set.insights.length} insight card${set.insights.length === 1 ? '' : 's'} (${set.state}).`,
      );
      return;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, INSIGHT_POLL_INTERVAL_MS),
    );
  }

  // A warning rather than a throw: the transactions are the point of this script
  // and they are already committed, so failing here would report a successful
  // seed as a failure. The account self-heals at the staleness cutoff.
  console.warn(
    `Insight generation for ${SHOWCASE_EMAIL} did not settle within ` +
      `${(INSIGHT_POLL_ATTEMPTS * INSIGHT_POLL_INTERVAL_MS) / 1000}s. The transactions are seeded; ` +
      `regenerate from the Insights page.`,
  );
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    if (
      SEED_MODE === 'cloud' &&
      !app.get(ConfigService).get('TURSO_ORG_TOKEN')
    ) {
      throw new Error(
        'Cloud mode needs the four TURSO_* variables in backend/.env. ' +
          'See docs/guides/configuration.md.',
      );
    }
    await seed(app);
  } finally {
    // Closes every open replica, each with a final push in cloud mode. Skipping
    // it is how a locally-committed write never reaches Turso.
    await app.close();
  }
}

// A non-zero exit code is the point: without it a half-finished run reports
// success to whatever ran it.
bootstrap().catch((error) => {
  console.error('Seeding failed.', error);
  process.exitCode = 1;
});
