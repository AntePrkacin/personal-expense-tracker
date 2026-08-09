import { ApiProperty } from '@nestjs/swagger';

/**
 * The four fields a scan can fail to fill. Not `note`: a receipt may
 * genuinely carry nothing worth noting, so its absence is not something
 * another photo would fix, unlike the other four - see `ReceiptScanService`.
 */
export const SCAN_MISSING_FIELDS = [
  'merchant',
  'amount',
  'date',
  'categoryId',
] as const;

export type ScanMissingField = (typeof SCAN_MISSING_FIELDS)[number];

/**
 * What one scan extracted from a receipt (or a synthesis of several pages of
 * one receipt). Every field is null when the model could not fill it or when
 * validation against live data dropped it - a hallucinated `categoryId`, a
 * `date` that is not a real calendar date, or a non-positive `amount`.
 */
export class ScanReceiptResponseDto {
  @ApiProperty({ type: String, nullable: true })
  merchant!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  amount!: number | null;

  @ApiProperty({ type: String, format: 'date', nullable: true })
  date!: string | null;

  /** An id from the caller's own live categories, verbatim, or null. Never a hallucinated id: `ReceiptScanService` validates it against the same list the prompt was given. */
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  categoryId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;

  /** Which of `merchant`, `amount`, `date` and `categoryId` came back null. */
  @ApiProperty({ enum: SCAN_MISSING_FIELDS, isArray: true })
  missing!: ScanMissingField[];
}
