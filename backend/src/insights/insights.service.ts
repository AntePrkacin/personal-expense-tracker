import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
} from 'drizzle-orm';
import { newId } from '../common/ids';
import { isUniqueViolation } from '../common/unique-violation';
import type { UserDatabase } from '../database/database.types';
import { UserDatabaseService } from '../database/user-database.service';
import {
  insightSets,
  insights,
  type InsightSetRow,
} from '../database/user/schema';
import type {
  InsightCardDto,
  InsightSetResponseDto,
} from './dto/insight-set-response.dto';
import { INSIGHT_GENERATOR, type InsightGenerator } from './insight-generator';

const RUN_IN_FLIGHT =
  'A generation run is already in progress. Wait for it to finish before starting another.';

// A `generating` row older than this is treated as an abandoned run - a process
// that died mid-run, or a throw inside the failing catch - rather than a live
// one, the way the rest of the codebase reasons about token and session expiry.
// Past the cutoff the run self-heals instead of wedging the read and every future
// POST. Rule-based generation settles in well under a second; the margin is
// headroom for a future slow `LlmInsightGenerator`. Exported so the e2e suite
// ages a row against the real cutoff rather than restating the number.
export const GENERATING_STALE_AFTER_MS = 5 * 60 * 1000;

// How long a shutdown waits for floated runs to settle. Generous against the
// sub-second a rule-based run takes and short enough that a wedged generator
// cannot hold the process open past Fly's kill timeout - see backend/CLAUDE.md,
// Deployment. A run abandoned here loses nothing a restart cannot redo: its row
// is reclaimed as stale five minutes later, and the previous ready set is still
// the read's answer in the meantime.
const SHUTDOWN_DRAIN_TIMEOUT_MS = 5_000;

// How many settled sets survive a completed run. Every superseded set past this
// is deleted with its cards, which is what keeps these two tables bounded now
// that a run starts on every transaction write rather than on a button press:
// unpruned, a user logging five expenses a day accumulates roughly 1,800 set
// rows and 3,600 card rows a year in their own replica, all of which the
// shutdown push carries to Turso Cloud.
//
// **Only the newest `ready` set is ever read**, by `latestReadySet`, so the
// retained remainder is for reading a recent
// run's history by hand rather than for anything the API serves. Three is enough
// to see the run before last and small enough that `latestReadySet`'s
// `ORDER BY generated_at` sorts a handful of rows - which is why that column
// still carries no index of its own, and must not grow one on the strength of a
// plan that reads the table as unbounded.
const SETTLED_SET_RETENTION = 3;

/**
 * Stores, reads and orchestrates generation of insight sets. The read derives the
 * API state from stored rows; {@link generate} runs a generation asynchronously
 * and persists its result.
 *
 * **The API's `empty`/`generating`/`ready` state is derived here, never stored.**
 * A row's `status` is `generating`, `ready` or `failed`; the read turns the set
 * of rows into one state: a run in flight wins (skeletons), else the newest
 * `ready` set, else empty. A `failed` row is simply skipped, which is the whole
 * of AC6 - the previous `ready` set stays the read's answer with no restore step,
 * because a run only ever becomes visible content once it reaches `ready`.
 *
 * **The content the read returns is always the latest `ready` set, independent of
 * the state.** On a regenerate the cards render skeletons off `state` while this
 * same response still carries the last good content, so the summary banner keeps
 * showing something rather than blanking mid-run.
 *
 * **Cross-user isolation is structural, like every other feature here.** Every
 * method opens the caller's own database, so there is no `user_id` column and no
 * `WHERE` to forget.
 *
 * **Nothing composes this service since PET-73.** `DashboardService` did, for the
 * teaser card's summary; that card is gone and the insight cards themselves moved
 * onto the Dashboard, reading `GET /api/insights` directly so the poll behind them
 * keeps them current. It is still exported from `InsightsModule`, which costs
 * nothing and is one line to un-need.
 */
@Injectable()
export class InsightsService implements OnApplicationShutdown {
  private readonly logger = new Logger(InsightsService.name);

