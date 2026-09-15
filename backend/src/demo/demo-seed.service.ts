import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isNull } from 'drizzle-orm';
import { todayIn } from '../common/month-window';
import { newId } from '../common/ids';
import { mostRecentAnchor } from '../common/period-rules';
import { UserDatabaseService } from '../database/user-database.service';
import {
  assistantMessages,
  assistantSessions,
  budgetHistory,
  categories,
  categoryCapHistory,
  periodRules,
  profile,
  transactions,
} from '../database/user/schema';
import { InsightsService } from '../insights/insights.service';
import {
  dateMonthsAgo,
  hasHappened,
  monthsAgoFor,
  parseDate,
} from '../scripts/showcase/dates';
import { MAX_DAY_OF_MONTH } from '../scripts/showcase/plan';
import { load } from '../scripts/showcase/fixture';
import type { Fixture } from '../scripts/showcase/fixture';

/**
 * Writes the committed showcase fixture into one account, and regenerates its
 * insights.
 *
 * ## Why this is a service rather than only a script
 *
 * This was `seed()` inside `src/scripts/seed-showcase.ts` and nothing else could
 * call it. A CLI boots its own Nest context and the database engine takes an
 * **exclusive file lock**, so running it against a live backend fails outright -
 * which is fine for a one-shot demo seed and useless for PET-86, where a demo
 * account has to be restored to the fixture on the request that hands it out.
 *
 * So the write phase moved here and the CLI now calls it. That is deliberately
 * an extraction rather than a second implementation: a demo account restored at
 * hand-out and a demo account seeded from the terminal have to be the same
 * account, and two copies of this arithmetic would diverge the first time either
 * changed.
 *
 * ## What stayed behind in the CLI, and must not follow it here
 *
 * Everything in `scripts/seed-showcase.env.ts`. That module scrubs `TURSO_*`,
 * `MAILPACE_API_TOKEN` and `MAIL_FROM` out of `process.env` so a `--local` run
 * cannot touch Turso Cloud, and it only works because it runs before
 * `AppModule` is imported. A live app doing any of that would reconfigure mail
 * and cloud access for every other request in flight. This service therefore
 * reads configuration the ordinary way, through `ConfigService`, and the mode it
 * is running in is whatever the process was already booted with.
 *
 * Provisioning stayed behind too. Creating the account - the central row, the
 * Turso database, the migrations, the profile and the starter categories - runs
 * through `VerificationService` exactly as a real registration does, and it
 * happens once per pooled account when the pool is built. Nothing at hand-out
 * time provisions anything, which is why this service needs neither
 * `VerificationService` nor `LoginTokenService` and `AuthModule`'s deliberately
 * narrow exports did not have to widen.
 */
@Injectable()
export class DemoSeedService {
  private readonly logger = new Logger(DemoSeedService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly userDatabases: UserDatabaseService,
    private readonly insights: InsightsService,
  ) {}

  /**
   * Restores one account to the fixture, then regenerates its insights.
   *
   * Returns how many transactions were written, which is the figure the CLI
   * reports and the hand-out logs.
   *
   * `insightPollMs` is a budget rather than a requirement: the write is the
   * point and the insights are a courtesy, so a run that does not settle inside
   * it warns and returns rather than failing a seed whose rows are already
   * committed. The CLI gives it 15s; a request gives it far less, because a
   * visitor waiting on a skeleton screen is worse than one watching cards fill
   * in.
   */
  async reseed(
    userId: string,
    { insightPollMs = 15_000 }: { insightPollMs?: number } = {},
  ): Promise<number> {
    const written = await this.writeFixture(userId);
    await this.regenerateInsights(userId, insightPollMs);
    return written;
  }

