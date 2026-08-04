import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { newId } from '../common/ids';
import { fromCents, toCents } from '../common/money';
import { monthWindow, todayIn, type MonthWindow } from '../common/month-window';
import type { UserDatabase } from '../database/database.types';
import { UserDatabaseService } from '../database/user-database.service';
import {
  categories,
  profile,
  transactions,
  type CategoryRow,
} from '../database/user/schema';
import type {
  CategoryResponseDto,
  CategoryStatus,
} from './dto/category-response.dto';
import type { CategoriesResponseDto } from './dto/categories-response.dto';
import type { CreateCategoryDto } from './dto/create-category.dto';
import type { UpdateCategoryDto } from './dto/update-category.dto';

const NO_CATEGORY = 'Category not found.';
const NOTHING_TO_UPDATE = 'Provide at least one field to update.';
const NO_DELETE_FALLBACK =
  'The Uncategorized category cannot be deleted: it is where deleting any other category moves its transactions.';
const NO_RENAME_FALLBACK =
  'The Uncategorized category cannot be renamed. Its cap, color, icon and note can all be changed.';
const NO_PROFILE = (userId: string) =>
  `Profile row missing for user ${userId}; a verified session implies one exists.`;
const NO_FALLBACK = (userId: string) =>
  `No fallback category for user ${userId}; provisioning seeds one for every account.`;

/** The sparse column set an UPDATE applies. Never includes `updatedAt`. */
type CategoryUpdate = Partial<
  Pick<CategoryRow, 'name' | 'color' | 'monthlyCapCents' | 'icon' | 'note'>
>;

/** One category's row plus its aggregates for the period, straight from SQL. */
interface CategoryWithSpend {
  row: CategoryRow;
  spentCents: number;
  transactionCount: number;
}

