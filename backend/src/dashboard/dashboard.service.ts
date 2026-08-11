import { Injectable } from '@nestjs/common';
import { CategoriesService } from '../categories/categories.service';
import { InsightsService } from '../insights/insights.service';
import { fromCents, toCents } from '../common/money';
import { addDays, daysBetween, daysLeftInWindow } from '../common/month-window';
import type { Period } from '../common/period-rules';
import { PeriodService } from '../periods/period.service';
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
 * **This is why the branch is third in a three-branch stack.** The period is
 * `PeriodService`'s and the per-category aggregation is `CategoriesService`'s; the
 * recent-transactions shape is `TransactionsService`'s. A window resolved or a
 * month summed in this file would be a fourth place doing what
 * `backend/CLAUDE.md`'s money note already calls a bug once a third one existed.
 *
 * **The shared `PeriodService` this comment used to argue against now exists, and
 * the edge it warned about is closed.** It described the cost - `currentWindow`,
 * `list` and `list` each resolving the period independently, so one request read
 * the profile row up to three times - as accepted rather than optimised away, on
 * the grounds that the fix would edit code two branches below this one to save a
 * read nothing had measured as slow. PET-72 had to build that service anyway,
 * because a period is a walk over pay-schedule history now rather than one column.
 *
 * The visible symptom of resolving it independently was at the midnight boundary:
 * the window and this method's own `today` could land on either side of it, so
 * `daysLeft` could momentarily read 0 where its DTO promises at least 1.
 * `PeriodService.current` returns the period **and** the `today` it was resolved
 * from, so the two cannot disagree and nothing here reads a clock.
 *
 * **That claim shipped half true, and a review of PET-72 is where the other half
 * landed.** The period and `today` came from one resolution, but the composed
 * `transactions.list` and `categories.list` each re-resolved "current" for
 * themselves - so at the same midnight boundary the echoed `period` could
 * describe the closing period while every figure inside it described the new
 * empty one. Both calls now take the already-resolved period as an argument,
 * which also removes two redundant `period_rules` reads from the app's most
 * expensive request.
 *
 * **No `Promise.all` anywhere below**, the same reason `TransactionsService`
 * avoids it: the embedded driver is happier with sequential statements on one
 * connection than with several arriving at once.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly categories: CategoriesService,
    private readonly periods: PeriodService,
    private readonly transactions: TransactionsService,
    private readonly insights: InsightsService,
  ) {}

  /**
   * @param periodStart A period's own `start`, from `GET /api/periods`. Omitted
   * means the current period. Every figure below is for that one period, and the
   * response echoes it back so the screen can label what it is showing.
   *
   * @throws BadRequestException if `periodStart` names no period of this account's.
   */
  async get(
    userId: string,
    periodStart?: string,
  ): Promise<DashboardResponseDto> {
    // Two paths rather than one, because only the current period has a "today"
    // inside it. The default path takes the period and the date from **one**
    // resolution, which is what closes the midnight edge described above - two
    // separate clock reads could still land either side of a boundary.
    let period: Period;
    let today: string;

    if (periodStart === undefined) {
      const current = await this.periods.current(userId);
      period = current;
      today = current.today;
    } else {
      period = await this.periods.startingAt(userId, periodStart);
      today = this.periods.today();
    }

    // A period the user is navigating back to is finished, so the rate-of-spend
    // figures have to measure it whole rather than against a `today` that sits
    // outside it. Decided by containment rather than by whether `?period=` was
    // sent: sending the current period's own start explicitly must answer
    // identically to omitting it.
    const isCurrent = period.start <= today && today < period.end;

    // The period is passed explicitly to both, rather than letting either resolve
    // its own default: they would each resolve the *current* period again, and
    // two independent resolutions of "current" can land either side of midnight -
    // so the figures would describe a different period than the `period` this
    // response echoes back. Passing the one resolved object is what makes the
    // comment above ("the two cannot disagree") actually true; the selector
    // still travels so the query object says what was asked.
    const selector = periodStart ?? 'current';

    // Explicit rather than relying on TransactionsService's own default: two
    // things below (the recent card, the weekly buckets' input order) depend
    // on newest-first, and that dependency should not live only in the fact
    // that nobody has changed the other service's default yet.
    const { transactions: periodTransactions } = await this.transactions.list(
      userId,
      { period: selector, sort: 'date_desc' },
      period,
    );
    const { categories: categoryRows, allocation } = await this.categories.list(
      userId,
      periodStart,
      period,
    );

    // The teaser summary from the latest ready insight set, or null when none
    // has been generated. Composed like everything else here rather than read
    // from the insights tables directly. Sequential, not a Promise.all, for the
    // same reason the rest of this method is: the embedded driver prefers one
    // statement at a time on the cached connection.
    const insight = await this.insights.latestReadySummary(userId);

    // The source of truth for the account-wide total, deliberately not a sum
    // of `categoryRows`' own `spent` fields even though the two now agree.
    // `CategoriesService.withSpend` folds orphaned spend into the fallback row,
    // so summing the categories would give the same answer - but summing the
    // transactions keeps this figure independent of that fold, which is what
    // makes a regression in it visible as percentages failing to reach 100
    // rather than as a total that quietly shrinks to match. Re-derived in cents
    // rather than summed as the already-converted major-unit floats the list
    // returns, so this addition cannot drift the way repeated float sums can.
    const totalCents = periodTransactions.reduce(
      (sum, transaction) => sum + toCents(transaction.amount),
      0,
    );
    const spent = fromCents(totalCents);

    const monthlyBudgetCents = toCents(allocation.monthlyBudget);
    const remaining = fromCents(monthlyBudgetCents - totalCents);

    // Counts today, so this is never zero and there is no division to guard -
    // decision 2: the rate that answers "am I burning too fast", not one that
    // looks better the earlier in the month it is read. A finished period is
    // measured whole instead, which is the same rule applied to a period whose
    // days have all elapsed; `daysBetween` on the half-open bounds *is* its
    // length, so there is no `+ 1` on that branch.
    const daysElapsed = isCurrent
      ? daysBetween(period.start, today) + 1
      : daysBetween(period.start, period.end);

    // Zero for a finished period rather than a negative count of days since it
    // closed, which is what `daysLeftInWindow` would report against a `today`
    // outside the window.
    const daysLeft = isCurrent ? daysLeftInWindow(period, today) : 0;
    const averagePerDay = spent / daysElapsed;

    return {
      spent,
      monthlyBudget: allocation.monthlyBudget,
      remaining,
      daysLeft,
      transactionCount: periodTransactions.length,
      averagePerDay,
      topCategory: topCategoryOf(categoryRows),
      weeklyBuckets: weeklyBucketsOf(period, periodTransactions),
      categories: categoriesOf(categoryRows, totalCents),
      recentTransactions: periodTransactions.slice(0, RECENT_LIMIT),
      insight,
      period: { start: period.start, end: period.end, label: period.label },
    };
  }
}

