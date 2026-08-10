import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  notExists,
  sql,
} from 'drizzle-orm';
import { newId } from '../common/ids';
import { fromCents, toCents } from '../common/money';
import type { Period } from '../common/period-rules';
import { PeriodService } from '../periods/period.service';
import type { UserDatabase } from '../database/database.types';
import { UserDatabaseService } from '../database/user-database.service';
import {
  categories,
  categoryCapHistory,
  transactions,
  type CategoryRow,
} from '../database/user/schema';
import type {
  CategoryResponseDto,
  CategoryStatus,
} from './dto/category-response.dto';
import type { CategoriesResponseDto } from './dto/categories-response.dto';
import type { CreateCategoryDto } from './dto/create-category.dto';
import type { UpdateCategoryCapsDto } from './dto/update-category-caps.dto';
import type { UpdateCategoryDto } from './dto/update-category.dto';

const NO_CATEGORY = 'Category not found.';
const NOTHING_TO_UPDATE = 'Provide at least one field to update.';
const NO_DELETE_FALLBACK =
  'The Uncategorized category cannot be deleted: it is where deleting any other category moves its transactions.';
const NO_RENAME_FALLBACK =
  'The Uncategorized category cannot be renamed. Its cap, color, icon and description can all be changed.';
const NO_FALLBACK = (userId: string) =>
  `No fallback category for user ${userId}; provisioning seeds one for every account.`;
// The second sentence is not decoration: it is the only way a client learns the
// identical payload is safe to retry whole, which is the point of the guard.
const NO_CATEGORIES = (ids: string[]) =>
  `No live category for ${ids.join(', ')}. No cap was changed.`;
const GUARD_DISAGREES = (ids: string[]) =>
  `Bulk cap update for ${ids.join(', ')} matched no rows, yet every id reads back live.`;

/**
 * The sparse column set an UPDATE applies. Never includes `updatedAt`.
 *
 * No cap here since PET-72: a cap change is an append to
 * `category_cap_history`, not a column on this row, so it travels separately.
 */
type CategoryUpdate = Partial<
  Pick<CategoryRow, 'name' | 'color' | 'icon' | 'description'>
>;

/** One category's row plus its aggregates for the period, straight from SQL. */
interface CategoryWithSpend {
  row: CategoryRow;
  /**
   * The cap in force for the period being reported, resolved from history rather
   * than read off the row. NULL means uncapped - which is the same answer as
   * having no history row at all, deliberately indistinguishable.
   */
  capCents: number | null;
  spentCents: number;
  transactionCount: number;
}

