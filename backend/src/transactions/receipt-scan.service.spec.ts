import {
  BadRequestException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { queryChain } from '../../test/query-chain';
import type { UserDatabaseService } from '../database/user-database.service';
import type { RawReceiptExtraction } from './receipt-extraction.service';
import { ReceiptScanService } from './receipt-scan.service';

const CATEGORY_ID = '0190c3f0-0000-7000-8000-000000000010';
const OTHER_CATEGORY_ID = '0190c3f0-0000-7000-8000-000000000011';

const VALID_RAW: RawReceiptExtraction = {
  merchant: 'Konzum',
  amount: 12.5,
  date: '2026-08-03',
  categoryId: CATEGORY_ID,
  note: 'Groceries',
};

const validImage = () => ({
  buffer: Buffer.alloc(10),
  mimetype: 'image/png',
  originalname: 'receipt.png',
});

/**
 * Unit cover for what `test/transactions.e2e-spec.ts` cannot reach without a
 * real Gemini key: dropping an invented value that fails validation against
 * live data, and reporting it in `missing` rather than trusting it. The e2e
 * suite is the proof of the real database reads, the real multer pipeline
 * and the real throttler; `ReceiptExtractionService` is mocked here so this
 * file's whole job is the against-live-data validation.
 */
describe('ReceiptScanService', () => {
  let service: ReceiptScanService;
  let getUserDb: jest.Mock;
  let select: jest.Mock;
  let extract: jest.Mock;
  let isConfigured: jest.Mock;

  /** A live category row, as the categories `select()` answers. */
  const categoryRows = () =>
    queryChain([{ id: CATEGORY_ID, name: 'Groceries' }]);

  /** No merchant history, the common case for a first scan. */
  const noMerchantHistory = () => queryChain([]);

  const build = () => {
    getUserDb = jest.fn().mockResolvedValue({ select });
    isConfigured = jest.fn().mockReturnValue(true);
    extract = jest.fn().mockResolvedValue(VALID_RAW);

    service = new ReceiptScanService(
      { getUserDb } as unknown as UserDatabaseService,
      {
        isConfigured,
        extract,
      } as unknown as import('./receipt-extraction.service').ReceiptExtractionService,
      {
        get: jest.fn().mockReturnValue('Europe/Zagreb'),
      } as unknown as ConfigService,
    );
  };

  beforeEach(() => {
    select = jest
      .fn()
      .mockReturnValueOnce(categoryRows())
      .mockReturnValueOnce(noMerchantHistory());
    build();
  });

  describe('upload guards, ahead of the database', () => {
    it('rejects an empty upload without opening the database', async () => {
      await expect(service.scan('user-id', [])).rejects.toThrow(
        BadRequestException,
      );
      expect(getUserDb).not.toHaveBeenCalled();
    });

    it('rejects an image over the 1.5MB cap, naming which file', async () => {
      const oversized = {
        buffer: Buffer.alloc(1.5 * 1024 * 1024 + 1),
        mimetype: 'image/jpeg',
        originalname: 'big.jpg',
      };

      await expect(service.scan('user-id', [oversized])).rejects.toThrow(
        PayloadTooLargeException,
      );
      await expect(service.scan('user-id', [oversized])).rejects.toThrow(
        /big\.jpg/,
      );
      expect(getUserDb).not.toHaveBeenCalled();
    });

    it('does not apply the image cap to a PDF', async () => {
      const largePdf = {
        buffer: Buffer.alloc(1.5 * 1024 * 1024 + 1),
        mimetype: 'application/pdf',
        originalname: 'receipt.pdf',
      };

      await service.scan('user-id', [largePdf]);
      expect(getUserDb).toHaveBeenCalled();
    });
  });

  describe('the keyless answer', () => {
    it('answers 503 without opening the database, when unconfigured', async () => {
      isConfigured.mockReturnValue(false);

      await expect(service.scan('user-id', [validImage()])).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(getUserDb).not.toHaveBeenCalled();
    });
  });

  describe('validation against live data', () => {
    it('passes a fully valid extraction straight through', async () => {
      const result = await service.scan('user-id', [validImage()]);

      expect(result).toEqual({
        merchant: 'Konzum',
        amount: 12.5,
        date: '2026-08-03',
        categoryId: CATEGORY_ID,
        note: 'Groceries',
        missing: [],
      });
    });

    it('drops a hallucinated categoryId and reports it missing, never falling back to a default', async () => {
      extract.mockResolvedValue({
        ...VALID_RAW,
        categoryId: OTHER_CATEGORY_ID,
      });

      const result = await service.scan('user-id', [validImage()]);

      expect(result.categoryId).toBeNull();
      expect(result.missing).toContain('categoryId');
    });

    it('drops a date that is not a real calendar date', async () => {
      extract.mockResolvedValue({ ...VALID_RAW, date: '2026-02-30' });

      const result = await service.scan('user-id', [validImage()]);

      expect(result.date).toBeNull();
      expect(result.missing).toContain('date');
    });

    it('drops a date in the wrong shape entirely', async () => {
      extract.mockResolvedValue({ ...VALID_RAW, date: '08/03/2026' });

      const result = await service.scan('user-id', [validImage()]);

      expect(result.date).toBeNull();
      expect(result.missing).toContain('date');
    });

    it('drops a non-positive amount', async () => {
      extract.mockResolvedValue({ ...VALID_RAW, amount: 0 });

      const result = await service.scan('user-id', [validImage()]);

      expect(result.amount).toBeNull();
      expect(result.missing).toContain('amount');
    });

    it('drops a non-numeric amount', async () => {
      extract.mockResolvedValue({
        ...VALID_RAW,
        amount: Number.NaN,
      });

      const result = await service.scan('user-id', [validImage()]);

      expect(result.amount).toBeNull();
      expect(result.missing).toContain('amount');
    });

    it('treats a blank merchant as missing rather than an empty string', async () => {
      extract.mockResolvedValue({ ...VALID_RAW, merchant: '   ' });

      const result = await service.scan('user-id', [validImage()]);

      expect(result.merchant).toBeNull();
      expect(result.missing).toContain('merchant');
    });

    it('never reports a missing note: it is supplementary, not something a retry photo fixes', async () => {
      extract.mockResolvedValue({ ...VALID_RAW, note: null });

      const result = await service.scan('user-id', [validImage()]);

      expect(result.note).toBeNull();
      expect(result.missing).not.toContain('note');
    });

    it('reports every invented field missing when nothing was extracted', async () => {
      extract.mockResolvedValue({
        merchant: null,
        amount: null,
        date: null,
        categoryId: null,
        note: null,
      });

      const result = await service.scan('user-id', [validImage()]);

      expect(result.missing).toEqual([
        'merchant',
        'amount',
        'date',
        'categoryId',
      ]);
    });
  });

  describe('merchant history', () => {
    it('passes the categories fetched to extract(), for the prompt', async () => {
      await service.scan('user-id', [validImage()]);

      expect(extract).toHaveBeenCalledWith(
        [validImage()],
        [{ id: CATEGORY_ID, name: 'Groceries' }],
        [],
      );
    });

    it('folds one merchant seen under two categories into one entry, ranked by total count', async () => {
      select = jest
        .fn()
        .mockReturnValueOnce(categoryRows())
        .mockReturnValueOnce(
          queryChain([
            {
              merchant: 'Konzum',
              categoryId: CATEGORY_ID,
              categoryName: 'Groceries',
              count: 5,
            },
            {
              merchant: 'Konzum',
              categoryId: OTHER_CATEGORY_ID,
              categoryName: 'Health',
              count: 2,
            },
            {
              merchant: 'HEP',
              categoryId: CATEGORY_ID,
              categoryName: 'Groceries',
              count: 1,
            },
          ]),
        );
      build();

      await service.scan('user-id', [validImage()]);

      const [, , merchantHistory] = extract.mock.calls[0] as [
        unknown,
        unknown,
        {
          merchant: string;
          categories: { categoryId: string; count: number }[];
        }[],
      ];

      expect(merchantHistory).toEqual([
        {
          merchant: 'Konzum',
          categories: [
            { categoryId: CATEGORY_ID, categoryName: 'Groceries', count: 5 },
            { categoryId: OTHER_CATEGORY_ID, categoryName: 'Health', count: 2 },
          ],
        },
        {
          merchant: 'HEP',
          categories: [
            { categoryId: CATEGORY_ID, categoryName: 'Groceries', count: 1 },
          ],
        },
      ]);
    });
  });
});
