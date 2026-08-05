// Field - the label, control box and inline message shared by Input and Select
// (Figma "Components", nodes 14:6 and 14:17, which draw the same wrapper twice).
//
// This file exists because of one acceptance criterion: "one inline message
// pattern is used, and the same pattern appears in every form across the app".
// A convention everyone remembers is not that; a single implementation both
// field types are built out of is. The ADD-7 date control will be the third
// consumer.
//
// No stories of its own - Input.stories.tsx and Select.stories.tsx exercise every
// state of it, the way categoryColour.ts is a shared module with no story.

/**
 * The bordered box, minus the colours that vary by state.
 *
 * Both the border colour and the fill are split out below, because a class string
 * cannot hold two of either: `border-border-strong` and `border-status-danger`
 * have equal specificity, so which one wins depends on their order in the
 * compiled stylesheet rather than in the attribute. Picking one is the only
 * reliable way. State classes carrying a variant prefix (`focus-within:`,
 * `disabled:`) are exempt, since the extra pseudo-class settles it.
 *
 * `relative` is here rather than on each consumer: Input positions its "$" prefix
 * against this box and Select positions its chevron, and both need every pixel of
 * the box to belong to the control underneath.
 *
 * The forced-colors outline is the accessible floor under the designed focus
 * style. Windows High Contrast forces every border-color to one system colour, so
 * the accent recolour below vanishes there and a 0.5px width change is all that
 * survives. This draws a real 2px outline instead, and only in that mode, so
 * normal rendering still matches Figma exactly.
 */
export const FIELD_CONTROL_BASE =
  'relative flex w-full items-center rounded-md border focus-within:forced-colors:outline-2 focus-within:forced-colors:outline-offset-2';

/**
 * Editable and disabled fills.
 *
 * No disabled field is drawn anywhere in the Figma file, so this is ours. It has
 * to exist: the box sets `bg-surface-card` and the control `text-text-primary`,
 * and author styles beat the user agent's own disabled treatment, so without it a
 * disabled field is pixel-identical to an editable one - a user clicks it, types,
 * and nothing happens. `Button` makes the same choice for the same reason.
 *
 * `surface-muted` rather than an opacity: it is the token the design already uses
 * for inert surfaces, and dimming would drag the border and text below their
 * contrast floor.
 */
export const FIELD_CONTROL_SURFACE: Record<'default' | 'disabled', string> = {
  default: 'bg-surface-card',
  disabled: 'bg-surface-muted cursor-not-allowed',
};

/**
 * Resting and invalid border treatments, focus behaviour included.
 *
 * The 1.5px accent border is the designed focus style (02 node 42:721, 09 node
 * 28:393, 19 node 102:1432; spec BUD-3 calls it out). Every frame that shows it
 * shows it on the currency amount field, which Figma never draws unfocused -
 * so what is designed is the *focused* look, and the 1px `Border/Strong` resting
 * state is read off the plain Input and Select tiles.
 *
 * Focus applies the same accent border in both rows. An earlier version held the
 * red border through focus and let the 1.5px thickening be the whole focus
 * signal, which is far too little to see - and invalidity is still carried by the
 * message below and by `aria-invalid`, neither of which focus touches. The red
 * border returns on blur.
 *
 * The width change is `border-[1.5px]`, not a token: Tailwind v4 has no
 * border-width theme namespace, so 1.5px cannot come from one. Because
 * box-sizing is border-box, the extra half pixel eats into the padding rather
 * than resizing the field, so nothing around it moves.
 */
export const FIELD_CONTROL_BORDER: Record<'default' | 'error', string> = {
  default: 'border-border-strong focus-within:border-[1.5px] focus-within:border-brand-accent',
  error: 'border-status-danger focus-within:border-[1.5px] focus-within:border-brand-accent',
};

/** The full box class for a control, in whichever state it is in. */
export function fieldControlClass(error?: string, disabled?: boolean) {
  const surface = FIELD_CONTROL_SURFACE[disabled ? 'disabled' : 'default'];
  const border = FIELD_CONTROL_BORDER[error ? 'error' : 'default'];
  return `${FIELD_CONTROL_BASE} ${surface} ${border}`;
}

/** The id `aria-describedby` points at. `undefined` when the field is valid. */
export function fieldErrorId(id: string, error?: string) {
  return error ? `${id}-error` : undefined;
}

type FieldProps = {
  /**
   * Required, and required at compile time rather than generated.
   *
   * `useId()` would be the obvious way to avoid asking, but it is a hook and
   * hooks are unavailable in Server Components, so it would force 'use client'
   * onto every field in the app. Making the prop mandatory pushes the problem
   * into the type system instead, the same move ProgressBar makes for its
   * accessible name: `npm run build` - this repo's typecheck gate - rejects a
   * field with no id rather than leaving it for review.
   */
  id: string;
  /** The Figma "Label" property, e.g. "Monthly budget". */
  label: string;
  /** The control itself. */
  children: React.ReactNode;
  /**
   * One line of validation copy, e.g. "Enter an amount greater than 0."
   *
   * No form error visual exists anywhere in the Figma file (assumption A29), so
   * this pattern - red border plus one line of `status-danger-text` beneath, no
   * icon - is ours and still owes a designer sign-off. It uses only Status tokens
   * and adds no glyph the design system does not already contain.
   */
  error?: string;
};

export function Field({ id, label, children, error }: FieldProps) {
  return (
    <div className="flex w-full flex-col gap-1.75">
      {/* The label carries an id as well as `htmlFor`, and the id is for one consumer:
          `(app)/DateField.tsx`, whose control is a <button> rather than an input. A
          `<label for>` is **not** part of a button's accessible-name computation in
          HTML-AAM - the name comes from its own subtree - so that field composes
          `aria-labelledby` from this id plus the button, and announces "Date, Oct 8,
          2025" instead of just the value. Input and Select need none of this, because
          `htmlFor` works normally on a real form control. */}
      {/* **`self-start` is a bug fix, not alignment.** This column is `w-full` and a flex item
          stretches by default, so the label was a full-width block - 472px of it inside the Add
          transaction modal, against about 55px of text. Clicking anywhere in that invisible strip
          activated the field, which is `<label for>` working exactly as specified and reads as a
          glitch: worst on a `<select>`, where Chrome focuses the control from a forwarded label
          click but does **not** open the list, so the border turned accent and nothing happened.
          Shrinking the label to its text makes the hit area what a reader would guess it is. */}
      <label
        id={`${id}-label`}
        htmlFor={id}
        className="text-label-m text-text-secondary cursor-pointer self-start"
      >
        {label}
      </label>
      {children}
      {/* Not role="alert". The message renders on submit alongside every other
          failed field, and a live region per field would announce them as a
          burst of interruptions. `aria-describedby` on the control, which Input
          and Select both wire up, is what carries it to a screen reader. */}
      {error ? (
        <p id={`${id}-error`} className="text-body-s text-status-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
