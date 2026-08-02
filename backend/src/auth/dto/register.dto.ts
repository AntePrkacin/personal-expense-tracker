import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsIn,
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
import { normalizeEmail } from '../../common/normalize-email';
import { STARTER_CATEGORY_NAMES } from '../../database/user/starter-categories';

/**
 * Everything screens 02, 03 and 22 collected, submitted in one request when
 * "Finish setup" is pressed (REG-4). The account does not exist during the
 * first two steps, so those values are held client-side until here (A32).
 */
export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  // See normalizeEmail for why this is normalized here. Non-strings pass
  // through so @IsEmail reports the type error rather than this silently
  // turning them into undefined.
  @Transform(({ value }: { value: unknown }) => normalizeEmail(value) ?? value)
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

  /**
   * The starter chips picked on screen 03, by name.
   *
   * Required but allowed to be empty: A4 records that no minimum is enforced,
   * and a user who deselects everything is making a valid choice. Required
   * rather than optional so a frontend that stops sending the field fails
   * loudly instead of silently seeding nothing.
   */
  @IsArray()
  @ArrayMaxSize(STARTER_CATEGORY_NAMES.length)
  @ArrayUnique()
  @IsIn(STARTER_CATEGORY_NAMES, { each: true })
  categories!: string[];
}
