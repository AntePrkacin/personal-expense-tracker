'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { FieldShell, fieldErrorId } from '@/components/ui/FieldShell';
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
// **The trigger is a `<button>` wearing daisyUI's `select` class, not a `<select>`.** A
// native select opens the platform's option list and cannot host a popover, which is the one
// thing this control has to do - so `ui/Select` could not be reused as a component. What is
// reused instead is the one class that component is built on: `select` is pure CSS and works
// on any element, box, padding, height and chevron included. So the resting appearance stays
// identical to the real selects beside it for free, which is the point - the two must not
// drift apart - and PET-57 deleted the hand-traced padding and chevron that used to keep them
// in step by hand.
//
// **This is the only control in the app built directly on `ui/FieldShell` rather than being
// `Input` or `Select`.**

/**
 * The trigger, as complete literal strings per state.
 *
 * `select` draws its own chevron from a pair of gradients, so nothing here positions one, and
 * `select-error` is the same invalid border `ui/Input` and `ui/Select` show from their own
 * `error` prop - which matters more here than there, because a `button` cannot carry
 * `aria-invalid` (see the markup below) and this border is half of what states the field is
 * wrong.
 *
 * `cursor-pointer` is **not** redundant: the user agent draws an arrow over a `<button>`,
 * which is the app-wide defect PET-10 fixed, and daisyUI's `select` expects a real select
 * whose cursor it does not set. `text-left` because a button centres its text by default and
 * a field's value is left-aligned.
 */
const DATE_TRIGGER: Record<'valid' | 'invalid', string> = {
  valid: 'select w-full cursor-pointer text-left',
  invalid: 'select select-error w-full cursor-pointer text-left',
};

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
 * The surface is a plain `base-100` card with the theme's own radius and a shadow: nothing in
 * Figma draws this popover at all, so there is no elevation to match, and `rounded-box` is
 * what daisyUI's own floating surfaces use.
 */
const DATE_POPOVER = 'bg-base-100 border-base-300 rounded-box fixed z-10 w-70 border p-3 shadow-md';

/** The gap between the field and the popover, and the minimum inset from any viewport edge. */
const GAP = 8;

/** `w-70`, needed as a number to keep the popover inside the viewport horizontally. */
const POPOVER_WIDTH = 280;

/**
 * The popover's height, which is a constant because the grid is a fixed six rows.
 *
 * 12 padding + a `btn-sm`'s 32 header + 8 gap + 36 weekday row + 216 for six 36px rows + 12
 * padding, which is 316 against the 314 Chrome measured before PET-57 made the pagers stock
 * daisyUI buttons. Only the flip decision below reads it, so being a pixel or two out changes
 * nothing - which is why the value was left alone rather than nobody noticing. And
 * `monthMatrix`'s fixed row count is what makes it a constant at all rather than something to
 * measure after render. Measuring would mean setting state in a layout effect, which
 * `react-hooks/set-state-in-effect` rejects and this repo carries no disable comments for.
 */
const POPOVER_HEIGHT = 314;

/**
 * A month chevron.
 *
 * A stock small square ghost button, so its hover, active and focus-visible treatments are the
 * theme's rather than three decisions of this file's own - which is what PET-57 deleted here.
 * Nothing in the design fixes its size, since Figma never opens this popover.
 */
const DATE_PAGER = 'btn btn-ghost btn-sm btn-square';

/**
 * The three states a day cell takes, as complete literal strings.
 *
 * A `Record` rather than conditional concatenation, which is `frontend/CLAUDE.md`'s rule and
 * not a style preference: Tailwind's scanner reads this file as raw text, so a class built by
 * interpolation is found by nobody and compiles to nothing with no build error. And whole
 * strings rather than a shared base plus a modifier, because `selected` is not `default` with
 * something added: it swaps `btn-ghost` for `btn-primary`, and a base holding both would leave
 * the outcome to stylesheet order.
 *
 * `selected` and `today` are mutually exclusive in the markup below, with selected winning.
 * `size-9` overrides `btn-square`'s own height so the grid's cells match the weekday strip
 * above them.
 *
 * None of the three is designed. `today` takes the outline rather than a fill, so it reads as
 * a marker beside a selected day rather than competing with it, and `aria-current` carries the
 * same fact to a screen reader.
 *
 * **`today` was `btn-ghost btn-outline` and painted nothing**, which is the trap the paragraph
 * above warns about happening in one class string rather than between two. Both modifiers set
 * `--btn-border` at equal specificity in the same cascade layer, and `daisyui/components/
 * button.css` (5.7.16) emits `.btn-outline` before `.btn-ghost` - so ghost's transparent border
 * won and today's cell was pixel-identical to a plain day. `btn-outline btn-primary` instead:
 * outline supplies the transparent fill and the border, and the colour modifier only sets
 * `--btn-color`, which outline's border reads. The lesson generalises past this file - **two
 * `btn-*` modifiers in one string are resolved by daisyUI's emission order, not by the order
 * you wrote them** - and `frontend/CLAUDE.md` carries it for the whole app.
 */
