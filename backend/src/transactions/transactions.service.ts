import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { newId } from '../common/ids';
import { fromCents, toCents } from '../common/money';
import type { UserDatabase } from '../database/database.types';
import { UserDatabaseService } from '../database/user-database.service';
import {
  categories,
  transactions,
  type TransactionRow,
} from '../database/user/schema';
import type { CreateTransactionDto } from './dto/create-transaction.dto';
import type { TransactionResponseDto } from './dto/transaction-response.dto';
import type { UpdateTransactionDto } from './dto/update-transaction.dto';

const NO_TRANSACTION = 'Transaction not found.';
const NO_CATEGORY = 'Category not found.';
const NOTHING_TO_UPDATE = 'Provide at least one field to update.';

/** The sparse column set an UPDATE applies. Never includes `updatedAt`. */
type TransactionUpdate = Partial<
  Pick<
    TransactionRow,
    'merchant' | 'categoryId' | 'amountCents' | 'date' | 'note'
  >
>;

/**
 * Create, update and delete over one user's transactions.
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
  constructor(private readonly userDatabases: UserDatabaseService) {}

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