  /**
   * The floated runs that have not settled yet, so shutdown can wait for them.
   *
   * A run outlives the request that started it by design, and until
   * PET-42-43-44 the only thing that started one was an explicit POST. Now every
   * transaction write does, so at any moment a shutdown can land on a run
   * mid-flight - and `DatabaseModule.onApplicationShutdown` closing every replica
   * underneath it is the same class of failure the deployment's kill-timeout
   * paragraph describes for the final push: the write is simply lost, silently.
   * Holding the promises is what makes {@link onApplicationShutdown} able to
   * wait. It is also what keeps the e2e suites quiet, since three of them post
   * transactions without ever reading an insight.
   */
  private readonly inFlight = new Set<Promise<void>>();

  /**
   * Users whose data moved while a run was already in flight.
   *
   * **The bounded dirty flag** (PET-73), and "bounded" is the entire argument for
   * having one at all. `docs/TODO.md` recorded that a burst of writes leaves a
   * stale set - writes 2..N all lose the single-run 409, so the surviving set is
   * whatever the first run read part-way through the burst - and observed that
   * every honest fix looks like a re-entrant loop on the write path. This one is
   * not, by construction:
   *
   * 1. A 409 in `InsightTriggersListener` calls {@link markDirty} instead of only
   *    logging.
   * 2. {@link runGeneration} clears the flag **as its own run starts**, so it can
   *    only ever be re-set by a write that landed after that read began.
   * 3. On either path that **settled** the state - a set written, or an empty
   *    account's placeholder removed - a flag that is set again starts **exactly
   *    one** more run. See {@link startFollowUpIfDirty} for why the two paths that
   *    settled nothing schedule none.
   *
   * Because each run clears the flag as it starts, a burst of N writes produces
   * **at most two runs**, and there is no path that schedules a third from the
   * second: the follow-up run clears the flag on entry too, and by then the burst
   * has settled. The set kept in memory rather than in a column for the same
   * reason `inFlight` is - it is process state about a floated run, not a fact
   * about the account, and a single instance is a deployment invariant (see
   * `backend/CLAUDE.md`, Deployment).
   */
  private readonly dirty = new Set<string>();

  constructor(
    private readonly userDatabases: UserDatabaseService,
    @Inject(INSIGHT_GENERATOR)
    private readonly generator: InsightGenerator,
  ) {}

  /**
   * Waits for every floated run to settle before the databases close.
   *
   * Bounded, because a wedged generator must not hold the process open: past the
   * cutoff the runs are abandoned and the read reclaims their rows five minutes
   * later anyway. Nothing here rethrows - `runGeneration` already records its own
   * failures, and a shutdown is not the place to start failing.
   */
  async onApplicationShutdown(): Promise<void> {
    if (this.inFlight.size === 0) {
      return;
    }

    this.logger.log(
      `Waiting for ${this.inFlight.size} insight run(s) to settle before shutdown.`,
    );
    await Promise.race([
      Promise.allSettled([...this.inFlight]),
      new Promise((resolve) =>
        setTimeout(resolve, SHUTDOWN_DRAIN_TIMEOUT_MS).unref(),
      ),
    ]);
  }

  /**
   * Starts an asynchronous generation run, for `POST /api/insights/generate`.
   *
   * The `generating` row is written and committed **before this returns**, so
   * the 202 the controller sends is truthful and a concurrent read can observe
   * the generating state. The generation itself is floated with a logging
   * `.catch`, exactly the shape `AuthService` uses: the rule-based work is fast,
   * but the async lifecycle is the design's contract (INS-5) and the seam a
   * future slow generator needs.
   *
   * **Only one run at a time**, enforced by three lines that back each other up:
   * an abandoned run past the stale cutoff is reclaimed to `failed` first, a live
   * run in flight is then a 409, and the partial unique index on
   * `status = 'generating'` catches the concurrent insert the check cannot (A26).
   *
   * @throws ConflictException if a run is already in flight.
   */
  async generate(userId: string): Promise<void> {
    const db = await this.userDatabases.getUserDb(userId);

    // Reclaim an abandoned run before anything else. A `generating` row past the
    // stale cutoff is a previous run that never reached `ready`/`failed`; flip it
    // to `failed` so the state self-heals, and - given the unique index below -
    // so it does not reject this run's own insert.
    await db
      .update(insightSets)
      .set({ status: 'failed' })
      .where(
        and(
          eq(insightSets.status, 'generating'),
          lt(insightSets.createdAt, this.staleBefore()),
          isNull(insightSets.deletedAt),
        ),
      );

    if (await this.hasRunInFlight(db)) {
      throw new ConflictException(RUN_IN_FLIGHT);
    }

    const runId = newId();
    try {
      await db.insert(insightSets).values({ id: runId, status: 'generating' });
    } catch (error) {
      // The check above is not atomic with this insert, so a concurrent POST can
      // slip between them; the partial unique index rejects the loser here. Same
      // outcome as the check catching it - one run at a time - but decided at the
      // database rather than by the racy read.
      if (isGeneratingConflict(error)) {
        throw new ConflictException(RUN_IN_FLIGHT);
      }
      throw error;
    }

    // Still floated - `generate` must return as soon as the placeholder is
    // committed - but tracked, so a shutdown can wait for it rather than closing
    // the database out from under it. `finally` rather than `then`, so a failed
    // run leaves the set too.
    const run = this.runGeneration(userId, runId)
      .catch((error) => {
        // The run already marked itself failed (AC6); this only records why.
        this.logger.error(
          `Insight generation ${runId} for user ${userId} failed`,
          error instanceof Error ? error.stack : String(error),
        );
      })
      .finally(() => {
        this.inFlight.delete(run);
      });
    this.inFlight.add(run);
  }

