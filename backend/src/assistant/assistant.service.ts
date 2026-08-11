import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { and, asc, count, desc, eq, isNull } from 'drizzle-orm';
import { CategoriesService } from '../categories/categories.service';
import { newId } from '../common/ids';
import type { UserDatabase } from '../database/database.types';
import { UserDatabaseService } from '../database/user-database.service';
import {
  assistantMessages,
  assistantSessions,
  categories,
  profile,
  transactions,
} from '../database/user/schema';
import { PeriodService } from '../periods/period.service';
import { AssistantCompletionService } from './assistant-completion.service';
import {
  deriveSessionTitle,
  type AssistantPromptContext,
  type AssistantTransactionRow,
  type AssistantTruncation,
} from './assistant-context.builder';
import {
  MAX_HISTORY_MESSAGES,
  MAX_PROMPT_TRANSACTIONS,
} from './assistant.constants';
import type {
  AssistantMessageDto,
  AssistantRole,
} from './dto/assistant-message-response.dto';
import type {
  AssistantConversationResponseDto,
  AssistantSessionCountResponseDto,
  AssistantSessionsResponseDto,
} from './dto/assistant-sessions-response.dto';
import type { SendMessageDto } from './dto/send-message.dto';
import type { SendMessageResponseDto } from './dto/send-message-response.dto';

const NOT_CONFIGURED = 'The assistant is not configured.';
const NO_SESSION = 'No such conversation.';

/**
 * What makes a conversation live, written once (PET-76).
 *
 * Both `sessionCount()` and `sessions()` publish a `total` over this condition,
 * and the two have to agree. A second hand-written `isNull(deletedAt)` is how one
 * of them silently starts counting tombstones - the failure mode nothing would
 * catch, because both numbers stay plausible.
 */
const LIVE_SESSION = isNull(assistantSessions.deletedAt);
const NO_PROFILE = (userId: string) =>
  `No profile row for user ${userId}; verification inserts one for every account.`;

/**
 * One turn of the assistant chat: the reads that build the prompt, the model
 * call, and the single write that records the exchange.
 *
 * **Compose, do not compute.** The window comes from `PeriodService.current`,
 * the budget from `PeriodService.budgetCentsFor`, and the per-category caps from
 * `CategoriesService.list` - never resolved here. `profile.currency` is read
 * directly, which is the one static field neither service surfaces and what
 * `RuleBasedInsightGenerator` already does.
 *
 * **The transaction digest is this service's own query**, not
 * `TransactionsService.list()`: that read is period-filtered and returns DTOs
 * carrying no category name, so it is the expensive path for data it cannot
 * fully supply. `ReceiptScanService`'s merchant-history read is the precedent for
 * a feature service reading `transactions` and `categories` directly.
 *
 * **Nothing is persisted unless the reply arrives.** The model is called first,
 * then the session row (on a first message), the question and the answer are
 * written in **one** `db.transaction()`. That is what lets `assistant_messages`
 * carry no status column and no lifecycle at all, and it is also what makes a
 * cancelled turn store nothing at no extra cost - the abort throws before any
 * write. What it costs is that a failed call loses the question, which the
 * composer holds client-side and puts back.
 */
@Injectable()
export class AssistantService {
  constructor(
    private readonly userDatabases: UserDatabaseService,
    private readonly completion: AssistantCompletionService,
    private readonly categories: CategoriesService,
    private readonly periods: PeriodService,
  ) {}

  /**
   * @param signal The request's own, from the route's `@Req()`. Hop 3 of the
   * abort chain - see `AssistantCompletionService.complete`.
   * @throws ServiceUnavailableException if `GEMINI_API_KEY` is unset.
   * @throws NotFoundException if `sessionId` names no live session of the
   * caller's.
   * @throws GatewayTimeoutException if the model call does not finish in time.
   */
  async send(
    userId: string,
    dto: SendMessageDto,
    signal?: AbortSignal,
  ): Promise<SendMessageResponseDto> {
    // Checked **before the user database is opened**, exactly as
    // `ReceiptScanService.scan` does, so an unconfigured deployment costs no
    // wasted reads.
    if (!this.completion.isConfigured()) {
      throw new ServiceUnavailableException(NOT_CONFIGURED);
    }

    const db = await this.userDatabases.getUserDb(userId);

    const session = dto.sessionId
      ? await this.liveSession(db, dto.sessionId)
      : null;
    const history = session ? await this.recentMessages(db, session.id) : [];

    const context = await this.buildContext(userId, db);
    const answer = await this.completion.complete(
      context,
      history.map(({ role, content }) => ({ role, content })),
      dto.message,
      signal,
    );

    // The two messages of a turn are written inside one transaction and
    // therefore share a millisecond, which is why `sort_order` exists rather
    // than a `created_at` tiebreak. The newest live row is the last of the
    // history read, which is ordered ascending.
    const nextSort =
      history.length === 0 ? 0 : history[history.length - 1].sortOrder + 1;

    const now = new Date();
    const sessionId = session?.id ?? newId();
    const title = session?.title ?? deriveSessionTitle(dto.message);
    const questionId = newId();
    const answerId = newId();

    // One transaction per turn. Both tables are user-scope so a transaction is
    // genuinely available, and this is a single synchronous call site with
    // nothing floated - so the embedded driver's refusal of *overlapping*
    // transactions is not in play.
    await db.transaction(async (tx) => {
      if (!session) {
        await tx.insert(assistantSessions).values({
          id: sessionId,
          title,
          lastMessageAt: now,
          createdAt: now,
        });
      } else {
        await tx
          .update(assistantSessions)
          .set({ lastMessageAt: now })
          .where(eq(assistantSessions.id, sessionId));
      }

      await tx.insert(assistantMessages).values([
        {
          id: questionId,
          sessionId,
          role: 'user',
          content: dto.message,
          sortOrder: nextSort,
          createdAt: now,
        },
        {
          id: answerId,
          sessionId,
          role: 'assistant',
          content: answer,
          sortOrder: nextSort + 1,
          createdAt: now,
        },
      ]);
    });

    return {
      sessionId,
      title,
      message: {
        id: questionId,
        role: 'user',
        content: dto.message,
        createdAt: now.toISOString(),
      },
      reply: {
        id: answerId,
        role: 'assistant',
        content: answer,
        createdAt: now.toISOString(),
      },
      truncation: context.truncation,
    };
  }

