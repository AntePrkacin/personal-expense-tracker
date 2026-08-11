import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  CATEGORY_CHANGED,
  type CategoryChangedEvent,
} from '../categories/category-changed.event';
import {
  TRANSACTION_CHANGED,
  type TransactionChangedEvent,
} from '../transactions/transaction-changed.event';
import { InsightsService } from './insights.service';

/**
 * Regenerates the insight set whenever the numbers behind it move: a transaction
 * created, edited or deleted, or a category created, edited, deleted or having
 * its caps set in bulk.
 *
 * **It handles two events, which is why it is not named after one of them.**
 * This file was `transaction-changed.listener.ts` until PET-73 added
 * `CATEGORY_CHANGED`; leaving it named after one of two events it handles is how
 * a filename becomes a lie. Both delegate to one private helper, because they are
 * the same action - the set is stale either way and there is nothing per-event to
 * decide.
 *
 * **This is what makes `state: 'empty'` mean "this account has never logged a
 * transaction".** Nothing on the frontend fires a generation: the insight cards
 * are a pure read plus a Regenerate button, so a read-only screen never writes to
 * the database on a visit, and there is no window in which an account with
 * expenses is shown "Insights unlock after your first expense". `docs/TODO.md`
 * records the reversal, since generate-on-write was argued against there before
 * PET-42-43-44 argued for it.
 *
 * **It lives here rather than in the two feature modules.** `InsightsModule`
 * already imports both `TransactionsModule` and `CategoriesModule` for the
 * generator's composition surface, so a direct call back would be the circular
 * dependency the emitter exists to avoid. Neither write path learns that
 * insights exist.
 *
 * **The cost on either write path is bounded and deliberate.** `generate` commits
 * the placeholder row and returns, floating the generation itself, so a write
 * pays three quick queries against a database the request already has open - the
 * stale reclaim, the in-flight check, and the insert - and never waits for the
 * generator. That is only acceptable while generation is sub-second: binding a
 * real `LlmInsightGenerator` to `INSIGHT_GENERATOR` needs a debounce first, which
 * `docs/TODO.md` still records. PET-73's chat does **not** bind one - it is a
 * separate module that generates nothing.
 */
@Injectable()
export class InsightTriggersListener {
  private readonly logger = new Logger(InsightTriggersListener.name);

  constructor(private readonly insights: InsightsService) {}

  @OnEvent(TRANSACTION_CHANGED)
  async onTransactionChanged(event: TransactionChangedEvent): Promise<void> {
    await this.regenerate(event.userId, `transaction ${event.reason}`);
  }

  /**
   * The second handler, and the whole of what closes `docs/TODO.md`'s "a cap
   * change can leave the insight set stale".
   *
   * The over-cap rule reads caps, so raising one can leave a `warning` card
   * asserting something that is no longer true. It fires for all four category
   * writes rather than only the two that touch a cap, because a rename or a
   * delete changes what the cards *say* just as surely - and because the write
   * method is the wrong place to decide which fields a content rule happens to
   * read today.
   */
  @OnEvent(CATEGORY_CHANGED)
  async onCategoryChanged(event: CategoryChangedEvent): Promise<void> {
    await this.regenerate(event.userId, `category ${event.reason}`);
  }

  /**
   * **Swallows everything, and both write paths swallow again around
   * `emitAsync`.** Neither catch is redundant: this one keeps a rejection from
   * reaching `emitAsync` at all, and the callers' keep a future second listener -
   * or a synchronous throw from this one - from failing a write that really did
   * save.
   *
   * A `ConflictException` is the expected outcome rather than an error: it means
   * a run is already in flight, so fresh-enough content is already being
   * generated.
   *
   * **Since PET-73 that no longer loses the losing write's data.** The 409 marks
   * the account dirty, and the run that is already in flight starts exactly one
   * more when it completes - so a burst of N writes produces at most two runs and
   * the second reads the settled table. That is `InsightsService.markDirty`, and
   * the boundedness is the entire argument for doing it at all: `docs/TODO.md`
   * said every honest fix here is a re-entrant loop on the write path, and a
   * bounded one is not.
   *
   * The docblock this replaces said the staleness "heals on the next write", and
   * that was accurate at the time rather than wrong - it is simply no longer the
   * mechanism.
   */
  private async regenerate(userId: string, reason: string): Promise<void> {
    try {
      await this.insights.generate(userId);
    } catch (error) {
      if (error instanceof ConflictException) {
        this.insights.markDirty(userId);
        this.logger.debug(
          `Insight generation for user ${userId} deferred (${reason}): a run is already in flight, and the account is marked dirty so that run starts one more.`,
        );
        return;
      }
      this.logger.error(
        `Insight generation for user ${userId} could not be started (${reason}); the write stands.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
