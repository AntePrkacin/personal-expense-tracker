import { parseAmountInput } from '@/lib/format';
import { partsFromIso } from '@/lib/date';
import type { components } from '@/types/api';

// The Add transaction form's shape, its validity rules, and the single boundary where
// five display strings become a `CreateTransactionDto`.
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
