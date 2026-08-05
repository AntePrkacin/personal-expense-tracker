import { ApiProperty } from '@nestjs/swagger';

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

  @ApiProperty({ example: '#57B368', description: 'Hex, `#RRGGBB`.' })
  color!: string;

  @ApiProperty({ nullable: true, type: String })
  icon!: string | null;

  @ApiProperty({ nullable: true, type: String })
  note!: string | null;

  @ApiProperty({
    description:
      'True for the one `Uncategorized` category every account has. It cannot be deleted or renamed, deleting any other category moves its transactions here, and the transaction form preselects it.',
  })
  isFallback!: boolean;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Major units. Null means uncapped, which is not a cap of 0.',
  })
  monthlyCap!: number | null;

  @ApiProperty({
    description:
      'Major units spent in this category during the current period.',
  })
  spent!: number;

  @ApiProperty({ description: 'Transactions counted in `spent`.' })
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
