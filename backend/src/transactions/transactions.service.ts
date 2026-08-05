import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  isNull,
  like,
  lt,
  ne,
  type SQL,
} from 'drizzle-orm';
import { CategoriesService } from '../categories/categories.service';
import { newId } from '../common/ids';
import { fromCents, toCents } from '../common/money';
import type { MonthWindow } from '../common/month-window';
import type { UserDatabase } from '../database/database.types';
import { UserDatabaseService } from '../database/user-database.service';
import {
  categories,
  transactions,
  type TransactionRow,
} from '../database/user/schema';
import type { CreateTransactionDto } from './dto/create-transaction.dto';
import {
  DEFAULT_PERIOD,
  DEFAULT_SORT,
  type ListTransactionsQueryDto,
  type TransactionSort,
} from './dto/list-transactions-query.dto';
import type { TransactionResponseDto } from './dto/transaction-response.dto';
import type {
  TransactionDetailResponseDto,
  TransactionsResponseDto,
} from './dto/transactions-response.dto';
import type { UpdateTransactionDto } from './dto/update-transaction.dto';

const NO_TRANSACTION = 'Transaction not found.';
const NO_CATEGORY = 'Category not found.';
const NOTHING_TO_UPDATE = 'Provide at least one field to update.';

/**
 * How many siblings the transaction detail's "Recent in {category}" card shows.
 *
 * Five where DET-5 draws three, because the viewed transaction is excluded and
 * the mock counted it as one of its three. Five leaves the card more than the
 * mock's two siblings while still reading as a short list rather than a second
 * table.
 */
const RECENT_IN_CATEGORY_LIMIT = 5;

/** The sparse column set an UPDATE applies. Never includes `updatedAt`. */
type TransactionUpdate = Partial<
  Pick<
    TransactionRow,
    'merchant' | 'categoryId' | 'amountCents' | 'date' | 'note'
  >
>;

/**
 * Reads and writes over one user's transactions.
 *
 * **Nothing month-scoped is computed here.** The list's period filter and the
 * detail read's category progress both come from `CategoriesService`, which owns
 * the app's only month aggregation. Resolving a window or summing a category's
 * spend in this file would put a second copy of that arithmetic behind a second
 * screen, and the Categories screen and the transaction detail would disagree the
 * first time a status threshold moved.
 *
 * **Cross-user isolation is structural, not enforced here.** Every method opens
 * the caller's own database, so user B's database simply has no row carrying
 * user A's transaction id and the ordinary 404 covers it. There is no
 * `WHERE user_id = ?` to forget, because there is no user column to have.
 *
 * **No `db.transaction()` anywhere in this file, deliberately.** Every write is
 * a single statement, so `LoginTokenService.issue()` stays the only
 * transactional call site in the app and the embedded driver's refusal to
 * overlap transactions is never tested. The category check ahead of a write is a
 * plain SELECT, and check-then-insert is not a race today: categories have no
 * delete endpoint yet, and once they get one it will tombstone, at which point a
 * dangling reference is exactly what an FK-less schema already obliges every
 * read to tolerate.
 *
 * Money crosses units here and nowhere else in the feature: `toCents` on the way
 * in, `fromCents` on the way out.
 */
@Injectable()
export class TransactionsService {
  constructor(
    private readonly userDatabases: UserDatabaseService,
    private readonly categories: CategoriesService,
  ) {}

  /**
   * The filtered, sorted list plus the count after filters.
   *
   * Every filter is optional and they compose into one `and()`, so an absent one
   * contributes no predicate rather than a wildcard. `period` defaults to the
   * current window, which is what TRN-3's filter already reads.
   *
   * **`total` is the post-filter count and equals `transactions.length`.** There
   * is no pagination (A11, TRN-6), so no second query counts anything; it is
   * returned as its own field so a future page size cannot silently turn TRN-2's
   * badge into a page count.
   */
  async list(
    userId: string,
    query: ListTransactionsQueryDto,
  ): Promise<TransactionsResponseDto> {
    const db = await this.userDatabases.getUserDb(userId);
    const window = await this.resolveWindow(userId, query.period);

    const rows = await db
      .select()
      .from(transactions)
      .where(and(...this.predicates(query, window)))
      .orderBy(...orderFor(query.sort ?? DEFAULT_SORT));

    const list = rows.map(toResponse);

    return { transactions: list, total: list.length };
  }

