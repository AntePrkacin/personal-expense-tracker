import { parseAmountInput } from './format';

// The two field rules that had twins in three modules, lifted here at PET-47 because the trigger
// `docs/TODO.md` recorded finally fired.
//
// **The trigger was named exactly, and this is it.** That entry predicted a shared `lib/amount.ts`
// when a third copy appeared, then watched PET-32 *not* create one - the edit modal reuses
// `(app)/transactionForm.ts` wholesale rather than restating the rule - and narrowed the trigger to
// "a third *form* that validates an amount without going through that module". The Settings
// Preferences card is that form: it validates a monthly budget, it is not a transaction, and
// importing `app/setup/draft.ts` from the signed-in shell would point Settings at onboarding, which
// is the layering inversion `lib/resend.ts` was moved out of `app/check-email/` to remove.
//
// **The name rule came with it because that entry said to take it**: "Whoever writes that should
// take `isMerchantValid` and `isNameValid` with it - they are the same pair of twins."
//
// **Every existing export keeps its own name and delegates here**, rather than call sites being
// rewritten to import from this module. `isBudgetValid`, `isNameValid`, `isAmountValid` and
// `isMerchantValid` each read correctly where they are - a budget, a name, an amount, a merchant -
// and renaming four predicates across five forms would be churn in service of nothing. What the
// lift buys is that there is now **one** copy of each rule to fix, which is what the rule of three
// is for; what it deliberately does not buy is a single vocabulary.

/**
 * Whether a typed amount is one a form may proceed on: greater than zero.
 *
 * The rule behind `app/setup/draft.ts`'s `isBudgetValid` and `(app)/transactionForm.ts`'s
 * `isAmountValid`, which were byte-identical.
 *
 * **`NaN > 0` is `false`**, so an empty field, a bare `'.'` and unparseable junk all fail on the
 * same comparison as `'0'` and `'0.00'` - which is why "missing" and "zero or negative" need one
 * rule and one message rather than two.
 *
 * It takes the **display string** rather than a number, and goes through `parseAmountInput` rather
 * than `Number()`. That is not incidental: `Number('2,000')` is `NaN` because the field's own
 * formatter puts the separators in, so a validator reading the raw value with `Number` rejects
 * every four-figure budget in the app.
 *
 * **No upper bound**, deliberately: A5 designs none, and the backend's own cap
 * (`@Max(1_000_000_000)`) is its business to enforce - a number restated here is one that can drift.
 */
export function isPositiveAmount(value: string): boolean {
  return parseAmountInput(value) > 0;
}

/**
 * Whether a required text field has been filled, matching the DTOs' `@IsNotEmpty()`.
 *
 * The rule behind `app/setup/draft.ts`'s and `settings/settingsForm.ts`'s `isNameValid` and
 * `(app)/transactionForm.ts`'s `isMerchantValid`, all three of which were `value.trim() !== ''`.
 *
 * **Deliberately carries no length bound**, which is the call every one of those three already
 * made about `@MaxLength`: restating a number here puts it in two places that can drift, and an
 * over-long value is caught by the DTO and surfaces on the form-level error line. The trade is a
 * generic message for that case; the alternative is a bound nothing checks against the backend's.
 */
export function isFilled(value: string): boolean {
  return value.trim() !== '';
}
