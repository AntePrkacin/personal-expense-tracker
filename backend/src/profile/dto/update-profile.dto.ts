import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsISO4217CurrencyCode,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { normalizeEmail } from '../../common/normalize-email';

/**
 * Only the fields the caller wants changed, per PATCH semantics.
 *
 * The tri-state contract of `UpdateTransactionDto`, minus its middle case:
 * **absent** leaves the field alone and a **value** sets it, but **no field
 * accepts null**, because every column behind this one is NOT NULL.
 *
 * That is why this is hand-written rather than `PartialType(RegisterDto)` with
 * `@IsOptional()` on everything. `@IsOptional()` skips validation for null as
 * well as undefined, so `{"firstName": null}` would pass every check and reach
 * a NOT NULL column, turning a bad request into a 500. `@ValidateIf` keyed on
 * `undefined` alone is the fix: absent fields skip validation, and an explicit
 * null is validated and refused.
 *
 * The validator stacks mirror `RegisterDto` field for field on purpose - the
 * Settings form edits exactly what onboarding collected, so a value accepted at
 * registration must stay acceptable here. `categories` is deliberately absent:
 * the starter set is seeded once at verification and the categories feature owns
 * it from there.
 */

/** Absent means "unchanged", so skip validation. An explicit null is validated. */
const provided = (_object: unknown, value: unknown): boolean =>
  value !== undefined;

export class UpdateProfileDto {
  @ValidateIf(provided)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName?: string;

  @ValidateIf(provided)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName?: string;

  /**
   * The login identifier. Changing it changes where future login links are sent
   * (AC6); links already in flight to the old address keep working.
   */
  // Normalized here like everywhere else, so the partial unique index on
  // users.email holds. Non-strings pass through so @IsEmail reports the type
  // error rather than this silently turning them into undefined.
  @Transform(({ value }: { value: unknown }) => normalizeEmail(value) ?? value)
  @ValidateIf(provided)
  @IsEmail()
  email?: string;

  // The same uppercase-then-validate pair as RegisterDto, and the same published
  // metadata: @IsISO4217CurrencyCode() derives nothing, so without it this is a
  // bare string in the contract. Keep the two byte-identical - they describe one
  // field, written twice.
  @ApiPropertyOptional({
    pattern: '^[A-Za-z]{3}$',
    description:
      'ISO 4217 code, e.g. `EUR`. Case-insensitive on the way in, stored and returned uppercase.',
    example: 'EUR',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @ValidateIf(provided)
  @IsISO4217CurrencyCode()
  currency?: string;

  /** Major units (e.g. 2000.50), as at registration. Stored as integer cents. */
  // The bound is spelled out because the plugin renders @IsPositive() as
  // `minimum: 1`, which is right for an integer and wrong for money: 0.50 is a
  // valid budget.
  @ApiPropertyOptional({ minimum: 0, exclusiveMinimum: true })
  @ValidateIf(provided)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000_000)
  monthlyBudget?: number;

  /** Capped at 28 so the day exists in every month. */
  // Explicit integer type for RegisterDto's reason: every TS `number` publishes
  // as `type: 'number'`, which would advertise 3.5 as a valid day.
  @ApiPropertyOptional({ type: 'integer' })
  @ValidateIf(provided)
  @IsInt()
  @Min(1)
  @Max(28)
  monthStartDay?: number;
}
