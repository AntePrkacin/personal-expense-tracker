import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsNotEmpty,
  Matches,
  Max,
  MaxLength,
} from 'class-validator';

/**
 * A new category, as the Add category modal submits it.
 *
 * **A cap is optional.** The ticket originally required one greater than zero,
 * which would have made uncapped categories a legacy artifact the API could
 * never produce again - the ten onboarding chips and the seeded `Uncategorized`
 * all have none. Users are not forced to budget per category, so an absent cap
 * is a first-class choice meaning "no limit", and the stats read answers
 * `status: "uncapped"` for it.
 *
 * A cap of exactly `0` is still rejected. It is a different state - "I intend to
 * spend nothing here", which puts the category Over on its first transaction -
 * and it is far more likely an empty form field coerced to a number than an
 * intent. What it would express is better said by omitting the cap.
 */
export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  /** Hex, `#RRGGBB`. The eight category colors come from Figma frame 03. */
  // The regex is an inline literal because the swagger plugin lifts only those
  // into `pattern` and silently drops a named constant - the same trap
  // CreateTransactionDto documents for its date.
  @ApiProperty({ example: '#57B368' })
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'color must be a hex color in #RRGGBB form',
  })
  color!: string;

  /**
   * Major units (e.g. 400.00), stored as integer cents. Omit for no cap.
   */
  // Spelled out for the same reason as CreateTransactionDto.amount: the plugin
  // renders @IsPositive() as `minimum: 1`, which is wrong where 0.50 is valid.
  @ApiPropertyOptional({ minimum: 0, exclusiveMinimum: true })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000_000)
  monthlyCap?: number;

  /** A name from the frontend's own icon set. Never resolved to an asset here. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  icon?: string;

  /** Captured, but surfaces on no screen today (CED-4, A42). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
