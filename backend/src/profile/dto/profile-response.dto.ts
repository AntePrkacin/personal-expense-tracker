import { ApiProperty } from '@nestjs/swagger';
import { SUPPORTED_CURRENCIES } from '../../common/currency';

/**
 * The signed-in person, as the Settings page and the sidebar footer need them.
 *
 * A class in a `.dto.ts` file for the same reason every response type here is:
 * an interface erases at compile time, and the swagger plugin only introspects
 * files matching its `dtoFileNameSuffix`. Break either and the response
 * publishes as `{}`.
 *
 * Five fields and no timestamps. `email` is the only one central owns; `fullName`
 * and `currency` come from the caller's own `profile` row, and the last two are
 * **resolved from history rather than selected** - see their own notes. The
 * instants are omitted because nothing in the design shows them, and leaving them
 * out keeps the `format: 'date-time'` question with the tickets that will actually
 * need it.
 */
export class ProfileResponseDto {
  /**
   * One name field, not a first and last.
   *
   * PET-72 collapsed the two: nothing in the app used them apart, so the second
   * was data collected to be thrown away. A client rendering initials or a short
   * greeting derives both from this.
   */
  fullName!: string;

  /** The login identifier. Lives in the central directory, not the profile row. */
  email!: string;

  @ApiProperty({
    enum: SUPPORTED_CURRENCIES,
    description:
      'ISO 4217 code, uppercase. Display only - amounts are stored in minor units. The list is restricted to two-decimal currencies, because the whole API assumes an exponent of 2.',
  })
  currency!: string;

  /**
   * Major units (e.g. 2000.5).
   *
   * **The budget as configured - the newest entry of the budget history, a
   * change scheduled at a future paycheck included - resolved rather than stored
   * as a column.** The value a settings form loads is exactly the value a save
   * would leave unchanged; what a given period was actually lived under is
   * answered per period by the dashboard, category and transaction reads. The
   * write is `POST /api/profile/schedule` rather than `PATCH /api/profile`:
   * setting a budget requires saying from which paycheck it applies, so that
   * earlier periods keep the budget they were actually spent against.
   */
  monthlyBudget!: number;

  /**
   * Day of the month the budgeting period starts on, 1-28 - your pay day.
   *
   * **Effective-dated as of PET-72, and this comment used to claim the
   * opposite.** It read "every period-scoped read derives its month window from
   * this at query time, so changing it re-buckets history rather than rewriting
   * anything", which had the mechanism right and the desirability backwards:
   * re-bucketing *all* history is precisely the rewriting. A new pay day is a fact
   * about the periods after it. Changing it therefore goes through
   * `POST /api/profile/schedule` with the first new paycheck date, and only the
   * periods from that date onward move.
   *
   * The value here is the day **as configured** - the newest rule's, a change
   * scheduled at a future paycheck included - for `monthlyBudget`'s reason: a
   * settings form has to load the value a save would leave unchanged, or a
   * faithful re-submit mid-pending-change would silently revert the change.
   * Which day any given period actually ran on is visible in that period's own
   * boundaries, via `GET /api/periods`.
   */
  @ApiProperty({ type: 'integer' })
  monthStartDay!: number;
}
