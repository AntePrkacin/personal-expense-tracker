'use client';

import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createElement, useRef, useState } from 'react';

import { FormError } from '@/components/FormError';
import { Button } from '@/components/ui/Button';
import {
  categoryIcon,
  categoryTileClass,
  type CategoryColour,
  type IconName,
} from '@/components/ui/categoryColour';
import { Input } from '@/components/ui/Input';
import { reformatAmountInput } from '@/lib/amountField';
import type { Category } from '@/lib/categories';
import type { Palette } from '@/lib/palette';
import type { UpdateCategoryResult } from '@/lib/updateCategory';
import type { components } from '@/types/api';

import { Modal, type ModalHandle } from '../../Modal';
import { ColourSelect } from './ColourSelect';
import { IconSelect } from './IconSelect';
import {
  invalidFields,
  toCategoryFormValues,
  toUpdateCategoryBody,
  type CategoryFormField,
  type CategoryFormValues,
} from './categoryForm';

// 21 Edit category (node 116:1040): frame 19's fields prefilled from a card, plus the red "Delete
// category" the footer draws on its left.
//
// **A second component rather than a mode on `AddCategoryModal`**, which is the call
// `(app)/EditTransactionModal.tsx` made about its own pair and which holds here for the same
// reasons. The fields, their order, their validation and the currency caret are already shared
// through `categoryForm.ts` and the `ui/` primitives. What is *not* shared is the diff, the footer's
// third control, the prefill, five of the messages, and the fact that submitting an unchanged form
// is a legitimate no-op. A `mode` prop would carry all of that as branches inside one file, and the
// two are the same shape only from a distance.
//
// **Field order is CED-4's, unchanged**: Name, Monthly budget, then Color beside Icon - four of the
// frame's five, because the Note is hidden behind `AddCategoryModal`'s `SHOWS_NOTE` for A42's
// reason. That is a subtraction from frame 21 exactly as it is from frame 19, and it amends AC1's
// "prefilled with that category's name, cap, color, icon and note": the note is prefilled into
// state, so nothing about it is lost on save, and no field draws it.
//
// **This modal opens for a category the user owns, never for `Uncategorized`.** That row has no
// kebab and no banner as of this ticket, so there is no trigger for it - which is what lets every
// field here be live, including Name, whose rename the backend answers 409 to on that one row.
// `lib/updateCategory.ts` classifies the 409 regardless, because a control that is not drawn is not
// an enforcement.

/**
 * Every message this screen can show (A29).
 *
 * **Nine entries: four reused verbatim from frame 19, five new.** The counts are spelled out because
 * `EditTransactionModal`'s own comment records getting exactly that wrong three times.
 *
 * Reused verbatim, four: the two field messages, `unauthenticated`, and both palette lines. That is
 * a decision rather than a copy-paste. Each field message states the *rule* rather than the
 * operation, so "Enter a name." is as true of an edit as of a create, and an expired session or an
 * unreadable palette says nothing about which operation was attempted. Rewording any of them here
 * would put two wordings of one fact a modal apart.
 *
 * New, five, and all of them join what A29 owes a designer since no form error visual exists
 * anywhere in the Figma file. `invalid` and `failed` are frame 19's sentences with the verb changed,
 * because "add" is wrong about an edit. The other three have no counterpart there at all, because
 * `POST /api/categories` answers neither a 404 nor a 409:
 *
 * - **`missing`** must not say "try again", which answers 404 forever. It says what is true and what
 *   fixes the screen, which is closing the modal.
 * - **`fallback`** must not either, for a sharper version of the same reason: that request is
 *   refused every time, by design. It is unreachable through the UI and carries copy anyway, the
 *   same call `DeleteCategoryDialog` makes about its own.
 * - **`paletteUnavailable`** is the one message that differs from frame 19's in substance rather
 *   than in wording. There the failed palette blocks the whole form, because a create has no colour
 *   until the read lands; here it blocks nothing, so the line says which two fields are affected
 *   rather than implying the modal is broken.
 */
