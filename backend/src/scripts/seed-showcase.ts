// MUST stay first. It picks the target and scrubs the environment before
// app.module.ts is loaded, and app.module.ts reads its configuration the moment
// it is imported. See the comment in seed-showcase.env.ts.
import { SEED_MODE } from './seed-showcase.env';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { AppModule } from '../app.module';
import { LoginTokenService } from '../auth/login-token.service';
import { VerificationService } from '../auth/verification.service';
import { DemoLeaseService } from '../demo/demo-lease.service';
import { DemoSeedService } from '../demo/demo-seed.service';
import { TemplatesService } from '../templates/templates.service';
import { UsersService } from '../users/users.service';
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
 * Named `slavko@` since PET-80, because the account is a person on a projector
 * rather than a row in a fixture: the sidebar, the greeting and every screenshot
 * carry the profile's name, and "Showcase User" reads as scaffolding in a way a
 * name does not.
 *
 * **This address is no longer deliverable, and the paragraph that used to say so
 * is deleted rather than softened.** It was an alias on the project's own domain
 * forwarding to `spendifico@gmail.com`, which is what once made a login link for
 * it arrive on a phone. PET-86 records the domain and the mail service as gone
 * and not coming back, so no login link reaches anybody at any address now and
 * the backend logs them instead. That is not a regression this script can fix:
 * it is why `/demo` exists. What the address still is, and all it has to be, is
 * the one thing that tells two seeded accounts apart.
 *
 * **On `example.com` rather than on the project's own domain, and that is a
 * safety property rather than tidiness.** `spendifico.eu` is a domain nobody
 * holds any more, so anybody can register it and start receiving mail addressed
 * to these accounts - and a login link is a bearer credential for an account
 * that is real, seeded and reachable. `example.com` is reserved by RFC 2606 and
 * cannot be registered by anybody, which makes the address permanently
 * undeliverable **by construction** rather than by the current state of a
 * registrar. The `.invalid` and `.example` TLDs are reserved too and were
 * rejected for a duller reason: they are not in the IANA TLD list that the
 * validators in this project check against.
 *
 * `--email=` overrides it and may be repeated, so a rehearsal or a second demo
 * can have an account of its own without editing this file.
 */
const DEFAULT_SHOWCASE_EMAIL = 'slavko@example.com';

/**
 * How many accounts `--pool` seeds, and what they are called.
 *
 * Ten because Turso's starter plan caps the organization at 100 databases with
 * overages disabled and this is a database-per-user app; the full argument is in
 * `src/database/CLAUDE.md`. The addresses are positional rather than descriptive
 * because nothing reads them: a pooled account is identified by its row in
 * `demo_accounts`, and the address exists only because `users.email` is how this
 * script finds an account it has already provisioned.
 *
 * On `example.com` for the reason above, and it matters more here than for the
 * showcase account: there are ten of these, they are published in
 * `docs/guides/demo-accounts.md`, and each one is an account a stranger might
 * be holding when the link arrives.
 */
const DEMO_POOL_SIZE = 10;

function demoPoolEmail(index: number): string {
  return `demo${index}@example.com`;
}

const EMAIL_FLAG = '--email=';
const POOL_FLAG = '--pool';

/**
 * Which accounts this run seeds.
 *
 * Addresses are normalized the way `UsersService` stores them, because this
 * script both looks one up and creates one: an unnormalized `--email=Slavko@...`
 * would miss the existing row and then create a second account differing only in
 * case.
 *
 * **`--pool` and `--email=` are additive rather than exclusive**, so a run can
 * refresh the pool and one named account together. Duplicates are collapsed,
 * because seeding the same account twice in one run is never what was meant and
 * the second pass would only undo and redo the first.
 */
function parseTargets(argv: readonly string[]): string[] {
  const named = argv
    .filter((arg) => arg.startsWith(EMAIL_FLAG))
    .map((flag) => flag.slice(EMAIL_FLAG.length).trim().toLowerCase());

  if (named.some((email) => email === '')) {
    throw new Error(`${EMAIL_FLAG} was given with no address.`);
  }

  const pool = argv.includes(POOL_FLAG)
    ? Array.from({ length: DEMO_POOL_SIZE }, (_, i) => demoPoolEmail(i + 1))
    : [];

  const targets = [...pool, ...named];

  return targets.length > 0 ? [...new Set(targets)] : [DEFAULT_SHOWCASE_EMAIL];
}

const SEED_TARGETS = parseTargets(process.argv.slice(2));

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
  fullName: string;
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
    fullName: fixture.profile.fullName,
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
 * what the first cloud run did, against a `dummy@example.com` a local run had
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
  email: string,
): Promise<string> {
  const usersService = app.get(UsersService);
  const verificationService = app.get(VerificationService);
  const loginTokenService = app.get(LoginTokenService);

  const payload = await onboardingPayload(app, fixture);

  let user = await usersService.findByEmail(email);
  if (!user) {
    await usersService.createPending(email, payload);
    user = await usersService.findByEmail(email);
  }

  if (!user) {
    throw new Error(`Could not read back the showcase user ${email}.`);
  }

  const verifiable = await usersService.findById(user.id);
  if (!verifiable) {
    throw new Error(`Could not read back the showcase user ${email}.`);
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
 * Provisions and fills every account this run targets.
 *
 * **The write phase is not here any more.** It lives in `DemoSeedService`, which
 * PET-86 extracted so the running backend can restore a demo account on the
 * request that hands it out - a CLI cannot, because the database engine takes an
 * exclusive file lock and a live backend already holds it. What stayed is the
 * half a live app must never do: provisioning an account, and the environment
 * scrubbing in `seed-showcase.env.ts` that keeps a `--local` run off Turso.
 *
 * One application context serves every target rather than one process each.
 * `UserDatabaseService` caches connections per user, so ten accounts cost ten
 * replicas and one boot instead of ten boots - which matters because the pool is
 * ten accounts and the difference is minutes.
 *
 * Targets are seeded **sequentially and independently**: one failure reports the
 * account it happened on and stops, leaving the accounts before it seeded. A
 * partially seeded pool is a working pool with fewer entries, so there is
 * nothing to roll back and rolling back would be worse.
 */
async function seed(app: INestApplicationContext): Promise<void> {
  const fixture = load();
  const demoSeed = app.get(DemoSeedService);
  const demoLeases = app.get(DemoLeaseService);
  const pooled = new Set(
    Array.from({ length: DEMO_POOL_SIZE }, (_, i) => demoPoolEmail(i + 1)),
  );

  for (const email of SEED_TARGETS) {
    const userId = await ensureShowcaseUser(app, fixture, email);
    const written = await demoSeed.reseed(userId);

    // **Enrolled only if it is one of the pool's own addresses.** `--email=` is
    // how a rehearsal account gets seeded, and putting one of those into the
    // pool would hand it to the next stranger who opened `/demo`. Membership is
    // therefore decided by the address rather than by the fact that this script
    // just wrote to it.
    if (pooled.has(email)) {
      await demoLeases.enrol(userId);
    }

    console.log(
      `Seeded ${email} with ${written} transactions across ${fixture.months} months (${SEED_MODE} mode).`,
    );
  }

  if (SEED_TARGETS.length > 1) {
    console.log(`Seeded ${SEED_TARGETS.length} accounts.`);
  }

  const { total, free } = await demoLeases.size();
  if (total > 0) {
    console.log(`Demo pool: ${total} account(s), ${free} free.`);
  }
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
