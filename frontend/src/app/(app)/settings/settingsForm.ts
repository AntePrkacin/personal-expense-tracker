import { isFilled, isPositiveAmount } from '@/lib/amount';
import { isEmailValid } from '@/lib/email';
import { formatAmountInput, parseAmountInput } from '@/lib/format';
import type { Profile } from '@/lib/profile';
import type { components } from '@/types/api';

// The Settings form's shape, its validity rules, and the single boundary where three display
// values become the *changed* half of an `UpdateProfileDto`.
//
// React-free on purpose, the same split `categoryForm.ts`, `(app)/transactionForm.ts` and
// `app/setup/draft.ts` all make: the rules and the conversion are plain functions whose suite needs
// no jsdom, and `SettingsForm.tsx` is left with rendering, state and the request. The error
// *strings* stay in the component, matching every other form in this app - so this module names
// which fields are wrong, and never what to say about them.
//
// **It is filed beside its consumers rather than at the `(app)` root**, which is `categoryForm.ts`'s
// own reasoning: the transaction module sits two levels up because its modals open from five
// triggers across three routes, and everything that reads this one lives on this single route.
//
// **PET-47 extends this file rather than replacing it.** The Preferences card adds `currency`,
// `monthlyBudget` and `monthStartDay` to `SettingsFormValues`, a case each to `invalidFields`, and a
// comparison each to `toUpdateProfileBody` - and nothing else moves, because `UpdateProfileDto` is
// one DTO covering all six fields, so the action, the result union and the submit handler are
// already general. That is the whole reason this ticket builds the page-level form rather than a
// card-level one.
//
// **PET-47 shipped and that prediction held with two corrections**, kept rather than edited away
// because both are the kind that reads as obvious only afterwards. It is **one** case in
// `invalidFields`, not three: `currency` and `monthStartDay` are picked from closed lists, so no
// interaction can make either wrong and a message for them would be one nothing could reach. And
// `sameSettingsValues` needed widening too, which the list above does not mention - it is what the
// resync in `SettingsForm` compares by value, so a field it did not know about would let an edited
// form look identical to the server's and be silently reverted.
//
// **Note this exports its own `invalidFields` and `isNameValid`**, which `categoryForm.ts` and
// `(app)/transactionForm.ts` also export. Three modules, three different value types, no
// relationship - the note that file already carries about the second one applies unchanged to the
// third. They must not be unified: the fields differ, the rules differ, and the only thing shared is
// the shape of the idea.

/**
 * What the form holds while it is being filled in.
 *
 * Three plain strings until PET-47, whose three additions are all differently shaped - so read the
 * sentence this replaces as dated rather than wrong. It said all three were plain strings because
 * all three were plain text inputs, with no display-string conversion of the kind
 * `CategoryFormValues.monthlyCap` needs, and predicted `monthlyBudget` would be the first field here
 * that did. It is, and the other two are not strings-in-inputs at all: `monthStartDay` is a number
 * and `currency` an ISO code, both picked from closed lists by controls that never round-trip a
 * value through the DOM. That is what made `PreferencesCard`'s `onChange` generic over the field
 * where `ProfileCard`'s takes a bare `string`.
 */
export type SettingsFormValues = {
  firstName: string;
  lastName: string;
  email: string;
  /** An ISO 4217 code, never the display name. `BudgetField` hands back the code itself. */
  currency: string;
  /**
   * The **display** string, grouped, e.g. `'2,000'`. Not a number.
   *
   * The first field on this page that needs the conversion `SetupDraft.budget` and
   * `CategoryFormValues.monthlyCap` both make, and for the identical reason: no number represents
   * `'2000.'` mid-type, so the value stays a string until `toUpdateProfileBody` turns it into the
   * major units `UpdateProfileDto` wants. The paragraph above this type predicted exactly this.
   */
  monthlyBudget: string;
  /** The day a period opens on, 1 to 28. A **number**, because `MonthStartField` returns one. */
  monthStartDay: number;
};

/** Every field on the form. Not all of them can carry a message - see `invalidFields`. */
export type SettingsFormField = keyof SettingsFormValues;

/**
 * The DOM id each field's control carries, declared once beside the union rather than written out
 * at the markup.
 *
 * `ui/Input` requires `id` as a literal prop - `useId()` is a hook and would force `'use client'`
 * onto the whole field layer - so these strings have to exist somewhere. They live here because
 * two files need them and must not disagree: `ProfileCard` labels the controls with them, and
 * `SettingsForm` moves focus to the first invalid one on a refused submit. A second hand-written
 * copy is how that focus call quietly starts finding nothing.
 */
