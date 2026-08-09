import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { todayIn, addDays } from '../common/month-window';
import type { UserDatabase } from '../database/database.types';
import { UserDatabaseService } from '../database/user-database.service';
import { categories, transactions } from '../database/user/schema';
import {
  SCAN_MISSING_FIELDS,
  type ScanMissingField,
  type ScanReceiptResponseDto,
} from './dto/scan-receipt-response.dto';
import {
  ReceiptExtractionService,
  type RawReceiptExtraction,
  type ReceiptMerchantHistoryEntry,
  type ReceiptScanFile,
} from './receipt-extraction.service';
import {
  MAX_IMAGE_BYTES,
  MERCHANT_HISTORY_DAYS,
  MERCHANT_HISTORY_LIMIT,
  RECEIPT_PDF_MIME_TYPE,
} from './receipt-scan.constants';

const NO_FILES = 'Attach at least one photo, or a single PDF, of the receipt.';
const IMAGE_TOO_LARGE = (name: string) =>
  `"${name}" is larger than the 1.5MB limit for a photo. Compress it, or send it as a PDF.`;

/**
 * Whether `value` is a real calendar date in `YYYY-MM-DD` form - the same
 * check `CreateTransactionDto`'s `@IsDateString({ strict: true })` runs,
 * reimplemented here because a model answer never reaches a DTO. `Date.UTC`
 * is used only to ask "did this round-trip", never to read a field back out
 * of it, so there is no timezone shift to worry about.
 */
function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Orchestrates one scan: reads the caller's categories and merchant history
 * for the prompt, calls `ReceiptExtractionService`, and validates every
 * invented value against live data before it ever reaches the frontend.
 *
 * **The model returns the same id it was given, or none.** `categoryId` is
 * checked against the caller's live categories and dropped - never
 * substituted with `Uncategorized` - when it matches nothing, because a
 * silent fallback would render as a confident categorization and quietly
 * mis-file the expense. `date` and `amount` get the same treatment for the
 * same reason: the form's fields are not the model's types, and trusting an
 * invented value moves the failure rather than catching it.
 */
@Injectable()
export class ReceiptScanService {
  constructor(
    private readonly userDatabases: UserDatabaseService,
    private readonly extraction: ReceiptExtractionService,
    private readonly config: ConfigService,
  ) {}

  /**
   * @throws BadRequestException if no file was attached, or an image exceeds
   * the per-image size cap that multer's own single-number limit cannot
   * express (see `receipt-scan.upload.ts`).
   * @throws ServiceUnavailableException if `GEMINI_API_KEY` is unset.
   * @throws GatewayTimeoutException if the model call does not finish in time.
   */
  async scan(
    userId: string,
    files: ReceiptScanFile[],
  ): Promise<ScanReceiptResponseDto> {
    if (files.length === 0) {
      throw new BadRequestException(NO_FILES);
    }

    for (const file of files) {
      if (
        file.mimetype !== RECEIPT_PDF_MIME_TYPE &&
        file.buffer.length > MAX_IMAGE_BYTES
      ) {
        throw new PayloadTooLargeException(IMAGE_TOO_LARGE(file.originalname));
      }
    }

    // Checked ahead of the database reads below: they would be wasted work on
    // an environment with no key, and the buttons stay visible regardless
    // (see the plan's "the key is optional" decision), so this is the first
    // thing every scan hits when it is unset.
    if (!this.extraction.isConfigured()) {
      throw new ServiceUnavailableException(
        'Receipt scanning is not configured.',
      );
    }

    const db = await this.userDatabases.getUserDb(userId);

    const categoryRows = await db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(isNull(categories.deletedAt));

    const merchantHistory = await this.topMerchants(db);

    const raw = await this.extraction.extract(
      files,
      categoryRows,
      merchantHistory,
    );

    return validate(raw, categoryRows);
  }

  /**
   * The top `MERCHANT_HISTORY_LIMIT` merchants of the past
   * `MERCHANT_HISTORY_DAYS` by transaction count, each with the categories
   * it has been logged under and how often - the context that lets the model
   * resolve a generic or misspelled receipt name to this user's own habits.
   *
   * One grouped query, folded in memory rather than in SQL, because ranking
   * merchants by their *total* count while also breaking each merchant's
   * total down by category is two different groupings over the same rows.
   */
  private async topMerchants(
    db: UserDatabase,
  ): Promise<ReceiptMerchantHistoryEntry[]> {
    const since = addDays(
      todayIn(this.config.get<string>('APP_TIMEZONE', 'Europe/Zagreb')),
      -MERCHANT_HISTORY_DAYS,
    );

    const rows = await db
      .select({
        merchant: transactions.merchant,
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        count: sql<number>`count(*)`,
      })
      .from(transactions)
      .innerJoin(
        categories,
        and(
          eq(categories.id, transactions.categoryId),
          isNull(categories.deletedAt),
        ),
      )
      .where(and(isNull(transactions.deletedAt), gte(transactions.date, since)))
      .groupBy(transactions.merchant, transactions.categoryId)
      .orderBy(desc(sql`count(*)`));

    const byMerchant = new Map<
      string,
      ReceiptMerchantHistoryEntry & { total: number }
    >();

    for (const row of rows) {
      const count = Number(row.count);
      const entry = byMerchant.get(row.merchant) ?? {
        merchant: row.merchant,
        categories: [],
        total: 0,
      };
      entry.categories.push({
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        count,
      });
      entry.total += count;
      byMerchant.set(row.merchant, entry);
    }

    return [...byMerchant.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, MERCHANT_HISTORY_LIMIT)
      .map(({ merchant, categories: cats }) => ({
        merchant,
        categories: cats,
      }));
  }
}

/**
 * Every invented value checked against live data, and anything that fails is
 * dropped and reported in `missing`. `note` never appears in `missing`: a
 * receipt may carry nothing worth noting at all, so its absence is not
 * something another photo would fix.
 */
function validate(
  raw: RawReceiptExtraction,
  categoryRows: { id: string; name: string }[],
): ScanReceiptResponseDto {
  const missing: ScanMissingField[] = [];

  const merchant = nonEmpty(raw.merchant);
  if (merchant === null) missing.push('merchant');

  const amount =
    typeof raw.amount === 'number' &&
    Number.isFinite(raw.amount) &&
    raw.amount > 0
      ? Math.round(raw.amount * 100) / 100
      : null;
  if (amount === null) missing.push('amount');

  const date = raw.date && isValidIsoDate(raw.date) ? raw.date : null;
  if (date === null) missing.push('date');

  const categoryId =
    raw.categoryId && categoryRows.some((c) => c.id === raw.categoryId)
      ? raw.categoryId
      : null;
  if (categoryId === null) missing.push('categoryId');

  return {
    merchant,
    amount,
    date,
    categoryId,
    note: nonEmpty(raw.note),
    // Stable order, matching SCAN_MISSING_FIELDS, rather than push order -
    // which already happens to match, but this keeps it true on purpose.
    missing: SCAN_MISSING_FIELDS.filter((field) => missing.includes(field)),
  };
}

function nonEmpty(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