const MESSAGES = {
  name: 'Enter a name.',
  monthlyCap: 'Enter a budget greater than 0, or leave it blank for no limit.',
  invalid: "We couldn't save this category. Please check the values and try again.",
  missing: 'This category no longer exists. Close this to see the current list.',
  fallback: "This category's name is fixed and can't be changed.",
  unauthenticated: 'Your session has expired. Log in again to save this.',
  failed: "We couldn't save this category. Please try again.",
  paletteUnavailable:
    "We couldn't load the colours and icons, so those two fields can't be changed right now.",
  paletteEmpty:
    "There are no colours or icons to choose from, so those two fields can't be changed.",
} as const;

/**
 * Field ids, which `ui/FieldShell` requires rather than generating; see its note on useId.
 *
 * Distinct from the Add modal's `add-category-*`, and not because both are ever open at once - the
 * header button and this provider each render one modal and only while open. They differ so that if
 * the two ever *are* mounted together, the failure is two dialogs rather than duplicate ids making
 * `getByLabelText` ambiguous, which is the harder bug to read. Same call `EditTransactionModal`
 * makes.
 */
const NAME_ID = 'edit-category-name';
const CAP_ID = 'edit-category-monthly-cap';
const COLOUR_ID = 'edit-category-color';
const ICON_ID = 'edit-category-icon';
const NOTE_ID = 'edit-category-note';

/**
 * Whether the Note field is drawn. **It is not**, for the reason `AddCategoryModal`'s own
 * `SHOWS_NOTE` gives in full: A42 says a category's note surfaces on no screen once saved.
 *
 * **Declared here rather than imported from that file**, which looks like the duplication this repo
 * argues against and is not. The two are not one decision: this one hides a field over a value the
 * user already has, so flipping it is how somebody first *sees* the note their seeded categories
 * carry, while flipping the other is how somebody first writes one. A category detail page would
 * likely turn both on together and a reviewer should be able to turn on either alone.
 *
 * Typed `boolean` rather than left to infer `false`, so the ternary below reads as a branch rather
 * than as unreachable code.
 */
const SHOWS_NOTE: boolean = false;

/** Which field the trigger that opened this asked for. See `focus` below. */
export type EditCategoryFocus = 'name' | 'monthlyCap';

const FOCUS_ID: Record<EditCategoryFocus, string> = {
  name: NAME_ID,
  monthlyCap: CAP_ID,
};

type EditCategoryModalProps = {
  /**
   * The category being edited, as the card already has it.
   *
   * **The whole category rather than an id, so nothing is fetched to open this.**
   * `CategoryResponseDto` carries every field the form draws, note included, so the trigger passes
   * what it already rendered and AC1's prefill costs no round trip. It is also the value the diff is
   * taken against, which is why it stays a prop rather than being copied into state.
   */
  category: Category;
  /**
   * The colours and icons to offer, or `null` if the read failed.
   *
   * Same prop and same two states as `AddCategoryModal`'s, threaded from the same server-side read -
   * see `transactions/categories/page.tsx`. What differs is the consequence, which is smaller here:
   * see `offersMarks`.
   */
  palette: Palette | null;
  /**
   * The update action.
   *
   * A prop rather than an import, which is every modal in this app's pattern and buys the same
   * thing: the suite passes a `jest.fn()` and needs no module mock, so the `@/` alias trap that
   * `jest.mock` cannot resolve never comes up.
   */
  update: (
    id: string,
    body: components['schemas']['UpdateCategoryDto'],
  ) => Promise<UpdateCategoryResult>;
  /**
   * Opens the delete confirmation over this modal (CED-7, AC7).
   *
   * A callback rather than a `useDeleteCategory()` call here, so this component knows nothing about
   * that provider and its suite needs neither - which is `EditTransactionModal`'s arrangement and
   * its reason. The owner also decides what the confirmation is told, which matters: it quotes the
   * **stored** name and count, not whatever is currently typed in these fields, because it describes
   * the category about to be removed.
   */
  onDelete: () => void;
  /**
   * Which field opens focused, because two triggers mean two answers.
   *
   * The kebab's "Edit" is an unspecific invitation, so it focuses Name - the first field, and the
   * one frame 21 draws filled. "Set limit" is not unspecific at all: the banner it sits on reads
   * "No limit set for this category", so it focuses the budget. Frame 21 draws the budget field with
   * a focus ring, which is a mid-fill snapshot rather than an on-open state - the same reading
   * `AddCategoryModal` gives frame 19 - so it settles neither case on its own.
   */
  focus?: EditCategoryFocus;
  /** Called once the dialog has closed, however it closed. The owner stops rendering this. */
  onClose: () => void;
};

