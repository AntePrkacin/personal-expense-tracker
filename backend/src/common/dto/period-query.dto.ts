import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, Matches } from 'class-validator';

/**
 * `?period=<YYYY-MM-DD>` - a period named by its own start date.
 *
 * Shared by `GET /api/categories` and `GET /api/dashboard`, which both answer for
 * exactly one period and have no other query parameter between them. The
 * transaction list does **not** use this: its `period` also accepts `current`,
 * `previous` and `all`, so it keeps its own field on
 * `ListTransactionsQueryDto`.
 *
 * **Omitted means the current period**, which is what every screen loads by
 * default and why the frontend leaves the parameter off rather than sending
 * today's period start - a URL that names a period explicitly would go stale the
 * moment the period rolled over.
 *
 * **An unknown start is a 400.** `PeriodService.startingAt` rejects a date that
 * is not a period start, rather than serving the period containing it: on an
 * account paid on the 14th most dates name no period at all, and answering
 * anyway would make two different query strings return the same page under an
 * overline that disagreed with one of them.
 */
export class PeriodQueryDto {
  /**
   * A period's own `start`, from `GET /api/periods`.
   */
  // The regex must stay an inline literal: the swagger plugin lifts only inline
  // regex into `pattern` and silently drops a named constant. Same trap as the
  // transaction DTOs' `date`, and `@IsDateString({ strict: true })` beside it is
  // what rejects 2026-02-30, which a regex cannot know is not a day.
  @ApiPropertyOptional({
    format: 'date',
    description:
      'A period’s `start` from `GET /api/periods`. Omit for the current period. A date that is not the start of one of your periods is a **400**, so build this from that endpoint rather than from month arithmetic.',
    example: '2025-12-01',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  period?: string;
}
