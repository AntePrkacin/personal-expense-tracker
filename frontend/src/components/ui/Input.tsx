import { Field, fieldControlClass, fieldErrorId } from './Field';

// Input / Field (Figma "Components", node 14:6).
//
// The text field on Register (22), Log in (23), Add and Edit transaction (09, 11),
// Add and Edit category (19, 21) and Settings (17).
//
// The `currency` variant is the "Amount" and "Monthly budget" field: the same
// wrapper, but a 22px Display/S value behind a "$" prefix (02 node 42:721, 09
// node 28:393, 19 node 102:1432). Figma models it as a separate frame rather than
// an instance of this component, because its type scale and padding differ; here
// it is one component with two variants, so the label, focus and error behaviour
// cannot drift between them.

export type InputVariant = 'default' | 'currency';

/**
 * Variant to utilities, all of it on the `<input>` rather than on the box.
 *
 * The designed padding has to sit on the control, not on the wrapper, because a
 * padded wrapper turns its own 14-16px band into a dead zone: clicking the left
 * edge of the Amount field would hit the `<div>` and place no caret. Select makes
 * the same choice for the same reason.
 *
 * `pl-9.25` is 37px, the designed left padding of 16 plus the 15px "$" glyph plus
 * the 6px gap the frames draw between them (node 42:721).
 *
 * Spelled out in full: an interpolated class is invisible to Tailwind's scanner
 * and compiles to nothing. utilities.test.ts compiles each of these.
 */
export const INPUT_VARIANTS: Record<InputVariant, string> = {
  default: 'text-body-m px-3.5 py-3',
  currency: 'text-display-s py-3.5 pr-4 pl-9.25',
};

type InputProps = {
  /** Wired to the label and the error message; see Field for why it is required. */
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
  /** One line of validation copy. See Field for the pattern and its status. */
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
  return (
    <Field id={id} label={label} error={error}>
      {/* The border lives on this wrapper rather than on the input, so one
          focus-within rule and one error rule cover both variants. It carries no
          padding of its own - see INPUT_VARIANTS. */}
      <div className={fieldControlClass(error, disabled)}>
        {variant === 'currency' ? (
          // Layered over the input rather than sitting beside it, so the glyph and
          // the padding around it still belong to the control - the same technique
          // Select uses for its chevron. `pointer-events-none` is what makes a
          // click on the "$" place a caret instead of doing nothing.
          //
          // Hidden from assistive technology: the label already says "Amount", and
          // a screen reader announcing a bare "dollar sign" before the value is
          // noise. The currency is hardcoded for the same reason lib/format.ts
          // hardcodes USD - the value chosen during onboarding (02) is not stored
          // yet. Both get revisited together.
          <span
            aria-hidden="true"
            className="text-display-s text-text-tertiary pointer-events-none absolute top-1/2 left-4 -translate-y-1/2"
          >
            $
          </span>
        ) : null}
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
          aria-describedby={fieldErrorId(id, error)}
          // outline-none is deliberate, not an accessibility slip. The wrapper's
          // accent border is the focus indicator, a second browser ring drawn just
          // inside it reads as a rendering bug rather than as focus, and
          // FIELD_CONTROL_BASE restores a real outline under forced-colors, where
          // a border colour cannot be trusted to change.
          //
          // w-full is what makes the input span the whole box, so every pixel of
          // the designed padding places a caret.
          className={`${INPUT_VARIANTS[variant]} text-text-primary placeholder:text-text-tertiary disabled:text-text-tertiary w-full bg-transparent outline-none disabled:cursor-not-allowed`}
        />
      </div>
    </Field>
  );
}
