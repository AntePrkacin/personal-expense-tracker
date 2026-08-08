import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsInt,
  IsISO4217CurrencyCode,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { normalizeEmail } from '../../common/normalize-email';

/**
 * A hard ceiling on the picked-category array, and **not** the length of the
 * offered list.
 *
 * This field used to read `@ArrayMaxSize(STARTER_CATEGORY_NAMES.length)`, whose
 * bound came from the constant PET-64 deleted. The offered list is a table now,
 * so there is no compile-time length to derive one from - and a count query
 * here is the wrong fix twice over: it would put a database read in front of
 * validation on the one route anybody can post to unauthenticated, whose timing
 * properties `backend/CLAUDE.md` is most careful about.
 *
 * So it is a literal, well above any plausible template count. It exists to
 * bound the array, not to describe the list; an id past the end of the real
 * list is rejected by the membership check in `AuthService` either way.
 */
const MAX_PICKED_CATEGORIES = 100;

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
  //
  // The plugin derives nothing from @IsISO4217CurrencyCode(), so without the
  // metadata below this publishes as a bare string and the generated frontend
  // type accepts any text at all. The pattern is case-insensitive because the
  // transform above runs before validation - it is honest about what the
  // endpoint takes, and the ISO list itself belongs in the description rather
  // than a 180-entry enum that drifts the moment the standard does.
  @ApiPropertyOptional({
    pattern: '^[A-Za-z]{3}$',
    description:
      'ISO 4217 code, e.g. `EUR`. Case-insensitive on the way in, stored and returned uppercase.',
    example: 'EUR',
  })
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
  // The bound is spelled out for the spec because the swagger plugin renders
  // @IsPositive() as `minimum: 1`, which is right for an integer and wrong
  // here: 0.50 is a valid budget. Everything else on this field it derives
  // correctly, including the description above.
  @ApiProperty({ minimum: 0, exclusiveMinimum: true })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000_000)
  monthlyBudget!: number;

  /** Capped at 28 so the day exists in every month. */
  // `type: 'integer'` spelled out because the plugin renders every TS `number`
  // as `type: 'number'`, which publishes 3.5 as a valid day while @IsInt()
  // rejects it. The derived `minimum` and `maximum` merge in alongside this.
  @ApiPropertyOptional({ type: 'integer' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  monthStartDay?: number;

  /**
   * The starter chips picked on screen 03, **by `category_templates.id`**.
   *
   * Ids rather than names since PET-64. The offered list is admin-managed data
   * in central now, so `@IsIn` has nothing to close over: a name is no longer a
   * stable key, and the enum a name-based check used to publish would have been
   * a snapshot of a table taken at build time. What replaces it is a shape check
   * here plus a **membership check against central** in `AuthService`, ahead of
   * the floated token issue and mail send so the empty-202 timing property
   * holds. An unknown id is a 400, consistent with "a malformed address is a
   * fact about the input, not about the account" - it names no account and
   * leaks nothing.
   *
   * Required but allowed to be empty: A4 records that no minimum is enforced,
   * and a user who deselects everything is making a valid choice. Required
   * rather than optional so a frontend that stops sending the field fails
   * loudly instead of silently seeding nothing.
   *
   * `@IsUUID()` before the lookup is what keeps junk out of an `IN (...)`
   * against central, and `@ArrayUnique` stops one template being seeded twice.
   * Unversioned, like every other id check in this app: primary keys here are
   * **v7** (`src/common/ids.ts`), so pinning a version would reject all of them.
   */
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description:
      'Ids from `GET /api/templates/categories`. May be empty. Unknown ids are a 400.',
  })
  @IsArray()
  @ArrayMaxSize(MAX_PICKED_CATEGORIES)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  categories!: string[];
}
