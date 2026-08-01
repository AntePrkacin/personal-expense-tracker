import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsISO4217CurrencyCode,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  // Normalized here rather than in the database: SQLite could do it with
  // `COLLATE NOCASE`, but Drizzle's column builder cannot express that, so the
  // unique index only holds if every write goes in already lowercased.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  // Uppercased first, so 'eur' passes and is stored as 'EUR'; the validator
  // checks against the (uppercase) ISO 4217 list, not just "any 3 letters".
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsOptional()
  @IsISO4217CurrencyCode()
  currency?: string;

  /**
   * Major units (e.g. 2000.50). Stored as integer cents. The cap is not a
   * product judgment: it keeps the cents conversion far inside JS safe-integer
   * range while staying generous for zero-decimal currencies, whose budgets
   * carry many digits.
   */
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000_000)
  monthlyBudget!: number;

  /** Capped at 28 so the day exists in every month. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  monthStartDay?: number;
}