  /**
   * How many live conversations there are, without reading them.
   *
   * **One `count(*)` rather than a list whose length is taken**, because its
   * caller is the tab bar on the *Chat* route, which wants the number and has no
   * use for the rows. `dto/assistant-sessions-response.dto.ts` carries why that
   * is worth an endpoint of its own.
   *
   * **It shares its predicate with `sessions()` below rather than restating
   * it.** The two figures are published as the same field name and have to mean
   * the same thing, and a second hand-written `isNull(deletedAt)` is how one of
   * them silently starts counting tombstones. `sessions()` keeps deriving its
   * own `total` from the rows it already holds - counting again in SQL there
   * would be a second round trip for a number in hand - so what is single-
   * sourced is the **condition**, which is the half that can drift.
   */
  async sessionCount(
    userId: string,
  ): Promise<AssistantSessionCountResponseDto> {
    const db = await this.userDatabases.getUserDb(userId);

    const [row] = await db
      .select({ total: count() })
      .from(assistantSessions)
      .where(LIVE_SESSION);

    // Defensive rather than reachable: an aggregate with no GROUP BY always
    // returns exactly one row. A missing one would be a driver fault, and
    // answering 0 is the honest reading of "no conversations counted".
    return { total: row?.total ?? 0 };
  }

  /** Every live conversation, newest activity first. */
  async sessions(userId: string): Promise<AssistantSessionsResponseDto> {
    const db = await this.userDatabases.getUserDb(userId);

    const rows = await db
      .select({
        id: assistantSessions.id,
        title: assistantSessions.title,
        lastMessageAt: assistantSessions.lastMessageAt,
        createdAt: assistantSessions.createdAt,
      })
      .from(assistantSessions)
      .where(LIVE_SESSION)
      .orderBy(
        desc(assistantSessions.lastMessageAt),
        desc(assistantSessions.id),
      );

    const sessions = rows.map((row) => ({
      id: row.id,
      title: row.title,
      lastMessageAt: row.lastMessageAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    }));

    return { sessions, total: sessions.length };
  }

  /**
   * One conversation with its messages, for resuming it.
   *
   * @throws NotFoundException for an unknown or tombstoned session. Cross-user
   * isolation is structural: every method opens the caller's own database, so
   * another user's session id simply does not exist here.
   */
  async conversation(
    userId: string,
    sessionId: string,
  ): Promise<AssistantConversationResponseDto> {
    const db = await this.userDatabases.getUserDb(userId);
    const session = await this.liveSession(db, sessionId);
    const messages = await this.allMessages(db, sessionId);

    return {
      id: session.id,
      title: session.title,
      lastMessageAt: session.lastMessageAt.toISOString(),
      createdAt: session.createdAt.toISOString(),
      messages: messages.map(toMessageDto),
    };
  }

  private async liveSession(db: UserDatabase, sessionId: string) {
    const [row] = await db
      .select({
        id: assistantSessions.id,
        title: assistantSessions.title,
        lastMessageAt: assistantSessions.lastMessageAt,
        createdAt: assistantSessions.createdAt,
      })
      .from(assistantSessions)
      .where(
        and(
          eq(assistantSessions.id, sessionId),
          isNull(assistantSessions.deletedAt),
        ),
      )
      .limit(1);

    if (!row) {
      throw new NotFoundException(NO_SESSION);
    }

    return row;
  }

