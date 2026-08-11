'use client';

import { Check } from 'lucide-react';
import { useRef, useState } from 'react';

import { categoryDotClass, type CategoryColour } from '@/components/ui/categoryColour';
import { FieldShell } from '@/components/ui/FieldShell';
import type { PaletteColour } from '@/lib/palette';

import { centreChosenRow } from '@/lib/pickerScroll';

// The Color field's picker: a swatch and a name per row, with a tick on the chosen one.
//
// **Why this is not `ui/Select`.** A native `<option>` cannot contain markup in any browser that
// matters, and the tick beside a selected option is drawn by the operating system, so neither half of
// what this draws is reachable from a native control. Chromium's `appearance: base-select` would give
// both, but daisyUI 5.7.16 ships nothing for it - so opting in resets the control and its popup to UA
// base styling, which would mean hand-written CSS re-creating what daisyUI already provides, and the
// result would exist only in Chromium. A control of our own is the smaller change.
//
// **`ui/Select` stays exactly as it is and this modal uses it nowhere.** The Icon field is
// `IconSelect`, a sibling of this one, because 64 glyphs want a searchable grid where 16 named
// colours want a list - so the two panels differ while the two triggers share `select`'s own class
// string, and every field in the row is the same box with the same chevron when closed. (This
// paragraph said Icon was still native until PET-37 built both halves in one change; the asymmetry
// `docs/TODO.md` used to carry is closed.)
//
// **The popover is the platform's, which is `(app)/transactions/TransactionRowMenu.tsx`'s argument
// rather than a new one.** `popovertarget` opens it, `popovertargetaction="hide"` closes it, and
// Escape, a click outside and the top layer are all the browser's - so nothing here holds "is it
// open" except the one piece of state `aria-expanded` needs. The costs come with it and are the same
// two that file records: jsdom implements no popover, so `jest.setup.ts`'s stub is what these tests
// run against, and **Firefox has no CSS anchor positioning**, where daisyUI's own
// `@supports not (position-area: bottom)` fallback centres the panel over a dimmed backdrop instead of
// anchoring it. Degraded rather than broken.
//
// **No `role="listbox"` and no `role="option"`, on purpose.** Those roles promise a keyboard contract
// - arrow keys, Home/End, type-ahead, `aria-activedescendant` - that this does not implement, and
// `TransactionRowMenu` refused `role="menu"` for exactly that reason while `SetupShell` refused
// `aria-current="step"`. What ships instead is a list of ordinary buttons: Tab reaches every one,
// Enter and Space pick, and `aria-current` names the chosen row without claiming a pattern. The lost
// arrow keys and the lost native mobile picker are the two real costs, both in `docs/TODO.md`.

/**
 * The trigger's box, byte-identical to `(app)/DateField.tsx`'s valid arm so the two read as one
 * control.
 *
 * **One literal rather than that file's `Record<'valid' | 'invalid'>`, because this field can carry
 * no message.** `categoryForm.ts` says why in full: both marks are preselected from the palette, so
 * no interaction can empty them and `invalidFields` deliberately never names them - the state that
 * looks like it wants a field error, a failed palette read, is a form-level line the modal owns. An
 * `error` prop here would have been a `select-error` variant nothing could ever reach, which is the
 * shape `frontend/src/app/CLAUDE.md` records `TransactionsTable`'s `pending` prop shipping as once.
 */
const TRIGGER = 'select w-full cursor-pointer text-left';

/**
 * The panel. `dropdown` is what CSS anchor positioning hangs off, `menu` owns the row padding and
 * hover, and the rest is the theme's - the same division `TransactionRowMenu` uses.
 *
 * `w-56` rather than the trigger's width: a popover is out of flow, so it inherits nothing, and 224px
 * is the field column at the designed 1440. `max-h-64` with `overflow-y-auto` because sixteen rows do
 * not fit in the modal, and `flex-nowrap` because daisyUI's `menu` is a flex column that would
 * otherwise wrap them into columns once it runs out of height.
 */
const PANEL =
  'dropdown menu rounded-box bg-base-100 z-10 max-h-64 w-56 flex-nowrap overflow-y-auto p-2 shadow-md';

/** What the trigger reads before a palette has supplied anything. See `AddCategoryModal`. */
const NO_COLOUR = 'Select…';

/** The swatch, at 16px. Bigger than the 8px legend dot, which is read rather than aimed at. */
const SWATCH = 'size-4 shrink-0 rounded-full';