/**
 * Categories, their month stats and the budget allocation summary.
 *
 * **Every figure here is derived on read and none of it is stored.** There is no
 * month column on `transactions` and there must not be one: a category's spend
 * for a period is a SUM over `transactions.date` read against the window
 * `PeriodService` resolves, which is what makes a backdated transaction land in
 * its own period.
 *
 * **Cross-user isolation is structural, not enforced here.** Every method opens
 * the caller's own database, so another user's category id simply does not exist
 * in it and the ordinary 404 covers the case. There is no `WHERE user_id = ?` to
 * forget, because there is no user column to have.
 *
 * **This service no longer resolves the period, and that is PET-72's structural
 * change here.** It used to own the app's only month arithmetic behind a private
 * `period()`, with `currentWindow` and `previousWindow` public purely so the
 * transaction reads, the dashboard and the insights generator could reach it -
 * three features importing the categories feature for something that had nothing
 * to do with categories. `PeriodService` owns that now and all four compose it
 * directly. What stays here is aggregation: sum spend against a window somebody
 * else resolved, and resolve each category's **cap** for that window.
 * `monthStatsFor` stays public, because one category's stats for the current
 * period really is this feature's business and the transaction detail needs it.
 *
 * **A cap is history now, not a column.** `withSpend` resolves it per window with
 * a correlated subquery, so every screen shows the cap that was in force for the
 * period it is displaying rather than today's cap applied retroactively to a
 * period that closed months ago. The three writes that used to set
 * `monthly_cap_cents` all append instead.
 *
 * **No `db.transaction()` anywhere in this file, deliberately** - including in
 * `remove`, which has two writes, and `setCaps`, which writes many rows at once.
 * Both tables are in the same database so a transaction is genuinely available,
 * but `backend/CLAUDE.md` records why the app keeps its transactional call sites
 * countable: the embedded driver refuses overlapping transactions rather than
 * queueing them, so a second call site on a user database means two quick writes
 * on one person's database collide.
 *
 * **Two shapes replace it, and which one applies depends on the write.** Where
 * the statements are order-dependent, ordering them so a failure between the two
 * is the harmless direction costs nothing - `remove`. Where they are not, and a
 * half-applied result would be a real one, the answer is a **conditional single
 * statement**: one statement whose own `WHERE` carries the condition that makes
 * it all-or-nothing, so the database decides rather than this code, and there is
 * no await between a check and a write for a concurrent request to land in.
 * `setCaps` is that, and `LoginTokenService.consume()` is the same shape.
 */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly userDatabases: UserDatabaseService,
    private readonly periods: PeriodService,
  ) {}

  /**
   * Live categories with their stats for a period, plus the allocation summary.
   *
   * @param periodStart A period's own `start`, from `GET /api/periods`. Omitted
   * means the current period, which is what every screen asks for by default.
   * **The whole response is period-scoped, including the allocation summary**:
   * caps and the monthly budget are both history now, so reporting last
   * December's spend against today's caps would be the exact retroactive
   * rewriting this ticket exists to stop.
   *
   * @throws BadRequestException if `periodStart` is not the start of a real
   * period for this account.
   */
  async list(
    userId: string,
    periodStart?: string,
  ): Promise<CategoriesResponseDto> {
    const period =
      periodStart === undefined
        ? await this.periods.current(userId)
        : await this.periods.startingAt(userId, periodStart);

    const budgetCents = await this.periods.budgetCentsFor(userId, period);
    const db = await this.userDatabases.getUserDb(userId);
    const rows = await this.withSpend(db, period);

    // Uncapped categories contribute nothing, which is what lets `unallocated`
    // sit near the full budget for someone who caps little. Correct, and not a
    // state frame 13 anticipates.
    const allocatedCents = rows.reduce(
      (total, { capCents }) => total + (capCents ?? 0),
      0,
    );

    return {
      categories: rows.map(toResponse),
      period: { start: period.start, end: period.end, label: period.label },
      allocation: {
        monthlyBudget: fromCents(budgetCents),
        allocated: fromCents(allocatedCents),
        // Unclamped: nothing prevents caps exceeding the budget (A43), and the
        // magnitude is what a future over-allocation state would need.
        unallocated: fromCents(budgetCents - allocatedCents),
      },
    };
  }

  /**
   * Creates a category. A cap is optional; absent means uncapped.
   *
   * **Two writes when a cap is given, ordered rather than wrapped**, for the
   * reason the class note gives: the category first, its first cap row second. A
   * failure between them leaves an uncapped category, which is visible on the
   * card and fixed by editing it. The reverse order would write a cap row for a
   * category that does not exist - harmless to every read, since they all join
   * from `categories`, but it would be a row nothing could ever reach or clean up.
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
        icon: dto.icon,
        description: dto.description ?? null,
        // Never settable through the API: the fallback is seeded at
        // provisioning and the partial unique index would reject a second one.
        isFallback: false,
      })
      .returning();

    // Resolved only when there is a cap to date. A category created without one
    // writes no history row at all - the sparse history the schema describes -
    // and pays for no period read either.
    const capCents =
      dto.monthlyCap === undefined ? null : toCents(dto.monthlyCap);

    if (capCents !== null) {
      const period = await this.periods.current(userId);
      await this.appendCap(db, created.id, period.start, capCents);
    }

    // A brand-new category cannot have transactions, so its stats are zero
    // without asking.
    return toResponse({
      row: created,
      capCents,
      spentCents: 0,
      transactionCount: 0,
    });
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

    // A cap change is no longer one of `changes`: it is an append to a different
    // table, so "did this request ask for anything" has to consider both. Read
    // into a local so `undefined` and `null` narrow properly below - the
    // difference between them is the whole tri-state.
    const cap = dto.monthlyCap;
    const capChanged = cap !== undefined;

    // Before the database is even opened: a bare UPDATE would still bump
    // `updated_at` through `$onUpdateFn` and record an edit that changed
    // nothing. Same reasoning as UpdateTransactionDto's.
    if (Object.keys(changes).length === 0 && !capChanged) {
      throw new BadRequestException(NOTHING_TO_UPDATE);
    }

    const db = await this.userDatabases.getUserDb(userId);
    const existing = await this.liveCategory(db, id);

    if (existing.isFallback && changes.name !== undefined) {
      throw new ConflictException(NO_RENAME_FALLBACK);
    }

    // Skipped for a cap-only change, which is the same rule the 400 above
    // enforces applied one level down: there is nothing to set on this row, and
    // an empty UPDATE would move `updated_at` for an edit that happened in
    // another table.
    if (Object.keys(changes).length > 0) {
      await db
        .update(categories)
        // Never sets `updatedAt` by hand: drizzle v1's buildUpdateSet applies
        // `$onUpdateFn` columns itself.
        .set(changes)
        .where(and(eq(categories.id, id), isNull(categories.deletedAt)));
    }

    if (cap !== undefined) {
      const period = await this.periods.current(userId);
      // `null` is a real value here, not an absence: it is how a capped category
      // becomes uncapped from this period onward.
      await this.appendCap(
        db,
        id,
        period.start,
        cap === null ? null : toCents(cap),
      );
    }

    // No `.returning()` above, because `monthStatsFor` selects the row again
    // anyway and the two copies of "id to stats" this file used to hold are what
    // PET-28 would have made a third of. The extra SELECT is the price of one
    // copy, and it is also what turns a row deleted between `liveCategory` and
    // this UPDATE into the ordinary 404 rather than a TypeError.
    return this.monthStatsFor(userId, id);
  }

  /**
   * Sets the cap on many categories at once, all of them or none.
   *
   * **One conditional statement, and still no `db.transaction()`.** The class
   * note above forbids a second transactional call site on a user database; this
   * is the shape that replaces it where ordering cannot help, because N cap
   * writes are order-independent and a failure part-way through would leave a
   * genuinely half-allocated budget. The `count(*)` subquery in the `WHERE` is
   * the whole atomicity story: the statement refuses itself unless every id in
   * the payload is live at the instant it runs, so there is no window between a
   * check and a write, and a concurrent delete cannot land in one.
   *
   * **PET-72 turned it from an UPDATE into an INSERT and the guard survived
   * unchanged**, which is the point of having written it this way. Caps are
   * append-only history now, so this inserts one `category_cap_history` row per
   * entry, all effective from the same period, instead of overwriting a column.
   * The guard is still a `count(*)` against live categories in the same
   * statement's `WHERE`, so it is still the database refusing a partial payload
   * rather than this code checking first.
   *
   * **The `WHERE` sits on a constant subquery, which is what makes it
   * all-or-nothing rather than per-row.** `INSERT ... SELECT ... FROM (VALUES
   * ...) WHERE <guard>` evaluates the guard for each generated row, and the guard
   * mentions none of them - so it is the same answer every time and either every
   * row is inserted or none is. Verified against the real driver before it was
   * written, in both directions.
   *
   * **The `CASE`-arms trap is gone, and that is a real simplification.** The old
   * UPDATE built a `CASE` from the payload and an `IN` list beside it, where a row
   * matched by the `WHERE` with no arm of its own fell off the end of the `CASE`
   * and was silently set to NULL - so the two halves had to come from one array
   * or the statement would wipe caps nobody named. Rows and ids now come from the
   * same `items` array by construction, because a row that is not in the VALUES
   * list is not inserted at all. There is no longer a way to express the bug.
   *
   * **No ceiling against the monthly budget, on purpose.** Nothing stops these
   * caps summing past it; `allocation.unallocated` simply comes back negative,
   * which `CategoriesResponseDto` documents and A43 records as undesigned. The
   * Allocate modal enforces a ceiling of its own, and `PATCH /categories/:id`
   * enforces none - putting one here would make this endpoint disagree with that
   * one about what a legal cap is.
   *
   * @throws NotFoundException if any id names no live category. Nothing is
   * applied, so the same payload can be retried once the caller has refreshed.
   */
  async setCaps(
    userId: string,
    dto: UpdateCategoryCapsDto,
  ): Promise<CategoriesResponseDto> {
    const items = dto.categories;
    const ids = items.map((item) => item.id);

    // Every row carries the same `effective_from`, the current period's start:
    // the Allocate modal is allocating *this* period's budget, and dating the
    // rows anywhere else would either rewrite a closed period or leave this one
    // uncapped.
    const period = await this.periods.current(userId);
    const db = await this.userDatabases.getUserDb(userId);

    // One instant for every row, so a later resolution ordering by `created_at`
    // cannot prefer one entry of a single save over another.
    const createdAt = Date.now();

    const values = sql.join(
      items.map(
        (item) =>
          sql`(${newId()}, ${item.id}, ${period.start}, ${item.monthlyCap === null ? null : toCents(item.monthlyCap)}, ${createdAt})`,
      ),
      sql`, `,
    );

    // The guard, and the only thing in the statement that reads `categories`.
    const live = and(inArray(categories.id, ids), isNull(categories.deletedAt));

    const applied = await db
      .insert(categoryCapHistory)
      .select(
        db
          .select({
            // SQLite names a VALUES clause's columns `column1`, `column2`, ... -
            // there is no syntax to name them inline - so the aliases here are
            // what map them onto the insert's column list, in this order.
            id: sql`column1`.as('id'),
            categoryId: sql`column2`.as('category_id'),
            effectiveFrom: sql`column3`.as('effective_from'),
            capCents: sql`column4`.as('cap_cents'),
            // Supplied rather than defaulted: `$defaultFn` runs when drizzle
            // builds a `values()` list, and this insert has none to build.
            createdAt: sql`column5`.as('created_at'),
          })
          .from(sql`(values ${values})`)
          .where(
            sql`(select count(*) from ${categories} where ${live}) = ${ids.length}`,
          ),
      )
      // Returning ids rather than counting the driver's result: the two driver
      // modes report different result shapes, which `database.types.ts` types as
      // `any` for that reason, so a row count would be the one place in the app
      // that depends on which mode it is running in.
      .returning({ id: categoryCapHistory.categoryId });

    if (applied.length !== ids.length) {
      throw new NotFoundException(
        NO_CATEGORIES(await this.missingIds(db, ids)),
      );
    }

    // The whole screen, recomputed. `list` already builds it, and a second copy
    // of "sum the caps, subtract from the budget" is what this file's own money
    // note calls a bug at the third occurrence. Note the frontend discards this
    // body today and re-reads through `router.refresh()`; it is the right
    // contract for the endpoint regardless, and the rest of the page needs that
    // refresh anyway.
    return this.list(userId);
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
   * One category with its stats for the current period.
   *
   * The same three steps `list` runs for every category, narrowed to one. The
   * transaction detail read calls this rather than computing `spent`, `cap`,
   * `percentUsed` and `remaining` itself, which is what keeps the progress bar on
   * frame 08 and the card on frame 13 reading the same number.
   *
   * The period is **always the current one**, even when the caller is looking at
   * a transaction from an earlier month: the bar answers "where is this category
   * now", which is what AC4 asks for and what DET-4's own "this month" title
   * says.
   *
   * @throws NotFoundException if the id names no live category.
   */
  async monthStatsFor(
    userId: string,
    categoryId: string,
  ): Promise<CategoryResponseDto> {
    const period = await this.periods.current(userId);
    const db = await this.userDatabases.getUserDb(userId);
    const [category] = await this.withSpend(db, period, categoryId);

    // `withSpend` filters on `deleted_at IS NULL`, so this covers a tombstoned
    // category as well as an unknown id - and, for the transaction detail, a
    // dangling `category_id`. That last one is reachable, if narrowly: `remove`
    // reassigns live transactions before tombstoning, but a transaction created
    // or updated concurrently with that delete can still be inserted with this
    // category after the reassignment swept past it. `TransactionsService`
    // catches exactly that NotFoundException and reports it as a broken
    // invariant rather than passing this method's 404 straight through, since
    // that 404 would name the wrong resource.
    if (!category) {
      throw new NotFoundException(NO_CATEGORY);
    }

    return toResponse(category);
  }

  /**
   * One append to a category's cap history.
   *
   * The single-row counterpart of `setCaps`' bulk insert, and the only other
   * place that writes this table. No conditional guard here: the caller has
   * already established the category is live, and a single append has no partial
   * state to protect against - the failure mode `setCaps` guards is "half the
   * budget allocated", which cannot arise from one row.
   */
  private async appendCap(
    db: UserDatabase,
    categoryId: string,
    effectiveFrom: string,
    capCents: number | null,
  ): Promise<void> {
    await db.insert(categoryCapHistory).values({
      id: newId(),
      categoryId,
      effectiveFrom,
      capCents,
    });
  }

  /**
   * Live categories with their spend and their cap for the period, in one query.
   *
   * A LEFT JOIN, so a category with no transactions still comes back, with the
   * `coalesce` turning SQL's NULL sum into a real zero. The date predicates sit
   * in the join condition rather than the WHERE clause: in a WHERE they would
   * filter out the category rows themselves, silently hiding every category that
   * happened to have no spend this period.
   *
   * **The cap is a correlated scalar subquery, not a join**, and that is the
   * shape PET-72 needed. A join to `category_cap_history` would multiply the rows
   * being aggregated - every historical cap row would duplicate that category's
   * transactions inside the SUM - so the cap has to be resolved to exactly one
   * value per category before it meets the aggregate. A scalar subquery does that
   * by construction, and it correlates on `categories.id`, which the GROUP BY
   * already keys on.
   *
   * **NULL and no-row both mean uncapped, and nothing distinguishes them.** A
   * category with no history for this window returns no row and the subquery
   * yields NULL; a category explicitly set back to uncapped has a row whose
   * `cap_cents` is NULL and yields NULL too. Both are correct and both render as
   * `status: "uncapped"`, which is why there is no third branch anywhere
   * downstream.
   */
  private async withSpend(
    db: UserDatabase,
    period: Period,
    onlyId?: string,
  ): Promise<CategoryWithSpend[]> {
    // Greatest `effective_from` at or before the period's start, ties broken by
    // the newest write - the same resolution rule `PeriodService.budgetCentsFor`
    // applies to the budget, because a cap and a budget are the same kind of
    // effective-dated setting.
    const capCents = sql<number | null>`(
      select ${categoryCapHistory.capCents}
      from ${categoryCapHistory}
      where ${categoryCapHistory.categoryId} = ${categories.id}
        and ${categoryCapHistory.deletedAt} is null
        and ${categoryCapHistory.effectiveFrom} <= ${period.start}
      order by ${categoryCapHistory.effectiveFrom} desc,
               ${categoryCapHistory.createdAt} desc,
               ${categoryCapHistory.id} desc
      limit 1
    )`;

    const rows = await db
      .select({
        row: categories,
        capCents,
        spentCents: sql<number>`coalesce(sum(${transactions.amountCents}), 0)`,
        transactionCount: sql<number>`count(${transactions.id})`,
      })
      .from(categories)
      .leftJoin(
        transactions,
        and(
          eq(transactions.categoryId, categories.id),
          isNull(transactions.deletedAt),
          gte(transactions.date, period.start),
          lt(transactions.date, period.end),
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

    const withSpend = rows.map((row) => ({
      row: row.row,
      // `Number(null)` is 0, not null, so the uncapped case has to be checked
      // before converting - otherwise every uncapped category would report a cap
      // of zero and read as Over on its first transaction.
      capCents: row.capCents === null ? null : Number(row.capCents),
      spentCents: Number(row.spentCents),
      transactionCount: Number(row.transactionCount),
    }));

    return this.foldOrphansIntoFallback(db, period, withSpend);
  }

  /**
   * Attribute spend belonging to no live category to the Uncategorized fallback.
   *
   * **The invariant this restores: every transaction in the period is counted in exactly one
   * returned row, so these rows always sum to the period's total spend.** Callers may rely on
   * that. PET-23's donut does: it draws one arc per row and the ring has to close, and a ring
   * that silently omitted a few pounds would be a chart that lies rather than a chart with a gap.
   *
   * **What breaks the invariant without this.** `transactions.category_id` is `NOT NULL`, so no
   * transaction lacks a category *id* - but `database/user/schema.ts` is FK-less by design and
   * categories are soft-deleted, so an id can name a row that still exists and is tombstoned.
   * The join above filters `isNull(categories.deletedAt)`, so such a transaction matches no row
   * and its cents leave the per-category totals while staying in the account-wide total.
   *
   * **It is rare and it is not hypothetical.** `remove` reassigns a category's transactions to
   * the fallback before tombstoning it, so ordinary deletion accounts for everything. The hole is
   * the check-then-write race `TransactionsService` documents: a create or update passes
   * `assertCategoryExists`, the concurrent delete's reassignment sweeps past it, and the write
   * lands with the id that just died. Nothing repairs it afterwards, so one occurrence is
   * permanent.
   *
   * **This does not close that race, and closing it is not this function's job.** The obvious fix
   * - wrapping check and write in `db.transaction()` - is forbidden by the note at the top of
   * this file: the embedded driver refuses overlapping transactions rather than queueing them, so
   * a second call site on a user database turns a rare correctness bug into a common availability
   * one. `docs/TODO.md` carries the conditional-write fix that would respect that constraint.
   * Until then this makes the money add up on the way out, which is what every reader needs.
   *
   * **What it costs, stated so no screen builds on the wrong half of it.** The fold happens on
   * read and repairs nothing in storage, so an orphaned transaction is counted on the fallback
   * row while still carrying the tombstoned category's id. The two endpoints therefore disagree
   * about that one row: `GET /categories` can report Uncategorized with a `transactionCount` that
   * `GET /transactions?categoryId=<fallback id>` will not return, because the filter matches the
   * stored id. `CategoryResponseDto` says so on both fields, since a client cannot see this from
   * the shape. What it is safe to build on is the sum - every transaction in the period is counted
   * in exactly one row - which is what the donut and the month stats need and all they need.
   *
   * Skipped entirely when the caller asked for one non-fallback category, since there is then no
   * row for the orphans to land in and no reason to pay for the query.
   */
  private async foldOrphansIntoFallback(
    db: UserDatabase,
    period: Period,
    rows: CategoryWithSpend[],
  ): Promise<CategoryWithSpend[]> {
    const fallback = rows.find(({ row }) => row.isFallback);
    if (!fallback) return rows;

    const [orphaned] = await db
      .select({
        spentCents: sql<number>`coalesce(sum(${transactions.amountCents}), 0)`,
        transactionCount: sql<number>`count(${transactions.id})`,
      })
      .from(transactions)
      .where(
        and(
          isNull(transactions.deletedAt),
          gte(transactions.date, period.start),
          lt(transactions.date, period.end),
          // A correlated NOT EXISTS rather than `notInArray` over the ids already in `rows`,
          // because `rows` is a single category when `onlyId` was passed and every other live
          // category would then read as orphaned.
          notExists(
            db
              .select({ one: sql`1` })
              .from(categories)
              .where(
                and(
                  eq(categories.id, transactions.categoryId),
                  isNull(categories.deletedAt),
                ),
              ),
          ),
        ),
      );

    const spentCents = Number(orphaned?.spentCents ?? 0);
    if (spentCents === 0) return rows;

    return rows.map((row) =>
      row.row.isFallback
        ? {
            ...row,
            spentCents: row.spentCents + spentCents,
            transactionCount:
              row.transactionCount + Number(orphaned?.transactionCount ?? 0),
          }
        : row,
    );
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

  /**
   * Which of these ids name no live category.
   *
   * Runs on the miss path only, so `setCaps`' success path stays exactly one
   * statement - `LoginTokenService.consume()`'s diagnostic read, for the same
   * reason: the classification is worth a second query precisely because it is
   * never paid when nothing went wrong.
   */
  private async missingIds(db: UserDatabase, ids: string[]): Promise<string[]> {
    const rows = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(inArray(categories.id, ids), isNull(categories.deletedAt)));

    const live = new Set(rows.map((row) => row.id));
    const missing = ids.filter((id) => !live.has(id));

    // The guard matched nothing, so at least one id was not live. An empty answer
    // means the guard and this read disagree, which is a broken invariant rather
    // than a client error - the same shape as NO_PROFILE and NO_FALLBACK.
    if (missing.length === 0) {
      throw new Error(GUARD_DISAGREES(ids));
    }
    return missing;
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
  capCents,
  spentCents,
  transactionCount,
}: CategoryWithSpend): CategoryResponseDto {
  const status = statusFor(spentCents, capCents);
  const capped = capCents !== null;

  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    description: row.description,
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

/**
 * The sparse column set, with `undefined` fields left out entirely.
 *
 * `monthlyCap` is deliberately absent: it is no longer a column on this row, so
 * it travels to `appendCap` instead of through here. Adding it back is how a
 * future edit would silently re-introduce the overwriting this ticket removed.
 */
function toUpdate(dto: UpdateCategoryDto): CategoryUpdate {
  const changes: CategoryUpdate = {};

  if (dto.name !== undefined) {
    changes.name = dto.name;
  }
  if (dto.color !== undefined) {
    changes.color = dto.color;
  }
  if (dto.icon !== undefined) {
    changes.icon = dto.icon;
  }
  if (dto.description !== undefined) {
    changes.description = dto.description;
  }

  return changes;
}
