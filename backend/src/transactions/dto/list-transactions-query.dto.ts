import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * The period filter's three values.
 *
 * Named windows rather than `?from=&to=`. A free date range lets a caller ask
 * for a span that is not a budgeting period at all, and then every figure
 * derived from it - `total` here, every aggregate on the dashboard - silently
 * means something other than what the screen claims. TRN-3's own control offers
 * periods, not a date picker, so nothing is given up.
 */
export const TRANSACTION_PERIODS = ['current', 'previous', 'all'] as const;
export type TransactionPeriod = (typeof TRANSACTION_PERIODS)[number];

/**
 * The sort's two values.
 *
 * Two, not a free-text field. A16 records that the open sort dropdown is never
 * drawn, so "Newest first" is the only option actually known; ascending is the
 * one a date sort certainly also has. Shipping anything wider would put a
 * contract in `openapi.json` that no screen asked for, and adding to this list
 * once the designer draws the menu is a one-line change.
 */
export const TRANSACTION_SORTS = ['date_desc', 'date_asc'] as const;
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
   */
  @ApiPropertyOptional({
    enum: TRANSACTION_PERIODS,
    default: DEFAULT_PERIOD,
    description:
      'Resolved server-side from your `monthStartDay`, so the boundary is your budgeting period rather than the calendar month. `previous` is the period before the current one. `all` applies no date filter.',
  })
  @IsOptional()
  @IsIn(TRANSACTION_PERIODS)
  period?: TransactionPeriod;

  /** Defaults to `date_desc`, which is AC1's "Newest first". */
  @ApiPropertyOptional({
    enum: TRANSACTION_SORTS,
    default: DEFAULT_SORT,
    description:
      'Ties on `date` break on `createdAt` descending, then `id`, so the order is stable across requests rather than reshuffling for no visible reason.',
  })
  @IsOptional()
  @IsIn(TRANSACTION_SORTS)
  sort?: TransactionSort;
}