  /**
   * Records that this user's data moved while a run was already in flight, so
   * the run that is generating starts exactly one more when it completes.
   *
   * Called by `InsightTriggersListener` on the 409 it used to only log. See
   * {@link dirty} for why exactly one, and why that cannot become two.
   */
  markDirty(userId: string): void {
    this.dirty.add(userId);
  }

  /**
   * The floated body of a run: generate, then persist or fail.
   *
   * On success the `generating` row becomes `ready`, its cards are inserted and
   * everything it supersedes past {@link SETTLED_SET_RETENTION} is deleted, all
   * in **one transaction**. An empty account generates nothing (`null`), so the
   * placeholder run is removed and the read falls back to whatever it was - and
   * nothing is pruned, because a run that produced no set supersedes none. On any
   * failure the row is marked `failed` and nothing else is touched, so the
   * previous `ready` set stays the read's answer (AC6).
   *
   * **Every write here is conditional on the row still being `generating`, so a
   * run reclaimed as abandoned writes nothing at all.** Past
   * `GENERATING_STALE_AFTER_MS` a newer `generate()` flips this row to `failed`
   * and starts its own run, so the single-run guard no longer makes this the only
   * transaction on the connection - which is exactly why the status is in every
   * `WHERE` below. A reclaimed loser cannot resurrect a row already declared
   * dead, cannot stamp a stale `generated_at` over the newest set, and cannot
   * leave cards hanging off a `failed` one. Two transactions genuinely overlapping
   * on the one cached connection is still reachable and still degrades that run to
   * `failed`; see docs/TODO.md.
   */
  private async runGeneration(userId: string, runId: string): Promise<void> {
    // Cleared **as this run starts**, before the generator reads anything. That
    // ordering is what bounds the loop: only a write that lands after this point
    // can set it again, so the follow-up run below is guaranteed to be reading
    // data this one could not have seen. See {@link dirty}.
    this.dirty.delete(userId);

    try {
      const set = await this.generator.generate(userId);
      const db = await this.userDatabases.getUserDb(userId);

      if (!set) {
        // Hard delete, not a tombstone: this placeholder never reached `ready`,
        // so it holds no content to audit and nothing a soft-delete would keep.
        // The one row in this database exempt from the tombstone convention.
        await db.delete(insightSets).where(this.stillRunning(runId));

        // **This path schedules a follow-up too, and a review of PET-73 is why.**
        // It read as the account having nothing to say, so nothing to chase - but
        // the generator answered `null` because it read **zero** transactions, and
        // a write landing after that read is exactly how the account stops being
        // empty. Reachable in one step: delete the last transaction (this run
        // starts and clears the flag), then create one before this run returns -
        // the create loses the 409 and marks the account dirty. Without this call
        // the new transaction reached no set until the next write, which is the
        // staleness {@link dirty} exists to close, and the user's entry leaked in
        // the set for the lifetime of the process.
        await this.startFollowUpIfDirty(userId, runId);
        return;
      }

      const claimed = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(insightSets)
          .set({
            status: 'ready',
            monthLabel: set.monthLabel,
            summaryHeadline: set.summary.headline,
            summaryBody: set.summary.body,
            generatedAt: new Date(),
          })
          .where(this.stillRunning(runId))
          .returning({ id: insightSets.id });

        // Reclaimed mid-run, so a newer run owns the state now. Skip the cards
        // too, or they would hang off a set the read will never serve.
        if (!row) {
          return false;
        }

        if (set.cards.length > 0) {
          await tx.insert(insights).values(
            set.cards.map((card, index) => ({
              id: newId(),
              setId: runId,
              tone: card.tone,
              title: card.title,
              body: card.body,
              sortOrder: index,
            })),
          );
        }

        // Drop what this run supersedes, in the same transaction that made it
        // the newest set - so the tables are bounded at every commit rather
        // than between them, and a crash cannot leave a half-pruned history.
        //
        // A **hard** delete, the second and last exemption from this database's
        // tombstone convention alongside the placeholder removal above, and for
        // the same reason: a tombstoned set is still a row, so soft-deleting
        // here would bound nothing at all.
        //
        // `generating` rows are excluded rather than ordered around. A row in
        // that state is either this run's own - already updated to `ready`
        // above and so not matched - or a live run belonging to a caller past
        // the stale cutoff, whose claim is `stillRunning`'s to settle and not
        // this prune's to delete out from under it.
        //
        // Read in full and sliced in TypeScript rather than expressed as a
        // correlated `NOT IN (SELECT ... LIMIT n)`, because this reads at most
        // a handful of rows once the first prune has run and the legible
        // version is worth more than the subquery.
        const settled = await tx
          .select({ id: insightSets.id })
          .from(insightSets)
          .where(ne(insightSets.status, 'generating'))
          .orderBy(desc(insightSets.createdAt));

        const superseded = settled
          .slice(SETTLED_SET_RETENTION)
          .map((row) => row.id);

        if (superseded.length > 0) {
          // Cards first. Reversed, a failure between the two statements would
          // strand cards pointing at a set that no longer exists - the same
          // ordering argument `CategoriesService.remove` makes about
          // reassigning before it tombstones.
          await tx.delete(insights).where(inArray(insights.setId, superseded));
          await tx
            .delete(insightSets)
            .where(inArray(insightSets.id, superseded));
        }

        return true;
      });

