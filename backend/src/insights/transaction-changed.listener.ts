import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  TRANSACTION_CHANGED,
  type TransactionChangedEvent,
} from '../transactions/transaction-changed.event';
import { InsightsService } from './insights.service';

/**
 * Regenerates the insight set whenever a transaction is created, edited or
 * deleted.
 *
 * **This is what makes `state: 'empty'` mean "this account has never logged a
 * transaction".** Nothing on the frontend fires a generation any more: the
 * Insights page is a pure read plus a Regenerate button, so a read-only screen
 * no longer writes to the database on every visit, and there is no window in
 * which an account with expenses is shown "Insights unlock after your first
 * expense". `docs/TODO.md` records the reversal, since generate-on-write was
 * argued against there before PET-42-43-44 argued for it.
 *
 * **It lives here rather than in `TransactionsModule`.** `InsightsModule` already
 * imports `TransactionsModule` for the generator's composition surface, so the
 * direct call back would be the circular dependency the emitter exists to avoid.
 * The write path emits and never learns that insights exist.
 *
 * **The cost on the write path is bounded and deliberate.** `generate` commits
 * the placeholder row and returns, floating the generation itself, so a
 * transaction write pays three quick queries against a database the request
 * already has open - the stale reclaim, the in-flight check, and the insert -
 * and never waits for the generator. That is only acceptable while generation is
 * sub-second: binding a real `LlmInsightGenerator` to `INSIGHT_GENERATOR` needs a
 * debounce or a dirty flag first, which is recorded in `docs/TODO.md`.
 */
@Injectable()
export class TransactionChangedListener {
  private readonly logger = new Logger(TransactionChangedListener.name);

  constructor(private readonly insights: InsightsService) {}

  /**
   * **Swallows everything, and the write path swallows again around
   * `emitAsync`.** Neither catch is redundant: this one keeps a rejection from
   * reaching `emitAsync` at all, and the caller's keeps a future second listener
   * - or a synchronous throw from this one - from failing a transaction that
   * really did save.
   *
   * A `ConflictException` is the expected outcome rather than an error: it means
   * a run is already in flight, so fresh-enough content is already being
   * generated.
   *
   * **What that costs is one stale set, and it heals on the next write rather
   * than on its own.** Nothing re-runs after the in-flight run completes: there
   * is no retry, no dirty flag and no sweep, so when writes 2..N of a burst all
   * lose this guard the surviving set is whatever the first run read part-way
   * through it. Deleting three transactions in a row is the ordinary way in -
   * the first delete's run reads mid-burst, the next two land here, and both
   * `/insights` and the dashboard teaser keep quoting spend that includes rows
   * the user has already removed. It ends at the account's next transaction
   * write, or at the Insights page's Regenerate button, which is on screen in
   * every state for exactly this class of reason.
   *
   * This docblock said "bounded by one run and self-heals" until the review of
   * PET-42-43-44, and the word was wrong rather than imprecise: a reader
   * checking whether a burst could leave stale content was being told the
   * mechanism that would fix it exists. `docs/TODO.md` carries it as deferred
   * work, which is what "recorded rather than mitigated" is supposed to mean.
   */
  @OnEvent(TRANSACTION_CHANGED)
  async regenerate(event: TransactionChangedEvent): Promise<void> {
    try {
      await this.insights.generate(event.userId);
    } catch (error) {
      if (error instanceof ConflictException) {
        this.logger.debug(
          `Insight generation for user ${event.userId} skipped (${event.reason}): a run is already in flight.`,
        );
        return;
      }
      this.logger.error(
        `Insight generation for user ${event.userId} could not be started (${event.reason}); the write stands.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
