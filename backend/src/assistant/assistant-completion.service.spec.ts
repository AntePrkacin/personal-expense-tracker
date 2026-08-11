import {
  GatewayTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AssistantCompletionService } from './assistant-completion.service';
import type { AssistantPromptContext } from './assistant-context.builder';
import { ASSISTANT_MODEL, ASSISTANT_TIMEOUT_MS } from './assistant.constants';

/** The one shape this spec cares about out of `GenerateContentParameters`. */
interface GenerateContentCall {
  model: string;
  contents: { role: string; parts: { text: string }[] }[];
  config: {
    systemInstruction: string;
    abortSignal?: AbortSignal;
  };
}

// ts-jest does not hoist `jest.mock` calls the way babel-jest does, so this
// runs in source order and `mockGenerateContent` is defined before the factory
// below closes over it - no "mock*"-prefix hoisting trick needed.
const mockGenerateContent = jest.fn<
  Promise<{ text?: string }>,
  [GenerateContentCall]
>();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
  })),
}));

/**
 * Unit cover for the assistant's one call site into Gemini. What only this file
 * can prove: the shape of what is sent, that a caller signal really reaches the
 * SDK combined with the timeout (the abort chain's third hop), and how each
 * failure is classified. The reads and the write are `AssistantService`'s and
 * are covered against a mocked completion service instead of a mocked SDK.
 */
describe('AssistantCompletionService', () => {
  let service: AssistantCompletionService;
  let config: { get: jest.Mock };

  const context: AssistantPromptContext = {
    today: '2026-08-11',
    currency: 'EUR',
    period: { start: '2026-08-01', end: '2026-09-01', label: 'August 2026' },
    budgetCents: 150_000,
    categories: [{ name: 'Groceries', cap: 400 }],
    transactions: [
      {
        date: '2026-08-10',
        merchant: 'Konzum',
        amountCents: 1234,
        categoryName: 'Groceries',
      },
    ],
    truncation: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    config = { get: jest.fn().mockReturnValue('test-api-key') };
    service = new AssistantCompletionService(
      config as unknown as ConfigService,
    );
    mockGenerateContent.mockResolvedValue({ text: 'You spent 12.34 EUR.' });
  });

  describe('isConfigured', () => {
    it('is true with a key', () => {
      expect(service.isConfigured()).toBe(true);
    });

    it('is false without one', () => {
      config.get.mockReturnValue(undefined);
      expect(service.isConfigured()).toBe(false);
    });
  });

  describe('complete', () => {
    it('returns the model text, trimmed', async () => {
      mockGenerateContent.mockResolvedValue({ text: '  An answer.\n' });

      await expect(service.complete(context, [], 'How much?')).resolves.toBe(
        'An answer.',
      );
    });

    it('sends the built prompt as a system instruction, not as a turn', async () => {
      await service.complete(context, [], 'How much?');

      const call = mockGenerateContent.mock.calls[0][0];
      expect(call.model).toBe(ASSISTANT_MODEL);
      expect(call.config.systemInstruction).toContain(
        '260810|Konzum|12.34|Groceries',
      );
      expect(call.contents).toHaveLength(1);
      expect(call.contents[0]).toEqual({
        role: 'user',
        parts: [{ text: 'How much?' }],
      });
    });

    it('declares no response schema, because the answer is prose', async () => {
      await service.complete(context, [], 'How much?');

      expect(mockGenerateContent.mock.calls[0][0].config).not.toHaveProperty(
        'responseSchema',
      );
    });

    it('re-sends the whole prior conversation, mapping assistant to model', async () => {
      await service.complete(
        context,
        [
          { role: 'user', content: 'First question' },
          { role: 'assistant', content: 'First answer' },
        ],
        'Second question',
      );

      expect(mockGenerateContent.mock.calls[0][0].contents).toEqual([
        { role: 'user', parts: [{ text: 'First question' }] },
        { role: 'model', parts: [{ text: 'First answer' }] },
        { role: 'user', parts: [{ text: 'Second question' }] },
      ]);
    });

    it('answers 503 with no key configured', async () => {
      config.get.mockReturnValue(undefined);

      await expect(service.complete(context, [], 'How much?')).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('answers 504 when the call outlives the timeout', async () => {
      jest.useFakeTimers();
      mockGenerateContent.mockImplementation(
        (call) =>
          new Promise((_resolve, reject) => {
            call.config.abortSignal?.addEventListener('abort', () =>
              reject(new Error('aborted')),
            );
          }),
      );

      const pending = service.complete(context, [], 'How much?');
      jest.advanceTimersByTime(ASSISTANT_TIMEOUT_MS);

      await expect(pending).rejects.toThrow(GatewayTimeoutException);
      jest.useRealTimers();
    });

    it('rejects rather than throwing 504 when the caller aborts', async () => {
      // Hop 3: a deliberate cancel is not a timeout, and calling it one would
      // put a wrong line in the log for something the user chose.
      const caller = new AbortController();
      mockGenerateContent.mockImplementation(
        (call) =>
          new Promise((_resolve, reject) => {
            call.config.abortSignal?.addEventListener('abort', () =>
              reject(new Error('aborted')),
            );
          }),
      );

      const pending = service.complete(context, [], 'How much?', caller.signal);
      caller.abort();

      await expect(pending).rejects.not.toBeInstanceOf(GatewayTimeoutException);
    });

    it('combines the caller signal with the timeout, so both can stop the call', async () => {
      const caller = new AbortController();
      await service.complete(context, [], 'How much?', caller.signal);

      const { abortSignal } = mockGenerateContent.mock.calls[0][0].config;
      expect(abortSignal?.aborted).toBe(false);

      caller.abort();
      expect(abortSignal?.aborted).toBe(true);
    });

    it('throws on an empty answer rather than storing a blank bubble', async () => {
      mockGenerateContent.mockResolvedValue({ text: '   ' });

      await expect(service.complete(context, [], 'How much?')).rejects.toThrow(
        'empty answer',
      );
    });

    it('throws when the SDK returns no text at all', async () => {
      mockGenerateContent.mockResolvedValue({});

      await expect(service.complete(context, [], 'How much?')).rejects.toThrow(
        'empty answer',
      );
    });

    it('propagates any other SDK failure unchanged', async () => {
      mockGenerateContent.mockRejectedValue(new Error('quota exhausted'));

      await expect(service.complete(context, [], 'How much?')).rejects.toThrow(
        'quota exhausted',
      );
    });
  });
});
