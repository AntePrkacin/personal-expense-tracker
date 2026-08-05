import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, desc, eq, gt, isNotNull, isNull, lt } from 'drizzle-orm';
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
 * the state.** On a regenerate the page renders skeletons off `state` while this
 * same response still carries the last good content, which is what lets the
 * dashboard teaser keep showing something rather than blanking mid-run.
 *
 * **Cross-user isolation is structural, like every other feature here.** Every
 * method opens the caller's own database, so there is no `user_id` column and no
 * `WHERE` to forget. `InsightsService` is exported from `InsightsModule` so the
 * dashboard composes it rather than re-query these tables.
 */
@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  constructor(
    private readonly userDatabases: UserDatabaseService,
    @Inject(INSIGHT_GENERATOR)
    private readonly generator: InsightGenerator,
  ) {}

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

    void this.runGeneration(userId, runId).catch((error) => {
      // The run already marked itself failed (AC6); this only records why.
      this.logger.error(
        `Insight generation ${runId} for user ${userId} failed`,
        error instanceof Error ? error.stack : String(error),
      );
    });
  }

  /**
   * The floated body of a run: generate, then persist or fail.
   *
   * On success the `generating` row becomes `ready` and its cards are inserted in
   * **one transaction**. An empty account generates nothing (`null`), so the
   * placeholder run is removed and the read falls back to whatever it was. On any
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
    try {
      const set = await this.generator.generate(userId);
      const db = await this.userDatabases.getUserDb(userId);

      if (!set) {
        // Hard delete, not a tombstone: this placeholder never reached `ready`,
        // so it holds no content to audit and nothing a soft-delete would keep.
        // The one row in this database exempt from the tombstone convention.
        await db.delete(insightSets).where(this.stillRunning(runId));
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

        return true;
      });

      if (!claimed) {
        this.logger.warn(
          `Insight generation ${runId} for user ${userId} was reclaimed as ` +
            `abandoned while still running; its result was discarded`,
        );
      }
    } catch (error) {
      const db = await this.userDatabases.getUserDb(userId);
      await db
        .update(insightSets)
        .set({ status: 'failed' })
        .where(this.stillRunning(runId));
      throw error;
    }
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
   * The latest ready set's summary headline, for the dashboard teaser.
   *
   * A string or null, deliberately narrow: `DashboardResponseDto.insight` is
   * `string | null` (PET-20's committed contract), so this hands it exactly that
   * and no more. Null whenever there is no ready set, including while the first
   * run is still generating.
   */
  async latestReadyTeaser(userId: string): Promise<string | null> {
    const db = await this.userDatabases.getUserDb(userId);
    const ready = await this.latestReadySet(db);

    return ready?.summaryHeadline ?? null;
  }

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
          // `failed` run. Filtered in SQL so `latestReadyTeaser` inherits it
          // rather than guarding the same invariant a second, different way.
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