  /**
   * One transaction with the two pieces of context frame 08 draws around it.
   *
   * **Three queries with two different windows, deliberately.** The row itself,
   * then the category's progress for the **current** period (AC4), then the latest
   * transactions in that category with **no date predicate at all** (AC5, which
   * DET-5's September row is the proof of). Serving both context pieces from one
   * window would be wrong in one direction or the other.
   *
   * @throws NotFoundException if the id names no live transaction.
   */
  async detail(
    userId: string,
    id: string,
  ): Promise<TransactionDetailResponseDto> {
    const db = await this.userDatabases.getUserDb(userId);

    const [row] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), isNull(transactions.deletedAt)))
      .limit(1);

    // Covers an unknown id, another account's id and an already tombstoned one,
    // none of which this caller is entitled to tell apart.
    if (!row) {
      throw new NotFoundException(NO_TRANSACTION);
    }

    // Not `Promise.all`: the embedded driver is happier with sequential
    // statements on one connection, and this is a read of two rows on a database
    // the caller already has open.
    const category = await this.categories.monthStatsFor(
      userId,
      row.categoryId,
    );
    const recentInCategory = await this.recentInCategory(db, row);

    return {
      transaction: toResponse(row),
      category,
      recentInCategory: recentInCategory.map(toResponse),
    };
  }

  /** @throws NotFoundException if `categoryId` names no live category. */
  async create(
    userId: string,
    dto: CreateTransactionDto,
  ): Promise<TransactionResponseDto> {
    const db = await this.userDatabases.getUserDb(userId);
    await this.assertCategoryExists(db, dto.categoryId);

    const [row] = await db
      .insert(transactions)
      .values({
        // Caller-supplied, like every id in both scopes - the schema declares no
        // $defaultFn for them.
        id: newId(),
        merchant: dto.merchant,
        categoryId: dto.categoryId,
        amountCents: toCents(dto.amount),
        // Verbatim. No `new Date(dto.date)` anywhere in this file: parsing it
        // would shift the day across timezones for no gain.
        date: dto.date,
        // Explicit, so an omitted note is a null column rather than a missing
        // key that reads back as undefined.
        note: dto.note ?? null,
      })
      .returning();

    return toResponse(row);
  }

  /**
   * @throws BadRequestException if the body changes nothing.
   * @throws NotFoundException if the id names no live transaction, or a supplied
   * `categoryId` names no live category.
   */
  async update(
    userId: string,
    id: string,
    dto: UpdateTransactionDto,
  ): Promise<TransactionResponseDto> {
    const set = buildUpdate(dto);

    // First, and ahead of even opening the database. A bare UPDATE would still
    // bump `updated_at` through $onUpdateFn, so an empty body would record an
    // edit that changed nothing.
    if (Object.keys(set).length === 0) {
      throw new BadRequestException(NOTHING_TO_UPDATE);
    }

    const db = await this.userDatabases.getUserDb(userId);

    if (dto.categoryId !== undefined) {
      await this.assertCategoryExists(db, dto.categoryId);
    }

    const [row] = await db
      .update(transactions)
      .set(set)
      .where(and(eq(transactions.id, id), isNull(transactions.deletedAt)))
      .returning();

    // Covers all three of: no such id, someone else's id, and an id already
    // tombstoned - none of which this caller is entitled to tell apart.
    if (!row) {
      throw new NotFoundException(NO_TRANSACTION);
    }

    return toResponse(row);
  }

  /**
   * Tombstones the row. Permanent as far as any client can tell - nothing reads
   * a row with `deleted_at` set - but the row survives so a future offline sync
   * cannot resurrect it under a delete-update conflict.
   *
   * One conditional UPDATE, never a read followed by a write: the await between
   * a check and a mark is exactly where two concurrent deletes would both pass.
   *
   * @throws NotFoundException if the id names no live transaction.
   */
  async remove(userId: string, id: string): Promise<void> {
    const db = await this.userDatabases.getUserDb(userId);

    const [row] = await db
      .update(transactions)
      .set({ deletedAt: new Date() })
      .where(and(eq(transactions.id, id), isNull(transactions.deletedAt)))
      .returning({ id: transactions.id });

    if (!row) {
      throw new NotFoundException(NO_TRANSACTION);
    }
  }

  /**
   * The date window a `period` names, or null for `all`.
   *
   * Both windows come from `CategoriesService`, so `monthStartDay` and
   * `APP_TIMEZONE` are read in exactly one place in the app. `all` resolves to
   * null rather than to an enormous window, so it costs no profile read and adds
   * no predicate.
   */
  private async resolveWindow(
    userId: string,
    period: ListTransactionsQueryDto['period'],
  ): Promise<MonthWindow | null> {
    switch (period ?? DEFAULT_PERIOD) {
      case 'current':
        return this.categories.currentWindow(userId);
      case 'previous':
        return this.categories.previousWindow(userId);
      case 'all':
        return null;
    }
  }

  /**
   * Every predicate the list applies, ready for one `and()`.
   *
   * The tombstone filter is unconditional and first. The rest are pushed only when
   * their filter was supplied, so an absent filter contributes nothing at all
   * rather than a predicate that happens to match everything.
   */
  private predicates(
    query: ListTransactionsQueryDto,
    window: MonthWindow | null,
  ): SQL[] {
    const where: SQL[] = [isNull(transactions.deletedAt)];

    if (window) {
      // Half-open, matching the window's own contract: text compared against the
      // text column, served as a range scan by `transactions_date_idx`, and no
      // last-day-of-month arithmetic anywhere.
      where.push(gte(transactions.date, window.start));
      where.push(lt(transactions.date, window.end));
    }

    if (query.categoryId) {
      where.push(eq(transactions.categoryId, query.categoryId));
    }

    // Already trimmed by the DTO, so an empty string here means the term was
    // whitespace. No predicate rather than `LIKE '%%'` - the same result, one
    // less scan. `LIKE` is case-insensitive for ASCII only, which is what the
    // DTO's description warns about and docs/TODO.md records.
    if (query.search) {
      where.push(like(transactions.merchant, `%${query.search}%`));
    }

    return where;
  }

  /**
   * The latest live transactions in the same category, any month.
   *
   * **No date predicate at all**, which is the whole difference between this and
   * the category stats beside it: AC5 wants the latest in the category regardless
   * of period, and DET-5's September row is the proof that the mock means it.
   *
   * The viewed transaction is excluded. It is already the header, the amount card
   * and a row in the details card, so a fourth appearance is noise - a deliberate
   * deviation from DET-5, whose first row is the viewed transaction itself.
   */
  private async recentInCategory(
    db: UserDatabase,
    row: TransactionRow,
  ): Promise<TransactionRow[]> {
    return db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.categoryId, row.categoryId),
          ne(transactions.id, row.id),
          isNull(transactions.deletedAt),
        ),
      )
      .orderBy(...orderFor('date_desc'))
      .limit(RECENT_IN_CATEGORY_LIMIT);
  }

  /**
   * A 404 rather than a 400 for an unknown category, which keeps 400 meaning
   * "the shape of this request was rejected". The id is well-formed and the
   * resource it names does not exist - that is what 404 is for.
   */
  private async assertCategoryExists(
    db: UserDatabase,
    categoryId: string,
  ): Promise<void> {
    const [category] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, categoryId), isNull(categories.deletedAt)))
      .limit(1);

    if (!category) {
      throw new NotFoundException(NO_CATEGORY);
    }
  }
}

