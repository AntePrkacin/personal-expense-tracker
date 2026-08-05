import { ApiProperty } from '@nestjs/swagger';
import { CategoryResponseDto } from '../../categories/dto/category-response.dto';
import { TransactionResponseDto } from './transaction-response.dto';

/**
 * The filtered list, plus the count the tab badge shows.
 *
 * **No pagination, and `total` is not a page count.** A11 and TRN-6 record that
 * the design has no pager anywhere - the mock lists 10 rows against a badge of
 * 128 and the table simply scrolls - so the whole filtered set comes back in one
 * response.
 */
export class TransactionsResponseDto {
  @ApiProperty({
    type: [TransactionResponseDto],
    description: 'Every matching transaction, in the requested sort order.',
  })
  transactions!: TransactionResponseDto[];

  /**
   * The count **after** filters, which is what TRN-2's badge shows.
   *
   * Equal to `transactions.length` today, and returned anyway. The redundancy is
   * deliberate: the moment pagination arrives the badge must not start counting
   * the page, and a frontend that had been reading `.length` would do exactly
   * that, silently.
   */
  @ApiProperty({
    description:
      'Matches after every filter, not the account total. Equal to `transactions.length` while there is no pagination; read this rather than the array length, so a future page size cannot silently turn the badge into a page count.',
  })
  total!: number;
}

/**
 * One transaction with the two pieces of context frame 08 draws around it.
 *
 * **The two have different windows, and that is the point.** `category` is the
 * spend against the cap for the **current** period (AC4, DET-4's "Groceries this
 * month"); `recentInCategory` is the latest in that category **regardless of
 * month** (AC5, DET-5's mock reaches back to September). Collapsing them onto one
 * window would be wrong in one direction or the other.
 */
export class TransactionDetailResponseDto {
  @ApiProperty({ type: TransactionResponseDto })
  transaction!: TransactionResponseDto;

  /**
   * The whole category, stats included, exactly as `GET /api/categories` returns
   * it.
   *
   * Embedded rather than narrowed to the four fields AC4 names. The identity
   * fields are not dead weight - DET-2's chip needs `name` and `color`, and
   * DET-5's rows need `color` for their dots - and sharing the DTO is what stops
   * this screen and the Categories screen disagreeing the first time a status
   * threshold moves.
   *
   * **Expect the uncapped shape here, not the exception.** Caps are optional
   * everywhere and the preselected fallback `Uncategorized` ships without one, so
   * a typical transaction returns `monthlyCap`, `percentUsed`, `remaining` and
   * `over` all null with `status: "uncapped"`. Frame 08 draws a progress bar
   * regardless; rendering its absence is the frontend's call.
   */
  @ApiProperty({
    type: CategoryResponseDto,
    description:
      "The transaction's category with its stats for the **current** period - not the period the transaction itself falls in. The bar answers where this category stands now.",
  })
  category!: CategoryResponseDto;

  /**
   * The latest transactions in the same category, any month, newest first.
   *
   * **Excludes the transaction being viewed**, which is a deliberate deviation
   * from DET-5: the mock's first row is the transaction whose page it sits on,
   * already printed in the header and the amount card. Five rows rather than the
   * mock's three, so dropping the self-row costs the card nothing.
   */
  @ApiProperty({
    type: [TransactionResponseDto],
    description:
      'Up to 5 other transactions in the same category, newest first, from any month. Excludes the one in `transaction`.',
  })
  recentInCategory!: TransactionResponseDto[];
}
