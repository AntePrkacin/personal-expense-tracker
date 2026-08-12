'use client';

import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

// The notification region: one stack, bottom right, above whatever is on screen.
//
// **It is the platform popover, which is this app's most-repeated argument and here it is a
// requirement rather than a preference.** `(app)/Modal.tsx` opens with `showModal()`, so every
// dialog in this app sits in the **top layer** - and daisyUI's `.toast` is `position: fixed` and
// nothing more (read out of `frontend/node_modules/daisyui/components/toast.css`, the rule
// `frontend/CLAUDE.md` sets for every question about what a daisyUI class actually does). A fixed
// element cannot paint over a top-layer one at any z-index, and this app picks no z-indexes anyway.
// Most toasts here are raised from inside a modal, so "behind the dialog" is not an edge case, it is
// the common case.
//
// **Four things were measured in Chrome before this file was written**, against a bare `<dialog>`
// and this exact rule set. `docs/plans/2026-08-11_PET-77_toast-notifications.md` carries the table;
// the two that shaped the code are below, and neither is guessable from the spec.
//
// **`showPopover()` fires on every post, not once at mount, and that is load-bearing.** Top-layer
// order is by when an element *entered* the layer, so a region shown once at mount sits under every
// dialog opened afterwards - measured, and visibly dimmed by the dialog's own `::backdrop`. Showing
// it again on each post puts it back on top of whatever is currently up.
//
// **The dismiss button is inert while a modal dialog is open, and that is the platform's.** The
// toast paints above the dialog, `document.elementFromPoint` over the button resolves to the dialog,
// and a real click at the button's own coordinates never reaches the handler. A popover that is a
// DOM *descendant* of the open dialog is hit-testable, so the only fix is portalling this region
// into whichever of four providers' dialogs happens to be topmost - a great deal of fragility to buy
// back a control the auto-dismiss already covers on a surface the user is about to leave. Rejected
// deliberately; the timer is what clears a toast raised over a modal.
//
// **The announcement is a separate pair of `sr-only` regions, and the popover is why.** A hidden
// popover is `display: none` (the UA's `[popover]:not(:popover-open)` rule), so React appends the
// toast into a hidden subtree and `showPopover()` reveals it a tick later - and a live region whose
// content changed while it was hidden is not reliably announced at all. That is the same class of
// silence `AllocateBudgetModal.tsx` and `SettingsForm.tsx` both record for a region created in the
// same commit as its content, reached from a new direction. So the two announcer regions are
// ordinary in-flow elements that are never hidden and never move, they mount **empty** and only
// their text changes, and the visible stack carries no `aria-live` of its own. The cost is the
// message existing twice in the DOM for as long as it is announced, which is what
// `ANNOUNCEMENT_CLEAR_MS` in the provider bounds.
//
// **Not `components/`, and not `components/ui/`.** That folder mirrors the Figma Components page and
// is complete, and this is not a tile - A29 designs no toast at all, so the whole treatment is ours.
// `components/`' criterion is spanning route segments in *different* trees, and every consumer here
// is inside the `(app)` group. So this is `Modal.tsx`'s and `PageHeader.tsx`'s situation: the
// signed-in shell's own component, beside the layout, with its stories filed under **Shell**.

/**
 * Whether the page currently has a modal dialog open.
 *
 * `dialog[open]` covers `showModal()` and the non-modal `show()` alike; this app only ever opens
 * modals, and a non-modal dialog would not make the region inert - so the over-match is harmless
 * and the narrower `:modal` selector is avoided because jsdom does not implement it.
 */
function hasOpenModal(): boolean {
  return typeof document !== 'undefined' && document.querySelector('dialog[open]') !== null;
}

/** What a toast is for. Two kinds, and `docs/TODO.md`'s entry is the argument for no third. */
export type ToastKind = 'success' | 'failure';

export type Toast = {
  /**
   * The stack key.
   *
   * A monotonic integer from the provider rather than `Date.now()` or `crypto.randomUUID()`: two
   * toasts posted in one tick share a millisecond, and nothing about a notification needs an
   * unguessable id. It is also what makes the suite's assertions stable.
   */
  id: number;
  kind: ToastKind;
  /** The whole sentence, already interpolated. There is no copy module in this repo. */
  message: string;
};

