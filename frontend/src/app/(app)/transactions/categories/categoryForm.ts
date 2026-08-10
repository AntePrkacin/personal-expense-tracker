import type { CategoryColour, IconName } from '@/components/ui/categoryColour';
import type { Category } from '@/lib/categories';
import { formatAmountInput, parseAmountInput } from '@/lib/format';
import type { components } from '@/types/api';

// The Add category form's shape, its validity rules, and the single boundary where five display
// values become a `CreateCategoryDto`.
//
// **PET-38 added a second boundary and a way in**, so the sentence above is now half the file:
// `toCategoryFormValues` turns a stored category into these same five display values, and
// `toUpdateCategoryBody` turns them back into the *changed* ones. The shape, the rules and the error
// vocabulary are shared by both modals, which is what makes the Edit modal a second component rather
// than a mode - see `EditCategoryModal.tsx` for the rest of that argument.
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
// two levels would put a module where no reader of the Categories screen would look for it. That
// prediction held: the Edit modal shipped and this file did not move.
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
 * `description` is a plain string rather than `string | undefined`, because a controlled input's value
 * cannot be `undefined` without React warning about it. Blank becomes *absent* at the boundary
 * below, which is where the distinction belongs.
 */
export type CategoryFormValues = {
  name: string;
  monthlyCap: string;
  color: CategoryColour | '';
  icon: IconName | '';
  description: string;
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
 * `CategoryCard`'s uncapped shape would be reachable only through onboarding and
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

/** The two fields that can carry a message. `color`, `icon` and `description` cannot - see above. */
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
 * - **`description` is omitted when blank, never sent as `''`.** `forbidNonWhitelisted` means the body must
 *   carry these five keys and nothing else, and an empty string would *pass* `@IsOptional()
 *   @IsString() @MaxLength(500)` and be stored - inventing a third state between "no description" and "a
 *   description" for every later reader of `CategoryResponseDto.description`.
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
  const description = values.description.trim();

  return {
    name: values.name.trim(),
    color: values.color,
    icon: values.icon,
    ...(cap === '' ? {} : { monthlyCap: parseAmountInput(cap) }),
    ...(description === '' ? {} : { description }),
  };
}

/**
 * The Edit modal's prefill: a stored category as the five display values (PET-38 AC1).
 *
 * The mirror of `toCreateCategoryBody`, and `(app)/transactionForm.ts`'s `toTransactionFormValues`
 * is the shape it copies. Four conversions, each the inverse of one above:
 *
 * - **`monthlyCap` goes through `formatAmountInput`**, not `String(cap)`, so the prefilled value is
 *   one the field could itself have produced - which is what lets the first keystroke here behave
 *   exactly as the tenth does in the Add modal, since `reformatAmountInput` runs over it. `.toFixed(2)`
 *   first, because the wire carries major units as a bare number and `1250.5` would prefill as
 *   `"1,250.5"`, a value the field would never emit.
 * - **An absent cap becomes `''`**, which is the same "no limit" `isCapValid` accepts and the blank
 *   the user clears a cap by leaving. There is no third state to model: `CategoryResponseDto.monthlyCap`
 *   is `null` when the category is uncapped, never absent.
 * - **`color` passes through as itself**, being the contract's own union on a stored row.
 * - **`icon` is `''` when the row carries none, and that asymmetry is the contract's rather than a
 *   convenience.** `CategoryResponseDto.icon` is **nullable** where `color` is not, and
 *   `UpdateCategoryDto.icon` documents itself as "not clearable" - so a category with no icon is a
 *   state the API can hand out and this form can never send back. `''` is exactly the "no mark
 *   chosen" the picker already models: the trigger reads "Select…", picking one sends it, and
 *   leaving it alone contributes no key. The alternative, substituting some default glyph, would
 *   silently write a mark the user never chose onto the first save of any other field.
 * - **`description` becomes `''` when null**, because a controlled input's value cannot be `undefined`
 *   without React warning about it. It becomes `null` again at the boundary below.
 *
 * **`name` is not trimmed on the way in**, which is `toTransactionFormValues`'s call about `merchant`:
 * a stored value is what it is, and trimming here would make the diff report a change the user did
 * not make.
 */
export function toCategoryFormValues(category: Category): CategoryFormValues {
  return {
    name: category.name,
    monthlyCap:
      category.monthlyCap === null ? '' : formatAmountInput(category.monthlyCap.toFixed(2)),
    color: category.color,
    icon: category.icon ?? '',
    description: category.description ?? '',
  };
}

