'use client';

import { useEffect, useRef, useState } from 'react';

import { Chevron, ChevronLeaf } from '@/components/ui/Select';
import { Field, fieldControlClass, fieldErrorId } from '@/components/ui/Field';
import { addDays, addMonths, daysInMonth, monthMatrix, WEEKDAY_INITIALS } from '@/lib/calendar';
import { isoFromParts, partsFromIso, todayIsoDate } from '@/lib/date';
import { formatIsoDate, monthOverline } from '@/lib/format';

// The Date field on 09 Add transaction and 11 Edit transaction (ADD-7, node 28:402).
//
// **Figma draws this as a closed select and never opens it**, so the trigger below is read
// off the design and everything inside the popover is ours. ADD-7 and assumption A14 say to
// "use a standard date picker and confirm the pattern with the designer", and the pattern
// chosen here is a mini-calendar: a month grid with a chevron either side of "October 2025".
// The week order, the six-row grid, the day-cell states and the whole keyboard model have no
// Figma counterpart and owe that confirmation, alongside what A29 covers. `docs/TODO.md`
// records it.
//
// **The trigger is a `<button>` wearing the Select field's clothes, not a `<select>`.** A
// native select opens the platform's option list and cannot host a popover, which is the one
// thing this control has to do - so `ui/Select` could not be reused as a component, and what
// is reused instead is its box (`fieldControlClass`), its padding geometry and its chevron.
// Everything about the resting appearance therefore stays identical to the real selects
// beside it, which is the point: the two must not drift apart.
//
// **This is the first control in the app built directly on `ui/Field` rather than being
// `Input` or `Select`**, which is what that file's "the ADD-7 date control will be the third
// consumer" note anticipated.

/**
 * The trigger's own padding and type, mirroring `SELECT_CONTROL`.
 *
 * `pr-8.5` is 34px for the same reason it is there: 14px of designed right padding, the 10px
 * chevron, and the 10px gap the tile draws between value and chevron. `text-left` because a
 * button centres its text by default and a field's value is left-aligned.
 *
 * `outline-none` for `Input`'s and `Select`'s reason - the box's accent border is the focus
 * indicator and a second ring drawn just inside it reads as a rendering bug - and
 * `FIELD_CONTROL_BASE` restores a real outline under forced colors, where a border colour
 * cannot be trusted to change.
 */
export const DATE_TRIGGER =
  'text-body-m text-text-primary w-full cursor-pointer bg-transparent py-3 pr-8.5 pl-3.5 ' +
  'text-left outline-none';

/**
 * The popover card.
 *
 * **`fixed`, not `absolute`, and that is the whole of one bug fix.** The user agent gives a modal
 * dialog `overflow: auto` with a `max-height`, so an `absolute` popover anchored to the field is
 * a descendant of that scroll box: opening it grew the dialog's `scrollHeight` from 532 to 663,
 * put a scrollbar down the side of the modal, and clipped 131px of the calendar. Measured in
 * Chrome, not inferred.
 *
 * `fixed` escapes both, because the dialog sets no `transform`, `filter` or `contain` - so it
 * establishes no containing block, the popover's containing block is the viewport, and the
 * dialog's overflow cannot clip it or count it. It stays a DOM child of the dialog, so it still
 * paints inside the dialog's own top-layer stacking context and over the modal rather than under
 * it. The cost is that the coordinates have to be computed, which `placeAgainst` does.
 *
 * `shadow-card` is the elevation every other floating surface here uses.
 */
export const DATE_POPOVER =
  'border-border-default bg-surface-card shadow-card fixed z-10 w-70 rounded-md border p-3';

/** The gap between the field and the popover, and the minimum inset from any viewport edge. */
const GAP = 8;

/** `w-70`, needed as a number to keep the popover inside the viewport horizontally. */
const POPOVER_WIDTH = 280;

/**
 * The popover's height, which is a constant because the grid is a fixed six rows.
 *
 * 12 padding + 28 header + 8 gap + 36 weekday row + 216 for six 36px rows + 12 padding = 312,
 * and Chrome measures 314 with the border. Only the flip decision below reads it, so being a
 * pixel or two out changes nothing - and `monthMatrix`'s fixed row count is what makes it a
 * constant at all rather than something to measure after render. Measuring would mean setting
 * state in a layout effect, which `react-hooks/set-state-in-effect` rejects and this repo carries
 * no disable comments for.
 */
const POPOVER_HEIGHT = 314;

