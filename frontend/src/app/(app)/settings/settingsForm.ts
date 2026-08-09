import { isEmailValid } from '@/lib/email';
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
// **Note this exports its own `invalidFields` and `isNameValid`**, which `categoryForm.ts` and
// `(app)/transactionForm.ts` also export. Three modules, three different value types, no
// relationship - the note that file already carries about the second one applies unchanged to the
// third. They must not be unified: the fields differ, the rules differ, and the only thing shared is
// the shape of the idea.

/**
 * What the form holds while it is being filled in.
 *
 * All three are plain strings, because all three are plain text inputs - there is no display-string
 * conversion here of the kind `CategoryFormValues.monthlyCap` needs, and PET-47's `monthlyBudget`
 * will be the first field on this page that does.
 */
export type SettingsFormValues = {
  firstName: string;
  lastName: string;
  email: string;
};

/** The three fields that can carry a message, which on this card is all of them. */
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
  return a.firstName === b.firstName && a.lastName === b.lastName && a.email === b.email;
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
 * It reads the three fields it draws and ignores the other three. PET-47 widens it.
 */
export function toSettingsFormValues(profile: Profile): SettingsFormValues {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
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
  return name.trim() !== '';
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

  return body;
}
