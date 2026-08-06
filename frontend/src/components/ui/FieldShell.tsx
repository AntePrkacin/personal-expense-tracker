// The shared shell of ui/Input and ui/Select: the daisyUI `fieldset`/`label`
// pair and the inline validation line beneath the control.
//
// PET-57 deleted ui/Field and let the two field components absorb its job, which
// left the shell pasted byte-identically into both - so "one inline message
// pattern in every form" was held only by two parallel test suites, and the next
// field type would have pasted a third copy. This file regroups exactly the
// identical half so the pattern has one owner again. It is deliberately smaller
// than the old ui/Field: the control in `children` keeps its own `aria-invalid`
// and `aria-describedby` wiring (pointed at `fieldErrorId`), because only the
// control knows which element it is and what state it carries.

/**
 * The error line's id, which is also what the control's `aria-describedby`
 * names. Derived in one place so the two halves of that wiring cannot drift:
 * `undefined` without an error, so neither attribute renders pointing at
 * nothing.
 */
export function fieldErrorId(id: string, error: string | undefined): string | undefined {
  return error ? `${id}-error` : undefined;
}

type FieldShellProps = {
  /**
   * Wired to the label and the error message. Required at compile time rather
   * than generated: `useId()` is a hook, and generating one would force
   * 'use client' onto the whole field layer.
   */
  id: string;
  /** The Figma "Label" property, e.g. "Merchant". */
  label: string;
  /** One line of validation copy, rendered beneath the control. */
  error?: string;
  /** The control itself, carrying the aria wiring described above. */
  children: React.ReactNode;
};

export function FieldShell({ id, label, error, children }: FieldShellProps) {
  return (
    // **A `div` wearing daisyUI's `fieldset` class, not a `<fieldset>` element.** The class is
    // pure CSS - a one-column grid with a row gap - and works on any element, while the element
    // publishes `role="group"`. daisyUI's own idiom is one `<fieldset>` around a *set* of
    // fields, named by a `legend.fieldset-legend`; this shell wraps exactly one control, so the
    // element form put a nameless group boundary around every Input, Select and DateField in
    // the app - five of them inside the Add transaction modal alone - each announced as an
    // unnamed group entered and left. Reach for the real element, with a legend, if a screen
    // ever draws a genuine group.
    <div className="fieldset w-full">
      {/* The label carries an id as well as `htmlFor`, for the one consumer that cannot use
          the latter. `htmlFor` names a form control, and HTML-AAM computes a **button's** name
          from its own subtree instead - so `(app)/DateField.tsx`, whose trigger is a `<button>`
          because a native `<select>` cannot host a popover, would never have its label
          announced. It points `aria-labelledby` at this id plus a value span inside itself, and
          the pattern needs an id it can name. Derived from `id` rather than passed, so no
          caller can hand out one that matches nothing. Harmless to `ui/Input` and `ui/Select`,
          which keep using `htmlFor` and ignore this. */}
      {/* **`justify-self-start` is a bug fix, not alignment**, and it is `justify-self` rather
          than the `self-start` the old `ui/Field` carried because the axis moved. That column
          was `flex flex-col`, where `align-self` is the horizontal axis; daisyUI's `fieldset`
          is `display: grid` with `grid-template-columns: 1fr`, where the horizontal axis is
          `justify-self` and `align-self` does nothing at all. Without it the label is a
          full-width grid item - about 400px of it inside the Add transaction modal, against
          some 55px of text - and clicking anywhere in that invisible strip activates the field,
          which is `<label for>` working exactly as specified and reads as a glitch: worst on a
          `<select>`, where Chrome focuses the control from a forwarded label click but does
          **not** open the list, so the field lights up and nothing happens. `cursor-pointer`
          for the other half of the same thing - daisyUI's `.label` sets a pointer only via
          `:has(input)`, which is the label-wraps-the-control shape rather than this one - so the
          hit area that is left is also the one a reader would guess. */}
      <label id={`${id}-label`} className="label cursor-pointer justify-self-start" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p id={fieldErrorId(id, error)} className="text-error text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
