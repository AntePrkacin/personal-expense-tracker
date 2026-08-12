import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * The period filter's three **named** values.
 *
 * Named windows rather than `?from=&to=`. A free date range lets a caller ask
 * for a span that is not a budgeting period at all, and then every figure
 * derived from it - `total` here, every aggregate on the dashboard - silently
 * means something other than what the screen claims. TRN-3's own control offers
 * periods, not a date picker, so nothing is given up.
 *
 * **PET-72 added a fourth form, and it does not weaken that argument.** A
 * `YYYY-MM-DD` value names one period by its own `start`, taken from
 * `GET /api/periods` - so it still names a real budgeting period rather than an
 * arbitrary span, and a date that starts no period of yours is a 400 rather than
 * a window. What it buys is history: `current` and `previous` can only reach two
 * periods, and the period select on the Dashboard reaches all of them.
 */
export const TRANSACTION_PERIODS = ['current', 'previous', 'all'] as const;
export type TransactionPeriod = (typeof TRANSACTION_PERIODS)[number];

/**
 * The sort's four values, and the two dimensions are deliberately not one enum
 * of "field" plus one of "direction".
 *
 * **PET-67 added the amount pair, which is the change the two-value version of
 * this comment predicted.** It said the list was two "not a free-text field",
 * because A16 records that the open sort dropdown is never drawn, so only
 * "Newest first" was actually known and "adding to this list once the designer
 * draws the menu is a one-line change". The product owner asked for amount
 * sorting, so this is that change; read the old note as the reason the list was
 * ever short rather than as an argument against widening it.
 *
 * One flat enum rather than `?sortBy=amount&sortDir=asc` for two reasons. The
 * client is a single `<select>` whose options are whole sorts, so a split would
 * make it assemble two parameters to express one choice a user made once. And a
 * flat enum makes every combination the API accepts enumerable in
 * `openapi.json`, which is what lets the frontend prove at compile time that it
 * offers all of them - see `EverySortIsOffered` in
 * `frontend/src/app/(app)/transactions/filters.ts`. A pair of orthogonal enums
 * publishes a product of values rather than a list, and nothing could check the
 * screen covered it.
 */
export const TRANSACTION_SORTS = [
  'date_desc',
  'date_asc',
  'amount_desc',
  'amount_asc',
] as const;
export type TransactionSort = (typeof TRANSACTION_SORTS)[number];

/** The default period. See the note on the field. */
export const DEFAULT_PERIOD: TransactionPeriod = 'current';

/** The default sort, which AC1 requires. */
export const DEFAULT_SORT: TransactionSort = 'date_desc';

/**
 * The four filters on `GET /api/transactions`, all optional.
 *
 * **`@IsOptional()` throughout, and here that is safe.** It is the trap in the
 * write DTOs, where it skips validation for `null` as well as `undefined` and
 * lets `{"merchant": null}` reach a NOT NULL column. A query string has no null
 * to confuse it with: an absent parameter is absent, and `?search=` is the empty
 * string.
 *
 * This is the app's first `@Query` DTO. The enums are declared with an explicit
 * `enum:` rather than left to the swagger plugin, which is how every other enum
 * in `openapi.json` is written - a widened `type: string` would generate a
 * frontend type accepting any text at all, and would fail nothing.
 */
