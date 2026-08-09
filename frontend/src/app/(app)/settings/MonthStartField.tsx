'use client';

import { useRef, useState } from 'react';

import { FieldShell } from '@/components/ui/FieldShell';
import { centreChosenRow } from '@/lib/pickerScroll';

// The "Month starts on" field (SET-3): which day of the month the user's budgeting period opens on.
//
// **The value is a day-of-month ordinal, not a date, and that decided the control.** A calendar
// picker was weighed and rejected: it would draw October 14th under "Tuesday" in a specific year,
// and the user would have to discard the month, the year and the weekday to extract the one number
// that repeats. A shortlist of 1st / 15th / 28th was rejected too - the first two are real payday
// anchors and the third is February's ceiling, so a three-item menu would advertise an
// implementation limit as if it were a popular choice.
//
// **28 is the backend's cap and the reason there is no clamping case anywhere.** `UpdateProfileDto`
// validates `@IsInt @Min(1) @Max(28)` precisely so every month has the day, which is what lets
// `src/common/month-window.ts` resolve a period with no last-day-of-month arithmetic and lets
// `periodOverline` name one with two branches.
//
// **Why this is not `ui/Select`.** A native `<select>`'s popup height cannot be set in CSS in
// Firefox or Safari, and 28 options is exactly the list the product owner wanted capped and
// scrollable. That is the only reason - everything else about a native control was preferable, and
// the two costs are the ones `ColourSelect` already records: no arrow keys, and no platform wheel
// picker on a phone. `docs/TODO.md` carries them.
//
// **It publishes no `role="listbox"` and no `role="option"`, which deviates from this ticket's own
// plan and follows the codebase instead.** The plan said listbox plus roving focus and type-ahead;
// four controls here have already declined that promise - `TransactionRowMenu` refused
// `role="menu"`, `ColourSelect` and `IconSelect` refused listbox, and `SetupShell` refused
// `aria-current="step"` - each because the role commits to a keyboard contract (arrow keys,
// Home/End, type-ahead, `aria-activedescendant`) the implementation does not have. Building the
// real contract here alone would give one picker in this app a keyboard model the other four lack,
// and the next person copying a picker would copy the wrong one. So this is a list of ordinary
// buttons: Tab reaches each, Enter and Space pick, and `aria-current` names the chosen row. Note
// `IconSelect` already ships **64** rows on this pattern, so 28 is not the case that breaks it.
// Amendable - if the app ever implements the listbox contract, it should be implemented for all
// five at once.

/** The days a period may start on. 28 for the reason in the header. */
const MONTH_START_DAYS = Array.from({ length: 28 }, (_, index) => index + 1);

/**
 * The English ordinal suffix for a day of the month.
 *
 * Written out rather than reached for through `Intl.PluralRules`, which needs its own
 * `select('ordinal')` table to turn a category into a suffix and would still hard-code these four
 * strings - so the table below is the honest version of the same thing. It is correct over 1-28,
 * which is every value this field can hold: the 11-13 exception is what the first branch covers,
 * and nothing above 28 is reachable.
 */
function ordinal(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`;

  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] ?? 'th';
  return `${day}${suffix}`;
}

/** A row's label, e.g. `"15th of the month"`. Exported so no test or story restates a shipped string. */
export function monthStartLabel(day: number): string {
  return `${ordinal(day)} of the month`;
}

/**
 * The trigger's box, byte-identical to `(app)/DateField.tsx`'s and `ColourSelect`'s valid arm so
 * every closed field in this app is one box with one chevron.
 *
 * One literal rather than a `Record` per state: this field cannot carry a message. Its value is
 * always one of 28 offered rows, so no interaction can empty it and `settingsForm.ts` never names
 * it in `invalidFields` - an `error` prop here would be a `select-error` variant nothing could
 * reach, which is the shape `TransactionsTable`'s `pending` prop shipped as once.
 */
const TRIGGER = 'select w-full cursor-pointer text-left';

/**
 * The panel, and the `max-h-64` is the whole point of the control.
 *
 * A native `<select>` cannot be capped this way in Firefox or Safari, which is why this is not one.
 * `overflow-y-auto` gives the 28 rows their own scroll box, and `flex-nowrap` is mandatory because
 * daisyUI's `menu` is a flex column that would otherwise wrap them into columns once it ran out of
 * height - the trap `ColourSelect` records for its own sixteen.
 */
const PANEL =
  'dropdown menu rounded-box bg-base-100 z-10 max-h-64 w-56 flex-nowrap overflow-y-auto p-2 shadow-md';

type MonthStartFieldProps = {
  /** Wired to the label and the value span; see `ui/FieldShell` on why it is required. */
  id: string;
  /** The Figma label, "Month starts on". */
  label: string;
  /** The stored day, 1 to 28. */
  value: number;
  /** Called with the picked day, already a number - the field never round-trips it as text. */
  onChange: (day: number) => void;
  /** One line of standing guidance, for what changing this does to every figure in the app. */
  hint?: string;
  disabled?: boolean;
};

export function MonthStartField({
  id,
  label,
  value,
  onChange,
  hint,
  disabled,
}: MonthStartFieldProps) {
  /**
   * Whether the panel is showing, for `aria-expanded` and nothing else.
   *
   * Fed by the popover's own `toggle` event rather than by the click, so a click, an Escape and a
   * click outside all arrive through one path and the attribute cannot disagree with the platform.
   */
  const [open, setOpen] = useState(false);

  const panelRef = useRef<HTMLUListElement>(null);

  const panelId = `${id}-picker`;
  const anchor = `--${id}-anchor`;

  return (
    <FieldShell id={id} label={label} hint={hint}>
      {/* `aria-labelledby` names the shell's label **and** the value span inside, which is
          `DateField`'s finding and the reason `ui/FieldShell` puts an id on its label: `htmlFor`
          names a form control, and HTML-AAM computes a button's name from its own subtree instead,
          so a `<label for>` alone would never be announced here.

          `aria-haspopup` is deliberately absent, for `TransactionRowMenu`'s reason: its useful
          values name ARIA patterns this is not one of, and `"true"` means menu. */}
      <button
        type="button"
        id={id}
        popoverTarget={panelId}
        disabled={disabled}
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        className={TRIGGER}
        style={{ anchorName: anchor } as React.CSSProperties}
      >
        <span id={`${id}-value`}>{monthStartLabel(value)}</span>
      </button>

      <ul
        ref={panelRef}
        className={PANEL}
        popover="auto"
        id={panelId}
        style={{ positionAnchor: anchor } as React.CSSProperties}
        onToggle={(event) => {
          const isOpen = event.newState === 'open';
          setOpen(isOpen);

          // Centres the chosen row in the panel's own scroll box on open, so a stored 28th does not
          // open on a list showing the 1st with no sign the value is 27 rows further down. One
          // `scrollTop` on one element, deliberately not `scrollIntoView` - `lib/pickerScroll.ts`
          // records what else that would move.
          if (isOpen) centreChosenRow(panelRef.current);
        }}
      >
        {MONTH_START_DAYS.map((day) => {
          const chosen = day === value;

          return (
            <li key={day}>
              <button
                type="button"
                popoverTarget={panelId}
                popoverTargetAction="hide"
                aria-current={chosen ? 'true' : undefined}
                className={chosen ? 'menu-active' : undefined}
                onClick={() => onChange(day)}
              >
                {monthStartLabel(day)}
              </button>
            </li>
          );
        })}
      </ul>
    </FieldShell>
  );
}
