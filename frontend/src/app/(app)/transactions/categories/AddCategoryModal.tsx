'use client';

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
import type { CreateCategoryResult } from '@/lib/createCategory';
import { currencySymbol } from '@/lib/money';
import { reformatAmountInput } from '@/lib/amountField';
import type { Palette } from '@/lib/palette';
import type { components } from '@/types/api';

import { Modal, type ModalHandle } from '../../Modal';
import { ColourSelect } from './ColourSelect';
import { IconSelect } from './IconSelect';
import { useCurrency } from '../../PreferencesProvider';
import {
  hasChosenMarks,
  invalidFields,
  toCreateCategoryBody,
  type CategoryFormField,
  type CategoryFormValues,
} from './categoryForm';

// 19 Add category (node 102:878): the fields, their validation, and the one request this feature
// makes.
//
// The box, the scrim and every close affordance belong to `(app)/Modal.tsx`; what is here is the
// form. Field order is CED-4's and AC1 asserts it: Name, Monthly budget, then Color beside Icon -
// **four of the frame's five**, because the Note is hidden behind `SHOWS_NOTE`; see that flag for
// why, and note it is a subtraction from the frame rather than an omission from this file.
//
// **Three deliberate departures from the frame, all recorded on the ticket and in the plan**, the
// hidden Note above being the largest. The other two: the
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
 *
 * **`paletteUnavailable` names a reload rather than reopening the modal, and the first version named
 * the one recovery that cannot work.** It read "Please close this and try again", which is what a
 * reader of the modal alone would write - but the palette is a prop resolved once by
 * `transactions/categories/page.tsx` and threaded down, so reopening re-renders the identical failed
 * value and the identical message. Only a reload or a navigation re-runs the read. A message telling
 * the user to do the one thing guaranteed not to help reads as a broken feature rather than as a
 * transient failure.
 *
 * **`paletteEmpty` is the second of the two palette states, and it is not a failure.** A read that
 * succeeds with an empty list means every colour or every icon is disabled admin-side, which
 * `readPalette` documents as a real configuration rather than an error - so it says what is true
 * rather than blaming a request that worked. It deliberately promises nothing the user can do: the
 * lists are not theirs to change, and there is no admin surface to send them to yet.
 */
const MESSAGES = {
  name: 'Enter a name.',
  monthlyCap: 'Enter a budget greater than 0, or leave it blank for no limit.',
  invalid: "We couldn't add this category. Please check the values and try again.",
  unauthenticated: 'Your session has expired. Log in again to save this.',
  failed: "We couldn't add this category. Please try again.",
  paletteUnavailable: "We couldn't load the colours and icons. Reload the page to try again.",
  paletteEmpty: "There are no colours or icons to choose from, so a category can't be added yet.",
} as const;

/** Field ids, which `ui/FieldShell` requires rather than generating; see its note on useId. */
const NAME_ID = 'add-category-name';
const CAP_ID = 'add-category-monthly-cap';
const COLOUR_ID = 'add-category-color';
const ICON_ID = 'add-category-icon';
const NOTE_ID = 'add-category-note';

/** What the preview names a category nobody has typed a name for yet. */
const UNNAMED_PREVIEW = 'New category';

/**
 * Whether the Note field is drawn. **It is not, and that is a product decision rather than an
 * unfinished one.**
 *
 * Frame 19 draws the field and CED-4 specifies it, so this is a deliberate departure from both. The
 * reason is A42, which the contract restates: a category's note **surfaces on no screen once saved**.
 * Asking for a note that nothing ever shows back is asking the user to write into a void - so the
 * field waits for a category detail page to show it on, the way `/transactions/[id]` shows a
 * transaction's.
 *
 * **A flag rather than commented-out JSX, and the difference is rot.** A commented block is not
 * typechecked, so renaming `CategoryFormValues.note` or changing `ui/Input`'s props would leave it
 * broken with the build green, and whoever uncomments it months later inherits the breakage. This way
 * the markup below compiles on every build, `NOTE_ID` stays used, and re-enabling the field is
 * flipping this one word.
 *
 * **Nothing behind the field was removed, and nothing needs adding back.** `categoryForm.ts` still
 * carries `note` in `CategoryFormValues`, still trims it and still omits it from the body when blank,
 * and its suite still pins all of that - so with the field hidden every category is simply created
 * without a note, which is a state the API already documents. `CreateCategoryDto.note` and the
 * `categories.note` column are untouched, so no migration is owed in either direction.
 *
 * Typed `boolean` rather than left to infer `false`, so the ternary below reads as a branch rather
 * than as unreachable code.
 */