type ColourSelectProps = {
  /** Wired to the label, the value span and the panel; see `ui/FieldShell` on why it is required. */
  id: string;
  /** The Figma "Label" property, which is "Color". */
  label: string;
  /** In the server's order, rendered as given. */
  options: PaletteColour[];
  /** `''` before a palette has landed, which is the disabled case. */
  value: CategoryColour | '';
  /**
   * Called with the chosen token.
   *
   * Typed as the contract's union rather than `string`, which is the whole reason this component is
   * worth having over a `<select>`: the value never round-trips through the DOM as text, so the
   * caller needs no lookup and no cast to satisfy `CreateCategoryDto`.
   */
  onChange: (token: CategoryColour) => void;
  disabled?: boolean;
};

export function ColourSelect({ id, label, options, value, onChange, disabled }: ColourSelectProps) {
  /**
   * Whether the panel is showing, for `aria-expanded` and nothing else.
   *
   * The one piece of state the popover does not let us avoid, exactly as in `TransactionRowMenu`:
   * `aria-expanded` reports *state*, and state is what a reader is missing when a panel opens with
   * focus still on the trigger. Fed by the popover's own `toggle` event rather than by the click, so
   * it cannot disagree with what the platform did - a click, Escape and a click outside all arrive
   * through the same event.
   */
  const [open, setOpen] = useState(false);

  /** The panel, which is its own scroll container here - unlike `IconSelect`, whose grid is. */
  const panelRef = useRef<HTMLUListElement>(null);

  const panelId = `${id}-picker`;

  // A dashed-ident derived from the field id, so two colour pickers on one page cannot anchor to each
  // other. `add-category-color` gives `--add-category-color-anchor`.
  const anchor = `--${id}-anchor`;

  const selected = options.find((colour) => colour.token === value);

  return (
    <FieldShell id={id} label={label}>
      {/* **`aria-labelledby` names the label *and* the value span inside**, which is `DateField`'s
          finding and the reason `ui/FieldShell` puts an id on its label at all: `htmlFor` names a
          form control, and HTML-AAM computes a **button's** name from its own subtree instead - so a
          `<label for>` alone would never be announced here.

          `aria-haspopup` is deliberately absent, for `TransactionRowMenu`'s reason: its useful values
          name ARIA patterns this is not one of, and `"true"` means menu. `aria-expanded` reports the
          state instead, which is the part a reader actually needs. */}
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
        <span className="flex items-center gap-2">
          {/* `aria-hidden` because the colour carries nothing the name does not: the value span
              beside it is the accessible name, and a swatch announced as anything would be a second
              voice for one fact. Same argument as the preview tile in `AddCategoryModal`. */}
          <span aria-hidden="true" className={`${SWATCH} ${categoryDotClass(value)}`} />
          <span id={`${id}-value`}>{selected?.label ?? NO_COLOUR}</span>
        </span>
      </button>

      <ul
        ref={panelRef}
        popover="auto"
        id={panelId}
        className={PANEL}
        style={{ positionAnchor: anchor } as React.CSSProperties}
        onToggle={(event) => {
          const isOpen = event.newState === 'open';
          setOpen(isOpen);

          // **Centred on open, so the chosen colour is never off-screen.** Sixteen rows do not fit
          // `max-h-64`, so opening on "Slate" - the sixteenth - used to show the top of the list with
          // nothing selected in view. The scroll container is this element rather than a child, which
          // is the one structural difference from `IconSelect`.
          if (isOpen) centreChosenRow(panelRef.current);
        }}
      >
        {options.map((colour) => {
          const isChosen = colour.token === value;

          return (
            <li key={colour.token}>
              {/* `popovertargetaction="hide"` rather than a close call in the handler, so the one
                  thing that dismisses this panel is the platform - the same single-exit shape
                  `(app)/Modal.tsx` argues for. React's `onClick` still runs, and the order does not
                  matter because the value is lifted to the caller either way.

                  `menu-active` is the visual selected row and `aria-current` is its announced half,
                  which is the pairing `frontend/src/components/CLAUDE.md` names as the one case where
                  a test may assert a daisyUI state class. */}
              <button
                type="button"
                popoverTarget={panelId}
                popoverTargetAction="hide"
                aria-current={isChosen ? true : undefined}
                onClick={() => onChange(colour.token)}
                className={
                  isChosen ? 'menu-active flex items-center gap-3' : 'flex items-center gap-3'
                }
              >
                <span
                  aria-hidden="true"
                  className={`${SWATCH} ${categoryDotClass(colour.token)}`}
                />
                <span className={isChosen ? 'grow font-semibold' : 'grow'}>{colour.label}</span>
                {/* The tick, on the right, and only on the chosen row. `text-primary` because it is
                    the one emphasised mark in the panel; `aria-hidden` because `aria-current` above
                    already says the same thing to a reader. */}
                {isChosen ? (
                  <Check className="text-primary size-4 shrink-0" aria-hidden="true" />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </FieldShell>
  );
}