/**
 * The ORDER BY for a sort, tiebreaks included.
 *
 * **The tiebreaks are not optional.** `date` is a calendar day, so several rows
 * share one routinely, and SQLite is free to return them in any order it likes -
 * which means the list would reshuffle between two identical requests for no
 * visible reason. `created_at` descending puts the most recently logged first,
 * and `id` settles the remainder: UUIDv7 is time-ordered, so even that tiebreak
 * reads as newest-first rather than arbitrary.
 *
 * Both tiebreaks stay descending under `date_asc`. Reversing them too would sort
 * a same-day group oldest-first inside a list the user asked to see
 * oldest-first, which is defensible, but "newest first within the day" is what
 * makes the most recently added transaction findable under either sort.
 */
function orderFor(sort: TransactionSort): SQL[] {
  return [
    sort === 'date_asc' ? asc(transactions.date) : desc(transactions.date),
    desc(transactions.createdAt),
    desc(transactions.id),
  ];
}

/**
 * The provided fields only, so absent ones are left alone.
 *
 * `updatedAt` is deliberately absent: drizzle v1's `buildUpdateSet` applies
 * every `$onUpdateFn` column itself on any UPDATE, so setting it here would be
 * both redundant and a second source of truth for the same timestamp.
 */
function buildUpdate(dto: UpdateTransactionDto): TransactionUpdate {
  const set: TransactionUpdate = {};

  if (dto.merchant !== undefined) set.merchant = dto.merchant;
  if (dto.categoryId !== undefined) set.categoryId = dto.categoryId;
  if (dto.amount !== undefined) set.amountCents = toCents(dto.amount);
  if (dto.date !== undefined) set.date = dto.date;
  // Null is a real value here - it clears the note - so this checks undefined
  // rather than falsiness.
  if (dto.note !== undefined) set.note = dto.note;

  return set;
}

/** A stored row as the API describes it: major units, ISO instants. */
function toResponse(row: TransactionRow): TransactionResponseDto {
  return {
    id: row.id,
    merchant: row.merchant,
    categoryId: row.categoryId,
    amount: fromCents(row.amountCents),
    date: row.date,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
