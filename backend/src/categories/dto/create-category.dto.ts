import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsNotEmpty,
  Max,
  MaxLength,
} from 'class-validator';
import {
  COLOUR_TOKENS,
  ICON_NAMES,
} from '../../database/central/template-tokens';

/**
 * A new category, as the Add category modal submits it.
 *
 * **A cap is optional.** The ticket originally required one greater than zero,
 * which would have made uncapped categories a legacy artifact the API could
 * never produce again - every onboarding chip and the seeded `Uncategorized`
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

  /**
   * A daisyUI semantic colour token, not a hex.
   *
   * **Hex was not merely indirect here, it was incoherent.** `primary` is the
   * one token daisyUI values differently per theme, so Entertainment
   * (`#422ad5` light, `#605dff` dark) and Education (`#e0e7ff`, `#edf1fe`) have
   * no single hex value at all - a stored one would record one and paint the
   * other half the time. The token is the stable identity; the theme resolves
   * the hue.
   *
   * `GET /api/templates/palette` is what a picker offers, and it can be a
   * strict subset of this list: `enabled` is presentation and this is
   * validation, so a category carrying a since-disabled colour still saves.
   */
  // The explicit `enum` is this repo's convention and is asserted in
  // test/openapi.e2e-spec.ts: the plugin derives nothing from @IsIn, so without
  // it this publishes as a bare string and the generated frontend type accepts
  // any text - which would quietly turn `Record<CategoryColour, string>` into
  // `Record<string, string>` and let every tile render grey. This replaces the
  // inline-regex-literal trap the field used to document; there is no `pattern`
  // here any more, and there must not be one.
  @ApiProperty({ enum: COLOUR_TOKENS, example: 'success' })
  @IsIn(COLOUR_TOKENS)
  color!: string;

  /**
   * Major units (e.g. 400.00), stored as integer cents. Omit for no cap.
   *
   * **Stored as the first row of this category's cap history, effective from the
   * current period** - not as a column on the category. So a cap set today is the
   * cap for this period onward and does not claim to have applied to periods
   * before the category existed.
   */
  // Spelled out for the same reason as CreateTransactionDto.amount: the plugin
  // renders @IsPositive() as `minimum: 1`, which is wrong where 0.50 is valid.
  @ApiPropertyOptional({ minimum: 0, exclusiveMinimum: true })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000_000)
  monthlyCap?: number;

  /**
   * A lucide icon name, and **required** as of PET-64.
   *
   * It was `@IsString() @MaxLength(60)` and optional, which accepted `cup` and
   * `box` - neither of which is a lucide name, so neither could ever render.
   * Narrowing it to the allowlist is what makes `Record<IconName, LucideIcon>`
   * on the frontend an exhaustiveness proof, and requiring it is free now and
   * expensive later.
   *
   * **The column is NOT NULL as of PET-72**, which is what this comment used to
   * explain the absence of: tightening it would have been the one user-scope
   * migration PET-64 declined to run against live data. The pre-launch database
   * reset removed that constraint along with the legacy rows, so the column now
   * says what this field has required since PET-64.
   */
  @ApiProperty({ enum: ICON_NAMES, example: 'shopping-basket' })
  @IsIn(ICON_NAMES)
  icon!: string;

  /**
   * Captured, but surfaces on no screen today (CED-4, A42).
   *
   * Called `description` since PET-72, matching both the column and the
   * `category_templates.description` a starter category copies it from. It was
   * `note`, which made the one field a user edits share a name with
   * `transactions.note`, a different field on a different table.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
