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
    <fieldset className="fieldset w-full">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p id={fieldErrorId(id, error)} className="text-error text-sm">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
