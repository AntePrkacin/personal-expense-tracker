import { isFilled, isPositiveAmount } from '@/lib/amount';
import { isEmailValid } from '@/lib/email';
import { formatAmountInput, parseAmountInput } from '@/lib/format';
import type { CurrencyCode } from '@/lib/money';
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
// **PET-72 splits this file's one boundary into two, and that is its whole change here.** The
// budget and the pay day left `UpdateProfileDto`: both apply *from a date*, so setting either now
// goes through `POST /api/profile/schedule` with the first paycheck it applies from. So
// `toUpdateProfileBody` narrows to the three fields that are still properties of the account, and
// `toChangeScheduleBody` is the second boundary, taking the anchor the dialog collected. The
// prediction above - that one DTO covering every field is what let PET-47 extend rather than
// restructure - held right up until a field needed a date attached to it.
//
// **`firstName` and `lastName` became one `fullName` on the same branch.** The app never used them
// apart; the sidebar wants initials and a short name, both derivable from one string.
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
  /**
   * The display name. One field since PET-72, labelled "Display name", and a
   * nickname is a legitimate value - which is why `isNameValid` checks only that
   * it is not blank.
   */
  fullName: string;
  email: string;
  /**
   * An ISO 4217 code, never the display name. `BudgetField` hands back the code itself.
   *
   * Typed off the contract since PET-72, where it was a bare `string`: the backend's currency
   * allowlist publishes a real enum now, so a code the API would refuse cannot reach this field and
   * `toUpdateProfileBody` needs no cast to put it on the wire.
   */
  currency: CurrencyCode;
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
  fullName: 'settings-full-name',
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
    a.fullName === b.fullName &&
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
    fullName: profile.fullName,
    email: profile.email,
    currency: profile.currency,
    monthlyBudget: formatAmountInput(profile.monthlyBudget.toFixed(2)),
    monthStartDay: profile.monthStartDay,
  };
}

/**
 * A name is anything that is not blank.
 *
 * Mirrors `@IsNotEmpty()` on the name field and **deliberately not `@MaxLength(100)`**, which is
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

  if (!isNameValid(values.fullName)) problems.push({ field: 'fullName', reason: 'required' });

  const email = emailProblem(values.email);
  if (email !== null) problems.push({ field: 'email', reason: email });

  // **Two of the five fields can never appear here, and that is a property of the controls rather
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

  const fullName = values.fullName.trim();
  if (fullName !== original.fullName) body.fullName = fullName;

  // Both sides lowered for the comparison only. The value that goes on the wire keeps the casing
  // the user typed, so the backend's normaliser stays the single authority on what "the same
  // address" means.
  const email = values.email.trim();
  if (email.toLowerCase() !== original.email.toLowerCase()) body.email = email;

  if (values.currency !== original.currency) body.currency = values.currency;

  // **The budget and the pay day are deliberately absent, and sending either would be a 400.**
  // `UpdateProfileDto` dropped both at PET-72 and `forbidNonWhitelisted` rejects them, because
  // neither can be set without saying from which paycheck it applies. `toChangeScheduleBody` below
  // is where they go.

  return body;
}

/**
 * Whether Save has to ask the paycheck question before it can write.
 *
 * **This is the whole trigger for the dialog**, and it is deliberately a comparison rather than a
 * flag the controls set: a user who types over the budget and types the original back has changed
 * nothing, and asking them which paycheck it applies from would be asking about a write that is not
 * going to happen. The same reasoning `toUpdateProfileBody` applies to every other field.
 *
 * The budget is compared as a **number** for `toUpdateProfileBody`'s own reason: the field rewrites
 * its display value on every keystroke, so retyping `2,000` over a stored `2000` is not an edit and
 * `'2,000.00' !== '2000'` would say it was.
 *
 * An invalid budget counts as unchanged. `SettingsForm` validates before it gets here, so that is
 * unreachable through the UI; it matters because the two orderings are one refactor apart and only
 * one of them avoids asking the question about a value that cannot be saved.
 */
