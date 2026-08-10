import { ApiProperty } from '@nestjs/swagger';

/**
 * One budgeting period: the window it covers and the name to show for it.
 *
 * **`start` is the period's identity.** It is what `?period=` takes on the
 * transaction, category and dashboard reads, and the only value a client should
 * ever build such a query from - a date that is not a period start is a 400
 * there, because on an account paid on the 14th most dates name no period at all.
 *
 * `end` is **exclusive**, matching every other window in this API: a transaction
 * belongs to this period when `start <= date < end`.
 *
 * This is the shape embedded in the dashboard, category and transaction list
 * responses, so each screen can print the period it is actually showing. The
 * period *list* adds one field to it; see `PeriodResponseDto`.
 */
export class PeriodSummaryDto {
  @ApiProperty({
    format: 'date',
    description:
      'First day of the period, inclusive. `YYYY-MM-DD`. Pass this verbatim as `?period=` elsewhere.',
    example: '2025-12-01',
  })
  start!: string;

  @ApiProperty({
    format: 'date',
    description:
      'First day **after** the period, exclusive. `YYYY-MM-DD`. Also the next period’s `start`, so periods tile with no gap.',
    example: '2026-01-14',
  })
  end!: string;

  @ApiProperty({
    description:
      'What to print above the screen, e.g. `October 2025`. Names **every month the period touches**, so an account paid mid-month reads `October / November 2025` - and a period stretched by a pay-schedule change can read `December 2025 / January 2026`. Do not derive this from `start`: a period is not always one month, so month arithmetic on the frontend would print the wrong thing exactly when it matters.',
    example: 'December 2025 / January 2026',
  })
  label!: string;
}

/**
 * A period as the period *list* reports it: the summary plus which one is now.
 *
 * Inherits rather than restating the three fields, which is what keeps their
 * descriptions in one place. `@nestjs/swagger` walks the prototype chain for that
 * metadata, so the generated schema carries all four - and
 * `test/openapi.e2e-spec.ts` pins it, because a silently missing inherited field
 * is exactly the failure mode `docs/agents/api-contract.md` warns about.
 */
export class PeriodResponseDto extends PeriodSummaryDto {
  @ApiProperty({
    description:
      'True for the one period containing today. Exactly one period in the list carries it.',
  })
  current!: boolean;
}

/**
 * Every period the account has, newest first.
 *
 * A wrapper object rather than a bare array, like every other collection here:
 * `ValidationPipe` skips a body whose reflected metatype is `Array`, and a
 * top-level array leaves no room to add a field later without breaking clients.
 *
 * **The list is bounded by the account's own history, not by a fixed number of
 * months**: it runs from the earlier of the account's first pay schedule and its
 * oldest transaction (including deleted ones) up to the current period, and never
 * into the future.
 */
export class PeriodsResponseDto {
  @ApiProperty({
    type: [PeriodResponseDto],
    description: 'Newest first, so index 0 is the current period.',
  })
  periods!: PeriodResponseDto[];
}
