import { ApiProperty } from '@nestjs/swagger';
import {
  COLOUR_TOKENS,
  ICON_NAMES,
} from '../../database/central/template-tokens';
import { InsightSummaryDto } from '../../insights/dto/insight-set-response.dto';
import { PeriodSummaryDto } from '../../periods/dto/period-response.dto';
import { TransactionResponseDto } from '../../transactions/dto/transaction-response.dto';

/** One 7-day slice of the trend chart. */
export class WeeklyBucketDto {
  @ApiProperty({ description: '`YYYY-MM-DD`, inclusive.' })
  startDate!: string;

  @ApiProperty({
    description:
      '`YYYY-MM-DD`, exclusive. The final bucket in a period is short - `endDate` is the period end, not seven days after `startDate`.',
  })
  endDate!: string;

  @ApiProperty({ description: 'Major units spent within this bucket.' })
  total!: number;
}

/** One slice of the donut, cap and status dropped. */
export class DashboardCategoryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Groceries' })
  name!: string;

  // The donut's slice fill comes off this, through a `Record` keyed by the
  // union this enum generates - so it publishes the enum for the same reason
  // CreateCategoryDto.color does. A bare `string` here degrades that record to
  // `Record<string, string>`, which accepts any subset of keys, and the slices
  // render grey with every gate green.
  @ApiProperty({
    enum: COLOUR_TOKENS,
    example: 'success',
    description: 'A daisyUI semantic colour token, not a hex.',
  })
  color!: string;

  /**
   * **Here for the recent-transactions card, not for the donut.**
   *
   * The donut's slices are bare colour and need none. `RecentTransactionsCard`
   * draws the same `size-9` tile the transactions table does, and joins it off
   * this array rather than making a second request - see `backend/CLAUDE.md`'s
   * note on why that join is free. Without this field that tile is the one
   * place left drawing a placeholder mark for every category, which is exactly
   * what the close colour pairs cannot survive.
   */
  @ApiProperty({ enum: ICON_NAMES, nullable: true, type: String })
  icon!: string | null;

  @ApiProperty({
    description:
      'Major units spent in this category during the current period.',
  })
  spent!: number;

  @ApiProperty({
    description:
      "Percentage of the period's total spend this category accounts for, unrounded. Relative to `spent` on this response, not to any cap. Across the whole `categories` array these sum to 100: spend belonging to no live category is folded into the Uncategorized fallback, so every transaction in the period is counted in exactly one entry. Round for display with an apportionment that preserves the total, since rounding each value independently can sum to 99 or 101.",
  })
  percent!: number;
}

/** The highest-spending category this period. */
export class TopCategoryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Groceries' })
  name!: string;

  @ApiProperty({
    enum: COLOUR_TOKENS,
    example: 'success',
    description: 'A daisyUI semantic colour token, not a hex.',
  })
  color!: string;

  @ApiProperty({
    description:
      'Major units spent in this category during the current period.',
  })
  spent!: number;
}

/**
 * Every figure the dashboard draws, for the current period.
 *
 * Nothing here is stored: it is all derived on read from `CategoriesService`
 * and `TransactionsService`, the same two services the Categories screen and
 * the transaction reads compose. A fourth place summing a month would be a bug
 * by `backend/CLAUDE.md`'s own money note, so `DashboardService` queries
 * neither `categories` nor `transactions` directly.
 */
export class DashboardResponseDto {
  @ApiProperty({ description: 'Major units spent so far this period.' })
  spent!: number;

  @ApiProperty({
    description:
      'Major units, the monthly budget **in force for this period**. Not necessarily the budget set today: raising it applies from the period you anchor the change to, and earlier periods keep the budget they were spent against.',
  })
  monthlyBudget!: number;

  @ApiProperty({
    description:
      'Major units, `monthlyBudget - spent`. Can be negative: overspending is a state the frontend needs the magnitude to draw, the same reasoning as `unallocated` on `GET /api/categories`.',
  })
  remaining!: number;

  @ApiProperty({
    description:
      'Whole days from today to the end of the period, counting today. 1 on the last day of the period, never 0 - the day is not over. **0 for a period you have navigated back to**, which is finished rather than nearly over.',
  })
  daysLeft!: number;

  @ApiProperty({ description: 'Live transactions in this period.' })
  transactionCount!: number;

  @ApiProperty({
    description:
      '`spent` divided by days elapsed so far (counting today), not by the days in the whole period - the rate that answers "am I burning too fast", not one that looks better the earlier in the month it is read. For a **finished** period every day has elapsed, so it divides by the period’s full length; note that a period is not always a month long.',
  })
  averagePerDay!: number;

  @ApiProperty({
    type: TopCategoryDto,
    nullable: true,
    description:
      'The highest-spending category this period, ties broken by name ascending. Null when nothing has been spent yet.',
  })
  topCategory!: TopCategoryDto | null;

  @ApiProperty({
    type: [WeeklyBucketDto],
    description:
      'Sums to `spent`. Anchored to the period start, not to ISO weeks, so the buckets tile the period without gap or overlap; the last one is short rather than overshooting into the next period. An **empty array**, not zero-filled buckets, when there is nothing to chart this period.',
  })
  weeklyBuckets!: WeeklyBucketDto[];

  @ApiProperty({
    type: [DashboardCategoryDto],
    description:
      'Every nonzero category this period, percentages unrounded and relative to `spent`. The entries account for all of `spent`, so their `spent` fields sum to it and their `percent` fields sum to 100. Empty when there is no spend yet.',
  })
  categories!: DashboardCategoryDto[];

  @ApiProperty({
    type: [TransactionResponseDto],
    description:
      'Up to 3 most recent transactions in the current period, newest first.',
  })
  recentTransactions!: TransactionResponseDto[];

  @ApiProperty({
    type: InsightSummaryDto,
    nullable: true,
    description:
      'The headline and body of the most recently generated insight set, for the teaser card. Null when nothing has been generated yet (including while the first run is still in flight). **Always the latest set**, not one for the period being viewed: insights are generated for the current period only.',
  })
  insight!: InsightSummaryDto | null;

  /**
   * Which period every figure above is for.
   *
   * The field `docs/TODO.md` has asked for since PET-20, and PET-72 is what makes
   * it necessary rather than merely convenient: with `?period=` navigation the
   * frontend can no longer assume the response is about the current month, and
   * with variable-length periods it cannot derive the label by month arithmetic
   * either.
   */
  @ApiProperty({
    type: PeriodSummaryDto,
    description:
      'The period every figure here covers - the current one unless `?period=` asked for another. Use `label` for the screen’s overline rather than deriving a month name from `start`.',
  })
  period!: PeriodSummaryDto;
}
