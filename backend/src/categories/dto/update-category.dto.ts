import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  COLOUR_TOKENS,
  ICON_NAMES,
} from '../../database/central/template-tokens';

/**
 * A change to an existing category. Send only what changes.
 *
 * **Tri-state, but only two fields have a middle case.** Absent leaves a field
 * alone and a value sets it; `null` clears, and only `monthlyCap` and `note`
 * accept it. Every other field uses `@ValidateIf((_, v) => v !== undefined)`
 * rather than `@IsOptional()`, for the reason `backend/CLAUDE.md` records:
 * `@IsOptional()` skips validation for `null` as well as `undefined`, so
 * `{"name": null}` would pass every check and reach a NOT NULL column as a 500.
 *
 * **`icon` used to be the third clearable field and no longer is**, even though
 * its column is still nullable. `CreateCategoryDto` requires an icon as of
 * PET-64, so letting a PATCH set one back to null would put a category into a
 * state the API can no longer create - and every render would fall back to a
 * glyph the user did not choose. The column stays nullable because tightening
 * it is a user-scope migration this ticket declines to run.
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

  /** A daisyUI semantic colour token. See `CreateCategoryDto.color`. */
  @ApiPropertyOptional({ enum: COLOUR_TOKENS, example: 'success' })
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(COLOUR_TOKENS)
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

  /** A lucide icon name. Not clearable - see the class comment. */
  @ApiPropertyOptional({ enum: ICON_NAMES, example: 'shopping-basket' })
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(ICON_NAMES)
  icon?: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