export const FIELD_ID: Record<SettingsFormField, string> = {
  firstName: 'settings-first-name',
  lastName: 'settings-last-name',
  email: 'settings-email',
  // `currency` has no control of its own: it is the left segment of the budget field, which carries
  // `monthlyBudget`'s id. The entry exists because `Record<SettingsFormField, _>` is an
  // exhaustiveness proof and dropping it would mean typing this as `Partial`, which is what lets a
  // real field quietly lose its id. It points at the field the segment lives in, so a focus call
  // that ever reaches for it lands somewhere true.
  currency: 'settings-monthly-budget',
  monthlyBudget: 'settings-monthly-budget',
  monthStartDay: 'settings-month-start',
};

/**
 * Whether two sets of form values are the same strings.
 *
 * Exists for the resync in `SettingsForm`, which has to answer "did the server's profile actually
 * change" and cannot do it by object identity: `page.tsx` builds a **fresh object on every server
 * render**, so `profile !== previous` is true after any `router.refresh()` in the app, whether or
 * not a single character moved. Comparing by value is what keeps an unrelated refresh from
 * rewriting the form.
 */
export function sameSettingsValues(a: SettingsFormValues, b: SettingsFormValues): boolean {
  return (
    a.firstName === b.firstName &&
    a.lastName === b.lastName &&
    a.email === b.email &&
    a.currency === b.currency &&
    a.monthlyBudget === b.monthlyBudget &&
    a.monthStartDay === b.monthStartDay
  );
}

/**
 * What is wrong with a field, rather than merely that something is.
 *
 * `categoryForm.invalidFields` returns bare field names, because each of its two fields has exactly
 * one way to be wrong. The email has **two** - absent, and malformed - and AC4 names them together
 * while the copy has to tell them apart. Carrying the reason here is what keeps this module from
 * either holding the strings or collapsing a distinction the component then has to re-derive.
 */
export type SettingsFieldProblem = {
  field: SettingsFormField;
  reason: 'required' | 'format';
};

/**
 * The stored profile as the form's three display values.
 *
 * **Deliberately does not trim**, which is `toCategoryFormValues`'s rule: the prefill has to be
 * exactly what is stored, or `toUpdateProfileBody` would report a change the user never made and a
 * wholly untouched form would fire a PATCH. Trimming happens once, at the boundary below.
 *
 * It read three fields and ignored three until PET-47, which is the ticket that widened it: all six
 * are here now, and the page is the whole profile.
 *
 * `monthlyBudget` goes through `formatAmountInput` rather than `String(...)`, which is
 * `toCategoryFormValues`'s own rule: the prefill has to be something the field could have produced,
 * or the first keystroke reformats it and `toUpdateProfileBody` reports a change nobody made. It is
 * handed `toFixed(2)` for the same reason that function is - a stored `2000` must prefill as
 * `'2,000.00'`, matching what the field writes back after any edit.
 */
export function toSettingsFormValues(profile: Profile): SettingsFormValues {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    currency: profile.currency,
    monthlyBudget: formatAmountInput(profile.monthlyBudget.toFixed(2)),
    monthStartDay: profile.monthStartDay,
  };
}

/**
 * A name is anything that is not blank.
 *
 * Mirrors `@IsNotEmpty()` on both name fields and **deliberately not `@MaxLength(100)`**, which is
 * the call `categoryForm.isNameValid` already makes about `@MaxLength(60)`: restating a bound here
 * puts it in two places that can drift, and an over-long name is caught by the DTO and surfaces as
 * the form-level `invalid` line. The trade is that the message for it is generic; the alternative is
 * a number in this file that nothing checks against the backend's.
 */
export function isNameValid(name: string): boolean {
  return isFilled(name);
}

/**
 * What is wrong with the address, or `null`.
 *
 * **Two reasons rather than one boolean**, because AC4 covers "malformed **or** empty" and a person
 * who cleared the field needs different copy from one who typed `marko@`.
 *
 * `isEmailValid` comes from `lib/email.ts` and no expression is restated here. That module is
 * **deliberately looser** than the DTO's validator.js `@IsEmail()`, and its docblock records the
 * trade: matching validator.js would mean either a validation dependency for one field or a copy of
 * its expression that rots silently, so the addresses it accepts and the backend refuses land on the
 * form-level `invalid` line instead of this inline one. Do not tighten it for this form.
 */
export function emailProblem(email: string): 'required' | 'format' | null {
  if (email.trim() === '') return 'required';
  return isEmailValid(email) ? null : 'format';
}

/**
 * Every problem on the form, in the order the fields are drawn.
 *
 * **Every one, never stopping at the first**, which is `categoryForm.invalidFields`'s rule and what
 * makes a blank form show three messages at once rather than one at a time down three submits.
 *
 * Draw order rather than severity order, so the messages appear where the eye already is.
 */
