import { ApiPropertyOptional } from '@nestjs/swagger';
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
  ValidateIf,
} from 'class-validator';

/**
 * Only the fields the caller wants changed, per PATCH semantics.
 *
 * The tri-state contract: **absent** leaves the field alone, **null** clears it
 * (nullable fields only, which is `note` and nothing else), and a **value**
 * sets it.
 *
 * That is why this is hand-written rather than `PartialType(CreateTransactionDto)`
 * with `@IsOptional()` on everything. `@IsOptional()` skips validation for null
 * as well as undefined, so `{"merchant": null}` would pass every check and reach
 * a NOT NULL column, turning a bad request into a 500. `@ValidateIf` keyed on
 * `undefined` alone is the fix: absent fields skip validation, and an explicit
 * null is validated and refused.
 */

/** Absent means "unchanged", so skip validation. An explicit null is validated. */
const provided = (_object: unknown, value: unknown): boolean =>
  value !== undefined;

export class UpdateTransactionDto {
  @ValidateIf(provided)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  merchant?: string;

  @ValidateIf(provided)
  @IsUUID()
  categoryId?: string;

  /** Major units, as on create. */
  @ApiPropertyOptional({ minimum: 0, exclusiveMinimum: true })
  @ValidateIf(provided)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000_000)
  amount?: number;

  /** `YYYY-MM-DD`, as on create. Inline regex for the `pattern` lift. */
  @ApiPropertyOptional({ format: 'date', example: '2026-08-03' })
  @ValidateIf(provided)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be a calendar date in YYYY-MM-DD form',
  })
  @IsDateString({ strict: true, strictSeparator: true })
  date?: string;

  /**
   * The one nullable field, and so the one that keeps `@IsOptional()`: null is
   * a meaningful value here rather than a mistake, and it means "clear the
   * note".
   */
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
