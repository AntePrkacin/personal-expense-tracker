import { fromCents } from '../common/money';
import { MAX_NAME_CHARS, MAX_SESSION_TITLE_CHARS } from './assistant.constants';

/**
 * Everything the assistant sends to Gemini, built from plain data.
 *
 * **Pure functions with no DI, no database and no SDK**, following the
 * `ReceiptScanService` / `ReceiptExtractionService` split one level further in:
 * `AssistantService` does the reads, `AssistantCompletionService` makes the call,
 * and the compression, the prompt and the sanitiser are here where a spec can
 * pin them with literals.
 *
 * `backend/src/assistant/CLAUDE.md` owns the inventory of what crosses the wire.
 * The literal prompt is here and is deliberately **not** restated there - it
 * would drift the first time somebody tuned a sentence.
 */

/** One transaction as the digest query hands it over, already category-resolved. */
export interface AssistantTransactionRow {
  /** `YYYY-MM-DD`, verbatim from the column. */
  date: string;
  merchant: string;
  amountCents: number;
  /** The live category's name, or the account's own fallback name. Never an id. */
  categoryName: string;
}

/**
 * One category's cap for the period being described, resolved by the caller.
 *
 * **Major units here, unlike every other money field in this file**, because it
 * arrives already converted from `CategoriesService.list` - the one place that
 * resolves a cap for a period, and which this feature composes rather than
 * re-queries. Converting it back to cents only to divide again would put a
 * round trip through `money.ts` in the name of looking consistent. What the rule
 * against "a fifth place doing its own arithmetic" forbids is a second
 * *conversion*; `toFixed(2)` below is formatting.
 */
export interface AssistantCategoryContext {
  name: string;
  /** Major units, or null for an uncapped category. */
  cap: number | null;
}

/**
 * What was left out, when the ceiling bit.
 *
 * **Reported to the screen as well as to the model.** A fact the model is told
 * should also be a fact the UI can state, or the only witness to it is a sentence
 * the model may or may not produce.
 */
export interface AssistantTruncation {
  /** How many rows went. */
  included: number;
  /** How many the account has. */
  total: number;
  /** The oldest date that made it in, `YYYY-MM-DD`. */
  oldestIncludedDate: string;
}

/** One prior message of the session, re-sent on every turn. */
export interface AssistantHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Everything the prompt header quotes, resolved through the services that own it. */
export interface AssistantPromptContext {
  /** `YYYY-MM-DD` in `APP_TIMEZONE`, from `PeriodService.today()`. */
  today: string;
  /** ISO 4217, read straight off `profile.currency`. */
  currency: string;
  /** The current period, from `PeriodService.current()`. */
  period: { start: string; end: string; label: string };
  /** The budget in force for that period, minor units. */
  budgetCents: number;
  categories: AssistantCategoryContext[];
  /** Newest first, already capped at `MAX_PROMPT_TRANSACTIONS`. */
  transactions: AssistantTransactionRow[];
  truncation: AssistantTruncation | null;
}

/**
 * Strips the row delimiters out of a free-text field and collapses whitespace.
 *
 * **This is the app's first delimited format and therefore the first place this
 * class of bug can exist.** `transactions.merchant` is free text with no
 * character restriction, so an unsanitised `|` shifts every field on its row and
 * the model reads an amount as a category name - which produces a *confidently
 * wrong answer* rather than an error, which is why its spec pins it rather than
 * trusting the format to be obviously right.
 *
 * The cap is `MAX_NAME_CHARS` and bounds a pathological name only; see that
 * constant for why names are otherwise verbatim.
 */
