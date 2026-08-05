import { Field, fieldControlClass, fieldErrorId } from './Field';

// Select / Field (Figma "Components", node 14:17).
//
// The dropdown on Setup step 1 ("Currency", 02), Add and Edit transaction
// ("Category", "Date", 09 and 11), Add and Edit category ("Color", "Icon", 19 and
// 21) and Settings ("Currency", "Month starts on", 17).
//
// Built on a native <select>. Figma never draws one open (assumptions A16, A40),
// so there is no designed list to match, and the native control brings keyboard
// handling, screen-reader semantics and the platform picker on a phone for free -
// none of which a hand-rolled listbox gets without several hundred lines and its
// own 'use client' boundary. What it cannot do is render anything but text in the
// list, so the "Color" picker on 19, whose options are the eight Category tokens,
// will need a control of its own when that ticket lands.

/**
 * The trailing chevron, traced from the Figma export (node 14:16) and re-pointed
 * at `currentColor`.
 *
 * The designed leaf is 10x5 with a 1.5 round-capped stroke, which means half the
 * stroke falls outside the box along all three ends. An SVG viewport clips its
 * own overflow by default, so without `overflow-visible` both tips and the elbow
 * render shorn flat - the same trap ListRow's glyph documents.
 *
 * `pointer-events-none` is what keeps the whole box clickable: the chevron is
 * layered over the select, and without it a click on the arrow - the most
 * obvious place to click - would land on the decoration and do nothing.
 */
export function Chevron() {
  return (
    <svg
      viewBox="0 0 10 5"
      className="text-text-tertiary pointer-events-none absolute top-1/2 right-3.5 h-1.25 w-2.5 -translate-y-1/2 overflow-visible"
      fill="none"
      aria-hidden="true"
    >
      <path d="M0 0L5 5L10 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The same leaf, free of this component's absolute positioning.
 *
 * `Chevron` above is pinned to the right edge of a field box, which is right for a select and
 * wrong for anything that needs the mark inline - the date picker's month chevrons sit in a
 * row and are rotated a quarter turn each. Exported as a second component rather than a prop
 * because the two differ in every positioning class and share only the path.
 *
 * The path, the 10x5 viewBox and `overflow-visible` are all the same, and that last one is
 * the reason to reuse this at all rather than redrawing it: the designed leaf is 10x5 with a
 * 1.5 round-capped stroke, so half the stroke falls outside the box along all three ends, and
 * an SVG viewport clips its own overflow by default. Redrawn from the export, both tips and
 * the elbow render shorn flat - the trap `ui/ListRow`'s glyph documents first.
 */
export function ChevronLeaf({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 10 5"
      className={`h-1.25 w-2.5 overflow-visible ${className ?? ''}`}
      fill="none"
      aria-hidden="true"
    >
      <path d="M0 0L5 5L10 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The control's own padding, which sits on the <select> rather than on the box.
 *
 * Input puts padding on the box; this cannot, because the select has to span the
 * full box for every part of it to open the list. `pr-8.5` is 34px: 14px of
 * designed right padding, the 10px chevron, and the 10px gap the tile draws
 * between value and chevron.
 */
// `cursor-pointer` for the reason `BUTTON_BASE` carries it, and it is not redundant here either:
// the user agent draws an arrow over a `<select>`, so the one control on the form that opens a
// list read as unclickable on hover. `(app)/DateField.tsx` wears this same box and already had a
// pointer, so without this the two disagreed - which is exactly the drift that field exists not
// to cause. `disabled:cursor-not-allowed` still wins through its pseudo-class.
export const SELECT_CONTROL =
  'text-body-m text-text-primary disabled:text-text-tertiary w-full cursor-pointer appearance-none bg-transparent py-3 pr-8.5 pl-3.5 outline-none disabled:cursor-not-allowed';

type SelectProps = {
  /** Wired to the label and the error message; see Field for why it is required. */
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
  /** One line of validation copy. See Field for the pattern and its status. */
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
  return (
    <Field id={id} label={label} error={error}>
      {/* The box keeps no padding of its own - see SELECT_CONTROL - and gets the
          `relative` the chevron positions against from FIELD_CONTROL_BASE. */}
      <div className={fieldControlClass(error, disabled)}>
        <select
          id={id}
          name={name ?? id}
          value={value}
          defaultValue={defaultValue ?? (placeholder && value === undefined ? '' : undefined)}
          onChange={onChange}
          required={required}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={fieldErrorId(id, error)}
          // outline-none for the same reason as Input: the box's accent border is
          // the focus indicator, a second ring inside it looks like a bug, and
          // FIELD_CONTROL_BASE restores a real outline under forced-colors.
          className={SELECT_CONTROL}
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
        <Chevron />
      </div>
    </Field>
  );
}