const DATE_DAY: Record<'selected' | 'today' | 'default', string> = {
  selected: 'btn btn-primary btn-square size-9',
  today: 'btn btn-outline btn-primary btn-square size-9',
  default: 'btn btn-ghost btn-square size-9',
};

/** The placeholder the trigger shows when it holds no date. */
const NO_DATE = 'Select a date';

type DateFieldProps = {
  /** Wired to the label, the error message and the trigger's own name. See `ui/FieldShell`. */
  id: string;
  /** The Figma "Label" property, i.e. "Date". */
  label: string;
  /** The selected day as `YYYY-MM-DD`, or `''` for none. */
  value: string;
  /** Called with the `YYYY-MM-DD` of the day picked. */
  onChange: (iso: string) => void;
  /** One line of validation copy. See `ui/FieldShell` for the pattern and its status. */
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
   * **`ui/FieldShell`'s label is excluded for exactly the same reason**, which is less obvious
   * because the label is not this component's markup. The shell carries `htmlFor={id}` for
   * `ui/Input` and `ui/Select`, and the id here belongs to the `<button>` trigger - so a click on
   * the word "Date" is forwarded to that button by the user agent. Without this line the mousedown
   * dismissed the popover and the forwarded click reopened it a task later, so the label could
   * never close the field and produced a visible flicker when it was open. With it, the label
   * behaves exactly like the trigger: one toggle per click. Found by clicking the label in Chrome;
   * jsdom does not forward a label click to a `<button>`, so no suite can see either the flicker
   * or the fix.
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
      // The shell's label, whose `htmlFor` names the trigger, so a click on it arrives at the
      // trigger anyway. Looked up rather than held in a ref, because the element belongs to
      // `ui/FieldShell` and this component never sees it.
      if (document.getElementById(`${id}-label`)?.contains(target)) return;

      dismiss();
    }

    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('resize', dismiss);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('resize', dismiss);
    };
  }, [open, id]);

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
    // No wrapper element around the two, and none is needed: the popover is `fixed`, so it
    // positions against the viewport rather than against a `relative` ancestor, and the trigger
    // now carries the field's box itself.
    <FieldShell id={id} label={label} error={error}>
      {/* `aria-labelledby` names the label *and* the value span inside, so the accessible
          name is "Date Oct 8, 2025". Two things about that are deliberate.

          A `<label for>` alone would not do it: HTML-AAM computes a button's name from its
          own subtree, so the label would simply never be announced - which is why
          `ui/FieldShell` puts an id on its label for this one consumer.

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
        // `select-error`'s border and by `aria-describedby` below, which points at the message
        // itself - and this repo keeps no eslint-disable comments, so the honest markup is
        // the only option rather than the preferred one.
        aria-describedby={fieldErrorId(id, error)}
        onClick={() => (open ? closePopover() : openPopover())}
        className={DATE_TRIGGER[error ? 'invalid' : 'valid']}
      >
        <span id={`${id}-value`}>{formatIsoDate(value) || NO_DATE}</span>
      </button>

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
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>

            {/* aria-live so paging announces the new month to a screen reader; without it the
                grid changes silently under the reader's cursor. monthOverline is the same
                formatter the page header uses, rather than a sixth Intl instance. */}
            <span aria-live="polite" className="text-sm font-semibold">
              {monthLabel}
            </span>

            <button
              type="button"
              aria-label="Next month"
              onClick={() => page(1)}
              className={DATE_PAGER}
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>

          {/* **Outside the grid, and that is a correctness fix rather than a layout choice.**
              A `role="row"` must own `gridcell`, `cell`, `columnheader` or `rowheader`
              children; these initials are all `aria-hidden`, so a row containing them owns
              nothing and a screen reader is entitled to announce an empty row or to miscount
              the grid's columns. `jsx-a11y` does not check ARIA ownership, so nothing failed.

              Hidden for the reason the initials are ambiguous by design - S and T each appear
              twice, so "S M T W T F S" is worse than silence - and each day button carries its
              own full date instead. `aria-hidden` sits on the container rather than on all
              seven children, which is the same thing said once.

              `size-9` matches the day buttons below, so the columns line up; the muted
              `base-content` is the same treatment `PageHeader` gives its overline. */}
          <div aria-hidden="true" className="flex">
            {WEEKDAY_INITIALS.map((initial, column) => (
              <span
                key={column}
                className="text-base-content/60 inline-flex size-9 items-center justify-center text-xs"
              >
                {initial}
              </span>
            ))}
          </div>

          <div ref={gridRef} role="grid" aria-label={monthLabel}>
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
                        // `today` outline carries visually. Valid on a button, where
                        // `aria-selected` is not.
                        aria-current={iso === today ? 'date' : undefined}
                        // The full date, because "8" alone tells a screen-reader user
                        // nothing about which month or weekday they are on.
                        aria-label={formatIsoDate(iso)}
                        onClick={() => pick(iso)}
                        className={
                          iso === value
                            ? DATE_DAY.selected
                            : iso === today
                              ? DATE_DAY.today
                              : DATE_DAY.default
                        }
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
    </FieldShell>
  );
}
