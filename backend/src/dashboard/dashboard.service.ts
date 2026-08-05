import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CategoriesService } from '../categories/categories.service';
import { fromCents, toCents } from '../common/money';
import {
  addDays,
  daysBetween,
  daysLeftInWindow,
  todayIn,
} from '../common/month-window';
import { TransactionsService } from '../transactions/transactions.service';
import type { TransactionResponseDto } from '../transactions/dto/transaction-response.dto';
import type {
  DashboardCategoryDto,
  DashboardResponseDto,
  TopCategoryDto,
  WeeklyBucketDto,
} from './dto/dashboard-response.dto';

/** How many of the current period's transactions the "recent" card shows. */
const RECENT_LIMIT = 3;

/**
 * Every figure the dashboard draws, composed from `CategoriesService` and
 * `TransactionsService` rather than queried here.
 *
 * **This is why the branch is third in a three-branch stack.** `monthWindow()`
 * and the per-category aggregation are `CategoriesService`'s; the
 * recent-transactions shape is `TransactionsService`'s. A window resolved or a
 * month summed in this file would be a fourth place doing what
 * `backend/CLAUDE.md`'s money note already calls a bug once a third one existed.
 *
 * **This costs more profile reads than any other endpoint in the app**, and
 * that is accepted rather than optimised away: `currentWindow`, `list` and
 * `list` each resolve the period independently, so one dashboard request reads
 * the profile row up to three times. All three land on one cached connection
 * (`UserDatabaseService` caches per user), the database is the caller's own and
 * small, and the alternative is a shared `PeriodService` that would edit code
 * two branches below this one just to save a read nothing has measured as slow.
 * That trade is recorded in `docs/TODO.md`.
 *
 * **No `Promise.all` anywhere below**, the same reason `TransactionsService`
 * avoids it: the embedded driver is happier with sequential statements on one
 * connection than with several arriving at once.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly categories: CategoriesService,
    private readonly transactions: TransactionsService,
    private readonly config: ConfigService,
  ) {}

  async get(userId: string): Promise<DashboardResponseDto> {
    const window = await this.categories.currentWindow(userId);
    const today = todayIn(
      this.config.get<string>('APP_TIMEZONE', 'Europe/Zagreb'),
    );

    // Explicit rather than relying on TransactionsService's own default: two
    // things below (the recent card, the weekly buckets' input order) depend
    // on newest-first, and that dependency should not live only in the fact
    // that nobody has changed the other service's default yet.
    const { transactions: periodTransactions } = await this.transactions.list(
      userId,
      { period: 'current', sort: 'date_desc' },
    );
    const { categories: categoryRows, allocation } =
      await this.categories.list(userId);

    // The source of truth for the account-wide total, deliberately not a sum
    // of `categoryRows`' own `spent` fields. A transaction whose category was
    // deleted moments after it was created (see TransactionsService's own note
    // on that race) would not appear in any live category row, and summing
    // categories would silently under-report the one figure the top stat tile
    // exists to get right. Re-derived in cents rather than summed as the
    // already-converted major-unit floats the list returns, so this addition
    // cannot drift the way repeated float sums can.
    const totalCents = periodTransactions.reduce(
      (sum, transaction) => sum + toCents(transaction.amount),
      0,
    );
    const spent = fromCents(totalCents);

    const monthlyBudgetCents = toCents(allocation.monthlyBudget);
    const remaining = fromCents(monthlyBudgetCents - totalCents);

    // Counts today, so this is never zero and there is no division to guard -
    // decision 2: the rate that answers "am I burning too fast", not one that
    // looks better the earlier in the month it is read.
    const daysElapsed = daysBetween(window.start, today) + 1;
    const daysLeft = daysLeftInWindow(window, today);
    const averagePerDay = spent / daysElapsed;

    return {
      spent,
      monthlyBudget: allocation.monthlyBudget,
      remaining,
      daysLeft,
      transactionCount: periodTransactions.length,
      averagePerDay,
      topCategory: topCategoryOf(categoryRows),
      weeklyBuckets: weeklyBucketsOf(window, periodTransactions),
      categories: categoriesOf(categoryRows, totalCents),
      recentTransactions: periodTransactions.slice(0, RECENT_LIMIT),
      // Always null until PET-41 ships the insights table. See docs/TODO.md.
      insight: null,
    };
  }
}

/** Rows with real spend this period, in the shape the donut wants. */
interface SpentCategoryRow {
  id: string;
  name: string;
  color: string;
  spent: number;
}