export function scheduleChanged(original: Profile, values: SettingsFormValues): boolean {
  const budgetMoved =
    isPositiveAmount(values.monthlyBudget) &&
    parseAmountInput(values.monthlyBudget) !== original.monthlyBudget;

  return budgetMoved || values.monthStartDay !== original.monthStartDay;
}

/**
 * The request body for `POST /api/profile/schedule`.
 *
 * **Every field is required, unlike the PATCH's diff**, and that is the endpoint's own rule rather
 * than a simplification here: a schedule is a complete statement, so the body always carries the
 * budget *and* the pay day *and* the paycheck they apply from. Sending only what changed would mean
 * the server resolving the other half, which is the same write with a hidden read in front of it.
 *
 * `firstPaycheckDate` is assembled from the month the dialog collected and the pay day **the form
 * holds**, never the stored one: on a save that changes both, the anchor has to fall on the *new*
 * pay day or the backend answers 400. That coupling is why this takes a month rather than a date -
 * a caller passing a date could pass one that contradicts `monthStartDay`, and there would be no
 * reason for it to.
 *
 * @param anchorMonth The first month the change applies to, as `YYYY-MM`. The dialog offers the four
 * before this one, this one, and the four after - see `paycheckMonths`.
 */
export function toChangeScheduleBody(
  values: SettingsFormValues,
  anchorMonth: string,
): components['schemas']['ChangeScheduleDto'] {
  return {
    monthlyBudget: parseAmountInput(values.monthlyBudget),
    monthStartDay: values.monthStartDay,
    firstPaycheckDate: `${anchorMonth}-${String(values.monthStartDay).padStart(2, '0')}`,
  };
}

/**
 * The nine months the paycheck dialog offers: the four before this one, this one, and the four after.
 *
 * **A window rather than a free date picker**, and the bound is the point twice over. Forward, a
 * schedule change more than four months out is a plan rather than a fact, and the periods it would
 * stretch are ones the user has not lived yet. Backward, the backend refuses an anchor earlier than
 * the account's first pay schedule - seeded a year before provisioning - so four months is
 * comfortably inside what it will accept, and the 400 that bound produces is one this list cannot
 * reach. One backend 400 **is** reachable from here, deliberately: a pay-day change backdated
 * behind a *later* pay-day change (two changes within the four-month window, the second anchored
 * before the first) is refused rather than corrupting the later rule's stored transition, and it
 * surfaces as the form's `invalid` line inside the dialog. A budget-only backdate across such a
 * change is fine - the server reads the re-asserted current day as "unchanged".
 *
 * `value` is `YYYY-MM`, which `toChangeScheduleBody` completes into a date with the pay day the form
 * holds. It is deliberately **not** a full date here: the day depends on a field the user may be
 * editing in the same save, so binding one in would let the two disagree.
 *
 * Pure, and `today` is a parameter rather than a clock read - the rule `month-window.ts` follows on
 * the backend for the same reason: it is what lets the suite pin the list across a year boundary
 * without faking timers.
 *
 * @param today `YYYY-MM-DD`. Only its year and month are read.
 */
export function paycheckMonths(today: string): { value: string; label: string }[] {
  const [year, month] = today.split('-').map(Number);
  const base = (year ?? 0) * 12 + ((month ?? 1) - 1);

  return Array.from({ length: 9 }, (_unused, index) => {
    const total = base + index - 4;
    const y = Math.floor(total / 12);
    const m = total - y * 12;

    return {
      value: `${String(y).padStart(4, '0')}-${String(m + 1).padStart(2, '0')}`,
      // `en-US` and `UTC`, matching `lib/format.ts`'s own month names: a local zone would render the
      // 1st of a month as the previous one for anybody west of Greenwich.
      label: new Date(Date.UTC(y, m, 1)).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }),
    };
  });
}

/**
 * Which month the dialog opens on: the current one.
 *
 * The overwhelmingly common case is a change taking effect now, so the default is the answer that
 * needs no interaction. It is the fifth of the nine `paycheckMonths` returns.
 */
export function currentPaycheckMonth(today: string): string {
  return paycheckMonths(today)[4]!.value;
}
