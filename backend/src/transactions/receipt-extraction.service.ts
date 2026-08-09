import {
  GatewayTimeoutException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Type, createPartFromBase64 } from '@google/genai';
import {
  RECEIPT_SCAN_MODEL,
  RECEIPT_SCAN_TIMEOUT_MS,
} from './receipt-scan.constants';

/** One uploaded part, already read into memory by multer. */
export interface ReceiptScanFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

/** The caller's live categories, as injected into the prompt. */
export interface ReceiptCategoryContext {
  id: string;
  name: string;
}

/** One merchant's history: which categories it has landed in, and how often. */
export interface ReceiptMerchantHistoryEntry {
  merchant: string;
  categories: { categoryId: string; categoryName: string; count: number }[];
}

/**
 * The model's raw answer, before `ReceiptScanService` validates any of it
 * against live data. Every field is exactly what the model returned, or null.
 */
export interface RawReceiptExtraction {
  merchant: string | null;
  amount: number | null;
  date: string | null;
  categoryId: string | null;
  note: string | null;
}

const EMPTY_EXTRACTION: RawReceiptExtraction = {
  merchant: null,
  amount: null,
  date: null,
  categoryId: null,
  note: null,
};

/**
 * The JSON schema Gemini's structured output enforces. `nullable: true` on
 * every field, because a receipt the model cannot read confidently is a real
 * outcome (the "nothing extracted" row of the plan's outcome table) rather
 * than something to guess at.
 */
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    merchant: {
      type: Type.STRING,
      nullable: true,
      description: 'The merchant or store name on the receipt.',
    },
    amount: {
      type: Type.NUMBER,
      nullable: true,
      description:
        'The final total charged, in major currency units (e.g. 12.5 for $12.50).',
    },
    date: {
      type: Type.STRING,
      nullable: true,
      description: 'The purchase date, as a calendar date in YYYY-MM-DD form.',
    },
    categoryId: {
      type: Type.STRING,
      nullable: true,
      description:
        'The id (verbatim, not the name) of the single best-matching category from the provided list, or null if none fits confidently.',
    },
    note: {
      type: Type.STRING,
      nullable: true,
      description:
        'A short note on what was purchased, only if the receipt lists specific items worth naming.',
    },
  },
  required: ['merchant', 'amount', 'date', 'categoryId', 'note'],
} as const;

/**
 * The one call site that talks to Gemini. Kept separate from
 * `ReceiptScanService` so a spec can mock `@google/genai` wholesale and
 * assert this file's own contract - what it sends, and what it returns for a
 * malformed or empty model answer - without touching the database reads or
 * the against-live-data validation, which are `ReceiptScanService`'s job.
 */
@Injectable()
export class ReceiptExtractionService {
  constructor(private readonly config: ConfigService) {}

  /**
   * Whether `GEMINI_API_KEY` is set. The key is optional and unpaired (see
   * `env.validation.ts`), so this is what lets `ReceiptScanService` answer a
   * defined 503 instead of failing the call itself.
   */
  isConfigured(): boolean {
    return Boolean(this.config.get<string>('GEMINI_API_KEY'));
  }

  /**
   * @throws ServiceUnavailableException if no key is configured. Callers
   * should check `isConfigured()` first; this is the defensive second check.
   * @throws GatewayTimeoutException if the call does not finish within
   * `RECEIPT_SCAN_TIMEOUT_MS`.
   */
  async extract(
    files: ReceiptScanFile[],
    categories: ReceiptCategoryContext[],
    merchantHistory: ReceiptMerchantHistoryEntry[],
  ): Promise<RawReceiptExtraction> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Receipt scanning is not configured.',
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RECEIPT_SCAN_TIMEOUT_MS);

    try {
      const response = await ai.models.generateContent({
        model: RECEIPT_SCAN_MODEL,
        contents: [
          buildPrompt(categories, merchantHistory),
          ...files.map((file) =>
            createPartFromBase64(file.buffer.toString('base64'), file.mimetype),
          ),
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          abortSignal: controller.signal,
        },
      });

      return parseExtraction(response.text);
    } catch (error) {
      // A client-side abort is a client-only signal (the SDK's own doc
      // comment on `abortSignal` says the service call is still billed), so
      // this is the only way to tell "we gave up waiting" from any other
      // failure the SDK throws.
      if (controller.signal.aborted) {
        throw new GatewayTimeoutException('Receipt extraction timed out.');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Every image supplied is a page of the *same* receipt (the plan's "one scan
 * produces one transaction" decision), so the prompt asks for synthesis
 * across pages rather than treating them as separate purchases.
 */
function buildPrompt(
  categories: ReceiptCategoryContext[],
  merchantHistory: ReceiptMerchantHistoryEntry[],
): string {
  return [
    'You are extracting structured data from one or more images, or a single PDF, of a purchase receipt. If more than one image is provided, they are pages of the SAME receipt - synthesize one answer across all of them rather than treating them as separate purchases.',
    `The user's categories, as {id, name} pairs. If you can confidently match the receipt to one, return its id verbatim. Never invent an id that is not in this list, and return null rather than guess:\n${JSON.stringify(categories)}`,
    `The user's merchant history for the past year, the ${merchantHistory.length} most frequent merchants with the categories each has been logged under and how many times. Use this to resolve a generic or misspelled merchant name on the receipt (e.g. "WM SUPERCENTER") to how this user actually categorizes it:\n${JSON.stringify(merchantHistory)}`,
    'Return the merchant name as printed, the final total charged, the purchase date as a calendar date (YYYY-MM-DD), the best-matching categoryId from the list above, and a short note only if the receipt lists specific items worth naming. Return null for any field you cannot determine with confidence rather than guessing.',
  ].join('\n\n');
}

/**
 * Structured output makes `response.text` a JSON string matching
 * `RESPONSE_SCHEMA` - but the schema is enforced by the model, not by a
 * parser on this end, so a malformed or absent response degrades to "nothing
 * extracted" rather than throwing. That is a real, reachable outcome (the
 * plan's own "nothing extracted" row) and not a bug to guard against.
 */
function parseExtraction(text: string | undefined): RawReceiptExtraction {
  if (!text) {
    return EMPTY_EXTRACTION;
  }

  try {
    const parsed = JSON.parse(text) as Partial<RawReceiptExtraction>;
    return {
      merchant: typeof parsed.merchant === 'string' ? parsed.merchant : null,
      amount: typeof parsed.amount === 'number' ? parsed.amount : null,
      date: typeof parsed.date === 'string' ? parsed.date : null,
      categoryId:
        typeof parsed.categoryId === 'string' ? parsed.categoryId : null,
      note: typeof parsed.note === 'string' ? parsed.note : null,
    };
  } catch {
    return EMPTY_EXTRACTION;
  }
}