export class ListTransactionsQueryDto {
  /**
   * Case-insensitive substring of the merchant name.
   *
   * The merchant only. AC2 says "matching the merchant", and the note - the one
   * other free-text field - appears on no list row, so matching it would return
   * rows whose reason the user cannot see.
   */
  // Trimmed here rather than in the service so `MaxLength` measures what will
  // actually be searched. A whitespace-only term arrives as the empty string,
  // which the service turns into no predicate at all rather than a `%%` scan.
  @ApiPropertyOptional({
    description:
      'Case-insensitive substring of the merchant name. Trimmed; an empty or whitespace-only term filters nothing. **Case-insensitive for ASCII only** - SQLite `LIKE` does not fold non-ASCII, so a merchant name with diacritics matches only on exact case.',
    example: 'groceries',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  // The same bound as `merchant` itself: a longer term cannot match anything.
  @MaxLength(200)
  search?: string;

  /**
   * One of your categories. An unknown id filters everything out rather than
   * 404ing - it is a filter, not a resource being addressed.
   */
  // Very often this will be the fallback `Uncategorized`, because the add form
  // preselects it. Nothing special is needed for that; it is an ordinary id
  // here. Worth knowing that the most-used value of this filter is a category
  // the user never picked.
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  /**
   * Which budgeting period to show. Defaults to `current`.
   *
   * **The default is the current period, not all history**, which is worth being
   * deliberate about because it means a bare `GET /api/transactions` hides rows.
   * It is the right default here: TRN-1 titles the screen with an overline naming
   * one month ("October 2025") and TRN-3 draws the filter already reading "This
   * month", so the designed default view *is* one period. Defaulting to `all`
   * instead would make every caller send `?period=current` to get the screen the
   * design specifies, and forgetting it would render all history under a header
   * naming a single month - a wrong-data bug with nothing to catch it.
   *
   * `all` is how you ask for history, and it applies no date predicate at all.
   *
   * **A `YYYY-MM-DD` period start is the fourth accepted form**, which is what
   * lets the period select reach further back than `previous`. It must be a
   * period's own `start` from `GET /api/periods`; any other date is a 400.
   */
  // Deliberately **not** `@IsIn(TRANSACTION_PERIODS)` any more, and deliberately
  // not an enum in the spec either: the value set is now three literals plus an
  // open date, which no enum can express. The regex is written out inline because
  // the swagger plugin lifts only an inline literal into `pattern` and silently
  // drops a named constant - the same trap the transaction write DTOs' `date`
  // documents. `@IsDateString({ strict: true })` sits behind a `@ValidateIf`
  // that exempts the three named values, because a keyword is not a date and
  // `@ValidateIf` gates every validator on the property - which is safe here,
  // since a named value has nothing left for `@Matches` to reject. A first
  // version shipped without the date check, claiming `PeriodService.startingAt`
  // was "a superset of what a date validator would catch"; it is not -
  // `month-window.ts` round-trips a month 13 without carrying, so
  // `?period=2026-13-01` answered 200 with an overlapping window and a literal
  // `undefined 2026` label. The review of PET-72 is where that came out.
  @ApiPropertyOptional({
    default: DEFAULT_PERIOD,
    pattern: '^(current|previous|all|\\d{4}-\\d{2}-\\d{2})$',
    description:
      'One of `current`, `previous`, `all`, or a period `start` in `YYYY-MM-DD` from `GET /api/periods`. Resolved server-side from your pay-schedule history, so the boundary is your budgeting period rather than the calendar month - and periods before a pay-day change keep the boundaries they had. `previous` is the period before the current one. `all` applies no date filter. A date that is not a real calendar date, or that starts none of your periods, is a **400**.',
    example: 'current',
  })
  @IsOptional()
  @ValidateIf(
    (_, value) => !TRANSACTION_PERIODS.includes(value as TransactionPeriod),
  )
  @Matches(/^(current|previous|all|\d{4}-\d{2}-\d{2})$/)
  @IsDateString({ strict: true })
  period?: string;

  /** Defaults to `date_desc`, which is AC1's "Newest first". */
  @ApiPropertyOptional({
    enum: TRANSACTION_SORTS,
    default: DEFAULT_SORT,
    description:
      'Every sort ends in the same tiebreaks: `date` descending (for the amount sorts only), then `createdAt` descending, then `id`. So the order is stable across requests rather than reshuffling for no visible reason, and two transactions of the same amount read newest-first between themselves.',
  })
  @IsOptional()
  @IsIn(TRANSACTION_SORTS)
  sort?: TransactionSort;
}