  /**
   * The tail of a conversation, oldest first.
   *
   * Capped at `MAX_HISTORY_MESSAGES` because every turn re-sends the whole
   * conversation on top of a prompt that is already tens of thousands of tokens.
   * Read newest-first and reversed, so the cap drops the **oldest** messages,
   * which is the right end to lose.
   */
  private async recentMessages(db: UserDatabase, sessionId: string) {
    const rows = await db
      .select({
        role: assistantMessages.role,
        content: assistantMessages.content,
        sortOrder: assistantMessages.sortOrder,
      })
      .from(assistantMessages)
      .where(
        and(
          eq(assistantMessages.sessionId, sessionId),
          isNull(assistantMessages.deletedAt),
        ),
      )
      .orderBy(desc(assistantMessages.sortOrder))
      .limit(MAX_HISTORY_MESSAGES);

    return rows
      .map((row) => ({ ...row, role: row.role as AssistantRole }))
      .reverse();
  }

  private async allMessages(db: UserDatabase, sessionId: string) {
    return db
      .select({
        id: assistantMessages.id,
        role: assistantMessages.role,
        content: assistantMessages.content,
        createdAt: assistantMessages.createdAt,
      })
      .from(assistantMessages)
      .where(
        and(
          eq(assistantMessages.sessionId, sessionId),
          isNull(assistantMessages.deletedAt),
        ),
      )
      .orderBy(asc(assistantMessages.sortOrder), asc(assistantMessages.id));
  }

  /** Everything the prompt quotes, resolved through the services that own it. */
  private async buildContext(
    userId: string,
    db: UserDatabase,
  ): Promise<AssistantPromptContext> {
    const period = await this.periods.current(userId);
    const budgetCents = await this.periods.budgetCentsFor(userId, period);
    const { categories: categoryRows } = await this.categories.list(
      userId,
      undefined,
      period,
    );

    const [profileRow] = await db
      .select({ currency: profile.currency })
      .from(profile)
      .where(isNull(profile.deletedAt))
      .limit(1);

    if (!profileRow) {
      // A verified session implies a profile row, so its absence is a broken
      // invariant rather than a 404 - the pattern `ProfileService` sets.
      throw new Error(NO_PROFILE(userId));
    }

    const fallbackName =
      categoryRows.find((row) => row.isFallback)?.name ?? 'Uncategorized';
    const { rows, truncation } = await this.digest(db, fallbackName);

    return {
      today: period.today,
      currency: profileRow.currency,
      period: { start: period.start, end: period.end, label: period.label },
      budgetCents,
      categories: categoryRows.map((row) => ({
        name: row.name,
        cap: row.monthlyCap,
      })),
      transactions: rows,
      truncation,
    };
  }

  /**
   * Every live transaction, newest first, capped.
   *
   * Three decisions in this query.
   *
   * **A `LEFT` join, not the inner join receipt scanning uses.** An inner join is
   * right there - a merchant with no live category teaches the model nothing -
   * and wrong here, because it would silently drop money through the
   * dangling-category race `## Transaction endpoints` documents, and the
   * assistant would then answer "how much did I spend" with a number that is
   * wrong and unexplainable. A null name folds onto the account's own fallback
   * category, which is `CategoriesService.withSpend`'s fold applied here and what
   * keeps the assistant's totals agreeing with the donut's.
   *
   * **`ORDER BY date DESC` with the `created_at`, `id` tiebreak**, for the reason
   * `TransactionsService` already gives: a calendar day is shared routinely and
   * without a tiebreak the order reshuffles between two identical requests.
   * Newest first, so a truncation drops the oldest rows. Served by
   * `transactions_date_idx`.
   *
   * **`limit N + 1`**, so this knows it truncated without a second `count(*)` on
   * every turn; the count is taken only when the extra row comes back.
   */
  private async digest(
    db: UserDatabase,
    fallbackName: string,
  ): Promise<{
    rows: AssistantTransactionRow[];
    truncation: AssistantTruncation | null;
  }> {
    const found = await db
      .select({
        date: transactions.date,
        merchant: transactions.merchant,
        amountCents: transactions.amountCents,
        categoryName: categories.name,
      })
      .from(transactions)
      .leftJoin(
        categories,
        and(
          eq(categories.id, transactions.categoryId),
          isNull(categories.deletedAt),
        ),
      )
      .where(isNull(transactions.deletedAt))
      .orderBy(
        desc(transactions.date),
        desc(transactions.createdAt),
        desc(transactions.id),
      )
      .limit(MAX_PROMPT_TRANSACTIONS + 1);

    const kept = found.slice(0, MAX_PROMPT_TRANSACTIONS);
    const rows: AssistantTransactionRow[] = kept.map((row) => ({
      date: row.date,
      merchant: row.merchant,
      amountCents: row.amountCents,
      categoryName: row.categoryName ?? fallbackName,
    }));

    if (found.length <= MAX_PROMPT_TRANSACTIONS) {
      return { rows, truncation: null };
    }

    const [total] = await db
      .select({ value: count() })
      .from(transactions)
      .where(isNull(transactions.deletedAt));

    return {
      rows,
      truncation: {
        included: rows.length,
        total: Number(total.value),
        oldestIncludedDate: rows[rows.length - 1].date,
      },
    };
  }
}

function toMessageDto(row: {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
}): AssistantMessageDto {
  return {
    id: row.id,
    role: row.role as AssistantRole,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  };
}