export function sanitizeField(value: string): string {
  return value
    .replace(/[|\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_CHARS);
}

/**
 * `YYYY-MM-DD` to `YYMMDD`, by pure string work.
 *
 * **Nothing constructs a `Date`**, the rule `src/common/month-window.ts` and
 * `frontend/src/lib/date.ts` both state from opposite directions: round-tripping
 * a calendar date through a `Date` shifts it across timezones.
 *
 * It saves about 11% of the digest and costs a century ambiguity, which the
 * prompt header closes by stating the dates are in the 2000s. **If any wrong
 * answer is ever traced to this field, revert to the ISO form** - the saving is
 * not worth an argument.
 */
export function toCompactDate(date: string): string {
  return `${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}`;
}

/**
 * The transaction digest: one row per line, `YYMMDD|Merchant|Amount|Category`.
 *
 * Four things about the format are decisions. **A newline as the row separator,
 * not a semicolon** - the same single byte, tokenising the same, and unable to
 * collide with a merchant name containing a semicolon. **`|`, carriage return and
 * newline are stripped** from both names, per `sanitizeField`. **The date is
 * `YYMMDD`**, per `toCompactDate`. And the amount is **`fromCents()` then two
 * decimal places**, with the currency stated once in the header rather than
 * repeated on every row - this is `fromCents`' fifth caller, and "a fifth place
 * doing its own arithmetic is a bug" is why it does not divide by 100 itself.
 */
export function compressTransactions(
  rows: readonly AssistantTransactionRow[],
): string {
  return rows
    .map((row) =>
      [
        toCompactDate(row.date),
        sanitizeField(row.merchant),
        fromCents(row.amountCents).toFixed(2),
        sanitizeField(row.categoryName),
      ].join('|'),
    )
    .join('\n');
}

/**
 * The instruction header, the data and the truncation notice, as one string.
 *
 * **The truncation is told to the model, not applied silently.** A model that
 * does not know its data was cut will confidently answer "you never shopped
 * there" about a merchant it was simply not shown.
 *
 * **The header names which period's budget and caps it is quoting.** Both are
 * effective-dated since PET-72, so a bare number would let the model answer a
 * question about last March with this month's limits and sound certain about it.
 *
 * **The budget and cap history is deliberately not sent.** The rows carry no
 * period attribution of their own, so a history would be a second dataset with a
 * join the model has to perform in prose, and the questions it unlocks ("what was
 * my budget in March") are worth a `docs/TODO.md` entry rather than a doubling of
 * the prompt.
 */
export function buildPrompt(context: AssistantPromptContext): string {
  const {
    today,
    currency,
    period,
    budgetCents,
    categories,
    transactions,
    truncation,
  } = context;

  const caps = categories
    .map(
      (category) =>
        `- ${sanitizeField(category.name)}: ${
          category.cap === null ? 'no cap' : category.cap.toFixed(2)
        }`,
    )
    .join('\n');

  return [
    "You are Spendifico's spending assistant. You answer questions about one person's own recorded expenses, using only the data below. Be concise, concrete and numeric: quote the figures you used and say which period they came from.",

    [
      `Today is ${today}.`,
      `All amounts, here and in the data, are in ${currency} and are written in major units with two decimal places.`,
      `The current budgeting period is "${period.label}", running from ${period.start} up to but not including ${period.end}. A budgeting period is anchored to the user's paycheck and is not always one calendar month.`,
      `The monthly budget in force for that period is ${fromCents(budgetCents).toFixed(2)}.`,
    ].join(' '),

    caps.length > 0
      ? `Per-category caps in force for that period. A category with no cap is not being budgeted separately, which is a deliberate choice rather than missing data:\n${caps}`
      : 'The user has set no per-category caps for that period.',

    `Every transaction on the account, newest first, one per line as YYMMDD|Merchant|Amount|Category. Dates are in the 2000s, so 260811 is 2026-08-11. The category is the one the transaction is filed under.\n${compressTransactions(transactions)}`,

    truncation
      ? `IMPORTANT: this is not the user's whole history. You were given the most recent ${truncation.included} of ${truncation.total} transactions, reaching back to ${truncation.oldestIncludedDate}. Anything before that date is missing from your data, so never say the user did not spend somewhere or did not spend at all - say that you can only see back to ${truncation.oldestIncludedDate}.`
      : "This is the user's complete transaction history on this account.",

    [
      'Rules.',
      'Answer only from the data above; never invent a transaction, a merchant, an amount or a date.',
      'If the data does not answer the question, say so plainly rather than estimating.',
      'You have no way to add, edit or delete anything - if the user asks you to, tell them which screen does it.',
      "Decline anything that is not about this account's spending, and do not give regulated financial, tax or investment advice.",
      // PET-76 reversed this rule. It read "Answer in plain prose. Do not use
      // markdown tables or headings; short paragraphs and, at most, simple
      // dashed lists." - and the model emitted markdown anyway, which is a fact
      // about models rather than about the wording. The bubble rendered it
      // literally, so `**July 2026**` reached the user as four asterisks and a
      // month. The frontend renders markdown now
      // (`frontend/src/app/(app)/insights/AssistantMarkdown.tsx`), so the
      // instruction that was being ignored is replaced by one that is true.
      //
      // It says what is rendered rather than merely permitting markdown: GFM
      // tables are supported, so saying so is what makes a per-category
      // breakdown come back as a table instead of as a paragraph listing
      // figures. Raw HTML is never parsed on the way out - it is escaped and
      // shown as characters - so asking for none of it keeps a reply from
      // arriving full of visible tags.
      'Answer in GitHub-flavoured markdown, which is rendered: use short paragraphs, bold for figures worth emphasising, bulleted or numbered lists, and a table when you are comparing several categories or periods. Keep it brief, use no headings above level three, and write no raw HTML.',
    ].join(' '),
  ].join('\n\n');
}

/**
 * A session's title, derived from its first user message and never rewritten -
 * which is why `assistant_sessions` carries no `updated_at`.
 *
 * Derived rather than asked for: the user's action is sending a message, not
 * naming a conversation, and a History list of "Untitled" rows is worth less than
 * an imperfect first line.
 */
export function deriveSessionTitle(firstMessage: string): string {
  const collapsed = firstMessage.replace(/\s+/g, ' ').trim();

  if (collapsed.length <= MAX_SESSION_TITLE_CHARS) {
    return collapsed;
  }

  // Cut on a word boundary when there is one late enough to be worth keeping,
  // so a long question does not end mid-word.
  const cut = collapsed.slice(0, MAX_SESSION_TITLE_CHARS);
  const lastSpace = cut.lastIndexOf(' ');
  const stem =
    lastSpace > MAX_SESSION_TITLE_CHARS / 2 ? cut.slice(0, lastSpace) : cut;

  return `${stem}…`;
}
