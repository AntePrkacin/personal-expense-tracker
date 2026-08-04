import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * A change to an existing category. Send only what changes.
 *
 * **Tri-state, but only two fields have a middle case.** Absent leaves a field
 * alone and a value sets it; `null` clears, and only `monthlyCap` and `note`
 * accept it, because they are the only nullable columns. Every other field uses
 * `@ValidateIf((_, v) => v !== undefined)` rather than `@IsOptional()`, for the
 * reason `backend/CLAUDE.md` records: `@IsOptional()` skips validation for
 * `null` as well as `undefined`, so `{"name": null}` would pass every check and
 * reach a NOT NULL column as a 500.
 *
 * Clearing `monthlyCap` back to null is deliberate and supported - deciding a
 * category no longer needs a limit is an ordinary thing to want, and the stats
 * read already defines what an uncapped category looks like.
 *
 * `name` is rejected with a **409** for the `Uncategorized` fallback, whose name
 * is a system invariant. Its cap, color, icon and note are all editable.
 */
export class UpdateCategoryDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({ example: '#57B368' })
  @ValidateIf((_, value) => value !== undefined)
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'color must be a hex color in #RRGGBB form',
  })
  color?: string;

  /** Major units. `null` clears the cap, leaving the category uncapped. */
  @ApiPropertyOptional({
    minimum: 0,
    exclusiveMinimum: true,
    nullable: true,
    type: Number,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000_000)
  monthlyCap?: number | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  icon?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
