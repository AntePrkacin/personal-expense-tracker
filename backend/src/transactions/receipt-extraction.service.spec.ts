import {
  GatewayTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ReceiptExtractionService } from './receipt-extraction.service';

/** The one shape this spec cares about out of `GenerateContentParameters`. */
interface GenerateContentCall {
  model: string;
  contents: unknown[];
  config: {
    responseMimeType: string;
    responseSchema: unknown;
    abortSignal?: AbortSignal;
  };
}

// ts-jest does not hoist `jest.mock` calls the way babel-jest does, so this
// runs in source order and `mockGenerateContent` is defined before the
// factory below closes over it - no "mock*"-prefix hoisting trick needed.
const mockGenerateContent = jest.fn<
  Promise<{ text?: string }>,
  [GenerateContentCall]
>();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
  })),
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', NUMBER: 'NUMBER' },
  createPartFromBase64: jest.fn((data: string, mimeType: string) => ({
    inlineData: { data, mimeType },
  })),
}));

/**
 * Unit cover for the one call site that talks to Gemini. What only this file
 * can prove: what `extract` returns for a well-formed, malformed and empty
 * model answer, and that a hung call is bounded and reported as its own
 * status. Validating an extracted value against live categories is
 * `ReceiptScanService`'s job, covered in its own spec against a mocked
 * `ReceiptExtractionService` instead of a mocked SDK.
 */
describe('ReceiptExtractionService', () => {
  let service: ReceiptExtractionService;
  let config: { get: jest.Mock };

  const files = [
    {
      buffer: Buffer.from('fake-image-bytes'),
      mimetype: 'image/png',
      originalname: 'r.png',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    config = { get: jest.fn().mockReturnValue('test-api-key') };
    service = new ReceiptExtractionService(config as unknown as ConfigService);
  });

  describe('isConfigured', () => {
    it('is true when GEMINI_API_KEY is set', () => {
      expect(service.isConfigured()).toBe(true);
    });

    it('is false when it is unset', () => {
      config.get.mockReturnValue(undefined);
      expect(service.isConfigured()).toBe(false);
    });
  });

  describe('extract', () => {
    it('throws ServiceUnavailableException if called with no key configured', async () => {
      config.get.mockReturnValue(undefined);

      await expect(service.extract(files, [], [])).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('sends the model id, the images and a JSON-schema config', async () => {
      mockGenerateContent.mockResolvedValue({ text: '{}' });

      await service.extract(files, [{ id: 'cat-1', name: 'Food' }], []);

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      const call = mockGenerateContent.mock.calls[0][0];
      expect(call.model).toBe('gemini-3.6-flash');
      // First content part is the prompt text, naming the category so the
      // model can return its id.
      expect(call.contents[0]).toEqual(expect.stringContaining('cat-1'));
      expect(call.contents[1]).toEqual({
        inlineData: {
          data: files[0].buffer.toString('base64'),
          mimeType: 'image/png',
        },
      });
      expect(call.config.responseMimeType).toBe('application/json');
      expect(call.config.responseSchema).toBeDefined();
    });

    it('parses a well-formed structured-output answer', async () => {
      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify({
          merchant: 'Konzum',
          amount: 12.5,
          date: '2026-08-03',
          categoryId: 'cat-1',
          note: 'Groceries',
        }),
      });

      await expect(service.extract(files, [], [])).resolves.toEqual({
        merchant: 'Konzum',
        amount: 12.5,
        date: '2026-08-03',
        categoryId: 'cat-1',
        note: 'Groceries',
      });
    });

    it('degrades an unparseable answer to every field null, rather than throwing', async () => {
      mockGenerateContent.mockResolvedValue({ text: 'not json' });

      await expect(service.extract(files, [], [])).resolves.toEqual({
        merchant: null,
        amount: null,
        date: null,
        categoryId: null,
        note: null,
      });
    });

    it('degrades an empty response the same way', async () => {
      mockGenerateContent.mockResolvedValue({ text: undefined });

      await expect(service.extract(files, [], [])).resolves.toEqual({
        merchant: null,
        amount: null,
        date: null,
        categoryId: null,
        note: null,
      });
    });

    it('discards a field of the wrong type rather than passing it through', async () => {
      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify({
          merchant: 123,
          amount: '12.50',
          date: null,
          categoryId: null,
          note: null,
        }),
      });

      await expect(service.extract(files, [], [])).resolves.toEqual({
        merchant: null,
        amount: null,
        date: null,
        categoryId: null,
        note: null,
      });
    });

    it('times out and answers GatewayTimeoutException, distinct from any other failure', async () => {
      jest.useFakeTimers();

      mockGenerateContent.mockImplementation(
        (params: { config?: { abortSignal?: AbortSignal } }) =>
          new Promise((_resolve, reject) => {
            params.config?.abortSignal?.addEventListener('abort', () =>
              reject(new Error('This operation was aborted')),
            );
          }),
      );

      const pending = service.extract(files, [], []);
      // Swallow the rejection before assertions run, so Jest's unhandled-
      // rejection detector does not flag it ahead of the `await expect` below.
      pending.catch(() => undefined);

      await jest.runAllTimersAsync();

      await expect(pending).rejects.toThrow(GatewayTimeoutException);

      jest.useRealTimers();
    });

    it('propagates a non-timeout failure from the SDK as-is', async () => {
      mockGenerateContent.mockRejectedValue(new Error('quota exceeded'));

      await expect(service.extract(files, [], [])).rejects.toThrow(
        'quota exceeded',
      );
    });
  });
});
