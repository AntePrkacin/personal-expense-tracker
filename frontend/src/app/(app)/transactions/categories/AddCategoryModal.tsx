'use client';

import { useRouter } from 'next/navigation';
import { createElement, useRef, useState } from 'react';

import { FormError } from '@/components/FormError';
import { Button } from '@/components/ui/Button';
import { categoryIcon, categoryTileClass } from '@/components/ui/categoryColour';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { CreateCategoryResult } from '@/lib/createCategory';
import { amountCaret, formatAmountInput } from '@/lib/format';
import type { Palette } from '@/lib/palette';
import type { components } from '@/types/api';

import { Modal, type ModalHandle } from '../../Modal';
import {
  hasChosenMarks,
  invalidFields,
  toCreateCategoryBody,
  type CategoryFormField,
  type CategoryFormValues,
} from './categoryForm';

// 19 Add category (node 102:878): the five fields, their validation, and the one request this
// feature makes.
//
// The box, the scrim and every close affordance belong to `(app)/Modal.tsx`; what is here is the
// form. Field order is CED-4's and AC1 asserts it: Name, Monthly budget, then Color beside Icon,
// then Note.
//
// **Two deliberate departures from the frame, both recorded on the ticket and in the plan.** The
// budget label carries "(optional)", because the cap really is optional (see `isCapValid`) and A12
// makes the absence of that word the only marker of a required field - so a bare label would make
// the one optional money field in the app read as required. And focus opens on **Name**, not on the
// budget field the frame draws with a ring: that frame also draws a name, a budget and a note
// already typed, so it is a mid-fill snapshot rather than an on-open state, and honouring it
// literally would skip an empty required field. `AddTransactionModal` honours its own frame's
// focused field because there it happens to be the first one.

/**
 * Every message this screen can show (A29).
 *
 * All of it ours: A29 records that **no form error visual exists anywhere in the Figma file**, so
 * both the pattern and the words owe a designer sign-off, and the `WithMessages` story exists to put
 * them in front of one. Shaped after `AddTransactionModal`'s, which is shaped after the one message
 * that has been live since onboarding.
 *
 * **The budget message states the rule *and* the escape**, which no other message in this app has
 * had to do. "Enter a budget greater than 0." would be true and would strand the user who wants no
 * limit at all, because the field looks required and nothing else on screen says it is not. So it
 * names blank as a valid choice, and that is the only place in the UI where the optional cap is
 * spelled out.
 */
const MESSAGES = {
  name: 'Enter a name.',
  monthlyCap: 'Enter a budget greater than 0, or leave it blank for no limit.',
  invalid: "We couldn't add this category. Please check the values and try again.",
  unauthenticated: 'Your session has expired. Log in again to save this.',
  failed: "We couldn't add this category. Please try again.",
  paletteUnavailable: "We couldn't load the colours and icons. Please close this and try again.",
} as const;

/** Field ids, which `ui/FieldShell` requires rather than generating; see its note on useId. */
const NAME_ID = 'add-category-name';
const CAP_ID = 'add-category-monthly-cap';
const COLOUR_ID = 'add-category-color';
const ICON_ID = 'add-category-icon';
const NOTE_ID = 'add-category-note';

/** What the preview names a category nobody has typed a name for yet. */
const UNNAMED_PREVIEW = 'New category';

type AddCategoryModalProps = {
  /**
   * The colours and icons to offer, or `null` if the read failed.
   *
   * `null` rather than an empty palette: an empty list would mean an admin has disabled everything,
   * which is a coherent (if useless) configuration, and this is "we could not ask". Both disable the
   * selects, but only one of them is a message worth showing - and the caller reads this off a
   * server-side read that has already resolved, so unlike `AddTransactionModal`'s categories there
   * is no third "not yet" state to model.
   */
  palette: Palette | null;
  /**
   * The create action.
   *
   * A prop rather than an import, which is `AddTransactionModal`'s pattern and buys the same thing:
   * the suite passes a `jest.fn()` and needs no module mock, so the `@/` alias trap that
   * `jest.mock` cannot resolve never comes up.
   */
  create: (body: components['schemas']['CreateCategoryDto']) => Promise<CreateCategoryResult>;
  /** Called once the dialog has closed, however it closed. The owner stops rendering this. */
  onClose: () => void;
};

