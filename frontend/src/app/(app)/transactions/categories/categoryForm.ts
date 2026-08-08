import type { CategoryColour, IconName } from '@/components/ui/categoryColour';
import { parseAmountInput } from '@/lib/format';
import type { components } from '@/types/api';

// The Add category form's shape, its validity rules, and the single boundary where five display
// values become a `CreateCategoryDto`.
//
// React-free on purpose, the same split `(app)/transactionForm.ts` and `app/setup/draft.ts` both
// make: the rules and the conversion are plain functions whose suite needs no jsdom, and
// `AddCategoryModal.tsx` is left with rendering, state and the request. The error *strings* stay in
// the component, matching every other form in this app - so this module names which fields are
// wrong and never what to say about them.
//
// **It is filed under `transactions/categories/` rather than beside `(app)/transactionForm.ts`, and
// that is a narrower home than its neighbour's on purpose.** The transaction form module sits at the
// `(app)` root because its two modals open from five triggers across three routes. Both consumers of
// this one - the Add modal here and PET-38's Edit modal - live on this single route, so hoisting it
// two levels would put a module where no reader of the Categories screen would look for it.
//
// **Note this exports its own `invalidFields`, which `(app)/transactionForm.ts` also exports.** Two
// modules, two different value types, no relationship. They must not be unified: the fields differ,
// the rules differ, and the only thing shared is the shape of the idea.

/**
 * What the form holds while it is being filled in.
 *
 * **`monthlyCap` is a display string, not a number**, which is `SetupDraft.budget`'s reason rather
 * than a new one: no number represents `'250.'`, a real intermediate state a user types through, and
 * `formatAmountInput` is what the field runs on every keystroke. The conversion happens once, in
 * `toCreateCategoryBody`.
 *
 * **`color` and `icon` carry `''` as well as their contract unions, and the empty string is not
 * laziness.** The contract publishes both as real OpenAPI enums, so `CreateCategoryDto` accepts a
 * literal union rather than a string - but the palette those literals come from is read over the
 * network and may not have arrived, or may have failed. `''` is that state, spelled out, and
 * `hasChosenMarks` below is what turns it back into a value the body will accept. The alternative
 * was a cast at the select's `onChange`, which would have typechecked while promising something no
 * `<select>` can guarantee.
 *
 * `note` is a plain string rather than `string | undefined`, because a controlled input's value
 * cannot be `undefined` without React warning about it. Blank becomes *absent* at the boundary
 * below, which is where the distinction belongs.
 */
export type CategoryFormValues = {
  name: string;
  monthlyCap: string;
  color: CategoryColour | '';
  icon: IconName | '';
  note: string;
};

/**
 * The same values once a colour and an icon have actually been chosen.
 *
 * The one shape `toCreateCategoryBody` will take, so "the palette arrived" is a fact the type system
 * holds rather than a comment the next person has to trust. Same technique as `ui/Button`'s
 * `href`-versus-`onClick` union and `Modal`'s `ModalShape`: make the unusable state unrepresentable
 * at the one call site that would misuse it.
 */
export type ChosenCategoryValues = CategoryFormValues & {
  color: CategoryColour;
  icon: IconName;
};

/**
 * Whether a colour and an icon have been chosen, narrowing the values if so.
 *
 * True for every form the user can actually submit: both selects are preselected from the palette's
 * first entry, so the `''` case means the palette read failed or has not landed - which is the state
 * the modal already blocks submission on, with a message, before it reaches validation. A caller
 * that skips this check cannot call `toCreateCategoryBody` at all, which is the point.
 */
export function hasChosenMarks(values: CategoryFormValues): values is ChosenCategoryValues {
  return values.color !== '' && values.icon !== '';
}

/** Whether the name is filled (CED-4), matching the DTO's `@IsNotEmpty()`. */
export function isNameValid(name: string): boolean {
  return name.trim() !== '';
}