      if (!claimed) {
        this.logger.warn(
          `Insight generation ${runId} for user ${userId} was reclaimed as ` +
            `abandoned while still running; its result was discarded`,
        );
        return;
      }

      await this.startFollowUpIfDirty(userId, runId);
    } catch (error) {
      const db = await this.userDatabases.getUserDb(userId);
      await db
        .update(insightSets)
        .set({ status: 'failed' })
        .where(this.stillRunning(runId));
      throw error;
    }
  }

  /**
   * Starts one more run when a write landed while this one was reading.
   *
   * Called from **both** paths that settled the state - the set written, and the
   * empty account's placeholder removed - and from neither of the two that did
   * not: a run that failed or was reclaimed has not settled the state a follow-up
   * would be scheduling against, and chaining off it is how a bounded retry
   * becomes an unbounded one.
   *
   * `generate` is called rather than `runGeneration`, so the follow-up takes the
   * same placeholder row, the same 409 guard and the same shutdown tracking as any
   * other run; its own start clears the flag again, which is the bound.
   */
  private async startFollowUpIfDirty(
    userId: string,
    runId: string,
  ): Promise<void> {
    if (!this.dirty.has(userId)) {
      return;
    }

    this.logger.debug(
      `Insight set for user ${userId} was superseded while run ${runId} ` +
        `was in flight; starting one more run.`,
    );

    await this.generate(userId).catch((error) => {
      // A 409 here means yet another run beat this one to it, which is the
      // benign outcome: something newer is already generating.
      if (error instanceof ConflictException) {
        return;
      }
      this.logger.error(
        `The follow-up insight run for user ${userId} could not be started`,
        error instanceof Error ? error.stack : String(error),
      );
    });
  }

  /** This run's row, and only while it is still the run that owns the state. */
  private stillRunning(runId: string) {
    return and(eq(insightSets.id, runId), eq(insightSets.status, 'generating'));
  }

  /** The latest set with its derived state, for `GET /api/insights`. */
  async getSet(userId: string): Promise<InsightSetResponseDto> {
    const db = await this.userDatabases.getUserDb(userId);

    const ready = await this.latestReadySet(db);
    const running = await this.hasRunInFlight(db);

    // `latestReadySet` has already excluded a content-less row in SQL, so this
    // reads as narrowing rather than a second guard: the columns are nullable in
    // the schema, and the DTO promises strings. Kept as a condition rather than
    // `!` so the types carry the invariant instead of an assertion hiding it.
    const content =
      ready && ready.summaryHeadline !== null && ready.summaryBody !== null
        ? {
            monthLabel: ready.monthLabel,
            summary: {
              headline: ready.summaryHeadline,
              body: ready.summaryBody,
            },
            generatedAt: ready.generatedAt
              ? ready.generatedAt.toISOString()
              : null,
            cards: await this.cardsFor(db, ready.id),
          }
        : null;

    const state = running ? 'generating' : content ? 'ready' : 'empty';

    return {
      state,
      monthLabel: content?.monthLabel ?? null,
      summary: content?.summary ?? null,
      insights: content?.cards ?? [],
      generatedAt: content?.generatedAt ?? null,
    };
  }

  /**
   * **`latestReadySummary` lived here until PET-73 and is gone with the field it
   * served.** It fed `DashboardResponseDto.insight`, the teaser card's headline
   * and body; that card is deleted and the insight cards themselves moved onto
   * the Dashboard, where they read `GET /api/insights` directly so the poll can
   * keep them current. Nothing composes this service any more, and
   * `InsightsService` stays exported only because `InsightsModule` has always
   * exported it - see that module.
   */

  /** The newest completed set, or null if none has ever completed. */
  private async latestReadySet(
    db: UserDatabase,
  ): Promise<InsightSetRow | null> {
    const [row] = await db
      .select()
      .from(insightSets)
      .where(
        and(
          eq(insightSets.status, 'ready'),
          // A `ready` row without its content is a broken invariant, not an
          // answer, so it is skipped here rather than downstream: an older
          // complete set then still serves, the same way AC6 lets one outlive a
          // `failed` run. Filtered in SQL so both readers inherit it rather than
          // each deciding for itself what a half-written set means. Note this
          // does not save `latestReadySummary` a null check: `InsightSetRow`
          // types both columns `string | null`, so narrowing forces a redundant
          // guard there, and the alternative - projecting the two columns so the
          // row type carries the guarantee - would narrow the row `getSet` reads
          // the rest of its fields off.
          isNotNull(insightSets.summaryHeadline),
          isNotNull(insightSets.summaryBody),
          isNull(insightSets.deletedAt),
        ),
      )
      // Newest wins (AC5): a later generation supersedes an earlier one, and the
      // dashboard teaser reads from this same newest set.
      .orderBy(desc(insightSets.generatedAt))
      .limit(1);

    return row ?? null;
  }

  /** The instant before which a `generating` row counts as abandoned. */
  private staleBefore(): Date {
    return new Date(Date.now() - GENERATING_STALE_AFTER_MS);
  }

  /** Whether a *fresh* generation run is currently in flight. */
  private async hasRunInFlight(db: UserDatabase): Promise<boolean> {
    const [row] = await db
      .select({ id: insightSets.id })
      .from(insightSets)
      .where(
        and(
          eq(insightSets.status, 'generating'),
          // Only a run within the stale cutoff counts; an older one is abandoned
          // and must neither wedge the read nor block a new POST.
          gt(insightSets.createdAt, this.staleBefore()),
          isNull(insightSets.deletedAt),
        ),
      )
      .limit(1);

    return row !== undefined;
  }

  /** One set's cards, in their stored render order. */
  private async cardsFor(
    db: UserDatabase,
    setId: string,
  ): Promise<InsightCardDto[]> {
    const rows = await db
      .select({
        tone: insights.tone,
        title: insights.title,
        body: insights.body,
      })
      .from(insights)
      .where(and(eq(insights.setId, setId), isNull(insights.deletedAt)))
      .orderBy(asc(insights.sortOrder));

    return rows.map((row) => ({
      tone: row.tone as InsightCardDto['tone'],
      title: row.title,
      body: row.body,
    }));
  }
}

/**
 * A partial-unique-index collision on the single-run guard, as opposed to any other
 * write failure. `insight_sets.status` and not the bare table: a `newId()`
 * primary-key clash is a broken invariant, not "a run is already in progress".
 */
function isGeneratingConflict(error: unknown): boolean {
  return isUniqueViolation(error, 'insight_sets.status');
}