/**
 * The stack's own classes.
 *
 * `toast toast-end toast-bottom` is daisyUI's bottom-right corner. The rest undoes the **popover UA
 * stylesheet**, which brings a border, padding, a margin and `overflow: auto` to any element
 * carrying the attribute - without them the stack draws a hairline box around itself and clips its
 * own shadows. `.toast` already zeroes the background and owns the insets, so those are not
 * restated here.
 */
const REGION_CLASS = 'toast toast-end toast-bottom m-0 overflow-visible border-0 p-0';

/**
 * Whole literal strings per kind, never interpolated - Tailwind's scanner reads source as text.
 *
 * **`text-white` is a literal colour in a repo that forbids them, and this is the carve-out rather
 * than an oversight.** `frontend/CLAUDE.md`'s rule is that theme-aware colour must be daisyUI
 * semantic colour, because a raw Tailwind palette value does not follow the theme. Nothing here is
 * theme-aware: `--color-success` and `--color-error` are the *same* fills in both Expensa themes
 * (measured), so the surface this text sits on never changes and a colour that followed the theme
 * would be the wrong one half the time.
 *
 * It replaces two colours that disagreed with each other. The label took `--color-success-content`,
 * a near-black green, while the dismiss control is a `btn-ghost` and painted from
 * `--color-base-content` - which is light in the dark theme and dark in the light one. So the toast
 * drew dark text beside a white X in dark mode, and neither token was chosen for a coloured fill.
 * One colour on the whole box is what makes the icon, the sentence and the X agree.
 */
const TOAST_CLASS: Record<ToastKind, string> = {
  success: 'alert alert-success text-white shadow-sm',
  failure: 'alert alert-error text-white shadow-sm',
};

type ToastRegionProps = {
  /** Oldest first, so the newest lands at the bottom of the column nearest the corner. */
  toasts: readonly Toast[];
  /**
   * The polite announcement, or the empty string.
   *
   * Separate from `toasts` rather than derived from it, because the two have different lifetimes:
   * a toast is on screen for seconds and its announcement is spent the moment it is read out.
   */
  politeAnnouncement: string;
  /** The assertive one. Same shape, and only one of the pair is ever non-empty at a time. */
  assertiveAnnouncement: string;
  onDismiss: (id: number) => void;
};

