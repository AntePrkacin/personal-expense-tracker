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
import { STARTER_CATEGORY_NAMES } from '../database/user/starter-categories';
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

/** The showcase account. Not a real inbox; the login link comes out of the logs. */
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

/** How many of the 17 complete months are seeded over budget. */
const OVER_BUDGET_MONTHS = 6;

/** An over-budget month lands at about 115% of the budget. */
const OVER_BUDGET_CENTS = 575_000;

/**
 * Days a transaction can fall on, matching the profile's `monthStartDay` range.
 *
 * 28 so every month has the day, which is the same reason the profile column is
 * constrained to 1-28. It does mean the 29th to the 31st are never used.
 */
const MAX_DAY_OF_MONTH = 28;

/** Share of transactions assigned to the fallback category, as a percentage. */
const UNCATEGORIZED_PERCENT = 5;

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
 * What registration would have collected. Major units, like a real onboarding
 * payload: `VerificationService` runs it through `toCents`.
 */
const ONBOARDING_PAYLOAD = {
  firstName: 'Showcase',
  lastName: 'User',
  currency: 'USD',
  monthlyBudget: BUDGET_CENTS / 100,
  monthStartDay: 1,
  categories: STARTER_CATEGORY_NAMES,
};

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

  let user = await usersService.findByEmail(SHOWCASE_EMAIL);
  if (!user) {
    await usersService.createPending(SHOWCASE_EMAIL, ONBOARDING_PAYLOAD);
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
    await usersService.stashOnboardingPayload(user.id, ONBOARDING_PAYLOAD);
    const rawToken = await loginTokenService.issue(user.id);
    await verificationService.verify(rawToken);
  }

  return user.id;
}

/**
 * A merchant pool where every category is guaranteed at least two merchants of
 * its own.
 *
 * The guarantee is why the faker names are dealt round-robin rather than each
 * picking a category at random: with 22 names over 11 categories, random
 * assignment leaves several categories with none at all, and every transaction
 * in such a category then has to fall back to some arbitrary merchant - so a
 * whole category's worth of spending shows up under one name.
 *
 * @returns merchant name to the ids of the categories it is valid for.
 */
function buildMerchantPool(
  categoryIds: readonly string[],
  groceriesId: string,
): Map<string, string[]> {
  // Fixed EU names, so the data does not read as entirely synthetic. They map
  // to Groceries exclusively.
  const fixedMerchants = ['dm', 'Müller', 'Konzum', 'Lidl'];

  // Deduplicated: faker.company.name() repeats, and the Map below would
  // silently drop the earlier mapping if it did.
  const names = new Set<string>(fixedMerchants);
  const fakerMerchants: string[] = [];
  while (fakerMerchants.length < categoryIds.length * 2) {
    const name = faker.company.name();
    if (names.has(name)) {
      continue;
    }
    names.add(name);
    fakerMerchants.push(name);
  }

  const pool = new Map<string, string[]>();
  for (const merchant of fixedMerchants) {
    pool.set(merchant, [groceriesId]);
  }

  const shuffled = faker.helpers.shuffle([...fakerMerchants]);
  shuffled.forEach((merchant, index) => {
    pool.set(merchant, [categoryIds[index % categoryIds.length]]);
  });

  // 20% of the whole pool carries a second category. Counted over every
  // merchant, not just the faker ones, because the fixed four are part of the
  // pool - and they are excluded from the draw itself, since mapping them
  // anywhere but Groceries is what makes them recognisable.
  const withTwo = Math.round((fixedMerchants.length + shuffled.length) * 0.2);
  for (const merchant of shuffled.slice(0, withTwo)) {
    const [primary] = pool.get(merchant)!;
    const candidates = categoryIds.filter((id) => id !== primary);
    pool.set(merchant, [primary, faker.helpers.arrayElement(candidates)]);
  }

  return pool;
}

/**
 * Splits `totalCents` across `count` transactions, each at least a cent.
 *
 * The running average keeps the amounts varied without letting them drift away
 * from the target: the last one absorbs whatever is left, so the month sums to
 * exactly what was asked for.
 */
function splitAmounts(totalCents: number, count: number): number[] {
  const amounts: number[] = [];
  let generated = 0;

  for (let i = 0; i < count; i++) {
    if (i === count - 1) {
      amounts.push(Math.max(1, totalCents - generated));
      break;
    }
    const average = (totalCents - generated) / (count - i);
    const amount = faker.number.int({
      min: Math.max(1, Math.floor(average * 0.2)),
      max: Math.max(1, Math.floor(average * 1.8)),
    });
    amounts.push(amount);
    generated += amount;
  }

  return amounts;
}

async function seed(app: INestApplicationContext): Promise<void> {
  const config = app.get(ConfigService);
  const userDatabaseService = app.get(UserDatabaseService);

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
  const pickableCategories = allCategories.filter((c) => !c.isFallback);

  // Caps sum to exactly the budget: an even split, with the last row absorbing
  // the remainder. The fallback gets one too - it holds real spend here.
  const evenCap = Math.floor(BUDGET_CENTS / allCategories.length);
  let remainingCap = BUDGET_CENTS;
  for (const [index, category] of allCategories.entries()) {
    const isLast = index === allCategories.length - 1;
    const cap = isLast ? remainingCap : evenCap;
    remainingCap -= cap;
    await userDb
      .update(categories)
      .set({ monthlyCapCents: cap })
      .where(eq(categories.id, category.id));
  }

  const groceries = allCategories.find((c) => c.name === 'Groceries');
  const merchantPool = buildMerchantPool(
    allCategories.map((c) => c.id),
    (groceries ?? pickableCategories[0]).id,
  );
  const merchantNames = [...merchantPool.keys()];

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
      Math.round(faker.number.int({ min: 60, max: 80 }) * elapsed),
    );
    const target = Math.round(
      (isOverBudget
        ? OVER_BUDGET_CENTS
        : faker.number.int({ min: 300_000, max: 480_000 })) * elapsed,
    );

    // Concentrated rather than smeared. An over-budget month spread evenly puts
    // every category about 15% up and none of them over its cap, so the donut,
    // the category cards and the over-cap insight have nothing to show - which
    // is the point of seeding an over-budget month at all.
    const hot = faker.helpers.arrayElements(
      pickableCategories,
      isOverBudget ? 2 : 1,
    );
    const hotPercent = isOverBudget ? 55 : 30;

    for (const amountCents of splitAmounts(target, count)) {
      const roll = faker.number.int({ min: 1, max: 100 });
      let categoryId: string;
      if (roll <= UNCATEGORIZED_PERCENT) {
        categoryId = fallbackCategory.id;
      } else if (roll <= UNCATEGORIZED_PERCENT + hotPercent) {
        categoryId = faker.helpers.arrayElement(hot).id;
      } else {
        categoryId = faker.helpers.arrayElement(pickableCategories).id;
      }

      // Never empty: buildMerchantPool guarantees every category at least two.
      const valid = merchantNames.filter((name) =>
        merchantPool.get(name)!.includes(categoryId),
      );
      if (valid.length === 0) {
        throw new Error(`No merchant is mapped to category ${categoryId}.`);
      }

      rows.push({
        id: newId(),
        merchant: faker.helpers.arrayElement(valid),
        categoryId,
        amountCents,
        date: dateMonthsAgo(
          today,
          monthsAgo,
          faker.number.int({ min: 1, max: lastDay }),
        ),
      });
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
