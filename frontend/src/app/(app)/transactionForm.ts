import { formatAmountInput, parseAmountInput } from '@/lib/format';
import { partsFromIso } from '@/lib/date';
import type { Transaction } from '@/lib/transactions';
import type { components } from '@/types/api';

// The Add transaction form's shape, its validity rules, and the single boundary where
// five display strings become a `CreateTransactionDto`.
//
// **PET-32 made this module serve frame 11 as well as frame 09, and that is why the
// `lib/amount.ts` this file used to predict never happened.** The edit modal draws the
// same five fields under the same four rules, so it imports `invalidFields` and the four
// predicates rather than restating any of them - which means `isAmountValid` still has
// exactly two copies in the repo, not the three that would have triggered the lift.
// `docs/TODO.md` carries the amended entry. What the edit modal did add is the two
// boundaries at the end of this file: one turning a stored row into form values, one
// turning form values back into the *changed* subset of an `UpdateTransactionDto`.
//
// React-free on purpose, the same split `app/setup/draft.ts` makes: the rules and the
// conversion are plain functions whose suite needs no jsdom, and
// `AddTransactionModal.tsx` above is left with rendering, state and the request. The
// error *strings* deliberately stay in the component, matching `BudgetForm` and
// `RegisterForm`, which each hold a local `MESSAGES` object - so this module names
// which fields are wrong and never what to say about them.

/**
 * What the form holds while it is being filled in.
 *
 * **`amount` is the display string, not a number**, and that is
 * `SetupDraft.budget`'s reason rather than a new one: no number represents `'24.'`,
 * which is a real intermediate state a user types through, and `formatAmountInput`
 * is what the field runs on every keystroke. The conversion to a number happens once,
 * in `toCreateTransactionBody`.
 *
 * `date` is `YYYY-MM-DD` throughout - the form, the wire and the database all use the
 * same string, so there is nothing to convert and no `Date` in the path. `lib/date.ts`
 * explains why that matters.
 *
 * `note` is a plain string rather than `string | undefined`, because a controlled
 * input's value cannot be `undefined` without React warning about it. Blank becomes
 * *absent* at the boundary below, which is where the distinction belongs.
 */
export type TransactionFormValues = {
  amount: string;
  categoryId: string;
  date: string;
  merchant: string;
  note: string;
};

/** The four required fields (ADD-5, A12). `note` is the one field that cannot be invalid. */
export type TransactionFormField = 'amount' | 'categoryId' | 'date' | 'merchant';

/**
 * Whether the amount is one "Add transaction" may proceed on: greater than zero
 * (ADD-6, and AC4).
 *
 * **A copy of `isBudgetValid` in `app/setup/draft.ts`, not an import of it**, and the
 * twin is named here so the next person finds both. Importing would point the signed-in
 * shell at onboarding, the same layering inversion `lib/resend.ts` was moved out of
 * `app/check-email/` to remove. It is also the call `LoginForm` already made about its
 * two field messages: "copied rather than shared - there is no copy module in this repo
 * and two overlapping strings are the wrong reason to invent one". PET-32's Edit
 * transaction modal will make it a third copy, which is the point at which a shared
 * `lib/amount.ts` earns its place; `docs/TODO.md` records that.
 *
 * **PET-32 did not make it a third copy**, and that prediction is left standing above
 * rather than deleted so the reasoning survives: the edit modal calls `invalidFields`
 * below instead of restating the rule, so it still lives in exactly two places and the
 * lift is still unearned. The trigger to watch for is now a third *form* that validates
 * an amount without coming through this module.
 *
 * `NaN > 0` is `false`, so an empty field, a bare `'.'` and unparseable junk all fail
 * on the same comparison as `'0'` and `'0.00'` - which is why AC3's "missing amount"
 * and AC4's "zero or negative" need one rule and one message rather than two.
 *
 * A signed string never reaches this in practice and is rejected if it does, which is
 * two separate facts worth keeping straight. The field runs `formatAmountInput` on
 * every keystroke and that drops the sign, so a pasted `'-24'` is already `'24'` in
 * state - amounts are entered as magnitudes (ADD-4, A13) and the product records
 * expenses only. Should a `'-24'` arrive anyway, `parseAmountInput` does **not** strip
 * the sign, so this answers `false`: the safe direction, and defence in depth rather
 * than the primary guard.
 *
 * There is no upper bound here; the DTO's `@Max(1_000_000_000)` is its own business,
 * and a value over it comes back as the `invalid` reason.
 */