export function AddCategoryModal({ palette, create, onClose }: AddCategoryModalProps) {
  const router = useRouter();
  const modalRef = useRef<ModalHandle>(null);

  /**
   * The form, with both marks preselected from the palette's first entries.
   *
   * **Preselected rather than opened on a `Select…` placeholder**, which is the opposite of
   * `AddTransactionModal`'s Category field and for the opposite reason. There, a placeholder is what
   * keeps AC3's "missing category" reachable. Here the frame draws a value in each select, the DTO
   * requires both, and neither can be wrong - so a placeholder would add two forced interactions and
   * two error messages the design never draws, to make a state nobody wants reachable.
   *
   * `''` when there is no palette, which `hasChosenMarks` is what reads - see `categoryForm.ts` for
   * why that is a type-level fact rather than a cast.
   */
  const [values, setValues] = useState<CategoryFormValues>(() => ({
    name: '',
    monthlyCap: '',
    color: palette?.colors[0]?.token ?? '',
    icon: palette?.icons[0]?.name ?? '',
    note: '',
  }));

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

  /**
   * The budget field, reformatted under the caret on every keystroke.
   *
   * Lifted from `AddTransactionModal`, including why it works: the handler writes the formatted
   * value and the caret onto `event.currentTarget` directly, which is already the node, so
   * `ui/Input` needs no `ref` prop. It depends on `formatAmountInput` being idempotent -
   * `lib/format.test.ts` pins that property for exactly this reason - and on `amountCaret` computing
   * the *semantic* position, because React restores the raw offset and that is wrong precisely when
   * a separator is inserted to the left of the caret.
   *
   * jsdom cannot observe the outcome either way, so the suite asserts `setSelectionRange` was called
   * and the visible behaviour is a Storybook check. `docs/TODO.md` already records that gap against
   * the budget field it was lifted from.
   */
  function onCapChange(event: React.ChangeEvent<HTMLInputElement>) {
    const element = event.currentTarget;
    const raw = element.value;
    const caret = element.selectionStart ?? raw.length;
    const formatted = formatAmountInput(raw);

    element.value = formatted;
    const at = amountCaret(raw, caret, formatted);
    element.setSelectionRange(at, at);

    setText('monthlyCap', formatted);
  }

  /**
   * Records a chosen colour by looking it up in the palette rather than casting the DOM's string.
   *
   * `chosen.token` is already the contract's union, so this narrows with a real runtime check where
   * `event.currentTarget.value as CategoryColour` would only have silenced the compiler. A value
   * that is in no palette row is ignored, which is unreachable through the select and is the honest
   * answer if it ever is not.
   */
  function chooseColour(token: string) {
    const chosen = palette?.colors.find((colour) => colour.token === token);
    if (chosen === undefined) return;

    setValues((current) => ({ ...current, color: chosen.token }));
    setFailure(null);
  }

  /** The icon half of `chooseColour`, same argument. */
  function chooseIcon(name: string) {
    const chosen = palette?.icons.find((icon) => icon.name === name);
    if (chosen === undefined) return;

    setValues((current) => ({ ...current, icon: chosen.name }));
    setFailure(null);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Mandatory: a form with no action GETs the current URL and reloads the page, which would close
    // the modal and lose everything typed while looking like a flicker.
    event.preventDefault();

    // **Before the field checks, not after, and it does two jobs.** It is `AddTransactionModal`'s
    // categories guard - there is nothing to submit against, the `role="alert"` line already says
    // why, and adding "Enter a name." on top would blame the user for a failed network read. It is
    // also the narrowing that lets `toCreateCategoryBody` be called at all, since that function
    // takes only values whose colour and icon are real. Both marks are preselected whenever the
    // palette landed, so this is false exactly when `palette` is null.
    if (!hasChosenMarks(values)) return;

    // Every field at once rather than the first failure, so a form with no name and a zero budget
    // shows both messages (AC3). `invalidFields` owns that rule so a jsdom-free test can pin it.
    const invalid = invalidFields(values);

    if (invalid.length > 0) {
      setErrors(Object.fromEntries(invalid.map((field) => [field, MESSAGES[field]])));
      return;
    }

    setFailure(null);
    setPending(true);

    const result = await create(toCreateCategoryBody(values));

    if (!result.ok) {
      setPending(false);
      setFailure(MESSAGES[result.reason]);
      return;
    }

    // **Refresh before closing, and close through the dialog rather than by unmounting.**
    // `router.refresh()` re-runs this route's Server Components, which is what redraws the card
    // grid, ticks the Categories tab badge and moves the allocation summary (AC5) - three things
    // from one call, because all three are computed from the same read.
    //
    // `modalRef.current.close()` rather than `onClose()` so the browser restores focus to the
    // button that opened this. The close event then calls `onClose` for us.
    router.refresh();
    modalRef.current?.close();
  }

  const colourOptions = (palette?.colors ?? []).map(({ token, label }) => ({
    value: token,
    label,
  }));

  const iconOptions = (palette?.icons ?? []).map(({ name, label }) => ({ value: name, label }));

  /**
   * The glyph the preview draws, looked up the same way every other tile in the app looks one up.
   *
   * `null` while there is no palette, which renders the tile empty rather than falling back to a
   * mark the user did not choose.
   */
  const PreviewIcon = categoryIcon(values.icon);
  const previewName = values.name.trim();

  return (
    <Modal
      ref={modalRef}
      title="Add category"
      onClose={onClose}
      initialFocusId={NAME_ID}
      onSubmit={onSubmit}
      footer={
        <>
          {/* Its default type is `button`, which is what stops it submitting the form.
              Deliberately not disabled while the request is out, matching the sibling modal: the X,
              Escape and a backdrop click all stay live regardless, so disabling this would be the
              one dead exit sitting beside three working ones. */}
          <Button label="Cancel" variant="secondary" onClick={() => modalRef.current?.close()} />
          {/* Disabled while the request is out. A19 designs no pending state, but a double submit
              here creates two categories the user then has to find and delete. */}
          <Button type="submit" label="Add category" disabled={pending} />
        </>
      }
    >
      {/* `required` with no asterisk, per A12: required fields are marked only by the absence of
          "(optional)". */}
      <Input
        id={NAME_ID}
        label="Name"
        value={values.name}
        onChange={(event) => setText('name', event.currentTarget.value)}
        error={errors.name}
        required
      />

      {/* The currency variant is what draws the `$` prefix and the larger value the frame gives this
          field (daisyUI's `input-lg`). **No `required`**, and that is the label's other half: this
          is the one money field in the app that may be left blank. */}
      <Input
        id={CAP_ID}
        label="Monthly budget (optional)"
        variant="currency"
        value={values.monthlyCap}
        onChange={onCapChange}
        error={errors.monthlyCap}
      />

      {/* Color and Icon share a row, which AC1 asserts. A flex row with flex-1 on each child rather
          than a grid, because `ui/FieldShell` is w-full and the two are separate components rather
          than cells of one layout - the same arrangement Date and Merchant use in frame 09.

          **"Color", not "Colour".** Figma governs content, which `frontend/CLAUDE.md` states as the
          division of authority; the comments around it use the repo's own spelling. */}
      <div className="flex w-full gap-3">
        <div className="flex-1">
          <Select
            id={COLOUR_ID}
            label="Color"
            options={colourOptions}
            value={values.color}
            onChange={(event) => chooseColour(event.currentTarget.value)}
            disabled={palette === null}
            required
          />
        </div>
        <div className="flex-1">
          <Select
            id={ICON_ID}
            label="Icon"
            options={iconOptions}
            value={values.icon}
            onChange={(event) => chooseIcon(event.currentTarget.value)}
            disabled={palette === null}
            required
          />
        </div>
      </div>

      {/* AC2's "the chosen one previews on the category", which the frame draws no element for - so
          this is the cheapest thing that makes the criterion true rather than a reading of the
          design. It is the same tile `CategoryCard`, `TransactionRow`, `CategoryContextCard` and
          `RecentTransactionsCard` all draw, through the same two helpers, so a colour that looks
          wrong here looks wrong there too.

          **`aria-hidden`, and not because colour is decorative.** Every piece of information in this
          row is already announced by the three fields above it: the name is the Name input's value,
          and the colour and icon are the two selects' own labelled values. Announcing it again would
          repeat all three and add a glyph with no text of its own. That is the same argument the
          dashboard donut's ring makes, where the legend carries the real text. */}
      <p aria-hidden="true" className="flex items-center gap-3">
        <span
          className={`rounded-field flex size-9 shrink-0 items-center justify-center ${categoryTileClass(values.color)}`}
        >
          {/* `createElement` rather than `<PreviewIcon />`: `react-hooks/static-components` reads a
              capitalised local in JSX as a component created during render, which this is not - it
              is a lookup into `CATEGORY_ICON`, a static map the module already holds. `CategoryCard`
              carries the full account of the rule, and this repo allows no eslint-disable comments. */}
          {PreviewIcon === null
            ? null
            : createElement(PreviewIcon, { className: 'size-4.5', 'aria-hidden': 'true' })}
        </span>
        {/* **`/60`, not `/50`, and the difference is which token this is.** `base-content/50` is the
            *category colour* in `COLOUR_TOKENS`, measured for a fill at the 3:1 non-text bar; this is
            muted **text**, which AA holds to 4.5:1, and 3.401:1 in light does not clear it. Every
            muted caption in this app is `/60` or `/70` already - `CategoryCard`, `BudgetCard`,
            `TrendCard`, `TransactionRow` and six more - so matching them is both the accessible
            choice and the consistent one. */}
        <span
          className={previewName === '' ? 'text-base-content/60 text-sm' : 'text-sm font-semibold'}
        >
          {previewName === '' ? UNNAMED_PREVIEW : previewName}
        </span>
      </p>

      {/* The one field marked optional besides the budget, and no `required`. It can carry no error,
          and it surfaces on no screen once saved (CED-4, A42) - which is the contract's own note,
          not an omission here. */}
      <Input
        id={NOTE_ID}
        label="Note (optional)"
        value={values.note}
        onChange={(event) => setText('note', event.currentTarget.value)}
      />

      {/* Two form-level lines rather than one, because they answer different questions and can both
          be true: the picker had nothing to offer, and the save was rejected.
          `components/FormError.tsx` owns the treatment and the `role="alert"` argument for both, and
          renders nothing when its message is absent - so neither needs a conditional here and a
          closed modal still contributes no text to the page, which `(app)/pages.test.tsx` depends
          on. */}
      <FormError message={palette === null ? MESSAGES.paletteUnavailable : null} />
      <FormError message={failure} />
    </Modal>
  );
}