/**
 * A month chevron's hit area.
 *
 * 28px rather than the 34px the modal's close button uses: these two sit inside a 280px
 * popover beside a month label, and nothing in the design fixes either number.
 */
export const DATE_PAGER =
  'inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md ' +
  'text-text-secondary hover:bg-surface-muted focus-visible:outline-brand-accent ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2';

/**
 * The three states a day cell takes, as complete literal strings.
 *
 * A `Record` rather than conditional concatenation, which is `frontend/CLAUDE.md`'s rule and
 * not a style preference: Tailwind's scanner reads this file as raw text, so a class built by
 * interpolation is found by nobody and compiles to nothing with no build error.
 * `ui/utilities.test.ts` compiles every value here.
 *
 * `selected` and `today` are mutually exclusive in the markup below, with selected winning -
 * they would otherwise both set a colour and the outcome would depend on stylesheet order,
 * which is exactly the trap `ui/Field` documents for its border maps.
 *
 * None of the three is designed. `today` borrows the accent as a text colour rather than a
 * fill, so it reads as a marker beside a selected day rather than competing with it.
 */
export const DATE_DAY: Record<'selected' | 'today' | 'default', string> = {
  selected: 'bg-brand-accent text-text-on-accent',
  today: 'text-brand-accent hover:bg-surface-muted',
  default: 'text-text-primary hover:bg-surface-muted',
};

/** Geometry shared by every day cell, whatever its state. */
export const DATE_DAY_BASE =
  'text-body-s inline-flex size-9 cursor-pointer items-center justify-center rounded-md ' +
  'focus-visible:outline-brand-accent focus-visible:outline-2 focus-visible:outline-offset-2';

/** The placeholder the trigger shows when it holds no date. */
const NO_DATE = 'Select a date';

type DateFieldProps = {
  /** Wired to the label, the error message and the trigger's own name. See `ui/Field`. */
  id: string;
  /** The Figma "Label" property, i.e. "Date". */
  label: string;
  /** The selected day as `YYYY-MM-DD`, or `''` for none. */
  value: string;
  /** Called with the `YYYY-MM-DD` of the day picked. */
  onChange: (iso: string) => void;
  /** One line of validation copy. See `ui/Field` for the pattern and its status. */
  error?: string;
};

/** The year and month to show the grid for, from a value or from today. */
function viewOf(iso: string): { year: number; month: number } {
  const parts = partsFromIso(iso) ?? partsFromIso(todayIsoDate())!;
  return { year: parts.year, month: parts.month };
}

/**
 * Where a `fixed` popover goes to sit under its trigger.
 *
 * Computed in the click handler rather than in an effect, which keeps it out of
 * `react-hooks/set-state-in-effect`'s way and means the popover's first paint is already in the
 * right place with no reposition flicker.
 *
 * It flips **above** the field when there is not room below, so the calendar is never half off
 * the bottom of a short window, and clamps horizontally so it cannot leave the viewport on the
 * right. Both use the constants above rather than a measurement.
 */
function placeAgainst(trigger: HTMLElement): { top: number; left: number } {
  const rect = trigger.getBoundingClientRect();
  const roomBelow = window.innerHeight - rect.bottom - GAP;

  return {
    top:
      roomBelow >= POPOVER_HEIGHT
        ? rect.bottom + GAP
        : Math.max(GAP, rect.top - POPOVER_HEIGHT - GAP),
    left: Math.max(GAP, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - GAP)),
  };
}