/**
 * The request body for `PATCH /api/categories/:id`: **only the fields that changed**.
 *
 * Read off the contract rather than declared, which is the rule `docs/agents/api-contract.md` sets
 * for every caller. `(app)/transactionForm.ts`'s `toUpdateTransactionBody` is the shape this copies,
 * and everything that file argues holds here: a diff rather than all five fields, because the DTO is
 * a real partial patch and sending everything every time would rewrite four fields the user never
 * touched; **an empty object is a legitimate return value** meaning nothing changed, which the caller
 * must answer by closing rather than by sending it, since the endpoint answers 400 for a body with no
 * keys; and callers must check `invalidFields` first, because `parseAmountInput` of junk is `NaN` and
 * `JSON.stringify` writes that as `null`.
 *
 * Three comparisons are this function's own rather than inherited.
 *
 * **A blank cap sends `null`, and that is the only way a capped category becomes uncapped.** It is
 * also the whole reason `isCapValid` accepts a blank field, which that function's own comment
 * predicted this ticket would use. Note the asymmetry with `toCreateCategoryBody`, which *omits* a
 * blank cap: `CreateCategoryDto` reads absent as "no cap" and does not accept `null` at all, while
 * here absent means "leave it alone" and only `null` clears it. The two rules look inconsistent and
 * are the same rule stated against two different DTOs.
 *
 * **`color` and `icon` are skipped while they are `''`, rather than this taking a narrowed
 * `ChosenCategoryValues`.** `toCreateCategoryBody` demands that type because a create with no colour
 * is a body the DTO rejects. Here `''` is reachable and means "no mark chosen": for `color` only
 * through a devtools-emptied form, and for `icon` through the ordinary case of a stored row that
 * carries none, since `CategoryResponseDto.icon` is nullable and `UpdateCategoryDto.icon` cannot
 * clear one. Skipping is the honest answer to both - an unchosen mark is not a change, and there is
 * no value this DTO would accept for it anyway - and it narrows the type as a side effect, which is
 * the cheaper of the two ways to satisfy the compiler.
 *
 * **`description` is compared trimmed against the *trimmed* stored value, and that is a fix rather than a
 * style.** A blank field over a stored `null` is no change, and a blank field over a stored description
 * sends `null` to clear it - both inherited from the transaction rule. What is not inherited is the
 * trim on the right-hand side, and leaving it off was a real defect: this file shipped comparing the
 * trimmed field against the raw `original.description ?? ''`, which made a stored `"  weekly shop  "`
 * differ from itself. Since `SHOWS_NOTE` is false the user cannot see or touch that field, so a
 * rename would quietly carry `description: "weekly shop"` with it, and a stored description of nothing but spaces
 * would be **deleted** by a save that never mentioned it. It also defeated the caller's
 * nothing-changed short circuit, so Save on an untouched form fired a PATCH.
 *
 * That value is reachable through the API, a seed or another client - `UpdateCategoryDto` applies
 * `@IsString() @MaxLength(500)` and no trim - even though this app's own `toCreateCategoryBody`
 * trims on the way out. **A hidden field must contribute a key only when the user changed it**, and
 * comparing like with like is what makes that true rather than nearly true.
 *
 * **`name` deliberately keeps the asymmetric comparison, and the difference is visibility.** A
 * stored name carrying stray whitespace does normalise the first time anything else about the
 * category is saved, which is a change the user did not type - and it is `toUpdateTransactionBody`'s
 * documented call about `merchant`, made for the reason that still holds here: the alternative is
 * never being able to trim it. The Name field is on screen with its value in it, so the user can see
 * what is being sent. The Note field is not, which is the whole reason the two are treated
 * differently. When `SHOWS_NOTE` flips, this asymmetry is the line to revisit.
 *
 * Keys are assigned rather than spread conditionally, for `toUpdateTransactionBody`'s reason: every
 * field is optional here, and five nested spreads would obscure the one thing this function is for.
 * `Object.keys` still sees exactly the changed fields, which is what the caller's empty check reads.
 */
export function toUpdateCategoryBody(
  original: Category,
  values: CategoryFormValues,
): components['schemas']['UpdateCategoryDto'] {
  const body: components['schemas']['UpdateCategoryDto'] = {};

  const name = values.name.trim();
  if (name !== original.name) body.name = name;

  const cap = values.monthlyCap.trim();
  const monthlyCap = cap === '' ? null : parseAmountInput(cap);
  if (monthlyCap !== original.monthlyCap) body.monthlyCap = monthlyCap;

  if (values.color !== '' && values.color !== original.color) body.color = values.color;

  if (values.icon !== '' && values.icon !== original.icon) body.icon = values.icon;

  // Both sides trimmed, so a stored description the user never saw cannot differ from itself. See above.
  const description = values.description.trim();
  if (description !== (original.description ?? '').trim())
    body.description = description === '' ? null : description;

  return body;
}
