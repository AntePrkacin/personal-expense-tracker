/**
 * Constants for the assistant chat, gathered in one file so the model choice,
 * the timeout and the four ceilings are each one number to tune rather than
 * several to keep in step. `transactions/receipt-scan.constants.ts` is the
 * precedent and the reasoning is the same.
 */

/**
 * The same model receipt scanning uses, behind its own constant rather than an
 * import from that feature's file: the two calls have nothing else in common -
 * this one sends no image, declares no response schema and asks for prose - so
 * sharing a constant would only make one feature's tuning silently retune the
 * other.
 */
export const ASSISTANT_MODEL = 'gemini-3.6-flash';

/**
 * Bounds the Gemini call, so a hung or quota-throttled request cannot leave the
 * composer's pending state up forever - the failure PET-56 was a whole ticket
 * about. A timed-out turn answers 504, distinct from the keyless 503.
 *
 * Longer than `RECEIPT_SCAN_TIMEOUT_MS`, deliberately: a scan sends an image and
 * asks for five fields, while a turn sends tens of thousands of tokens of
 * transaction data and asks for prose over it.
 */
export const ASSISTANT_TIMEOUT_MS = 60_000;

/**
 * How many transactions go into one prompt, newest first.
 *
 * **3,000 puts the showcase account's whole history in every prompt.** Measured
 * on `src/scripts/showcase/fixture.data.json` in exactly the format
 * `compressTransactions` produces: 2,249 rows, 80,679 bytes, 35.9 bytes per row.
 * Tokens are the number that matters and bytes-over-four understates it, because
 * a pipe-delimited row splits on digits and delimiters - roughly 12 to 18 tokens
 * per row, so about 27k-40k tokens of data for that account and 36k-54k for a
 * full 3,000. Nothing is cached, so that is paid on **every message**.
 *
 * The consequence to carry rather than rediscover: **the truncation path is
 * unreachable on every account this project has**, so its spec constructs the
 * case directly and a browser walk cannot see it without a hand-built account of
 * more than 3,000 transactions.
 */
export const MAX_PROMPT_TRANSACTIONS = 3_000;

/**
 * How many prior messages of a session are re-sent, oldest dropped first.
 *
 * Sessions are resumable and every turn re-sends the whole conversation, so this
 * is what stops a long chat growing without bound on top of a prompt that is
 * already tens of thousands of tokens. Forty messages is twenty turns, roughly
 * 6k tokens.
 */
export const MAX_HISTORY_MESSAGES = 40;

/**
 * The longest message the API accepts, enforced by `SendMessageDto`.
 *
 * A pasted novel must not be what blows the context. The composer restates this
 * as a literal with the DTO named in a comment - `maxLength` reaches no
 * generated type, and the resulting 400 would otherwise produce advice the user
 * cannot act on. `MAX_CAP_ROWS` is the precedent for that duplication.
 */
export const MAX_MESSAGE_CHARS = 2_000;

/**
 * Caps one merchant or category name in a compressed row.
 *
 * **This bounds a pathological name and nothing else - it is not a compression
 * measure.** Names go verbatim: shortening "Konzum Superkonzum" to "Konzum"
 * merges two real merchants in the one field the model is being asked questions
 * *about*, and a confident wrong answer is exactly what `ReceiptScanService`
 * drops a hallucinated `categoryId` to avoid. The saving would be trivial
 * anyway - measured on the showcase fixture the mean merchant is 9.86 characters
 * and the longest is 20, 97 distinct names over 2,249 rows, so the whole
 * merchant field is about 22KB of an 80KB string.
 */
export const MAX_NAME_CHARS = 64;

/** How long a session title derived from its first message may be. */
export const MAX_SESSION_TITLE_CHARS = 60;
