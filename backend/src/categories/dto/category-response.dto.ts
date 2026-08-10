import { ApiProperty } from '@nestjs/swagger';
import {
  COLOUR_TOKENS,
  ICON_NAMES,
} from '../../database/central/template-tokens';

/**
 * Where a category's spend sits against its cap this period.
 *
 * The four capped bands come from the design's own visible examples (CTG-5,
 * A23): On track below 75%, Near from 75%, Full at exactly the cap, Over above
 * it. `uncapped` is the fifth, and it exists because a cap is optional - the
 * seeded `Uncategorized` has none, and neither does any category the user chose
 * not to cap. None of the four thresholds means anything without a cap to
 * measure against, so inventing one would be worse than saying so.
 *
 * The band is decided on stored cents, never on `percentUsed`. Read literally
 * the design leaves a hole between 99% and 100%; comparing integers closes it
 * with no judgement call, and makes display rounding unable to move a category
 * between bands.
 */
export type CategoryStatus = 'on_track' | 'near' | 'full' | 'over' | 'uncapped';

export class CategoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Groceries' })
  name!: string;

  @ApiProperty({
    enum: COLOUR_TOKENS,
    example: 'success',
    description:
      'A daisyUI semantic colour token, not a hex - several of these have no single hex value, being themed per light and dark.',
  })
  color!: string;

  /**
   * Always present as of PET-72, when the column became NOT NULL.
   *
   * It was nullable "because the column is, not because a new category may omit
   * one" - `CreateCategoryDto.icon` has been required since PET-64 and no PATCH
   * can clear it, so the null was only ever reachable by a row predating that.
   * The database reset removed those rows and the column now agrees with the DTO.
   */
  @ApiProperty({ enum: ICON_NAMES })
  icon!: string;

  /**
   * Free text the user owns. Called `note` before PET-72, renamed to match both
   * the column and the `category_templates.description` a starter category
   * copies it from - and to stop it reading like `transactions.note`, which is a
   * different field on a different table and keeps its own name.
   */
  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({
    description:
      'True for the one `Uncategorized` category every account has. It cannot be deleted or renamed, deleting any other category moves its transactions here, and the transaction form preselects it.',
  })
  isFallback!: boolean;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'Major units. Null means uncapped, which is not a cap of 0. **The cap in force for the period being reported**, not necessarily the one set today: changing a cap applies from the current period onward and leaves earlier periods reporting the cap they were budgeted under.',
  })
  monthlyCap!: number | null;

  @ApiProperty({
    description:
      'Major units spent in this category during the current period. On the fallback ' +
      '(`isFallback`) row this also carries spend whose category no longer exists, so these ' +
      'figures always sum to the period total; see `transactionCount` for what that costs.',
  })
  spent!: number;

  @ApiProperty({
    description:
      'Transactions counted in `spent`. On the fallback (`isFallback`) row this can exceed what ' +
      '`GET /transactions?categoryId=<this id>` returns: orphaned transactions are attributed ' +
      'here on read but still store the id of the deleted category, so they are counted and not ' +
      'enumerable. Do not present this count as a link to a filtered list for that one row.',
  })
  transactionCount!: number;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'Percentage of the cap used, unrounded. Null when uncapped. Round it for display; the status is decided on cents, so rounding cannot disagree with it.',
  })
  percentUsed!: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'Major units still available. Null when uncapped or already over; `over` carries the excess instead.',
  })
  remaining!: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'Major units spent beyond the cap. Null unless the status is `over`.',
  })
  over!: number | null;

  @ApiProperty({
    enum: ['on_track', 'near', 'full', 'over', 'uncapped'],
    description:
      'Decided on cents, not on `percentUsed`. `uncapped` when there is no cap.',
  })
  status!: CategoryStatus;
}