/** Rows with real spend this period, in the shape the donut wants. */
interface SpentCategoryRow {
  id: string;
  name: string;
  color: string;
  /** For the recent-transactions card's tile, not for the donut. */
  icon: string | null;
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
 * **The two denominators are now the same number, and that is a guarantee
 * rather than a coincidence.** `CategoriesService.withSpend` folds spend
 * belonging to no live category into the Uncategorized fallback row, so every
 * transaction in the period is counted in exactly one row and these rows sum to
 * `totalCents` exactly. Percentages therefore sum to 100 whenever `categories`
 * is non-empty, which PET-23's donut relies on: it draws one arc per row and the
 * ring is required to close.
 *
 * This comment previously argued the opposite - that a dangling-category
 * transaction should be allowed to leave the slices summing to just under 100%,
 * on the grounds that a visible shortfall in one slice beats one hidden inside
 * every percentage. That reasoning was sound about *where* to put the error and
 * wrong that an error had to exist at all: the money belongs to a category the
 * user can no longer see, which is precisely what Uncategorized is for. See
 * `foldOrphansIntoFallback`.
 *
 * `totalCents` stays the denominator regardless, because AC4 asks for
 * "percentage of the period total" and because keeping it means a future
 * regression in the fold shows up as percentages that visibly fail to reach
 * 100, rather than being silently renormalised out of sight.
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
        icon: row.icon,
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
