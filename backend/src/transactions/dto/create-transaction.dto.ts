import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
} from 'class-validator';

/**
 * A new spend, as the add-transaction form submits it.
 *
 * Nothing here is display-only. Time, payment method, status and account appear
 * on the transaction detail mock (DET-8) but no form captures them and no
 * column stores them, so they are not accepted: `forbidNonWhitelisted` turns
 * one into a 400 rather than dropping it silently and letting a frontend
 * believe it was saved. See A20 in docs/TODO.md.
 */
export class CreateTransactionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  merchant!: string;

  /** An existing category of this user's. An unknown id is a 404, not a 400. */
  @IsUUID()
  categoryId!: string;

  /**
   * Major units (e.g. 12.50), stored as integer cents. Positive: this app
   * records spending, and direction is not a per-row choice.
   */
  // Spelled out for the same reason as RegisterDto.monthlyBudget: the swagger
  // plugin renders @IsPositive() as `minimum: 1`, which is right for an integer
  // and wrong here, where 0.50 is a perfectly good amount.
  @ApiProperty({ minimum: 0, exclusiveMinimum: true })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000_000)
  amount!: number;

  /**
   * The calendar day the money was spent, `YYYY-MM-DD`. Stored verbatim.
   *
   * Backdating is ordinary and supported: the month a transaction belongs to is
   * derived from this at read time, so a date in a past month lands in that
   * month rather than the one it was entered in.
   */
  // Two decorators doing two different jobs, and both are needed. @Matches pins
  // the shape - and the regex has to be an inline literal, because the swagger
  // plugin lifts only those into `pattern` and silently drops a named
  // constant. @IsDateString then runs a real calendar check, which is what
  // rejects 2026-02-30: a regex cannot know February's length.
  @ApiProperty({ format: 'date', example: '2026-08-03' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be a calendar date in YYYY-MM-DD form',
  })
  @IsDateString({ strict: true, strictSeparator: true })
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