  /**
   * The write phase, lifted from the seed script unchanged in substance.
   *
   * Everything about *what* it writes and why is argued at the statements
   * themselves; the ordering and the transaction boundary are the parts to leave
   * alone.
   */
  async writeFixture(userId: string): Promise<number> {
    const fixture = load();
    const userDb = await this.userDatabases.getUserDb(userId);

    // Tombstones filtered, like every other read in this codebase, and here it
    // is load-bearing rather than conventional: a category deleted through the
    // API is still a row, so an unfiltered read would satisfy the assert below
    // and then bind that name to the dead id - filing every transaction for it
    // under a category each of those reads discards.
    const allCategories = await userDb
      .select()
      .from(categories)
      .where(isNull(categories.deletedAt));
    assertCategoriesMatch(fixture, allCategories);

    const idByName = new Map(allCategories.map((c) => [c.name, c.id]));

    // Today in the app's own zone, not the machine's, so a run just either side
    // of local midnight agrees with every month-scoped figure the dashboard
    // computes - all of which resolve their window against APP_TIMEZONE.
    const todayIso = todayIn(this.config.get<string>('APP_TIMEZONE')!);
    const today = parseDate(todayIso);

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
      .filter((transaction) =>
        hasHappened(transaction, today, MAX_DAY_OF_MONTH),
      )
      .map((transaction) => ({
        id: newId(),
        merchant: transaction.merchant,
        categoryId: idByName.get(transaction.category)!,
        amountCents: transaction.amountCents,
        date: dateMonthsAgo(today, transaction.monthsAgo, transaction.day),
      }));

    // **One anchor for all three histories, at or before the oldest transaction.**
    // The budget would not need it - `budgetCentsFor` falls back to the earliest row
    // for any period older than it - but a **cap** falls back to *uncapped*, because
    // a sparse history is how an uncapped category is represented. Anchored at today
    // instead, every period the demo can navigate back to would show thirteen
    // uncapped categories, which is the one thing this account exists to
    // demonstrate not being.
    const historyAnchor = mostRecentAnchor(
      fixture.profile.monthStartDay,
      rows.reduce(
        (oldest, row) => (row.date < oldest ? row.date : oldest),
        todayIso,
      ),
    );

    // **Rewritten rather than appended, and this is the one place in the app that
    // treats these tables as mutable.** Everything the API does to them is an
    // append, because a user's history is a record of decisions they made. A fixture
    // is not a record: it is a statement of what this demo account *is*. Appending
    // would accumulate one budget row per seeding run rather than converging, and
    // re-seeding being idempotent is the property the whole thing is built around.
    //
    // Re-asserted rather than assumed for the same reason the old profile write was:
    // on a re-run the account is already verified, so nothing above touched its
    // history, and a budget or pay day changed through the API in between would
    // leave the caps distributing against a figure the account no longer resolves.
    // PET-86 made that case ordinary rather than theoretical: a demo visitor can
    // change both through Settings, and the next hand-out has to undo it.
    await userDb.delete(periodRules);
    await userDb.insert(periodRules).values({
      id: newId(),
      effectiveFrom: historyAnchor,
      monthStartDay: fixture.profile.monthStartDay,
      // The earliest rule has no predecessor to bridge from. This account has one
      // pay schedule for the whole of its history on purpose: a mid-fixture
      // schedule change would make its months incomparable, which is a different
      // demo from the one the caps and the trend chart are built for.
      transitionStart: null,
    });

    await userDb.delete(budgetHistory);
    await userDb.insert(budgetHistory).values({
      id: newId(),
      effectiveFrom: historyAnchor,
      budgetCents: fixture.profile.monthlyBudgetCents,
    });

    // Caps come out of the fixture rather than an even split, which put every
    // category at $384.62 - Groceries and Healthcare on the same allowance, and a
    // mortgage on a quarter of what it costs. `assertPlanIsCoherent` has already
    // checked they sum to the budget, so `unallocated` still lands on zero, in
    // every period the demo can navigate to.
    await userDb.delete(categoryCapHistory);
    await userDb.insert(categoryCapHistory).values(
      fixture.categories.map((category) => ({
        id: newId(),
        categoryId: idByName.get(category.name)!,
        effectiveFrom: historyAnchor,
        capCents: category.capCents,
      })),
    );

    // **What the visitor typed goes with the rows they typed it about.** The two
    // assistant tables are the only place in this database that holds a
    // visitor's own words, and nothing else in the app deletes them: left here,
    // every question one visitor asked is listed under the History tab for
    // every visitor of this account afterwards, indefinitely. People type real
    // finances into demo chat boxes.
    //
    // Messages before sessions, because the child rows are the ones with a
    // parent to be orphaned by. There is no foreign key to enforce it - this
    // schema declares none - so the order is a courtesy to anybody reading the
    // tables mid-restore rather than a constraint.
    await userDb.delete(assistantMessages);
    await userDb.delete(assistantSessions);

    // **The display name and the currency are the visitor's to change too**, and
    // Settings lets them. Rewritten rather than left, so the next visitor is not
    // greeted by the last one's idea of a funny name - and so the fixture's
    // amounts are read back in the currency they were written for. Everything
    // else in this row is provisioning's and stays as it is.
    await userDb.update(profile).set({
      fullName: fixture.profile.fullName,
      currency: fixture.profile.currency,
    });

    // One transaction, so a failure part-way through leaves the account with the
    // history it had rather than with whichever chunk landed before the error.
    //
    // **The objection the script could wave away now has to be answered.** The
    // embedded driver refuses overlapping transactions on one connection, and
    // this is no longer a one-shot script with nothing else running: it is a
    // request handler. It is still safe, because the connection is per user
    // database and a demo account is leased to exactly one visitor at a time -
    // nobody else is on this connection by construction. That is a property of
    // the lease, so if leasing ever stops being exclusive, this has to change
    // with it.
    await userDb.transaction(async (tx) => {
      await tx.delete(transactions);
      const chunkSize = 100;
      for (let i = 0; i < rows.length; i += chunkSize) {
        await tx.insert(transactions).values(rows.slice(i, i + chunkSize));
      }
    });

    return rows.length;
  }