export function DateField({ id, label, value, onChange, error }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => viewOf(value));

  /**
   * The day the grid's single tab stop sits on.
   *
   * A roving `tabIndex` rather than 42 tab stops, which is the ARIA grid pattern: one Tab
   * enters the grid and the arrows move within it. Without it, reaching the footer of the
   * modal from the Date field would take up to 42 presses.
   */
  const [focusedIso, setFocusedIso] = useState(() => value || todayIsoDate());

  /**
   * Whether the next render should move DOM focus onto `focusedIso`.
   *
   * The flag exists because the same state drives two very different interactions. A keyboard
   * move *must* take focus with it, or the arrows appear to do nothing. A chevron click must
   * **not**, or focus would jump from the chevron into the grid and paging twice would be
   * impossible with the mouse. An effect keyed only on `focusedIso` cannot tell those apart,
   * so the handlers that want focus moved say so.
   */
  const moveFocus = useRef(false);

  /** Where the `fixed` popover sits, computed against the trigger when it opens. */
  const [placement, setPlacement] = useState({ top: 0, left: 0 });

  const gridRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const today = todayIsoDate();

  useEffect(() => {
    if (!open || !moveFocus.current) return;

    moveFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focusedIso}"]`)?.focus();
  }, [open, focusedIso]);

  /**
   * Dismissal by anything that is not the calendar: a click elsewhere, or a resize.
   *
   * **`mousedown` rather than `click`**, so the popover is gone before whatever was clicked
   * reacts - a click on the Category select closes this and opens that in one gesture rather
   * than needing two.
   *
   * **The trigger is excluded, and that is load-bearing.** Its own `onClick` toggles, so if this
   * closed the popover on mousedown the click would immediately reopen it and the button would
   * appear dead.
   *
   * Resize **closes** rather than repositions, because the coordinates are computed once on open
   * and a resize invalidates them. Cheap, honest, and a resize with the calendar open is rare;
   * repositioning would mean tracking the trigger's rect continuously for no real gain.
   *
   * Note a click on the scrim closes this *and* the modal - the popover on mousedown, the dialog
   * on the click that follows. That is the same "click outside dismisses" the modal already
   * promises (AC7), rather than a two-step Escape has to be.
   */
  useEffect(() => {
    if (!open) return;

    function dismiss() {
      // Not `closePopover()`, which pulls focus back to the trigger: that would fight whatever
      // the user just clicked into. Dismiss quietly and let the click land where it was aimed.
      setOpen(false);
    }

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (target === null) return;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;

      dismiss();
    }

    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('resize', dismiss);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('resize', dismiss);
    };
  }, [open]);

  function openPopover() {
    const next = value || today;
    const trigger = triggerRef.current;
    if (trigger === null) return;

    setFocusedIso(next);
    setView(viewOf(next));
    setPlacement(placeAgainst(trigger));
    moveFocus.current = true;
    setOpen(true);
  }

  /** Closes and hands focus back to the trigger, which is where the user was. */
  function closePopover() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function pick(iso: string) {
    onChange(iso);
    closePopover();
  }

  /** Pages the grid without touching focus, so the chevron stays clickable. */
  function page(delta: number) {
    setView((current) => addMonths(current.year, current.month, delta));
  }

  /** Moves the roving tab stop, following the view along if the month changed. */
  function moveTo(iso: string | null) {
    if (iso === null) return;

    setFocusedIso(iso);
    setView(viewOf(iso));
    moveFocus.current = true;
  }

  function onGridKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    // **Escape closes the popover and must not reach the dialog.** A `<dialog>` treats Escape
    // as a close request, so without `preventDefault` the browser would shut the whole modal
    // and lose everything typed - the one place in this feature where Escape needs code at
    // all, since `(app)/Modal.tsx` deliberately writes none. `stopPropagation` is belt and
    // braces for any React-level listener above.
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closePopover();
      return;
    }

    const byKey: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };

    const delta = byKey[event.key];

    if (delta !== undefined) {
      // Arrow keys scroll the page by default, and inside a grid that is never what is meant.
      event.preventDefault();
      moveTo(addDays(focusedIso, delta));
      return;
    }

    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();

      const parts = partsFromIso(focusedIso)!;
      const { year, month } = addMonths(parts.year, parts.month, event.key === 'PageUp' ? -1 : 1);

      // The day is **clamped** to the target month's length rather than allowed to roll: from
      // 31 January, PageDown means "the last day of February I can be on", not "3 March".
      // This is the same reason `addMonths` refuses to do date arithmetic at all.
      moveTo(isoFromParts(year, month, Math.min(parts.day, daysInMonth(year, month))));
    }
  }

  const grid = monthMatrix(view.year, view.month);

  // `monthOverline` is the same formatter the page header uses for "October 2025", rather than
  // a sixth Intl instance. Built with the local parts constructor, never `new Date(string)` -
  // see lib/date.ts on why the latter shifts the day in any zone behind UTC.
  const monthLabel = monthOverline(new Date(view.year, view.month - 1, 1));

  return (
    <Field id={id} label={label} error={error}>
      {/* The box supplies `relative`, which is what the popover positions against, and the
          resting and error borders, which are the same ones every other field draws. */}
      <div className={fieldControlClass(error)}>
        {/* `aria-labelledby` names the label *and* the value span inside, so the accessible
            name is "Date Oct 8, 2025". Two things about that are deliberate.

            A `<label for>` alone would not do it: HTML-AAM computes a button's name from its
            own subtree, so the label would simply never be announced - which is why
            `ui/Field` gained a label id for this one consumer.

            And the second reference points at a **child span rather than at the button
            itself**. Self-reference is legal per the accname spec and is meant to append the
            element's own contents, but resolution of it is inconsistent - the repo's own
            testing-library stack computes "Date" and drops the value entirely. An explicit
            id cannot be read two ways by anybody. */}
        <button
          ref={triggerRef}
          type="button"
          id={id}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-labelledby={`${id}-label ${id}-value`}
          // **No `aria-invalid`, unlike `ui/Input` and `ui/Select`.** Those set it on a real
          // form control, where the `textbox` and `combobox` roles support it; the `button`
          // role does not, so it would be an attribute a screen reader is entitled to ignore
          // (and `jsx-a11y/role-supports-aria-props` says so). The invalid state is carried by
          // the red border and by `aria-describedby` below, which points at the message
          // itself - and this repo keeps no eslint-disable comments, so the honest markup is
          // the only option rather than the preferred one.
          aria-describedby={fieldErrorId(id, error)}
          onClick={() => (open ? closePopover() : openPopover())}
          className={DATE_TRIGGER}
        >
          <span id={`${id}-value`}>{formatIsoDate(value) || NO_DATE}</span>
        </button>

        {/* ui/Select's own chevron, positioned and pointer-events-none, so the resting field
            is pixel-identical to the Category select above it. */}
        <Chevron />

        {open ? (
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Choose a date"
            className={DATE_POPOVER}
            // The one inline style in this component, and it has to be: `fixed` needs viewport
            // coordinates, and Tailwind cannot express "wherever this field happens to be".
            style={{ top: placement.top, left: placement.left }}
            onKeyDown={onGridKeyDown}
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => page(-1)}
                className={DATE_PAGER}
              >
                {/* The leaf points down at rest, so a quarter turn clockwise points it left. */}
                <ChevronLeaf className="rotate-90" />
              </button>

              {/* aria-live so paging announces the new month to a screen reader; without it the
                  grid changes silently under the reader's cursor. monthOverline is the same
                  formatter the page header uses, rather than a sixth Intl instance. */}
              <span aria-live="polite" className="text-strong-m text-text-primary">
                {monthLabel}
              </span>

              <button
                type="button"
                aria-label="Next month"
                onClick={() => page(1)}
                className={DATE_PAGER}
              >
                <ChevronLeaf className="-rotate-90" />
              </button>
            </div>

            <div ref={gridRef} role="grid" aria-label={monthLabel}>
              <div role="row" className="flex">
                {WEEKDAY_INITIALS.map((initial, column) => (
                  // aria-hidden because the initials are ambiguous by design - S and T each
                  // appear twice - so a reader announcing "S M T W T F S" is worse than
                  // nothing. Each day button carries its own full date instead.
                  <span
                    key={column}
                    aria-hidden="true"
                    className="text-caption text-text-tertiary inline-flex size-9 items-center justify-center"
                  >
                    {initial}
                  </span>
                ))}
              </div>

              {grid.map((week, row) => (
                <div role="row" key={row} className="flex">
                  {week.map((iso, column) =>
                    iso === null ? (
                      // An empty cell rather than the neighbouring month's day: the design has
                      // no styling for an adjacent-month day, so inventing one would invent
                      // more than the file contains.
                      <span role="gridcell" key={column} className="size-9" />
                    ) : (
                      // `aria-selected` belongs on the **gridcell**, not on the button inside
                      // it: the `button` role does not support that state, and the ARIA grid
                      // pattern puts selection on the cell. This is also the shape APG's own
                      // date-picker dialog uses.
                      <span role="gridcell" key={column} aria-selected={iso === value}>
                        <button
                          type="button"
                          data-iso={iso}
                          // The roving tab stop. Exactly one day in the grid is reachable by
                          // Tab; the arrows move it.
                          tabIndex={iso === focusedIso ? 0 : -1}
                          // Announces "current date" on today, which is the marker the
                          // `today` colour carries visually. Valid on a button, where
                          // `aria-selected` is not.
                          aria-current={iso === today ? 'date' : undefined}
                          // The full date, because "8" alone tells a screen-reader user
                          // nothing about which month or weekday they are on.
                          aria-label={formatIsoDate(iso)}
                          onClick={() => pick(iso)}
                          className={`${DATE_DAY_BASE} ${
                            iso === value
                              ? DATE_DAY.selected
                              : iso === today
                                ? DATE_DAY.today
                                : DATE_DAY.default
                          }`}
                        >
                          {partsFromIso(iso)!.day}
                        </button>
                      </span>
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Field>
  );
}
