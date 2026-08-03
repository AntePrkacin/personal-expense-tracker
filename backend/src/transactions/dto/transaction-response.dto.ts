/**
 * One transaction as the API returns it.
 *
 * A class in a `.dto.ts` file, and it has to be both: an interface erases at
 * compile time so there is nothing left to hang metadata on, and the swagger
 * plugin only introspects files matching its `dtoFileNameSuffix`. Break either
 * and the spec still generates - this response is just described as `{}`.
 */
export class TransactionResponseDto {
  id!: string;

  merchant!: string;

  categoryId!: string;

  /** Major units (e.g. 12.5). Stored as integer cents; converted on the way out. */
  amount!: number;

  /** `YYYY-MM-DD`, exactly the string that was stored. */
  date!: string;

  /** Null when the transaction has no note, never absent. */
  note!: string | null;

  /** ISO 8601. */
  createdAt!: string;

  /**
   * ISO 8601. Within a millisecond of `createdAt` until the first edit, not
   * necessarily equal to it: the two columns default from independent `new Date()`
   * calls, so an insert can straddle a millisecond boundary. Do not use equality
   * of the two to mean "never edited".
   */
  updatedAt!: string;
}