  /**
   * Generates the account's insight set, and **waits for the run to finish**
   * rather than for it to start.
   *
   * Needed at all because the rows above are written straight to `transactions`
   * rather than through `TransactionsService`, so none of them emits the
   * transaction-changed event that regenerates a set on every ordinary write.
   * Left out, a freshly seeded account demos the empty state - the one frame it
   * has the least business showing.
   *
   * **`generate()` alone is not enough, and is worse than leaving it out.** It
   * returns as soon as the placeholder `generating` row is committed and floats
   * the real work. In the CLI that raced `app.close()` closing every replica
   * underneath it; in a request it would race nothing, but the visitor would
   * still land on a skeleton the first read has to wait out. So this polls
   * `getSet` until the state settles, which is the only completion signal the
   * service's public surface offers.
   */
  private async regenerateInsights(
    userId: string,
    budgetMs: number,
  ): Promise<void> {
    try {
      await this.insights.generate(userId);
    } catch (error) {
      // Guarded for the same reason the loop below warns rather than throws.
      // `generate()` answers `ConflictException` when a `generating` row younger
      // than the staleness cutoff exists, which is exactly what an interrupted
      // previous run leaves behind. Unguarded, re-seeding inside that window
      // lets the exception escape **after** every transaction has already been
      // written - reporting a successful seed as a failure.
      this.logger.warn(
        `Insight generation for ${userId} could not be started: ` +
          `${error instanceof Error ? error.message : String(error)} ` +
          `The transactions are seeded.`,
      );
      return;
    }

    // Rule-based generation settles in well under a second; the ceiling is a
    // wedged-run guard, not an expected wait.
    const deadline = Date.now() + budgetMs;
    while (Date.now() < deadline) {
      const set = await this.insights.getSet(userId);
      if (set.state !== 'generating') {
        this.logger.log(
          `Generated ${set.insights.length} insight card${set.insights.length === 1 ? '' : 's'} for ${userId} (${set.state}).`,
        );
        return;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, INSIGHT_POLL_INTERVAL_MS),
      );
    }

    // A warning rather than a throw: the transactions are the point and they are
    // already committed, so failing here would report a successful seed as a
    // failure. The account self-heals at the staleness cutoff.
    this.logger.warn(
      `Insight generation for ${userId} did not settle within ${budgetMs}ms. ` +
        `The transactions are seeded.`,
    );
  }
}

/** How often the poll above asks whether the run has settled. */
const INSIGHT_POLL_INTERVAL_MS = 250;

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
 * The usual cause is `category_templates` changing under a fixture generated
 * before it; the other is this account having a category deleted through the
 * API, which the tombstone filter on the read above turns into the same
 * missing-category failure rather than a silently dead id. So the message says
 * which category, which cause, and what actually fixes it - regenerating does
 * not, since the fixture's categories come from a hand-written table.
 *
 * **A demo visitor deleting a category reaches this**, which is why the lease
 * releases on a failed re-seed rather than handing out the account anyway.
 */
export function assertCategoriesMatch(
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
      `removed since this data was generated - or this account had a category ` +
      `deleted through the API. Regenerating alone will not fix it: the ` +
      `fixture's categories come from CATEGORY_PLANS in ` +
      `src/scripts/showcase/plan.ts, so add, rename or remove the row there ` +
      `first (rebalancing spendPercent, countPercent and capCents until ` +
      `assertPlanIsCoherent passes), then run \`mise run seed:fixture\`.`,
  );
}