export function isAmountValid(amount: string): boolean {
  return parseAmountInput(amount) > 0;
}

/**
 * Whether a category has been chosen.
 *
 * Reachable because the Category select opens on a `Select…` placeholder rather than
 * preselecting the fallback "Uncategorized". The contract's own `isFallback` doc says
 * the form preselects it, which would make this rule - and AC3's "missing category" -
 * unreachable by construction; the placeholder keeps the criterion real at the cost of
 * one interaction per expense. That decision is recorded on the ticket.
 *
 * `ui/Select` renders a placeholder as a `value=""` option that is both disabled and
 * hidden, so `''` is exactly what an untouched select submits.
 */
export function isCategoryChosen(categoryId: string): boolean {
  return categoryId !== '';
}

/**
 * Whether the date is a real calendar day.
 *
 * Stricter than "filled", and it costs nothing: `partsFromIso` already rejects both
 * `''` and a well-shaped impossibility like `2025-02-30`. The picker cannot produce
 * either, so this is the same kind of guard `parseDraft` applies to sessionStorage -
 * the value arrives as a prop and a string is a string.
 */
export function isDateValid(date: string): boolean {
  return partsFromIso(date) !== null;
}

/** Whether the merchant is filled (ADD-5), matching the DTO's `@IsNotEmpty()`. */
export function isMerchantValid(merchant: string): boolean {
  return merchant.trim() !== '';
}

/**
 * Every required field that is currently invalid, in the order the modal draws them.
 *
 * **The list rather than a boolean, because AC3 asks for all of them at once**: an
 * empty form must show four messages, not stop at the first. Returning the set from a
 * plain function puts that rule where a fast test can pin it, instead of leaving it
 * implicit in four `if` statements inside a submit handler.
 *
 * The order matches ADD-2's field order, so a caller rendering the list reads top to
 * bottom.
 */
export function invalidFields(values: TransactionFormValues): TransactionFormField[] {
  const invalid: TransactionFormField[] = [];

  if (!isAmountValid(values.amount)) invalid.push('amount');
  if (!isCategoryChosen(values.categoryId)) invalid.push('categoryId');
  if (!isDateValid(values.date)) invalid.push('date');
  if (!isMerchantValid(values.merchant)) invalid.push('merchant');

  return invalid;
}

/**
 * The request body for `POST /api/transactions`.
 *
 * Read off the contract rather than declared, which is the rule
 * `docs/agents/api-contract.md` sets for every caller.
 *
 * Four conversions, each of which is a decision:
 *
 * - **`amount` goes through `parseAmountInput`**, not `Number()`, which answers `NaN`
 *   for the `'1,240.50'` the field actually holds. Callers must check
 *   `invalidFields` first: `parseAmountInput('')` is `NaN`, `JSON.stringify` writes
 *   that as `null`, and `@IsNumber` answers 400 - the same guard `RegisterForm`
 *   applies to the budget.
 * - **`date` is passed through verbatim.** The backend stores the string as given, so
 *   there is nothing to convert, and converting would be the bug: any `Date` in this
 *   path can move the day across a timezone. See `lib/date.ts`.
 * - **`merchant` is trimmed once, here.** Trimming on change would delete the space
 *   the moment somebody typed one between two words, which is exactly the call
 *   `toRegisterBody` makes about the three name fields.
 * - **`note` is omitted when blank, never sent as `''`.** Two reasons, and the second
 *   is the important one. `forbidNonWhitelisted` on the backend's `ValidationPipe`
 *   means the body must carry these five keys and nothing else - so this is also where
 *   DET-8's `time`, `paymentMethod`, `status` and `account` must never appear. But an
 *   empty string would *pass* `@IsOptional() @IsString() @MaxLength(500)` and be
 *   stored, and `TransactionResponseDto.note` promises "null when the transaction has
 *   no note, never absent" - so `''` would invent a third state for every later
 *   reader, and AC6 says "created without a note", which `''` is not.
 *
 * The conditional spread rather than `note: note || undefined` is what makes the
 * object's own keys match the wire's. Both serialise identically, because
 * `JSON.stringify` drops `undefined`, but only the spread lets a test assert with
 * `Object.keys` that nothing extra is being sent.
 */