export function invalidFields(values: SettingsFormValues): SettingsFieldProblem[] {
  const problems: SettingsFieldProblem[] = [];

  if (!isNameValid(values.firstName)) problems.push({ field: 'firstName', reason: 'required' });
  if (!isNameValid(values.lastName)) problems.push({ field: 'lastName', reason: 'required' });

  const email = emailProblem(values.email);
  if (email !== null) problems.push({ field: 'email', reason: email });

  // **Three of the six fields can never appear here, and that is a property of the controls rather
  // than an omission.** `currency` and `monthStartDay` are picked from closed lists of valid values,
  // so no interaction can put either in a state the DTO would refuse; a message for them would be
  // one nothing could reach, the shape `TransactionsTable`'s `pending` prop shipped as once.
  //
  // The budget can be wrong, and it has exactly one way to be: `isPositiveAmount` folds "blank",
  // "zero" and "unparseable junk" onto one comparison, which is why BUD-6 and A5 specify one
  // message rather than two. `required` rather than a new reason, so the component's `MESSAGES`
  // stays a map over reasons it already handles.
  if (!isPositiveAmount(values.monthlyBudget)) {
    problems.push({ field: 'monthlyBudget', reason: 'required' });
  }

  return problems;
}

/**
 * The request body for `PATCH /api/profile`, carrying only what changed.
 *
 * Read off the contract rather than declared, the rule `docs/agents/api-contract.md` sets for every
 * caller. This is `toUpdateCategoryBody` with three differences, each a decision:
 *
 * - **Names are trimmed on the way out and compared against the untrimmed stored value.** That
 *   asymmetry is `toUpdateTransactionBody`'s documented call about `merchant`: a stored name
 *   carrying stray whitespace normalises on the first save that touches anything, which is
 *   acceptable precisely because the field is on screen with its value in it. The Note field that
 *   file treats differently is the case where it is not.
 * - **The address is compared case-insensitively, and the typed casing is what gets sent.** The
 *   backend's `normalizeEmail` is `trim().toLowerCase()` and `ProfileResponseDto.email` already
 *   comes back normalised, so retyping `MARKO@email.com` over a stored `marko@email.com` is not a
 *   change and must contribute no key. Lowercasing here instead would be a second normaliser that
 *   can drift from the first, which is the call `toRegisterBody` already makes about the same field.
 * - **Nothing is ever sent as `null`.** `UpdateProfileDto` accepts none: every column behind it is
 *   NOT NULL, and every field carries `@ValidateIf((_, v) => v !== undefined)` rather than
 *   `@IsOptional()`, which would skip validation for `null` as well as `undefined`. This is the
 *   exact mirror of `toUpdateCategoryBody`, where a blank cap sends `null` because that is the only
 *   way a capped category becomes uncapped. **The two look inconsistent and are one rule stated
 *   against two DTOs**, which is worth saying out loud, because the next person to read them side by
 *   side will otherwise "fix" one of them.
 *
 * **An empty result means nothing changed, and the caller must not send it.**
 * `PATCH /api/profile` answers 400 to a body with no keys - `UpdateTransactionDto`'s reasoning,
 * since a bare UPDATE would bump `updated_at` through `$onUpdateFn` - so `SettingsForm` returns
 * without calling the action at all. Unlike the modals there is no dialog to close, so that return
 * is silent.
 *
 * Keys are assigned rather than spread conditionally, for `toUpdateTransactionBody`'s reason:
 * `Object.keys` then sees exactly the changed fields, which is what the caller's empty check reads
 * and what the suite asserts.
 */
export function toUpdateProfileBody(
  original: Profile,
  values: SettingsFormValues,
): components['schemas']['UpdateProfileDto'] {
  const body: components['schemas']['UpdateProfileDto'] = {};

  const firstName = values.firstName.trim();
  if (firstName !== original.firstName) body.firstName = firstName;

  const lastName = values.lastName.trim();
  if (lastName !== original.lastName) body.lastName = lastName;

  // Both sides lowered for the comparison only. The value that goes on the wire keeps the casing
  // the user typed, so the backend's normaliser stays the single authority on what "the same
  // address" means.
  const email = values.email.trim();
  if (email.toLowerCase() !== original.email.toLowerCase()) body.email = email;

  if (values.currency !== original.currency) body.currency = values.currency;

  // **Compared as a number, never as a string**, which is `toUpdateTransactionBody`'s call about
  // its own amount: the field rewrites its display value on every keystroke, so retyping `2,000`
  // over a stored `2000` is not an edit and `'2,000.00' !== '2000'` would say it was - firing a
  // PATCH on a form nobody changed, which the endpoint answers 400 to when it is the only key.
  //
  // Guarded on validity rather than sent regardless: `parseAmountInput('')` is `NaN`, and
  // `JSON.stringify` writes that as `null`, which `UpdateProfileDto` rejects for a field that
  // accepts no nulls at all. `SettingsForm` validates before it diffs, so this is unreachable
  // through the UI - it is here because the two orderings are one refactor apart and only one of
  // them is safe.
  const monthlyBudget = parseAmountInput(values.monthlyBudget);
  if (isPositiveAmount(values.monthlyBudget) && monthlyBudget !== original.monthlyBudget) {
    body.monthlyBudget = monthlyBudget;
  }

  if (values.monthStartDay !== original.monthStartDay) body.monthStartDay = values.monthStartDay;

  return body;
}
