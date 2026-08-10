import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsPositive,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { MAX_MONTH_START_DAY } from '../../common/period-rules';

/**
 * A pay-schedule change, a budget change, or both - anchored to a paycheck.
 *
 * **Every field is required, and the anchor is why this endpoint exists.**
 * `PATCH /api/profile` used to accept `monthlyBudget` and `monthStartDay` as
 * ordinary fields, which quietly meant "and apply this to all of history". A
 * budget is a fact about a span of time and a pay day reshapes the periods after
 * it, so neither can be set without saying **from when**. Making
 * `firstPaycheckDate` required is what makes that impossible to omit; making the
 * other two required as well means the body always describes a complete schedule
 * rather than a diff whose missing half has to be looked up.
 *
 * **What the server does with it, because the two cases differ:**
 *
 * - `monthStartDay` **differs** from the day in force at the anchor: a real
 *   schedule change. Salaries are paid in arrears, so the old boundary
 *   immediately before the anchor is removed - that paycheck never arrives - and
 *   one stretched **transition period** runs from the last kept boundary up to the
 *   anchor. That transition keeps the **old** budget; the new one starts at the
 *   anchor. A pay-day change must be anchored at or after the newest existing
 *   change: anchoring one behind a later change is a **400**, because a rule
 *   inserted between two others would corrupt the later one's stored transition
 *   and correcting history is deliberately not built.
 * - `monthStartDay` is **unchanged**: a budget-only change. No period boundary
 *   moves, and the new budget applies from the start of the period the anchor
 *   falls in. "Unchanged" also covers an anchor reaching back across the last
 *   pay-day change while carrying the **newest** schedule's day - the day
 *   `GET /api/profile` reports - so a backdated budget edit is never read as a
 *   request to move boundaries.
 *
 * Either way, **periods before the change are untouched** and keep the budget,
 * the caps and the boundaries they were actually budgeted under.
 *
 * The anchor may be in the past or the future. A retroactive one re-shapes the
 * periods from it onward. A future one leaves every period before it unchanged
 * and stretches the period **immediately before the anchor** up to it - anchored
 * past the next boundary, the periods in between still open and close on the old
 * schedule until the transition begins. Either way `GET /api/profile` reports
 * the new values at once, because it serves the schedule as configured rather
 * than the current period's.
 */
export class ChangeScheduleDto {
  /**
   * Major units (e.g. 2000.50). Stored as integer cents.
   *
   * Required even when only the pay day is changing: send the budget you want to
   * keep. The alternative - an optional field meaning "leave it alone" - would
   * have the endpoint resolve the current budget and re-append it, which is the
   * same write with a hidden read in front of it.
   */
  // The bound is spelled out because the plugin renders @IsPositive() as
  // `minimum: 1`, which is right for an integer and wrong for money: 0.50 is a
  // valid budget.
  @ApiProperty({ minimum: 0, exclusiveMinimum: true })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000_000)
  monthlyBudget!: number;

  /**
   * The day of the month you are paid on, 1-28.
   *
   * Capped at 28 so the day exists in every month: a period starting on the 31st
   * would have to mean the 28th in February, and "the same day next month" would
   * stop being a function.
   */
  // Explicit integer type for RegisterDto's reason: every TS `number` publishes
  // as `type: 'number'`, which would advertise 3.5 as a valid day.
  @ApiProperty({ type: 'integer', minimum: 1, maximum: MAX_MONTH_START_DAY })
  @IsInt()
  @Min(1)
  @Max(MAX_MONTH_START_DAY)
  monthStartDay!: number;

  /**
   * The date of the **first paycheck** under this schedule, `YYYY-MM-DD`.
   *
   * Must be day `monthStartDay` of its own month, or the request is a **400**: a
   * period starts on every paycheck, so an anchor falling on any other day would
   * describe a first period beginning on a day no later period ever begins on.
   * The frontend builds it from the month the user picks and the pay day they
   * entered, so the two cannot disagree in practice - the check is there for
   * every other caller.
   */
  // The regex must stay an inline literal: the swagger plugin lifts only inline
  // regex into `pattern` and silently drops a named constant. `@IsDateString({
  // strict: true })` beside it is what rejects 2026-02-30, which a regex cannot
  // know is not a day.
  @ApiProperty({
    format: 'date',
    description:
      'The first paycheck date under the new schedule, `YYYY-MM-DD`. Must be day `monthStartDay` of its month. May be in the past (re-shapes periods from then on) or the future (stretches the period immediately before it up to the anchor; earlier periods are untouched). A pay-day change anchored before a later pay-day change is a **400**.',
    example: '2026-01-14',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  firstPaycheckDate!: string;
}
