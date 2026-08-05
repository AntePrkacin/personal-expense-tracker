import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { newId } from '../common/ids';
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

/**
 * Stores and reads a generated insight set. Generation itself is PET-40.
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
 * dashboard (and PET-40) compose it rather than re-query these tables.
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
   * **Only one run at a time.** Regenerate is disabled while a run is in flight
   * (A26), so a second request finding a `generating` row is a 409 rather than a
   * second concurrent writer on the one cached connection.
   *
   * @throws ConflictException if a run is already in flight.
   */
  async generate(userId: string): Promise<void> {
    const db = await this.userDatabases.getUserDb(userId);

    if (await this.hasRunInFlight(db)) {
      throw new ConflictException(RUN_IN_FLIGHT);
    }

    const runId = newId();
    await db.insert(insightSets).values({ id: runId, status: 'generating' });

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
   * **one transaction** - safe on the embedded driver because the single-run
   * guard keeps this the only transaction on the connection. An empty account
   * generates nothing (`null`), so the placeholder run is removed and the read
   * falls back to whatever it was. On any failure the row is marked `failed` and
   * nothing else is touched, so the previous `ready` set stays the read's answer
   * (AC6).
   */
  private async runGeneration(userId: string, runId: string): Promise<void> {
    try {
      const set = await this.generator.generate(userId);
      const db = await this.userDatabases.getUserDb(userId);

      if (!set) {
        await db.delete(insightSets).where(eq(insightSets.id, runId));
        return;
      }

      await db.transaction(async (tx) => {
        await tx
          .update(insightSets)
          .set({
            status: 'ready',
            monthLabel: set.monthLabel,
            summaryHeadline: set.summary.headline,
            summaryBody: set.summary.body,
            generatedAt: new Date(),
          })
          .where(eq(insightSets.id, runId));

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
      });
    } catch (error) {
      const db = await this.userDatabases.getUserDb(userId);
      await db
        .update(insightSets)
        .set({ status: 'failed' })
        .where(eq(insightSets.id, runId));
      throw error;
    }
  }

  /** The latest set with its derived state, for `GET /api/insights`. */
  async getSet(userId: string): Promise<InsightSetResponseDto> {
    const db = await this.userDatabases.getUserDb(userId);

    const ready = await this.latestReadySet(db);
    const running = await this.hasRunInFlight(db);
    const cards = ready ? await this.cardsFor(db, ready.id) : [];

    const state = running ? 'generating' : ready ? 'ready' : 'empty';

    return {
      state,
      monthLabel: ready?.monthLabel ?? null,
      // A `ready` row carries its content by invariant - PET-40 writes the
      // header and the cards in one transaction - so the summary is present
      // whenever `ready` is.
      summary: ready
        ? { headline: ready.summaryHeadline!, body: ready.summaryBody! }
        : null,
      insights: cards,
      generatedAt: ready?.generatedAt ? ready.generatedAt.toISOString() : null,
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
        and(eq(insightSets.status, 'ready'), isNull(insightSets.deletedAt)),
      )
      // Newest wins (AC5): a later generation supersedes an earlier one, and the
      // dashboard teaser reads from this same newest set.
      .orderBy(desc(insightSets.generatedAt))
      .limit(1);

    return row ?? null;
  }

  /** Whether a generation run is currently in flight. */
  private async hasRunInFlight(db: UserDatabase): Promise<boolean> {
    const [row] = await db
      .select({ id: insightSets.id })
      .from(insightSets)
      .where(
        and(
          eq(insightSets.status, 'generating'),
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
