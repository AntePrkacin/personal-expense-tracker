import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
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
import {
  COLOUR_TOKENS,
  ICON_NAMES,
} from '../../database/central/template-tokens';

/**
 * A change to an existing category. Send only what changes.
 *
 * **Tri-state, but only two fields have a middle case.** Absent leaves a field
 * alone and a value sets it; `null` clears, and only `monthlyCap` and
 * `description` accept it. Every other field uses
 * `@ValidateIf((_, v) => v !== undefined)` rather than `@IsOptional()`, for the
 * reason `backend/CLAUDE.md` records: `@IsOptional()` skips validation for `null`
 * as well as `undefined`, so `{"name": null}` would pass every check and reach a
 * NOT NULL column as a 500.
 *
 * **`icon` used to be the third clearable field and no longer is.**
 * `CreateCategoryDto` requires an icon as of PET-64, so letting a PATCH set one
 * back to null would put a category into a state the API can no longer create -
 * and every render would fall back to a glyph the user did not choose. Its column
 * is NOT NULL as of PET-72, so a null here would now be a 500 rather than merely
 * an unrenderable row.
 *
 * Clearing `monthlyCap` back to null is deliberate and supported - deciding a
 * category no longer needs a limit is an ordinary thing to want, and the stats
 * read already defines what an uncapped category looks like. **It is an append,
 * not a clear**: a cap row with a null `cap_cents` effective from the anchored
 * period - `capFrom`, or the current period when it is absent - so the periods
 * before the anchor stay exactly as they were.
 *
 * `name` is rejected with a **409** for the `Uncategorized` fallback, whose name
 * is a system invariant. Its cap, color, icon and description are all editable.
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

  /**
   * Major units. `null` clears the cap, leaving the category uncapped.
   *
   * Applies from the period `capFrom` names onward - the current one when it is
   * absent - never further back: the change is a new row in this category's cap
   * history, so every period before the anchor keeps the cap it was budgeted
   * under.
   */
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

  /**
   * The period the cap change applies from: a period's own `start` from
   * `GET /api/periods`. Omitted means the current period.
   *
   * Meaningful only beside `monthlyCap` - sent without one it is a **400**,
   * because there is nothing for it to date and silently ignoring it would
   * read as a backdate that happened. Backdating is deliberate and visible:
   * every period from the anchor onward is re-judged against the new cap,
   * unless a newer cap row already covers it, and every period before the
   * anchor keeps its own. A date that is not one of your period starts, or
   * starts a future period, is a **400**.
   */
  // The regex must stay an inline literal - the swagger plugin lifts only an
  // inline literal into `pattern` - and `@IsDateString({ strict: true })`
  // beside it is what rejects `2026-02-30`, the same pair every date field in
  // this API carries.
  @ApiPropertyOptional({
    format: 'date',
    description:
      'A period `start` from `GET /api/periods` that the cap applies from. Omit for the current period. Requires `monthlyCap` in the same body. Periods before it are untouched; periods from it onward use the new cap unless a later cap row already covers them.',
    example: '2025-12-01',
  })
  @ValidateIf((_, value) => value !== undefined)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  capFrom?: string;

  /** A lucide icon name. Not clearable - see the class comment. */
  @ApiPropertyOptional({ enum: ICON_NAMES, example: 'shopping-basket' })
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(ICON_NAMES)
  icon?: string;

  /** Free text the user owns. `null` clears it. Called `note` before PET-72. */
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}
