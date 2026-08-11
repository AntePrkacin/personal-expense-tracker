import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
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
import { DEFAULT_CURRENCY, SUPPORTED_CURRENCIES } from '../../common/currency';
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
  /**
   * What the sidebar and greeting show. One field, not a first and last name.
   *
   * PET-72 collapsed the two. The app never used them apart - the sidebar wants
   * initials and a short name, both derivable from one string - so the second was
   * data collected in order to be thrown away. The form's label is "Display name",
   * and a nickname is a legitimate answer.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName!: string;

  // See normalizeEmail for why this is normalized here. Non-strings pass
  // through so @IsEmail reports the type error rather than this silently
  // turning them into undefined.
  @Transform(({ value }: { value: unknown }) => normalizeEmail(value) ?? value)
  @IsEmail()
  email!: string;

  // Uppercased first, so 'eur' passes and is stored as 'EUR'.
  //
  // **`@IsIn(SUPPORTED_CURRENCIES)` since PET-72, replacing
  // `@IsISO4217CurrencyCode()`.** The old comment here argued that the ISO list
  // "belongs in the description rather than a 180-entry enum that drifts the
  // moment the standard does" - which was right about the enum and wrong about
  // accepting the whole standard, because `src/common/money.ts` multiplies by 100
  // unconditionally. A user picking JPY had every amount they typed inflated a
  // hundredfold. The allowlist is exponent-2 currencies only; see
  // `src/common/currency.ts` for why that is the fix rather than a workaround.
  //
  // The enum is spelled out in `@ApiProperty` because the plugin derives nothing
  // from `@IsIn` - without it this publishes as a bare string and the generated
  // frontend type accepts any text at all, which is what would let the picker
  // offer a code the backend rejects.
  @ApiPropertyOptional({
    enum: SUPPORTED_CURRENCIES,
    default: DEFAULT_CURRENCY,
    description:
      'ISO 4217 code. Case-insensitive on the way in, stored and returned uppercase. Restricted to two-decimal currencies, because the API assumes an exponent of 2 everywhere.',
    example: 'EUR',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
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

  /**
   * The day of the month you are paid on. Capped at 28 so the day exists in
   * every month.
   *
   * **This is the pay day, and onboarding asks for it as of PET-72.** It becomes
   * the account's first `period_rules` row, anchored to the most recent occurrence
   * of this day - so the account starts with a real pay schedule rather than a
   * setting, and changing it later moves only the periods from the change onward.
   */
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
