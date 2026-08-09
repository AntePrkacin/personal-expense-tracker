// MUST stay first. It picks the target and scrubs the environment before
// app.module.ts is loaded, and app.module.ts reads its configuration the moment
// it is imported. See the comment in seed-showcase.env.ts.
import { SEED_MODE } from './seed-showcase.env';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
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
import {
  dateMonthsAgo,
  hasHappened,
  monthsAgoFor,
  parseDate,
} from './showcase/dates';
import { MAX_DAY_OF_MONTH } from './showcase/plan';
import { load } from './showcase/fixture';
import type { Fixture } from './showcase/fixture';

/**
 * Fills one account with plausible spending, so a demo has something to show.
 * Run it through `mise run seed` (local files) or
 * `mise run seed:cloud` (Turso Cloud); `docs/guides/seeding-dummy-data.md`
 * is the procedure.
 *
 * It boots the real AppModule and goes through the real services rather than
 * writing rows directly, so the showcase user is provisioned exactly the way a
 * registration provisions one - central directory row, own database, migrations,
 * profile, starter categories and the fallback. A hand-built fixture would drift
 * from that the first time provisioning changed.
 *
 * **The data itself is no longer invented here.** PET-69 split generation out
 * into `showcase/generate.ts` and its output into the committed
 * `showcase/fixture.data.json`, both pure and knowing nothing about dates or
 * databases. This file only resolves that fixture against today - each
 * transaction's `(month, occurrence)` becomes a `monthsAgo` through
 * `monthsAgoFor`, then a date through `dateMonthsAgo` - and writes the result,
 * which is what makes a seeded account reproducible rather than merely
 * well-shaped: two seeds on the same day produce byte-identical transactions,
 * ids aside.
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
 * Every category template there is, as the onboarding payload's `categories`,
 * with the profile the fixture asks for.
 *
 * **Ids, not names, since PET-64**, and read out of central rather than out of
 * a constant - which is the whole point of this script provisioning through the
 * real services. A hard-coded list here would drift from the templates the
 * moment an admin edited one, and registration would answer 400 on ids that no
 * longer exist.
 *
 * The profile half comes from the fixture rather than from a constant of its
 * own, so the budget the caps were computed against and the budget written to
 * the account cannot disagree.
 */
async function onboardingPayload(
  app: INestApplicationContext,
  fixture: Fixture,
): Promise<{
  firstName: string;
  lastName: string;
  currency: string;
  monthlyBudget: number;
  monthStartDay: number;
  categories: string[];
}> {
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
    firstName: fixture.profile.firstName,
    lastName: fixture.profile.lastName,
    currency: fixture.profile.currency,
    // Major units, like a real onboarding payload: `VerificationService` runs
    // it through `toCents`.
    monthlyBudget: fixture.profile.monthlyBudgetCents / 100,
    monthStartDay: fixture.profile.monthStartDay,
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
  fixture: Fixture,
): Promise<string> {
  const usersService = app.get(UsersService);
  const verificationService = app.get(VerificationService);
  const loginTokenService = app.get(LoginTokenService);

  const payload = await onboardingPayload(app, fixture);

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
 * Fails when the account does not carry exactly the categories the fixture
 * names.
 *
 * Both directions matter and they fail for different reasons. A category the
 * fixture names and the account lacks has transactions with nowhere to go. A
 * category the account has and the fixture does not gets no cap, so the caps
 * stop summing to the budget and the allocation summary reports an unallocated
 * remainder the demo never meant to show.
 *
 * Either way the cause is the same - `category_templates` changed under a
 * fixture generated before it - so the message says which category and what to
 * do about it rather than leaving the reader to work it out from a missing row.
 */
function assertCategoriesMatch(
  fixture: Fixture,
  seeded: readonly { name: string }[],
): void {
  const inFixture = new Set(fixture.categories.map((c) => c.name));
  const inAccount = new Set(seeded.map((c) => c.name));

  const missing = [...inFixture].filter((name) => !inAccount.has(name));
  const extra = [...inAccount].filter((name) => !inFixture.has(name));

  if (missing.length === 0 && extra.length === 0) {
    return;
  }

  const problems = [
    missing.length > 0 &&
      `the fixture expects ${missing.join(', ')}, which this account does not have`,
    extra.length > 0 &&
      `this account has ${extra.join(', ')}, which the fixture says nothing about`,
  ].filter(Boolean);

  throw new Error(
    `The showcase fixture and the category templates disagree: ` +
      `${problems.join('; ')}. A category template has been added, renamed or ` +
      `removed since this data was generated. Regenerate it.`,
  );
}

async function seed(app: INestApplicationContext): Promise<void> {
  const config = app.get(ConfigService);
  const userDatabaseService = app.get(UserDatabaseService);

  const fixture = load();

  const userId = await ensureShowcaseUser(app, fixture);
  const userDb = await userDatabaseService.getUserDb(userId);

  // Re-asserted rather than assumed. On a re-run the account is already
  // verified, so nothing above touched the profile, and a budget or a month
  // start day changed through PATCH /api/profile in between would leave the
  // caps below distributing against a number the profile no longer holds.
  await userDb
    .update(profile)
    .set({
      monthlyBudgetCents: fixture.profile.monthlyBudgetCents,
      monthStartDay: fixture.profile.monthStartDay,
    })
    .where(eq(profile.id, userId));

  const allCategories = await userDb.select().from(categories);
  assertCategoriesMatch(fixture, allCategories);

  const idByName = new Map(allCategories.map((c) => [c.name, c.id]));

  // Caps come out of the fixture now rather than an even split, which put every
  // category at $384.62 - Groceries and Healthcare on the same allowance, and a
  // mortgage on a quarter of what it costs. `assertPlanIsCoherent` has already
  // checked they sum to the budget, so `unallocated` still lands on zero.
  for (const category of fixture.categories) {
    await userDb
      .update(categories)
      .set({ monthlyCapCents: category.capCents })
      .where(eq(categories.id, idByName.get(category.name)!));
  }

  // Today in the app's own zone, not the machine's, so a run just either side
  // of local midnight agrees with every month-scoped figure the dashboard
  // computes - all of which resolve their window against APP_TIMEZONE.
  const today = parseDate(todayIn(config.get<string>('APP_TIMEZONE')!));

  // The fixture carries no monthsAgo - only the calendar position
  // (month, occurrence) `MONTH_TARGETS` was drawn against - so it is resolved
  // here, against whichever month this run actually lands in.
  const rows = fixture.transactions
    .map((transaction) => ({
      ...transaction,
      monthsAgo: monthsAgoFor(
        transaction.month,
        transaction.occurrence,
        today.month,
      ),
    }))
    .filter((transaction) => hasHappened(transaction, today, MAX_DAY_OF_MONTH))
    .map((transaction) => ({
      id: newId(),
      merchant: transaction.merchant,
      categoryId: idByName.get(transaction.category)!,
      amountCents: transaction.amountCents,
      date: dateMonthsAgo(today, transaction.monthsAgo, transaction.day),
    }));

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
    `Seeded ${SHOWCASE_EMAIL} with ${rows.length} transactions across ${fixture.months} months (${SEED_MODE} mode).`,
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

  await insights.generate(userId);

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