/**
 * Whether the monthly cap is one "Add category" may proceed on.
 *
 * **A blank field is valid, and this single line is where that whole decision lives.** The ticket
 * asked for a required budget greater than zero; `CreateCategoryDto` made `monthlyCap` optional and
 * its docstring records why - every onboarding chip and the seeded `Uncategorized` are uncapped, so
 * requiring one would make an uncapped category a state the API could never produce again, and
 * `CategoryCard`'s "No limit set for this category" would be reachable only through onboarding and
 * PET-38's "Set limit". Blank means "no limit".
 *
 * **A typed `0` is still rejected, and it is a different thing from blank.** A cap of zero means "I
 * intend to spend nothing here", which puts the category Over on its first transaction, and it is
 * far more likely a mistake than an intent. The DTO rejects it with `@IsPositive()`; this is the
 * same rule stated early so the user sees a message instead of a 400.
 *
 * `NaN > 0` is `false`, so junk, a lone `'.'` and a pasted negative all fail on the same comparison
 * as `'0'` and `'0.00'`. The field runs `formatAmountInput` on every keystroke and that drops the
 * sign, so a pasted `'-5'` is already `'5'` in state; `parseAmountInput` does not strip a sign, so a
 * negative arriving by any other route still answers `false` here. Defence in depth rather than the
 * primary guard.
 *
 * There is no upper bound. The DTO's `@Max(1_000_000_000)` is its own business, and a value over it
 * comes back as the `invalid` reason.
 */
export function isCapValid(cap: string): boolean {
  if (cap.trim() === '') {
    return true;
  }

  return parseAmountInput(cap) > 0;
}

/**
 * The required fields that are currently invalid, in the order the modal draws them.
 *
 * **The list rather than a boolean, because AC3 asks for all of them at once**: an empty form must
 * show both messages, not stop at the first. Returning the set from a plain function puts that rule
 * where a fast test can pin it, instead of leaving it implicit in two `if` statements inside a
 * submit handler.
 *
 * **Only two fields can appear here, and `color` and `icon` deliberately cannot.** Both are
 * preselected from the palette, so no interaction can empty them and any message for them would be
 * copy nothing can show - the state that looks like it needs one, a failed palette read, is a
 * form-level failure the modal reports on its own line and refuses to submit. A devtools-emptied
 * select falls through to the backend's 400 and the `invalid` line, which is the honest answer for
 * a value the UI cannot produce.
 */
export function invalidFields(values: CategoryFormValues): CategoryFormField[] {
  const invalid: CategoryFormField[] = [];

  if (!isNameValid(values.name)) invalid.push('name');
  if (!isCapValid(values.monthlyCap)) invalid.push('monthlyCap');

  return invalid;
}

/** The two fields that can carry a message. `color`, `icon` and `note` cannot - see above. */
export type CategoryFormField = 'name' | 'monthlyCap';

/**
 * The request body for `POST /api/categories`.
 *
 * Read off the contract rather than declared, which is the rule `docs/agents/api-contract.md` sets
 * for every caller. Takes `ChosenCategoryValues`, so it cannot be reached before the palette has
 * supplied a real colour and icon.
 *
 * Four conversions, each a decision:
 *
 * - **`name` is trimmed once, here.** Trimming on change would delete the space the moment somebody
 *   typed one between two words, the same call `toCreateTransactionBody` makes about `merchant` and
 *   `toRegisterBody` about the name fields.
 * - **`monthlyCap` is omitted entirely when blank**, never sent as `null` and never as `0`. Absent
 *   is what the DTO reads as "no cap"; `null` is not accepted by `CreateCategoryDto` at all (only
 *   `UpdateCategoryDto` takes it, to *clear* a cap), and `0` is the state `isCapValid` rejects.
 * - **`monthlyCap` goes through `parseAmountInput`**, not `Number()`, which answers `NaN` for the
 *   `'1,250.50'` the field actually holds. Callers must check `invalidFields` first, exactly as they
 *   must for `toCreateTransactionBody`.
 * - **`note` is omitted when blank, never sent as `''`.** `forbidNonWhitelisted` means the body must
 *   carry these five keys and nothing else, and an empty string would *pass* `@IsOptional()
 *   @IsString() @MaxLength(500)` and be stored - inventing a third state between "no note" and "a
 *   note" for every later reader of `CategoryResponseDto.note`.
 *
 * The conditional spreads rather than `monthlyCap: cap || undefined` are what make the object's own
 * keys match the wire's. Both serialise identically, because `JSON.stringify` drops `undefined`, but
 * only the spread lets a test assert with `Object.keys` that nothing extra is being sent.
 */
export function toCreateCategoryBody(
  values: ChosenCategoryValues,
): components['schemas']['CreateCategoryDto'] {
  // Both trimmed for the same reason: a value of nothing but spaces is a blank value.
  const cap = values.monthlyCap.trim();
  const note = values.note.trim();

  return {
    name: values.name.trim(),
    color: values.color,
    icon: values.icon,
    ...(cap === '' ? {} : { monthlyCap: parseAmountInput(cap) }),
    ...(note === '' ? {} : { note }),
  };
}