const SHOWS_NOTE: boolean = false;

type AddCategoryModalProps = {
  /**
   * The colours and icons to offer, or `null` if the read failed.
   *
   * `null` rather than an empty palette: an empty list would mean an admin has disabled everything,
   * which is a coherent (if useless) configuration, and this is "we could not ask". Both disable the
   * selects, and **both are a message worth showing** - see `offersMarks` below for why the first
   * version of this sentence said only one was, and what that cost. The caller reads this off a
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
  // The prefix glyph for `ui/Input`'s currency variant, which drew a literal `$` until PET-47's
  // review. See `useCurrency` for why the symbol is a prop rather than read inside the primitive.
  const currency = useCurrency();
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

  /**
   * Whether the palette gave this form something to submit with.
   *
   * **Not `palette !== null`, and the difference is a form that looks fine and cannot save.** A read
   * that succeeds with `colors: []` or `icons: []` is a state `readPalette` documents as real -
   * `GET /api/templates/palette` returns `enabled` rows only, so an admin disabling a whole list
   * produces it - and it arrives as a non-null palette. Keyed on null, every guard below let it
   * through: the selects rendered enabled over empty panels, no line said why, and `hasChosenMarks`
   * then refused every submit in silence, because `values.color` and `values.icon` fall back to `''`
   * exactly as they do with no palette at all. The primary action of the modal was dead with no
   * feedback anywhere.
   *
   * **Either list empty disables both fields**, rather than only the one that is empty. The form
   * cannot be submitted while a required mark is missing, so leaving the other picker live would
   * invite the user to fill in a form that has no way to save - the same argument
   * `AddTransactionModal` makes for guarding on its categories read before its field checks.
   */
  const offersMarks = palette !== null && palette.colors.length > 0 && palette.icons.length > 0;

  /**
   * Which of the two palette lines to show, if either. `null` is the healthy case.
   *
   * The failed read and the empty configuration are different facts and get different words; see
   * `MESSAGES` for both. They cannot both be true, which is why this is one line rather than the
   * pair of `FormError`s the submit failure sits beside.
   */
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

  /**
   * The budget field, reformatted under the caret on every keystroke.
   *
   * **This was the fourth verbatim copy of that handler, and it is the one that got it lifted.**
   * `lib/amountField.ts` owns the body and the three things about it that are load-bearing; this
   * field is otherwise the same currency input `app/setup/BudgetForm.tsx` and both transaction
   * modals draw, differing only in which piece of state it writes to.
   */
  function onCapChange(event: React.ChangeEvent<HTMLInputElement>) {
    setText('monthlyCap', reformatAmountInput(event.currentTarget));
  }

  /**
   * Records a chosen colour, with no lookup and no cast.
   *
   * **It used to search the palette for the DOM's string, and `ColourSelect` is why it no longer
   * has to.** A `<select>` hands back `string`, so the token had to be recovered by finding the row
   * that matched - a real runtime check, but a check for something that could not be wrong. The
   * custom control never puts the value through the DOM at all: it calls this with the row's own
   * `token`, already typed as the contract's union. `chooseIcon` below is now the same shape, since
   * both fields are controls of our own.
   */
  function chooseColour(token: CategoryColour) {
    setValues((current) => ({ ...current, color: token }));
    setFailure(null);
  }

  /** The icon half, and identical now that `IconSelect` hands back the contract's own union too. */
  function chooseIcon(name: IconName) {
    setValues((current) => ({ ...current, icon: name }));
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
    // palette offered any, so this is false exactly when `offersMarks` is - which covers the failed
    // read and the empty configuration alike, and both of those already have their line on screen.
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

    // **The `catch` is not defensive, and without it a failed submit freezes the modal.** `create`
    // is a Server Action called from the client, so a transport that never completes - the user
    // going offline mid-submit, the server answering the action's POST with something that is not an
    // action result, a deploy restarting under it - **rejects** rather than resolving to a
    // `CreateCategoryResult`. A rejection escaping this handler skips both lines below, so `pending`
    // stays true, the submit button stays disabled for good (which also kills Enter), and nothing
    // says why. Every other failure here keeps what was typed and lets the user try again; that one
    // left Cancel as the only exit, which discards the whole form.
    //
    // `failed` rather than a reason of its own: `lib/createCategory.ts` publishes exactly three, and
    // this is the same fact as the 5xx arm - the request did not complete, and trying again is the
    // honest advice.
    let result: CreateCategoryResult;

    try {
      result = await create(toCreateCategoryBody(values));
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
    // `router.refresh()` re-runs this route's Server Components, which is what redraws the card
    // grid, ticks the Categories tab badge and moves the allocation summary (AC5) - three things
    // from one call, because all three are computed from the same read.
    //
    // `modalRef.current.close()` rather than `onClose()` so the browser restores focus to the
    // button that opened this. The close event then calls `onClose` for us.
    router.refresh();
    modalRef.current?.close();
  }

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
        currencySymbol={currencySymbol(currency)}
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
        {/* **Neither field is a native select any more, so this modal imports `ui/Select` nowhere.** A
            native `<option>` cannot hold a swatch or a glyph and its tick is drawn by the operating
            system, so both designed lists are unreachable from a native control. The two are not the
            same shape, though, and the difference is deliberate: `ColourSelect` is a named list because
            sixteen colours read as words, and `IconSelect` is a searchable grid because 64 glyphs are
            looked for by shape. All three triggers - these two and the budget's sibling in frame 09 -
            wear `select`'s own class string, so the row is one box per field when closed.

            Neither takes `required`: a `<button>` submits nothing, so there is no native validation to
            satisfy, and `hasChosenMarks` is what actually guards an empty colour or icon. */}
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
        {/* A grid rather than `ColourSelect`'s list, because 64 glyphs are looked for by *shape* and a
            one-per-row list of names makes that eleven screens of scrolling. Its search box is what
            makes the set navigable at all; see `IconSelect` for both arguments. */}
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
      {/* **`text-xs` beside `label` is not redundant, and dropping it makes this the one oversized
          label in the modal.** Every other label is a `.label` inside daisyUI's `.fieldset`, and the
          12px comes from **`.fieldset`** (`font-size: .75rem`), not from `.label` - verified in
          `node_modules/daisyui/components/fieldset.css` rather than assumed, which is the rule
          `frontend/CLAUDE.md` sets for any question about what a daisyUI class does. This row is not
          a field and has no fieldset, so it has to say the size itself. `gap-1.5` is that same file's
          `gap: .375rem`, so the label sits off its content exactly as the real labels do.

          The `aria-hidden` above moved onto this wrapper so it covers the word too: by the argument
          just made, announcing "Preview" and then nothing would be worse than silence. */}
      <div aria-hidden="true" className="flex flex-col gap-1.5">
        <span className="label text-xs">Preview</span>

        <p className="flex items-center gap-3">
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
            className={
              previewName === '' ? 'text-base-content/60 text-sm' : 'text-sm font-semibold'
            }
          >
            {previewName === '' ? UNNAMED_PREVIEW : previewName}
          </span>
        </p>
      </div>

      {/* The Note field, drawn by frame 19 and specified by CED-4, and **deliberately not rendered
          today** - see `SHOWS_NOTE`. No `required`, and it can carry no error. */}
      {SHOWS_NOTE ? (
        <Input
          id={NOTE_ID}
          label="Note (optional)"
          value={values.note}
          onChange={(event) => setText('note', event.currentTarget.value)}
        />
      ) : null}

      {/* Two form-level lines rather than one, because they answer different questions and can both
          be true: the picker had nothing to offer, and the save was rejected.
          `components/FormError.tsx` owns the treatment and the `role="alert"` argument for both, and
          renders nothing when its message is absent - so neither needs a conditional here and a
          closed modal still contributes no text to the page, which `(app)/pages.test.tsx` depends
          on. */}
      <FormError message={paletteMessage} />
      <FormError message={failure} />
    </Modal>
  );
}
