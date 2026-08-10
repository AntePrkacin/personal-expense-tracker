import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { SUPPORTED_CURRENCIES } from '../../common/currency';
import { normalizeEmail } from '../../common/normalize-email';

/**
 * Only the fields the caller wants changed, per PATCH semantics.
 *
 * The tri-state contract of `UpdateTransactionDto`, minus its middle case:
 * **absent** leaves the field alone and a **value** sets it, but **no field
 * accepts null**, because every column behind this one is NOT NULL.
 *
 * That is why this is hand-written rather than `PartialType(RegisterDto)` with
 * `@IsOptional()` on everything. `@IsOptional()` skips validation for null as
 * well as undefined, so `{"fullName": null}` would pass every check and reach
 * a NOT NULL column, turning a bad request into a 500. `@ValidateIf` keyed on
 * `undefined` alone is the fix: absent fields skip validation, and an explicit
 * null is validated and refused.
 *
 * **Three fields, down from six, and the two that left did not move sideways.**
 * PET-72 removed `monthlyBudget` and `monthStartDay` from this body because
 * neither is a property of the account any more: a budget applies **from a date**,
 * and a pay day change reshapes the periods after it. Accepting them here would
 * mean choosing that date silently, which is the retroactive rewriting the whole
 * ticket exists to remove. They are `POST /api/profile/schedule`, which requires
 * the anchor and therefore cannot be sent by accident. `firstName` and `lastName`
 * became one `fullName` on the same branch.
 *
 * The validator stacks still mirror `RegisterDto` field for field, for the
 * original reason: the Settings form edits what onboarding collected, so a value
 * accepted at registration must stay acceptable here. `categories` is deliberately
 * absent - the starter set is seeded once at verification and the categories
 * feature owns it from there.
 */

/** Absent means "unchanged", so skip validation. An explicit null is validated. */
const provided = (_object: unknown, value: unknown): boolean =>
  value !== undefined;

export class UpdateProfileDto {
  /**
   * What the sidebar and greeting show. One field, not a first and last name.
   *
   * The app never used the two apart - the sidebar wants initials and a short
   * name, both derivable from one string - so asking for a surname was asking for
   * data to throw away. The label on the form is "Display name", and a nickname is
   * a legitimate answer.
   */
  @ValidateIf(provided)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName?: string;

  /**
   * The login identifier. Changing it changes where future login links are sent
   * (AC6); links already in flight to the old address keep working.
   */
  // Normalized here like everywhere else, so the partial unique index on
  // users.email holds. Non-strings pass through so @IsEmail reports the type
  // error rather than this silently turning them into undefined.
  @Transform(({ value }: { value: unknown }) => normalizeEmail(value) ?? value)
  @ValidateIf(provided)
  @IsEmail()
  email?: string;

  // The same uppercase-then-validate pair as RegisterDto, and the same published
  // enum. Keep the two byte-identical - they describe one field, written twice.
  //
  // `@IsIn(SUPPORTED_CURRENCIES)` since PET-72, replacing
  // `@IsISO4217CurrencyCode()` and the hand-written `pattern` that went with it.
  // The standard's full list includes zero- and three-decimal currencies, which
  // `src/common/money.ts` would scale by a factor of a hundred or ten; see
  // `src/common/currency.ts`. The allowlist also publishes a real enum, so the
  // frontend's picker is typed off the contract instead of restating a list.
  @ApiPropertyOptional({ enum: SUPPORTED_CURRENCIES, example: 'EUR' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @ValidateIf(provided)
  @IsIn(SUPPORTED_CURRENCIES)
  currency?: string;
}