/**
 * Highest spend among live categories, ties broken by name ascending.
 *
 * The tiebreak is decided here, on the name, rather than inherited from the
 * order `categoryRows` arrives in. `CategoriesService.withSpend` does sort
 * name-ascending today, so a winner replaced only on strictly-greater spend
 * would happen to pick the alphabetically-first of a tie - but it would flip
 * silently the day that `ORDER BY` changed, and nothing in this file's tests
 * would catch it. Comparing the name explicitly costs a line and removes the
 * coupling.
 */
function topCategoryOf(rows: SpentCategoryRow[]): TopCategoryDto | null {
  let winner: SpentCategoryRow | null = null;

  for (const row of rows) {
    if (row.spent <= 0) {
      continue;
    }
    if (
      winner === null ||
      row.spent > winner.spent ||
      (row.spent === winner.spent && row.name < winner.name)
    ) {
      winner = row;
    }
  }

  if (!winner) {
    return null;
  }

  return {
    id: winner.id,
    name: winner.name,
    color: winner.color,
    spent: winner.spent,
  };
}

/**
 * Every nonzero category, percentages relative to `totalCents` rather than to
 * the sum of these rows' own spend.
 *
 * The two denominators usually agree and can differ by the same dangling-
 * category race `topCategoryOf`'s caller is already written around: a
 * transaction whose category no longer exists inflates `totalCents` without
 * appearing in any row here, so the slices can sum to just under 100%. Correct
 * given AC4 asks for "percentage of the period total", not "percentage of the
 * other slices" - and the alternative, normalising against these rows' own sum,
 * would hide the same shortfall inside every percentage instead of only this
 * one, rarer than either.
 */
function categoriesOf(
  rows: SpentCategoryRow[],
  totalCents: number,
): DashboardCategoryDto[] {
  return rows
    .filter((row) => row.spent > 0)
    .map((row) => {
      const spentCents = toCents(row.spent);
      return {
        id: row.id,
        name: row.name,
        color: row.color,
        spent: row.spent,
        percent: totalCents === 0 ? 0 : (spentCents / totalCents) * 100,
      };
    });
}

/**
 * The trend chart's buckets: 7 days each, anchored to the period start, the
 * last one clipped rather than overshooting past the period end.
 *
 * **An empty array for an account with no transactions this period**, not a
 * full set of zero buckets - AC5's "empty weekly series" means there is
 * nothing to chart, and the empty-state frame replaces the chart entirely.
 * Within a period that does have spend, a week with none still gets a
 * zero-valued bucket: the chart draws a continuous axis and a missing week
 * would compress it.
 */
function weeklyBucketsOf(
  window: { start: string; end: string },
  periodTransactions: TransactionResponseDto[],
): WeeklyBucketDto[] {
  if (periodTransactions.length === 0) {
    return [];
  }

  const totalDays = daysBetween(window.start, window.end);
  const bucketCount = Math.ceil(totalDays / 7);
  const buckets: WeeklyBucketDto[] = [];

  for (let i = 0; i < bucketCount; i++) {
    const startDate = addDays(window.start, i * 7);
    const endDate =
      i === bucketCount - 1 ? window.end : addDays(window.start, (i + 1) * 7);

    const bucketCents = periodTransactions
      .filter(
        (transaction) =>
          transaction.date >= startDate && transaction.date < endDate,
      )
      .reduce((sum, transaction) => sum + toCents(transaction.amount), 0);

    buckets.push({ startDate, endDate, total: fromCents(bucketCents) });
  }

  return buckets;
}
