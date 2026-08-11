import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsNumber,
  IsPositive,
  IsUUID,
  Matches,
  Max,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/**
 * A literal ceiling rather than a count of the caller's categories, for
 * `RegisterDto.categories`' reason: a count query here would put a database read
 * in front of validation. Nothing in this app has a hundred categories, so this
 * bounds request size and how far one mistaken request can reach, nothing more.
 */
const MAX_CAPS_PER_REQUEST = 100;

/** One category's new cap. */
export class CategoryCapDto {
  @ApiProperty({ format: 'uuid' })
  // Unversioned, like every other id check in this app: primary keys here are
  // v7 (`src/common/ids.ts`), so pinning a version would reject all of them.
  @IsUUID()
  id!: string;

  /**
   * Major units. `null` clears the cap, leaving the category uncapped.
   *
   * **Required on every entry**, unlike `UpdateCategoryDto.monthlyCap`: this
   * endpoint has no "leave this field alone" case, so an omitted cap is a 400
   * rather than a no-op.
   */
  // The two paragraphs that used to sit in the docblock are here instead,
  // because the swagger plugin lifts JSDoc into the published description and
  // neither is any use to a caller - the split `CreateCategoryDto` already draws.
  //
  // `@ValidateIf` rather than `@IsOptional()`, and the difference is the whole
  // reason the field is required-and-nullable. `@IsOptional()` skips validation
  // for `undefined` as well as `null`, so it would accept an entry naming a
  // category and saying nothing about its cap - which reaches the `CASE` in
  // `setCaps` with no arm of its own and sets that cap to NULL. So the trap here
  // is the mirror of the one `UpdateCategoryDto` documents: there `@IsOptional`
  // is wanted for its skip-on-null, here only the skip-on-null is wanted and the
  // skip-on-undefined would silently uncap a category.
  @ApiProperty({
    minimum: 0,
    exclusiveMinimum: true,
    nullable: true,
    type: Number,
  })
  @ValidateIf((_, value) => value !== null)
  // Spelled out for `CreateCategoryDto.monthlyCap`'s reason: the plugin renders
  // @IsPositive() as `minimum: 1`, which is wrong where 0.50 is a valid cap.
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000_000)
  monthlyCap!: number | null;
}

/**
 * Every cap the Allocate budget modal changed, applied atomically.
 *
 * **A wrapper object rather than a bare array body, and not for taste.**
 * `ValidationPipe.toValidate` returns false when the reflected metatype is
 * `Array`, so `@Body() items: CategoryCapDto[]` arrives with the global pipe
 * skipped entirely - no `whitelist`, no `forbidNonWhitelisted`, no `@IsUUID`,
 * no cap bound. What that costs is not theoretical: SQLite's INTEGER affinity
 * stores a string cap in `monthly_cap_cents` **as TEXT**, and the category then
 * serialises with `status: "on_track"` beside a null `monthlyCap`, a shape
 * `CategoryResponseDto` says is impossible, stored permanently. A bare array
 * also cannot carry `@ApiProperty`, so its schema would have to be hand-written
 * with `@ApiBody`.
 *
 * The field is named `categories` after `RegisterDto.categories`, this repo's
 * only other array body.
 */
export class UpdateCategoryCapsDto {
  /**
   * One entry per category whose cap is changing. Send only what changed.
   *
   * `@ValidateNested` and `@Type` are **both** required and neither works alone:
   * without them the entries pass as plain objects with every decorator above
   * unrun, which is the quiet-failure class `docs/agents/api-contract.md`
   * describes for response shapes, arriving here on the request side.
   *
   * `@ArrayUnique` takes an identifier function because comparison for objects
   * is otherwise reference-based, so two entries naming one category would both
   * pass. **It is load-bearing rather than hygiene:** `setCaps` guards itself
   * with `count(*) = ids.length`, and a repeated id makes that count
   * unreachable, so dropping this decorator would turn every duplicate into a
   * permanent 404 instead of a clean 400.
   */
  @ApiProperty({
    type: [CategoryCapDto],
    minItems: 1,
    maxItems: MAX_CAPS_PER_REQUEST,
    description:
      'One entry per category, at least one. A repeated `id` is a 400. Either every entry is applied or none is.',
  })
  @IsArray()
  // The bulk analogue of `update()`'s empty-body 400, and it belongs here rather
  // than in the service: that guard is in code only because no decorator can say
  // "at least one of these five fields", which is not the shape of this rule.
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_CAPS_PER_REQUEST)
  @ArrayUnique((item: CategoryCapDto) => item.id)
  @ValidateNested({ each: true })
  @Type(() => CategoryCapDto)
  categories!: CategoryCapDto[];

  /**
   * The period every cap in the batch applies from: a period's own `start` from
   * `GET /api/periods`. Omitted means the current period.
   *
   * One anchor for the whole batch rather than one per entry, because the
   * Allocate modal asks its "from when" question once for the save - a payload
   * mixing anchors would be several decisions dressed as one, and nothing in
   * the UI can express it. The same visibility rule as
   * `UpdateCategoryDto.capFrom`: periods before the anchor are untouched, and a
   * date that starts none of your periods, or a future one, is a **400**.
   */
  // The inline-regex-plus-strict-date pair every date field in this API
  // carries; see `UpdateCategoryDto.capFrom`.
  @ApiPropertyOptional({
    format: 'date',
    description:
      'A period `start` from `GET /api/periods` that every cap in the batch applies from. Omit for the current period. Periods before it are untouched.',
    example: '2025-12-01',
  })
  @ValidateIf((_, value) => value !== undefined)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  capsFrom?: string;
}
