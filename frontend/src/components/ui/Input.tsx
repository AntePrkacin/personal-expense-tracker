// Input, on daisyUI's `input` inside a `fieldset`/`label` pair (PET-57). The
// pair replaced ui/Field, whose one job - the label, the inline message and the
// aria wiring between them - both field components now carry directly.
//
// The text field on Register (22), Log in (23) and the forms to come. The
// `currency` variant is the "Amount" / "Monthly budget" field: the same input
// with a "$" prefix, using daisyUI's wrapping-label pattern so a click on the
// glyph still focuses the control.
//
// daisyUI's `validator` class is deliberately not used: it colours from the
// HTML validation API's :valid/:invalid, and every form here is `noValidate`
// with controlled messages passed through the `error` prop, so `input-error`
// is applied from that prop instead.

export type InputVariant = 'default' | 'currency';

// State-keyed complete literals, the repo's Record convention: Tailwind's
// scanner reads whole class strings, never halves assembled at runtime.
const INPUT_CONTROL: Record<'valid' | 'invalid', string> = {
  valid: 'input w-full',
  invalid: 'input input-error w-full',
};

const CURRENCY_BOX: Record<'valid' | 'invalid', string> = {
  valid: 'input input-lg w-full',
  invalid: 'input input-lg input-error w-full',
};

type InputProps = {
  /**
   * Wired to the label and the error message. Required at compile time rather
   * than generated: `useId()` is a hook, and generating one would force
   * 'use client' onto the whole field layer.
   */
  id: string;
  /** The Figma "Label" property, e.g. "Merchant". */
  label: string;
  variant?: InputVariant;
  /** Defaults to `id`, which is what every form on the design needs. */
  name?: string;
  /**
   * `email` exists for Register and Log in, which validate the format (REG-2,
   * LOG-2).
   *
   * There is deliberately no `number`. The currency variant would then render
   * browser spinners the design does not draw, and a number input silently
   * discards a partially typed value like "24." while the user is mid-keystroke.
   * `inputMode` gets the numeric keypad on a phone without either problem.
   */
  type?: 'text' | 'email';
  inputMode?: 'text' | 'decimal';
  value?: string;
  defaultValue?: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** One line of validation copy, rendered beneath the control. */
  error?: string;
};

export function Input({
  id,
  label,
  variant = 'default',
  name,
  type = 'text',
  inputMode,
  value,
  defaultValue,
  onChange,
  placeholder,
  required,
  disabled,
  error,
}: InputProps) {
  const errorId = error ? `${id}-error` : undefined;

  const control = (
    <input
      id={id}
      name={name ?? id}
      type={type}
      inputMode={inputMode ?? (variant === 'currency' ? 'decimal' : undefined)}
      value={value}
      defaultValue={defaultValue}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      aria-invalid={error ? true : undefined}
      aria-describedby={errorId}
      className={variant === 'currency' ? 'grow' : INPUT_CONTROL[error ? 'invalid' : 'valid']}
    />
  );

  return (
    <fieldset className="fieldset w-full">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {variant === 'currency' ? (
        // The wrapping label is daisyUI's prefix pattern: the box styling sits on
        // it, the inner input is bare, and a click anywhere in the box - the "$"
        // included - focuses the control. Its own text is aria-hidden, so the
        // accessible name still comes only from the visible label above.
        <label className={CURRENCY_BOX[error ? 'invalid' : 'valid']}>
          <span aria-hidden="true" className="opacity-60">
            $
          </span>
          {control}
        </label>
      ) : (
        control
      )}
      {error ? (
        <p id={errorId} className="text-error text-sm">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