export function toCreateTransactionBody(
  values: TransactionFormValues,
): components['schemas']['CreateTransactionDto'] {
  // Trimmed for merchant's reason: a note of nothing but spaces is a blank note.
  const note = values.note.trim();

  return {
    amount: parseAmountInput(values.amount),
    date: values.date,
    merchant: values.merchant.trim(),
    categoryId: values.categoryId,
    ...(note === '' ? {} : { note }),
  };
}

/**
 * A stored transaction as the edit form's five fields (EDT-1, and AC1).
 *
 * The inverse of `toCreateTransactionBody`, and two of the four conversions are decisions
 * rather than plumbing.
 *
 * **`amount` goes through `formatAmountInput(amount.toFixed(2))`**, not `String(amount)`
 * and not `formatCurrency`. The stored value is a number of major units, so a `24` would
 * render as `24` where frame 11 draws `24.00` - and `toFixed(2)` is what supplies the
 * cents before the grouping separator goes in, so `1240.5` becomes `1,240.50` rather than
 * `1240.5`. `formatCurrency` is the wrong tool for the same reason it is wrong in
 * `BudgetForm`: it emits a `$`, which belongs to `Input variant="currency"` here, and it
 * is `Intl`-based, so it would fight every subsequent keystroke.
 *
 * **`note` becomes `''` when it is `null`**, because a controlled input's value cannot be
 * `null` without React warning about it - the same boundary `TransactionFormValues`
 * documents from the other side. The distinction between "no note" and "empty note" is
 * restored on the way out, in `toUpdateTransactionBody` below.
 *
 * `date` and `merchant` pass through verbatim. `date` is the same `YYYY-MM-DD` string in
 * the database, on the wire and in the form, so there is nothing to convert and any
 * `Date` here would be the bug `lib/date.ts` describes. `merchant` is **not** trimmed on
 * the way in: a stored value is what it is, and trimming here would make the diff below
 * report a change the user did not make.
 */
export function toTransactionFormValues(transaction: Transaction): TransactionFormValues {
  return {
    amount: formatAmountInput(transaction.amount.toFixed(2)),
    categoryId: transaction.categoryId,
    date: transaction.date,
    merchant: transaction.merchant,
    note: transaction.note ?? '',
  };
}

/**
 * What `scanReceipt` (PET-59) answers, once its numeric `amount` has already
 * been normalized through `formatAmountInput` at the Server Action boundary
 * - so this is the same display-string shape `TransactionFormValues` holds,
 * never a raw number.
 */
export type ScannedTransactionFields = {
  merchant: string | null;
  amount: string | null;
  date: string | null;
  categoryId: string | null;
  note: string | null;
};

/**
 * Merges a scan's fields into the form, honouring which the user has already
 * typed into.
 *
 * **Tracks touched fields, not empty ones, and that is the whole point.**
 * `AddTransactionModal` initialises `date: todayIsoDate()`, so an emptiness
 * test would never overwrite it - a scan carrying the receipt's real date
 * would be silently refused in favour of today's. `touched` instead records
 * which fields the user has actually written into (through the form's `set`
 * function, never through this merge itself), so the pre-filled default date
 * counts as untouched and a field the user typed into - blank or not - is
 * left alone. This is also what makes a second scan safe on a partially
 * typed form: only the gaps a first scan left get filled.
 *
 * A `null` field is a field the scan could not fill, so it never overwrites
 * anything, touched or not - the caller's existing value (blank, or a
 * previous scan's) survives.
 */
