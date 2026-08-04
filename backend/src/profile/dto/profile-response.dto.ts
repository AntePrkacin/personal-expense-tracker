import { ApiProperty } from '@nestjs/swagger';

/**
 * The signed-in person, as the Settings page and the sidebar footer need them.
 *
 * A class in a `.dto.ts` file for the same reason every response type here is:
 * an interface erases at compile time, and the swagger plugin only introspects
 * files matching its `dtoFileNameSuffix`. Break either and the response
 * publishes as `{}`.
 *
 * Six fields and no timestamps. `email` is the only one central owns; the rest
 * come from the caller's own `profile` row. The instants are omitted because
 * nothing in the design shows them, and leaving them out keeps the
 * `format: 'date-time'` question with the tickets that will actually need it.
 */
export class ProfileResponseDto {
  firstName!: string;

  lastName!: string;

  /** The login identifier. Lives in the central directory, not the profile row. */
  email!: string;

  /** ISO 4217 code, uppercase. Display only - amounts are stored in minor units. */
  currency!: string;

  /** Major units (e.g. 2000.5). Stored as integer cents; converted on the way out. */
  monthlyBudget!: number;

  /**
   * Day of the month the budgeting period starts on, 1-28. Every period-scoped
   * read derives its month window from this at query time, so changing it
   * re-buckets history rather than rewriting anything.
   */
  @ApiProperty({ type: 'integer' })
  monthStartDay!: number;
}
