/**
 * Constants shared by the receipt-scanning feature, gathered in one file so
 * the size stack and the model choice are each one number to tune rather than
 * several to keep in step.
 */

/**
 * `gemini-3.6-flash`, behind one exported constant rather than inline: the
 * plan names three current candidates (this one, `gemini-3.5-flash` and the
 * `-lite` fallback), and a call site naming the model by string would have to
 * be found and edited to try another. See docs/plans/2026-08-06_PET-59_receipt-scanning.md.
 */
export const RECEIPT_SCAN_MODEL = 'gemini-3.6-flash';

/** The five MIME types Gemini is asked to read. A `fileFilter` rejects anything else with a 400. */
export const RECEIPT_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
] as const;

export type ReceiptMimeType = (typeof RECEIPT_MIME_TYPES)[number];

export const RECEIPT_PDF_MIME_TYPE: ReceiptMimeType = 'application/pdf';

/** At most 4 images, or exactly 1 PDF - enforced by `receiptFileFilter` and multer's own `limits.files`. */
export const MAX_RECEIPT_FILES = 4;

/** Multer's fileSize limit counts bytes, not kinds, so it is set to the larger of the two caps below; the smaller (image) cap is checked after upload. */
export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
export const MAX_PDF_BYTES = 4 * 1024 * 1024;

/**
 * Top N merchants by transaction count injected into the prompt, capped so
 * "every merchant from the past year" stays bounded on latency, tokens and
 * what a free-tier account hands Google to train on. Named so it can be
 * tuned against a real prompt rather than rediscovered.
 */
export const MERCHANT_HISTORY_LIMIT = 50;

/** How far back the merchant history query reaches. */
export const MERCHANT_HISTORY_DAYS = 365;

/**
 * Bounds the Gemini call so a hung or quota-throttled request cannot leave
 * the modal's loading overlay up forever (the failure PET-56 was a whole
 * ticket about). A timed-out scan answers 504, distinct from the keyless 503.
 */
export const RECEIPT_SCAN_TIMEOUT_MS = 20_000;
