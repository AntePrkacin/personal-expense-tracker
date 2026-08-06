// Select, on daisyUI's `select` inside the `fieldset`/`label` shell that
// ui/FieldShell renders for both field components; see Input and FieldShell for
// the shared reasoning, including why daisyUI's `validator` class is not used
// for the controlled `error` prop.
//
// The dropdown on Setup step 1 ("Currency", 02) and the forms to come. Built on
// a native <select>: Figma never draws one open (assumptions A16, A40), so
// there is no designed list to match, and the native control brings keyboard
// handling, screen-reader semantics and the platform picker on a phone for
// free. daisyUI's `select` class draws its own chevron, which retired the
// hand-traced one this file used to carry.

import { FieldShell, fieldErrorId } from './FieldShell';

// **`ChevronLeaf` used to live here and is gone.** daisyUI's `select` already drew the field's
// own chevron, so its only consumer was the date picker's two month arrows, which rotated the
// down-pointing leaf a quarter turn each way. `lucide-react` ships `ChevronLeft` and
// `ChevronRight` as themselves, so `(app)/DateField.tsx` names the direction it wants instead of
// deriving it - and the `overflow-visible` this component had to carry (half a round-capped
// stroke fell outside its tight 10x5 box) goes with it, because lucide's 24-grid has the padding
// built in.

// State-keyed complete literals, the repo's Record convention: Tailwind's
// scanner reads whole class strings, never halves assembled at runtime.
//
// **`cursor-pointer` is not redundant, and dropping it silently reverted PET-10.** daisyUI's
// `select` sets a cursor on exactly two things, verified against `daisyui/components/select.css`
// (5.7.16): `not-allowed` when the control is disabled, and `pointer` on an `<option>` inside
// the CSS-styleable picker. A resting, enabled select gets none, so it keeps the user agent's
// arrow and reads as inert - the app-wide defect PET-10 fixed. `(app)/DateField.tsx` states the
// same fact for its `<button>` trigger, and this constant exists so the two cannot drift.
const SELECT_CONTROL: Record<'valid' | 'invalid', string> = {
  valid: 'select w-full cursor-pointer',
  invalid: 'select select-error w-full cursor-pointer',
};

type SelectProps = {
  /** Wired to the label and the error message; see Input for why it is required. */
  id: string;
  /** The Figma "Label" property, e.g. "Category". */
  label: string;
  options: { value: string; label: string }[];
  /** Defaults to `id`. */
  name?: string;
  /**
   * The "Select..." the tile shows as its default value.
   *
   * Rendered as a `value=""` option that is both `disabled` and `hidden`, so it
   * can be the displayed selection without appearing in the list and without
   * being submittable. `required` then rejects it.
   */
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  required?: boolean;
  disabled?: boolean;
  /** One line of validation copy, rendered beneath the control. */
  error?: string;
};

export function Select({
  id,
  label,
  options,
  name,
  placeholder,
  value,
  defaultValue,
  onChange,
  required,
  disabled,
  error,
}: SelectProps) {
  const errorId = fieldErrorId(id, error);

  return (
    <FieldShell id={id} label={label} error={error}>
      <select
        id={id}
        name={name ?? id}
        value={value}
        defaultValue={defaultValue ?? (placeholder && value === undefined ? '' : undefined)}
        onChange={onChange}
        required={required}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={SELECT_CONTROL[error ? 'invalid' : 'valid']}
      >
        {placeholder ? (
          <option value="" disabled hidden>
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}
