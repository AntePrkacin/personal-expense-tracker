import { ApiProperty } from '@nestjs/swagger';

/**
 * The lifecycle the read reports, mapping to the three designed frames.
 *
 * Derived at read time from the stored rows, never itself a stored column:
 * `generating` when a run is in flight (15, skeletons), `ready` when there is a
 * completed set (14), `empty` before anything has ever generated (16). A failed
 * run is never a state of its own - its row is skipped and the read falls back to
 * the previous `ready` set, so a failure is invisible here (AC6).
 */
export type InsightState = 'empty' | 'generating' | 'ready';

/**
 * An insight's tone, mapping to the frontend's Status palette. Set per content
 * rule by the generator (PET-40): over-cap is `warning`, a favourable
 * month-over-month move is `positive`, the projection is `info`, and
 * recurring-merchant detection is `neutral`.
 */
export type InsightTone = 'warning' | 'positive' | 'info' | 'neutral';

/** One insight card: rendered prose, not re-derived on read. */
export class InsightCardDto {
  @ApiProperty({
    enum: ['warning', 'positive', 'info', 'neutral'],
    description: 'Maps to the Status palette the frontend draws the card in.',
  })
  tone!: InsightTone;

  @ApiProperty({ example: 'Dining out is over budget' })
  title!: string;

  @ApiProperty({ example: '$312 of $300 - $12 over' })
  body!: string;
}

/** The monthly summary banner: a headline and a body sentence. */
export class InsightSummaryDto {
  @ApiProperty({ example: 'You are on track this month' })
  headline!: string;

  @ApiProperty({
    example: "You've spent $1,240 of your $2,000 budget with 11 days to go.",
  })
  body!: string;
}

/**
 * The AI Insights read: one set with the state the page renders from.
 *
 * The content fields (`monthLabel`, `summary`, `insights`, `generatedAt`) track
 * the most recent **`ready`** set and are independent of `state`: on a
 * regenerate the page shows skeletons because `state` is `generating`, while the
 * dashboard teaser keeps reading this same last-good content rather than
 * blanking. `empty` carries null content and an empty `insights` array.
 */
export class InsightSetResponseDto {
  @ApiProperty({
    enum: ['empty', 'generating', 'ready'],
    description:
      'Whether a run is in flight (`generating`), a completed set exists (`ready`), or nothing has ever generated (`empty`). Independent of the content fields, which always carry the latest `ready` set.',
  })
  state!: InsightState;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'October 2025',
    description:
      'The period the latest ready set covers, rendered when it was generated. Null in the empty state.',
  })
  monthLabel!: string | null;

  @ApiProperty({
    type: InsightSummaryDto,
    nullable: true,
    description: 'The summary banner of the latest ready set. Null when empty.',
  })
  summary!: InsightSummaryDto | null;

  @ApiProperty({
    type: [InsightCardDto],
    description:
      'The cards of the latest ready set, in their generated order. Empty until a set is ready.',
  })
  insights!: InsightCardDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'ISO 8601, when the latest ready set finished generating. Null when empty.',
  })
  generatedAt!: string | null;
}
