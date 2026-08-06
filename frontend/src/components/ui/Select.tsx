// Select, on daisyUI's `select` inside a `fieldset`/`label` pair (PET-57). The
// pair replaced ui/Field; see Input for the shared reasoning, including why
// daisyUI's `validator` class is not used for the controlled `error` prop.
//
// The dropdown on Setup step 1 ("Currency", 02) and the forms to come. Built on
// a native <select>: Figma never draws one open (assumptions A16, A40), so
// there is no designed list to match, and the native control brings keyboard
// handling, screen-reader semantics and the platform picker on a phone for
// free. daisyUI's `select` class draws its own chevron, which retired the
// hand-traced one this file used to carry.

// State-keyed complete literals, the repo's Record convention: Tailwind's
// scanner reads whole class strings, never halves assembled at runtime.
const SELECT_CONTROL: Record<'valid' | 'invalid', string> = {
  valid: 'select w-full',
  invalid: 'select select-error w-full',
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
  const errorId = error ? `${id}-error` : undefined;

  return (
    <fieldset className="fieldset w-full">
      <label className="label" htmlFor={id}>
        {label}
      </label>
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
      {error ? (
        <p id={errorId} className="text-error text-sm">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