/**
 * Categories, their month stats and the budget allocation summary.
 *
 * **Every figure here is derived on read and none of it is stored.** There is no
 * month column on `transactions` and there must not be one: a category's spend
 * for a period is a SUM over `transactions.date` read against the window this
 * service resolves, which is what makes a backdated transaction land in its own
 * month and a changed `monthStartDay` re-bucket history correctly.
 *
 * **Cross-user isolation is structural, not enforced here.** Every method opens
 * the caller's own database, so another user's category id simply does not exist
 * in it and the ordinary 404 covers the case. There is no `WHERE user_id = ?` to
 * forget, because there is no user column to have.
 *
 * **No `db.transaction()` anywhere in this file, deliberately** - including in
 * `remove`, which is the one operation with two writes. Both tables are in the
 * same database so a transaction is genuinely available, but
 * `backend/CLAUDE.md` records that `LoginTokenService.issue()` is the app's only
 * transactional call site on purpose: the embedded driver refuses overlapping
 * transactions rather than queueing them, so a second call site means two quick
 * deletes on one user's database collide. Ordering solves the same problem for
 * free - see `remove`.
 */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly userDatabases: UserDatabaseService,
    private readonly config: ConfigService,
  ) {}

  /** Live categories with their month stats, plus the allocation summary. */
  async list(userId: string): Promise<CategoriesResponseDto> {
    const db = await this.userDatabases.getUserDb(userId);
    const { window, monthlyBudgetCents } = await this.period(db, userId);
    const rows = await this.withSpend(db, window);

    // Uncapped categories contribute nothing, which is what lets `unallocated`
    // sit near the full budget for someone who caps little. Correct, and not a
    // state frame 13 anticipates.
    const allocatedCents = rows.reduce(
      (total, { row }) => total + (row.monthlyCapCents ?? 0),
      0,
    );

    return {
      categories: rows.map(toResponse),
      allocation: {
        monthlyBudget: fromCents(monthlyBudgetCents),
        allocated: fromCents(allocatedCents),
        // Unclamped: nothing prevents caps exceeding the budget (A43), and the
        // magnitude is what a future over-allocation state would need.
        unallocated: fromCents(monthlyBudgetCents - allocatedCents),
      },
    };
  }

  /**
   * Creates a category. A cap is optional; absent means uncapped.
   *
   * @throws BadRequestException via the DTO for a cap of zero or less.
   */
  async create(
    userId: string,
    dto: CreateCategoryDto,
  ): Promise<CategoryResponseDto> {
    const db = await this.userDatabases.getUserDb(userId);

    const [created] = await db
      .insert(categories)
      .values({
        id: newId(),
        name: dto.name,
        color: dto.color,
        monthlyCapCents:
          dto.monthlyCap === undefined ? null : toCents(dto.monthlyCap),
        icon: dto.icon ?? null,
        note: dto.note ?? null,
        // Never settable through the API: the fallback is seeded at
        // provisioning and the partial unique index would reject a second one.
        isFallback: false,
      })
      .returning();

    // A brand-new category cannot have transactions, so its stats are zero
    // without asking. That is why this method never resolves the period: the
    // profile read it would cost buys a window nothing here would query.
    return toResponse({ row: created, spentCents: 0, transactionCount: 0 });
  }

  /**
   * Applies a sparse change.
   *
   * @throws BadRequestException if the body carries no field at all.
   * @throws NotFoundException if the id names no live category.
   * @throws ConflictException on renaming the fallback.
   */
  async update(
    userId: string,
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    const changes = toUpdate(dto);

    // Before the database is even opened: a bare UPDATE would still bump
    // `updated_at` through `$onUpdateFn` and record an edit that changed
    // nothing. Same reasoning as UpdateTransactionDto's.
    if (Object.keys(changes).length === 0) {
      throw new BadRequestException(NOTHING_TO_UPDATE);
    }

    const db = await this.userDatabases.getUserDb(userId);
    const existing = await this.liveCategory(db, id);

    if (existing.isFallback && changes.name !== undefined) {
      throw new ConflictException(NO_RENAME_FALLBACK);
    }

    const [updated] = await db
      .update(categories)
      // Never sets `updatedAt` by hand: drizzle v1's buildUpdateSet applies
      // `$onUpdateFn` columns itself.
      .set(changes)
      .where(and(eq(categories.id, id), isNull(categories.deletedAt)))
      .returning();

    const { window } = await this.period(db, userId);
    const [spend] = await this.withSpend(db, window, id);

    return toResponse({
      row: updated,
      spentCents: spend?.spentCents ?? 0,
      transactionCount: spend?.transactionCount ?? 0,
    });
  }

  /**
   * Deletes a category, moving its transactions to the fallback.
   *
   * **Two writes, ordered rather than wrapped.** Reassign first, tombstone
   * second: a failure in between leaves the transactions on `Uncategorized` and
   * this category live but empty, which is visible, harmless and fixed by
   * retrying. The reverse order would strand rows pointing at a tombstone. That
   * is what makes skipping the transaction safe here, and it would not be if the
   * two writes were order-independent.
   *
   * **The reassignment sweeps tombstoned transactions too.** They are invisible
   * through the API either way, but leaving them pointed at a category that no
   * longer exists would put a dangling reference into exactly the record the
   * tombstones exist to serve, the future offline sync.
   *
   * @throws NotFoundException if the id names no live category.
   * @throws ConflictException on deleting the fallback itself.
   */
  async remove(userId: string, id: string): Promise<void> {
    const db = await this.userDatabases.getUserDb(userId);
    const existing = await this.liveCategory(db, id);

    if (existing.isFallback) {
      throw new ConflictException(NO_DELETE_FALLBACK);
    }

    const fallback = await this.fallbackId(db, userId);

    // Deliberately no `isNull(transactions.deletedAt)` filter - see the note
    // above. A category with no transactions updates zero rows, which needs no
    // special case.
    await db
      .update(transactions)
      .set({ categoryId: fallback })
      .where(eq(transactions.categoryId, id));

    await db
      .update(categories)
      .set({ deletedAt: new Date() })
      .where(and(eq(categories.id, id), isNull(categories.deletedAt)));
  }

  /**
   * The caller's budgeting period and monthly budget.
   *
   * "Today" is resolved in `APP_TIMEZONE`, not UTC: on the boundary day a
   * transaction logged just after local midnight would otherwise fall into the
   * previous period, and the whole screen would show the wrong month for a few
   * hours. A per-user timezone is the eventual fix (docs/TODO.md).
   */
  private async period(
    db: UserDatabase,
    userId: string,
  ): Promise<{ window: MonthWindow; monthlyBudgetCents: number }> {
    const [row] = await db
      .select({
        monthStartDay: profile.monthStartDay,
        monthlyBudgetCents: profile.monthlyBudgetCents,
      })
      .from(profile)
      .where(eq(profile.id, userId))
      .limit(1);

    // A verified session implies a profile row, so its absence is a broken
    // invariant rather than a 404 a client could act on - the same call
    // ProfileService makes.
    if (!row) {
      throw new Error(NO_PROFILE(userId));
    }

    return {
      window: monthWindow(
        row.monthStartDay,
        todayIn(this.config.get<string>('APP_TIMEZONE', 'Europe/Zagreb')),
      ),
      monthlyBudgetCents: row.monthlyBudgetCents,
    };
  }

  /**
   * Live categories with their spend for the window, in one grouped query.
   *
   * A LEFT JOIN, so a category with no transactions still comes back, with the
   * `coalesce` turning SQL's NULL sum into a real zero. The date predicates sit
   * in the join condition rather than the WHERE clause: in a WHERE they would
   * filter out the category rows themselves, silently hiding every category that
   * happened to have no spend this period.
   */
  private async withSpend(
    db: UserDatabase,
    window: MonthWindow,
    onlyId?: string,
  ): Promise<CategoryWithSpend[]> {
    const rows = await db
      .select({
        row: categories,
        spentCents: sql<number>`coalesce(sum(${transactions.amountCents}), 0)`,
        transactionCount: sql<number>`count(${transactions.id})`,
      })
      .from(categories)
      .leftJoin(
        transactions,
        and(
          eq(transactions.categoryId, categories.id),
          isNull(transactions.deletedAt),
          gte(transactions.date, window.start),
          lt(transactions.date, window.end),
        ),
      )
      .where(
        onlyId
          ? and(eq(categories.id, onlyId), isNull(categories.deletedAt))
          : isNull(categories.deletedAt),
      )
      .groupBy(categories.id)
      // Deterministic, so the list does not reshuffle between requests. Name is
      // not unique, hence the id tiebreak.
      .orderBy(asc(categories.name), asc(categories.id));

    return rows.map((row) => ({
      row: row.row,
      spentCents: Number(row.spentCents),
      transactionCount: Number(row.transactionCount),
    }));
  }

  /** @throws NotFoundException if the id names no live category. */
  private async liveCategory(
    db: UserDatabase,
    id: string,
  ): Promise<CategoryRow> {
    const [row] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), isNull(categories.deletedAt)))
      .limit(1);

    if (!row) {
      throw new NotFoundException(NO_CATEGORY);
    }
    return row;
  }

  /** The reassignment target every delete depends on. */
  private async fallbackId(db: UserDatabase, userId: string): Promise<string> {
    const [row] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.isFallback, true), isNull(categories.deletedAt)))
      .limit(1);

    // Provisioning seeds one for every account and the API refuses to delete
    // it, so absence is a broken invariant, not a client error. Databases
    // provisioned before PET-35 have none and are re-provisioned by hand.
    if (!row) {
      throw new Error(NO_FALLBACK(userId));
    }
    return row.id;
  }
}