export function ToastRegion({
  toasts,
  politeAnnouncement,
  assertiveAnnouncement,
  onDismiss,
}: ToastRegionProps) {
  const regionRef = useRef<HTMLDivElement>(null);

  /**
   * Whether a modal dialog is open, because that is exactly when this region's dismiss control is
   * dead.
   *
   * **A review called the previous shape what it was: a control that looks operable and is not.**
   * The header above records the measurement - a popover shown after a modal `<dialog>` paints over
   * it and is inert, so a real click never reaches `onDismiss` - and the button was still drawn
   * fully styled, focusable and hover-responsive for the toast's whole life. Root `CLAUDE.md`
   * re-asserted one commit earlier that this app ships no such control. So the control announces
   * itself instead: `aria-disabled` plus the muted treatment, which is the call every inert control
   * on the Categories tab made before PET-70 cleared them.
   *
   * A `MutationObserver` rather than a check at post time, because the dialog can open or close
   * while a toast is up and the answer has to follow it.
   */
  const [modalOpen, setModalOpen] = useState(() => hasOpenModal());

  useEffect(() => {
    const sync = () => setModalOpen(hasOpenModal());

    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open'],
    });

    return () => observer.disconnect();
  }, []);

  /** The newest toast's id, which is what "a post happened" looks like from in here. */
  const newestId = toasts.length === 0 ? null : toasts[toasts.length - 1].id;

  useEffect(() => {
    const region = regionRef.current;

    // Guarded because **jsdom implements none of the Popover API** and `jest.setup.ts` deliberately
    // polyfills none of it, the call `TransactionRowMenu` already lives with. Under Jest the region
    // stays an ordinary fixed element, which is exactly what keeps every content assertion in the
    // suites honest - what cannot be asserted there is the stacking, and that is a browser check.
    if (region === null || typeof region.showPopover !== 'function') return;

    if (newestId === null) {
      // `:popover-open` rather than a boolean of our own: `hidePopover()` on a closed popover
      // throws, and the platform is the only thing that knows, since a light dismiss is not
      // possible on a `manual` popover but a re-render is.
      if (region.matches(':popover-open')) region.hidePopover();
      return;
    }

    // Hide first when it is already open. Re-entering the top layer is the whole point - see the
    // header comment - and there is no "raise" call, so leaving and coming back is how it is spelt.
    if (region.matches(':popover-open')) region.hidePopover();
    region.showPopover();
  }, [newestId]);

  return (
    <>
      {/* The two announcers. Ordinary in-flow elements, never hidden, mounted empty from the first
          render and only their text changing - the rule this repo has now paid for three times.
          The suites therefore assert each one's **text**, never its presence, which is the whole
          distinction: a region that exists is not a region that announces.

          **`aria-live` rather than the equivalent `role="status"` / `role="alert"` pair, and that
          is a decision about the rest of the app rather than about this component.** Those two
          roles are what every form-level message in this repo already publishes -
          `components/FormError.tsx` is `role="alert"` and five screens render one - and this region
          is mounted on the layout for the whole session, empty. Give it the roles and every
          `getByRole('alert')` in the app matches two elements the moment a form shows a message:
          33 such queries in `SettingsForm.test.tsx` alone, and the ambiguity would be a defect in
          the region rather than in the suites that found it. `aria-live` announces identically and
          publishes no role, so the role landscape of every screen is exactly what it was. */}
      <div className="sr-only" data-toast-announcer="polite" aria-live="polite">
        {politeAnnouncement}
      </div>
      <div className="sr-only" data-toast-announcer="assertive" aria-live="assertive">
        {assertiveAnnouncement}
      </div>

      {/* `popover="manual"` rather than `"auto"`: an auto popover light-dismisses, so clicking
          anything at all would close the whole stack - which for a notification region is a defect
          rather than the feature it is on a menu. */}
      <div ref={regionRef} popover="manual" className={REGION_CLASS}>
        {toasts.map((toast) => (
          <div key={toast.id} className={TOAST_CLASS[toast.kind]}>
            {toast.kind === 'success' ? (
              <CircleCheck className="size-5 shrink-0" aria-hidden="true" />
            ) : (
              <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
            )}
            <span>{toast.message}</span>
            {/* Named for what it dismisses rather than a bare "Dismiss", which is `PopoverMenu`'s
                rule about a page of identical buttons: with three toasts up, "Dismiss" three times
                tells a screen-reader user which control they are on and nothing about which
                message. A visually hidden span rather than `aria-label`, so
                `getByRole('button', { name: ... })` still reads what is in the DOM. */}
            <button
              type="button"
              // `text-white` again rather than inheriting: `.btn` sets its own `color`, so the
              // container's utility loses to it on specificity. A utility on the button itself wins,
              // because Tailwind's utilities layer outranks daisyUI's component layer - the same
              // mechanism `Modal`'s `translate-none scale-none` relies on.
              //
              // **`aria-disabled` while a modal is open**, because the control is genuinely dead
              // then - see `modalOpen` above. Never `disabled`: that takes it out of the tab order,
              // so a keyboard user meets a gap where this states its condition. The handler is
              // dropped with it, so the attribute and the behaviour cannot disagree.
              aria-disabled={modalOpen || undefined}
              className={
                modalOpen
                  ? 'btn btn-ghost btn-xs btn-circle text-white/50'
                  : 'btn btn-ghost btn-xs btn-circle text-white'
              }
              onClick={modalOpen ? undefined : () => onDismiss(toast.id)}
            >
              <X className="size-4" aria-hidden="true" />
              <span className="sr-only">Dismiss: {toast.message}</span>
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