export function mergeScannedFields(
  values: TransactionFormValues,
  touched: ReadonlySet<keyof TransactionFormValues>,
  scanned: ScannedTransactionFields,
): TransactionFormValues {
  const next = { ...values };

  if (!touched.has('merchant') && scanned.merchant !== null) next.merchant = scanned.merchant;
  if (!touched.has('amount') && scanned.amount !== null) next.amount = scanned.amount;
  if (!touched.has('date') && scanned.date !== null) next.date = scanned.date;
  if (!touched.has('categoryId') && scanned.categoryId !== null) next.categoryId = scanned.categoryId;
  if (!touched.has('note') && scanned.note !== null) next.note = scanned.note;

  return next;
}

/**
 * The request body for `PATCH /api/transactions/:id`: **only the fields that changed**.
 *
 * Read off the contract rather than declared, which is the rule
 * `docs/agents/api-contract.md` sets for every caller.
 *
 * **A diff rather than all five fields, because the DTO is a real partial patch** - absent
 * leaves a field alone, `null` clears the note, a value sets it. Sending everything every
 * time would work and would rewrite four fields the user never touched, which is a worse
 * answer to the same question. Two things follow that callers have to know:
 *
 * - **An empty object is a legitimate return value**, and it means nothing changed. The
 *   endpoint answers 400 `Provide at least one field to update.` for a body with no keys,
 *   so the caller must close without submitting rather than send it. `EditTransactionModal`
 *   does exactly that, and its suite pins it.
 * - **Callers must check `invalidFields` first**, as they must for
 *   `toCreateTransactionBody` and for the same reason: `parseAmountInput('')` is `NaN`,
 *   `JSON.stringify` writes that as `null`, and `@IsNumber` answers 400.
 *
 * Two comparisons are worth their comments. **`note` is compared against
 * `original.note ?? ''`**, so a blank field over a stored `null` is *no change* and a
 * blank field over a stored note sends `null` - the only way to clear one, and the reason
 * this cannot reuse `toCreateTransactionBody`'s omit-when-blank rule. And **`merchant` is
 * compared trimmed**, so a stored value carrying stray whitespace normalises the first
 * time anything else about the row is saved; that is a change the user did not type, and
 * it is preferred to the alternative of never being able to trim it.
 *
 * Keys are assigned rather than spread conditionally. `toCreateTransactionBody` uses a
 * spread because it has one optional field among four required ones; here every field is
 * optional, and five nested spreads would obscure the one thing this function is for. The
 * property that matters is the same and `Object.keys` still sees it: a field that did not
 * change contributes no key at all, rather than a key set to `undefined`.
 */
export function toUpdateTransactionBody(
  original: Transaction,
  values: TransactionFormValues,
): components['schemas']['UpdateTransactionDto'] {
  const body: components['schemas']['UpdateTransactionDto'] = {};

  const amount = parseAmountInput(values.amount);
  if (amount !== original.amount) body.amount = amount;

  if (values.categoryId !== original.categoryId) body.categoryId = values.categoryId;

  if (values.date !== original.date) body.date = values.date;

  const merchant = values.merchant.trim();
  if (merchant !== original.merchant) body.merchant = merchant;

  // Trimmed for merchant's reason: a note of nothing but spaces is a blank note, and a
  // blank note is `null` rather than `''` - `TransactionResponseDto.note` promises "null
  // when the transaction has no note, never absent", so `''` would invent a third state.
  const note = values.note.trim();
  if (note !== (original.note ?? '')) body.note = note === '' ? null : note;

  return body;
}