/** Which of the five bands a category is in, decided on cents. */
function statusFor(
  spentCents: number,
  capCents: number | null,
): CategoryStatus {
  if (capCents === null) {
    return 'uncapped';
  }
  if (spentCents > capCents) {
    return 'over';
  }
  if (spentCents === capCents) {
    return 'full';
  }
  // Not `percentUsed >= 75`: comparing the integers is what closes the gap the
  // design leaves between 99% and 100%.
  if (spentCents >= capCents * 0.75) {
    return 'near';
  }
  return 'on_track';
}

function toResponse({
  row,
  spentCents,
  transactionCount,
}: CategoryWithSpend): CategoryResponseDto {
  const capCents = row.monthlyCapCents;
  const status = statusFor(spentCents, capCents);
  const capped = capCents !== null;

  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    note: row.note,
    isFallback: row.isFallback,
    monthlyCap: capped ? fromCents(capCents) : null,
    spent: fromCents(spentCents),
    transactionCount,
    // Unrounded on purpose: rounding here would let slices sum to 99 or 101 and
    // the caller could not repair what it was not given.
    percentUsed: capped ? (spentCents / capCents) * 100 : null,
    remaining:
      capped && status !== 'over' ? fromCents(capCents - spentCents) : null,
    over: capped && status === 'over' ? fromCents(spentCents - capCents) : null,
    status,
  };
}

/** The sparse column set, with `undefined` fields left out entirely. */
function toUpdate(dto: UpdateCategoryDto): CategoryUpdate {
  const changes: CategoryUpdate = {};

  if (dto.name !== undefined) {
    changes.name = dto.name;
  }
  if (dto.color !== undefined) {
    changes.color = dto.color;
  }
  if (dto.monthlyCap !== undefined) {
    // null clears the cap, which is how a capped category becomes uncapped.
    changes.monthlyCapCents =
      dto.monthlyCap === null ? null : toCents(dto.monthlyCap);
  }
  if (dto.icon !== undefined) {
    changes.icon = dto.icon;
  }
  if (dto.note !== undefined) {
    changes.note = dto.note;
  }

  return changes;
}
