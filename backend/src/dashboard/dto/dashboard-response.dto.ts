import { ApiProperty } from '@nestjs/swagger';
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

  @ApiProperty({ example: '#57B368', description: 'Hex, `#RRGGBB`.' })
  color!: string;

  @ApiProperty({
    description:
      'Major units spent in this category during the current period.',
  })
  spent!: number;

  @ApiProperty({
    description:
      "Percentage of the period's total spend this category accounts for, unrounded. Relative to `spent` on this response, not to any cap.",
  })
  percent!: number;
}

/** The highest-spending category this period. */
export class TopCategoryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Groceries' })
  name!: string;

  @ApiProperty({ example: '#57B368', description: 'Hex, `#RRGGBB`.' })
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
    description: 'Major units, the monthly budget from your profile.',
  })
  monthlyBudget!: number;

  @ApiProperty({
    description:
      'Major units, `monthlyBudget - spent`. Can be negative: overspending is a state the frontend needs the magnitude to draw, the same reasoning as `unallocated` on `GET /api/categories`.',
  })
  remaining!: number;

  @ApiProperty({
    description:
      'Whole days from today to the end of the period, counting today. 1 on the last day of the period, never 0 - the day is not over.',
  })
  daysLeft!: number;

  @ApiProperty({ description: 'Live transactions in the current period.' })
  transactionCount!: number;

  @ApiProperty({
    description:
      '`spent` divided by days elapsed so far (counting today), not by the days in the whole period - the rate that answers "am I burning too fast", not one that looks better the earlier in the month it is read.',
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
      'Every nonzero category this period, percentages unrounded and relative to `spent`. Empty when there is no spend yet.',
  })
  categories!: DashboardCategoryDto[];

  @ApiProperty({
    type: [TransactionResponseDto],
    description:
      'Up to 3 most recent transactions in the current period, newest first.',
  })
  recentTransactions!: TransactionResponseDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'The teaser from the most recently generated insight set. Always null until PET-41 ships the insights table and starts filling this in.',
  })
  insight!: string | null;
}