export function EditCategoryModal({
  category,
  palette,
  update,
  onDelete,
  focus = 'name',
  onClose,
}: EditCategoryModalProps) {
  const router = useRouter();
  const modalRef = useRef<ModalHandle>(null);

  /**
   * The form, prefilled from the stored category (CED-6, AC1).
   *
   * Initialised once on mount rather than synced from the prop, which is what makes this an editable
   * draft instead of a display of the row: a `router.refresh()` triggered by anything else on the
   * page must not overwrite what the user is halfway through typing. The modal is unmounted when it
   * closes, so reopening always re-reads the category.
   */
  const [values, setValues] = useState<CategoryFormValues>(() => toCategoryFormValues(category));

  /**
   * Whether the palette gave the two pickers anything to offer.
   *
   * The same predicate `AddCategoryModal` uses and for the same reason - a read that succeeds with
   * an empty list is a real configuration rather than an error, and it arrives as a non-null palette
   * - but it decides much less here. There it gates submission, because a create has no colour until
   * the read lands. Here the colour and the icon are prefilled from a stored row, so an unusable
   * palette costs the user those two fields and nothing else.
   */
  const offersMarks = palette !== null && palette.colors.length > 0 && palette.icons.length > 0;

  /** Which of the two palette lines to show, if either. `null` is the healthy case. */
  const paletteMessage =
    palette === null ? MESSAGES.paletteUnavailable : offersMarks ? null : MESSAGES.paletteEmpty;

  const [errors, setErrors] = useState<Partial<Record<CategoryFormField, string>>>({});
  /** The post-network failure line, already resolved to its copy. `null` means none showing. */
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /** Writes one text field and clears its message, which is this repo's timing rule for forms. */
  function setText(field: 'name' | 'monthlyCap' | 'note', value: string) {
    setValues((current) => ({ ...current, [field]: value }));

    // Validation appears on submit only and clears as soon as the user starts fixing that field -
    // never on the next keystroke of a different one. Same as every other form in the app. `note`
    // is skipped because it can carry no message.
    if (field !== 'note') setErrors((current) => ({ ...current, [field]: undefined }));
    setFailure(null);
  }

  /** The budget field, reformatted under the caret on every keystroke. `lib/amountField.ts` owns it. */
  function onCapChange(event: React.ChangeEvent<HTMLInputElement>) {
    setText('monthlyCap', reformatAmountInput(event.currentTarget));
  }

  /** Records a chosen colour. No lookup and no cast: `ColourSelect` hands back the contract's union. */
  function chooseColour(token: CategoryColour) {
    setValues((current) => ({ ...current, color: token }));
    setFailure(null);
  }

  /** The icon half, and identical because `IconSelect` hands back the contract's union too. */
  function chooseIcon(name: IconName) {
    setValues((current) => ({ ...current, icon: name }));
    setFailure(null);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Mandatory: a form with no action GETs the current URL and reloads the page, which would close
    // the modal and lose every edit while looking like a flicker.
    event.preventDefault();

    // **There is deliberately no `if (!offersMarks) return;` here, and this is the one place this
    // form must not copy `AddCategoryModal`.** That guard exists there because a create has no
    // colour until the palette arrives, so there is genuinely nothing to submit. An edit has one:
    // `values.color` and `values.icon` are prefilled from the stored row, `toUpdateCategoryBody`
    // omits both while they are untouched, and both pickers are `disabled` when the palette is
    // unusable so no value the backend could reject can reach the body. A failed palette therefore
    // leaves the name and the budget perfectly saveable, and renaming a category while the palette
    // is down is a reasonable thing to do.
    //
    // The identical guard was a real defect in `EditTransactionModal` rather than a redundancy: it
    // returned before any state changed, and the "we couldn't load" line was already on screen from
    // the read, so pressing Save did nothing observable at all.

    // Every field at once rather than the first failure, so a form with no name and a zero budget
    // shows both messages. `invalidFields` is frame 19's, unchanged.
    const invalid = invalidFields(values);

    if (invalid.length > 0) {
      setErrors(Object.fromEntries(invalid.map((field) => [field, MESSAGES[field]])));
      return;
    }

    const body = toUpdateCategoryBody(category, values);

    // **Nothing changed, so nothing is sent.** The endpoint answers 400 for an empty body, which is
    // a correct answer to a question the user did not ask - they pressed Save on a form they had not
    // edited, and the honest response is the same as Cancel's. No `router.refresh()` either: there
    // is nothing new to read.
    if (Object.keys(body).length === 0) {
      modalRef.current?.close();
      return;
    }

    setFailure(null);
    setPending(true);

    // **The `catch` is not defensive, and without it a failed submit freezes the modal.** `update`
    // is a Server Action called from the client, so a transport that never completes - the user
    // going offline mid-submit, a deploy moving the action id - **rejects** rather than resolving to
    // an `UpdateCategoryResult`. A rejection escaping this handler skips both lines below, so
    // `pending` stays true and the submit button stays disabled for good, which also kills Enter.
    //
    // `failed` rather than a reason of its own: this is the same fact as the 5xx arm, which is that
    // the request did not complete.
    let result: UpdateCategoryResult;

    try {
      result = await update(category.id, body);
    } catch {
      setPending(false);
      setFailure(MESSAGES.failed);
      return;
    }

    if (!result.ok) {
      setPending(false);
      setFailure(MESSAGES[result.reason]);
      return;
    }

    // **Refresh before closing, and close through the dialog rather than by unmounting.**
    // `router.refresh()` re-runs this route's Server Components, which is what recomputes the card's
    // percent, chip and remaining-or-over figure and moves the allocation summary with them (AC3) -
    // four things from one call, because all four are computed from the same read. AC4's other
    // screens get theirs on their own next render, for the same reason: none of them holds a copy.
    //
    // `modalRef.current.close()` rather than `onClose()` so the browser restores focus to whatever
    // opened this. The close event then calls `onClose` for us.
    router.refresh();
    modalRef.current?.close();
  }

  /** The glyph the preview draws, looked up the way every other tile in the app looks one up. */
  const PreviewIcon = categoryIcon(values.icon);
  const previewName = values.name.trim();

  return (
    <Modal
      ref={modalRef}
      title="Edit category"
      onClose={onClose}
      initialFocusId={FOCUS_ID[focus]}
      onSubmit={onSubmit}
      footerStart={
        // CED-7 and AC7: opens the confirmation, and deletes nothing itself. `textDanger` is the
        // ghost-plus-`text-error` variant `ui/Button` reserves for exactly this control on frames
        // 11, 21 and 12's siblings, and the trash comes from lucide like every other glyph.
        //
        // **Deliberately live while a save is in flight**, which is the call both edit modals make
        // about Cancel: no fetch in this app carries a timeout, so a hung request is exactly when a
        // way out matters most. If the delete lands first, the in-flight patch answers 404 and this
        // modal is already gone.
        <Button
          label="Delete category"
          variant="textDanger"
          icon={<Trash2 className="size-4" aria-hidden="true" />}
          onClick={onDelete}
        />
      }
      footer={
        <>
          {/* Its default type is `button`, which is what stops it submitting the form. Live while
              the request is out for the sibling modals' reason: it cannot double-submit, and the X,
              Escape and a backdrop click all stay live regardless. */}
          <Button label="Cancel" variant="secondary" onClick={() => modalRef.current?.close()} />
          {/* Disabled while the request is out. A double submit here is gentler than the Add
              modal's - a repeated patch is idempotent where a repeated post makes a duplicate - but
              it would still fire two requests and race their two answers into one line. */}
          <Button type="submit" label="Save changes" disabled={pending} />
        </>
      }
    >
      {/* `required` with no asterisk, per A12: required fields are marked only by the absence of
          "(optional)". Live even though `Uncategorized`'s name is fixed, because this modal has no
          trigger on that card - see the file comment. */}
      <Input
        id={NAME_ID}
        label="Name"
        value={values.name}
        onChange={(event) => setText('name', event.currentTarget.value)}
        error={errors.name}
        required
      />

      {/* The currency variant draws the `$` prefix and the larger value frame 21 gives this field,
          exactly as frame 19 does. **No `required`**, and that is the label's other half: this is
          the one money field in the app that may be left blank. Clearing it is how a cap is removed,
          and `toUpdateCategoryBody` is what turns that into the `null` the DTO wants - which is the
          same relationship the Note field has with its own `null` one modal over. */}
      <Input
        id={CAP_ID}
        label="Monthly budget (optional)"
        variant="currency"
        value={values.monthlyCap}
        onChange={onCapChange}
        error={errors.monthlyCap}
      />

      {/* Color and Icon share a row, as they do on frame 19. A flex row with flex-1 on each child
          rather than a grid, because `ui/FieldShell` is w-full and the two are separate components
          rather than cells of one layout.

          **Both are disabled when the palette is unusable and the form still saves**, which is this
          modal's one substantive divergence from its sibling - see `onSubmit`. Note the trigger of
          a picker whose stored token the palette no longer offers reads "Select…" beside the
          correct swatch, because both derive their label by finding the row; saving without
          touching the field omits the key, so nothing is lost. `docs/TODO.md` carries it. */}
      <div className="flex w-full gap-3">
        <div className="flex-1">
          <ColourSelect
            id={COLOUR_ID}
            label="Color"
            options={palette?.colors ?? []}
            value={values.color}
            onChange={chooseColour}
            disabled={!offersMarks}
          />
        </div>
        <div className="flex-1">
          <IconSelect
            id={ICON_ID}
            label="Icon"
            options={palette?.icons ?? []}
            value={values.icon}
            onChange={chooseIcon}
            disabled={!offersMarks}
          />
        </div>
      </div>

      {/* The same preview `AddCategoryModal` draws, and the same `aria-hidden` argument: every
          piece of information in this row is already announced by the three fields above it, so
          announcing it again would repeat all three and add a glyph with no text of its own. It
          earns more here than there, because an edit is where somebody is looking at a mark rather
          than picking one for the first time. */}
      <div aria-hidden="true" className="flex flex-col gap-1.5">
        <span className="label text-xs">Preview</span>

        <p className="flex items-center gap-3">
          <span
            className={`rounded-field flex size-9 shrink-0 items-center justify-center ${categoryTileClass(values.color)}`}
          >
            {/* `createElement` rather than `<PreviewIcon />`: `react-hooks/static-components` reads
                a capitalised local in JSX as a component created during render, which this is not -
                it is a lookup into `CATEGORY_ICON`, a static map the module already holds.
                `CategoryCard` carries the full account, and this repo allows no eslint-disable
                comments. */}
            {PreviewIcon === null
              ? null
              : createElement(PreviewIcon, { className: 'size-4.5', 'aria-hidden': 'true' })}
          </span>
          {/* `/60` rather than `/50` for muted **text**, which AA holds to 4.5:1 - the reasoning is
              `AddCategoryModal`'s and unchanged. Unreachable here in practice, since a stored
              category always has a name, and kept so the two previews cannot drift. */}
          <span
            className={
              previewName === '' ? 'text-base-content/60 text-sm' : 'text-sm font-semibold'
            }
          >
            {previewName === '' ? 'Unnamed category' : previewName}
          </span>
        </p>
      </div>

      {/* The Note field, drawn by frame 21 and specified by CED-4, and **deliberately not rendered
          today** - see `SHOWS_NOTE`. Its value is prefilled into state regardless, so a save never
          clears a note the user cannot see. */}
      {SHOWS_NOTE ? (
        <Input
          id={NOTE_ID}
          label="Note (optional)"
          value={values.note}
          onChange={(event) => setText('note', event.currentTarget.value)}
        />
      ) : null}

      {/* Two form-level lines rather than one, because they answer different questions and can both
          be true: the pickers had nothing to offer, and the save was rejected.
          `components/FormError.tsx` owns the treatment and the `role="alert"` argument, and renders
          nothing when its message is absent - so neither needs a conditional here and a closed modal
          still contributes no text to the page, which `(app)/pages.test.tsx` depends on. */}
      <FormError message={paletteMessage} />
      <FormError message={failure} />
    </Modal>
  );
}
