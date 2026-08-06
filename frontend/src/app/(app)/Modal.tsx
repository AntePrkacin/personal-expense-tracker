'use client';

import { useEffect, useId, useImperativeHandle, useRef } from 'react';

// The dialog box every modal in the app draws (Figma node 28:384, which is literally named
// "Modal"): the dimmed page behind it, the centred card, the titled header with its close
// button, the body and the right-aligned footer row.
//
// **Built on the native `<dialog>` with `showModal()`**, which is the call `ui/Select.tsx`
// already argues for about native controls: the platform gives the top layer, focus
// containment, Escape, `inert`-equivalent blocking of the page behind, and `::backdrop` -
// none of which a hand-rolled `role="dialog"` gets without a few hundred lines of the least
// reliable code in the category. Two things fall out of the top layer specifically and are
// worth knowing: nothing here picks a z-index, and the box paints over `SidebarNav`'s
// `sticky top-0` with no stacking context to arrange. Verified in Chrome against a sticky
// element at `z-index: 9999`, which the dialog still covers.
//
// **The chrome is stock daisyUI as of PET-57**: `modal` on the dialog, `modal-box` on the
// card, `modal-action` on the footer row. That retired four hard-coded class constants and
// the reasoning behind two of them, because daisyUI's own stylesheet now owns what they
// worked around - it styles the `::backdrop`, centres the box, hides the closed state, and
// gives the box its padding, radius, shadow, width and `max-height`. The two hairline
// dividers went with them: a stock daisyUI modal draws none, and PET-57 hands radius,
// shadow and rules to the theme rather than to Figma's measurements.
//
// **Focus restoration is the one item that was on the platform's list and had to come off
// it.** The platform does restore focus to whatever opened a dialog, and it does not survive
// an owner that unmounts the modal in `onClose` - see the effect below, which is why this
// component writes that part itself.
//
// **It lives here rather than in `components/ui/`.** That folder mirrors the Figma Components
// page and is complete, and this is not a tile. It is not `components/`' case either -
// `AccessCard` is there because it spans route segments in *different* trees with no common
// parent, whereas every frame that draws this box (09, 11, 19, 21 and both delete
// confirmations) sits inside the `(app)` group. So this is `PageHeader`'s situation: the
// signed-in shell's own component, beside the layout. Its stories are filed under **Shell**
// for that reason.
//
// **PET-33 gave it a second shape rather than a second component.** Frame 12 is a centred icon
// circle over a centred title with no X, where every frame before it was a left-aligned title
// with one - so `align` and `icon` arrived. The alternative, a `ConfirmDialog` of its own, would
// have re-implemented the single-exit `close()`, the focus capture and restore below, and the
// backdrop target test: the three least obvious things in this file, duplicated so that one
// dialog could be centred. See `align`'s own note for why the centred shape drops the X.
//
// **Two behaviours this component's suite cannot see**, because jsdom implements neither and
// `jest.setup.ts` deliberately does not fake them: Escape and the focus trap. Both are
// Storybook and manual checks, recorded in `frontend/src/app/CLAUDE.md` and `docs/TODO.md` -
// the same split `BudgetForm`'s caret restore already lives with. It was three until the
// focus restore turned out to need our own code, at which point it became testable.

/**
 * The X, traced from node 28:388: a 10x10 box, two crossing strokes, round caps.
 *
 * `overflow-visible` for the reason `ui/Select`'s chevron leaf and `CategoryChip`'s checkmark
 * both document: an SVG viewport clips its own overflow, and half of a round-capped 1.5
 * stroke falls outside the box at all four ends, so without it every tip renders shorn flat.
 *
 * `currentColor` so the button owns the colour, which under `btn-ghost` means the theme does.
 * The stroke width is inferred rather than read - the frame exports this as a flattened
 * image - and is on the list of things the designer still owes an answer on.
 */
function CloseGlyph() {
  return (
    <svg viewBox="0 0 10 10" className="size-2.5 overflow-visible" fill="none" aria-hidden="true">
      <path
        d="M0 0L10 10M10 0L0 10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

type ModalProps = {
  /** The header's heading, e.g. "Add transaction". Rendered as an `h2`; see below. */
  title: string;
  /**
   * Called once, when the dialog has closed.
   *
   * **The single exit.** Cancel, the X, a backdrop click and Escape all funnel into
   * `close()`, whose `close` event is what invokes this - so there is one path to test and no
   * way for one affordance to close the box while another forgets to tell the caller. The
   * owner is expected to stop rendering this component in response, which is what makes a
   * closed modal render nothing at all.
   */
  onClose: () => void;
  /** The body's rows. Wrapped in the designed gap; pass the fields alone. */
  children: React.ReactNode;
  /**
   * The footer's controls, right-aligned.
   *
   * Required, and named for its position rather than its contents - the call `AccessCard`'s
   * `aboveCard` and `PageHeader`'s `action` both make. Every frame that draws this box draws
   * at least one control here.
   */
  footer: React.ReactNode;
  /**
   * The `id` of the control to focus when the dialog opens.
   *
   * An id rather than a ref, which is not a workaround in this codebase: `ui/FieldShell` makes
   * `id` a required prop precisely so no field needs one, every form declares its ids as
   * module constants, and `ui/Input` exposes no `ref` at all - the same constraint
   * `BudgetForm` works within for its caret restore.
   *
   * **Without it the browser focuses the first tabbable descendant, which is the X.** So a
   * screen reader would announce "Close" on arrival, and frame 09's drawn focused-Amount
   * state - the whole of AC2 - would be false. Passing the amount field's id is what makes
   * the design true.
   */
  initialFocusId?: string;
  /**
   * Submit handler. When present, the body and footer are wrapped in a real `<form>`.
   *
   * `noValidate` comes with it, and both halves are `BudgetForm`'s documented rules: a real
   * form means Enter in any field submits, and `noValidate` stops the browser's own
   * validation bubble firing in place of the designed inline message. The caller still owes
   * `preventDefault()`, since only it knows whether the submit should proceed.
   *
   * Optional because 12 and the category delete confirmation have no form to submit - their
   * footers are two buttons and an action.
   */
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  /**
   * How the header reads, and therefore which frame this is.
   *
   * `'start'` is frames 09, 11, 19 and 21: a left-aligned title with the X beside it, which is
   * what a form in a box wants. `'center'` is frame 12 and the category delete confirmation:
   * the `icon` below in a circle, the title centred under it, and the two footer buttons split
   * evenly across the box. The body's own alignment stays the caller's, because this component
   * has never had an opinion about what goes in `children`.
   *
   * **`'center'` also drops the X, which is the half worth arguing.** Frame 12 draws none, and
   * the reason it can is that its footer is Cancel and Delete rather than a form's Cancel and
   * Save - so the dismissing control is already on screen, named, and the wider of the two.
   * Nothing is lost: Escape and the backdrop still close it, and both go through the same
   * single exit. A confirmation with three ways to say no and one to say yes is also the wrong
   * shape; the X was the third.
   */
  align?: 'start' | 'center';
  /**
   * The glyph above the title, in a tinted circle. `align="center"` only.
   *
   * Drawn by the caller rather than named by a prop, so this file needs no icon vocabulary and
   * the category delete confirmation can pass a different mark. The circle, its size and its
   * tint are here, because they are the box's chrome rather than the caller's.
   */
  icon?: React.ReactNode;
  /**
   * Exposes `close()` so a caller can dismiss the dialog itself.
   *
   * **The point is that it closes the dialog rather than unmounting it**, and the difference
   * is the browser's focus restore. `AddTransactionModal` needs this on a successful save: it
   * could simply call its own `onClose` and let the owner stop rendering it, but removing an
   * open dialog from the DOM skips the platform's "return focus to whatever opened this"
   * behaviour, so the user would be left with focus on `<body>` after logging an expense. Going
   * through `close()` fires the `close` event, which is `onClose`, which unmounts it - so the
   * one-exit rule still holds and this adds a way in, not a second way out.
   */
  ref?: React.Ref<ModalHandle>;
};

/** What `ref` exposes. One method, because there is one thing a caller cannot already do. */
export type ModalHandle = { close: () => void };

export function Modal({
  title,
  onClose,
  children,
  footer,
  initialFocusId,
  onSubmit,
  align = 'start',
  icon,
  ref,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  /**
   * The heading's id, generated rather than required.
   *
   * `ui/FieldShell` bans `useId` because it would force `'use client'` onto the whole field
   * layer; this component already carries the directive, so the objection does not apply. And
   * it must be generated rather than a constant: frame 11 opening frame 12 is a real
   * two-dialog case, and a hard-coded id would collide the moment both are mounted.
   */
  const titleId = useId();

  /** Whatever had focus when this opened, so closing can hand it back. See the effect below. */
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Captured before anything below moves focus, and only on the first run: `??=` is what keeps
    // a re-render from recording the Amount field as "where the user came from".
    restoreFocusTo.current ??= document.activeElement as HTMLElement | null;

    // Guarded because `showModal()` on an already-open dialog throws InvalidStateError, and
    // this effect re-runs if `initialFocusId` changes. Re-running should only move focus.
    if (!dialog.open) dialog.showModal();

    if (initialFocusId) document.getElementById(initialFocusId)?.focus();
  }, [initialFocusId]);

  /**
   * Hands focus back to whatever opened this, on unmount.
   *
   * **The platform does this itself, and in this architecture that is not enough** - which was
   * found by walking the real thing in Chrome rather than by reading the spec. `close()` fires
   * the `close` event, `onClose` is where the owner stops rendering the modal, and React does
   * that *synchronously inside the event dispatch* - so the dialog is detached before the
   * browser's own focus-restore step completes, and focus lands on `<body>` instead. The next
   * Tab then starts from the top of the page.
   *
   * Doing it here rather than in `close()` covers every exit, including the ones this component
   * never sees: Escape, and an owner that unmounts the modal for its own reasons.
   *
   * **`isConnected` is the one case that legitimately cannot be restored**, and it is real rather
   * than defensive: saving from the Transactions empty state replaces the card holding the button
   * that opened this, so there is nothing left to focus. `docs/TODO.md` records that gap.
   *
   * Re-focusing an element the browser already restored is a no-op, so this is safe when it
   * happens to be redundant.
   *
   * **Expect one focus bounce in development and none in production.** `next.config.ts` sets no
   * `reactStrictMode`, so it defaults to true, and StrictMode double-invokes effects as
   * mount -> cleanup -> mount. That cleanup runs this restore, so focus goes trigger -> Amount ->
   * trigger -> Amount before settling. The end state is correct and the build is unaffected;
   * it is written down so nobody spends an afternoon chasing a flicker that only exists behind
   * `npm run dev`.
   */
  useEffect(
    () => () => {
      const target = restoreFocusTo.current;
      if (target?.isConnected) target.focus();
    },
    [],
  );

  /** Every affordance goes through here. Escape needs no code: the UA's own default calls it. */
  function close() {
    dialogRef.current?.close();
  }

  // React 19 takes `ref` as an ordinary prop, so no forwardRef wrapper is needed.
  useImperativeHandle(ref, () => ({ close }));

  /**
   * A click on the dimmed area outside the box, and the target test is the whole of it.
   *
   * A click on `::backdrop` reports the dialog element itself as its target, while a click on
   * anything inside reports that child - and daisyUI's `.modal` makes the dialog a full-viewport
   * container whose only child is `modal-box`, so everything with padding on it is a child and
   * the only thing left for the dialog itself to receive is a click beside the box.
   *
   * Known limitation, worth a comment rather than a fix: a press that starts inside the box and
   * releases outside it also lands here. Pairing `pointerdown` with `click` is the mitigation
   * if it ever proves annoying. Note also that this is the one affordance that can discard a
   * half-typed form by accident - AC7 asks for it and A19 calls it standard behaviour, so it
   * ships, but the ticket carries the flag.
   */
  function onDialogClick(event: React.MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) close();
  }

  const content = (
    <>
      {/* `modal-box` owns the padding now, so the body only spaces its own rows: gap-4 is node
          28:390's 16, and the vertical padding is what separates them from the header above and
          the footer's own `modal-action` margin below. */}
      <div className="flex flex-col gap-4 py-4">{children}</div>
      {/* `modal-action` is daisyUI's footer row: right-aligned, gapped, spaced off the body.
          Frame 11 is what will change that - it puts a "Delete transaction" text button at the
          left of this row, which is `modal-action` plus a `justify-between`, and a Record keyed
          by alignment is the shape then. One consumer, one literal, for now.

          Frame 12 does not change it either, though it looks as if it should: it draws two
          equal buttons filling the box's width, which `modal-action` plus `*:flex-1` gives
          without a second alignment. `align` carries that rather than a third prop, because the
          two always travel together - a centred confirmation is exactly the one with a split
          footer. */}
      <div className={align === 'center' ? 'modal-action *:flex-1' : 'modal-action'}>{footer}</div>
    </>
  );

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={onDialogClick}
      aria-labelledby={titleId}
      className="modal"
    >
      {/* `translate-none scale-none` trades daisyUI's entrance animation away, and it is not
          optional: `.modal-box` rests at `scale: .95` and opens to `scale: 1`, and any non-none
          `scale`/`translate` makes this element the containing block for `position: fixed`
          descendants - so DateField's fixed-positioned calendar popover would be laid out
          relative to this box and then scrolled by its `overflow-y: auto`, instead of
          overlaying the modal from the viewport. Walked in Chrome: without these two classes,
          opening the Date field scrolls the whole box sideways. Tailwind's utilities layer
          outranks daisyUI's component layer, which is what lets two utilities beat the
          open-state rule. */}
      <div className="modal-box translate-none scale-none">
        {align === 'center' ? (
          // Frame 12's header: the glyph in its circle, the title under it, both centred, and
          // no X - see `align`'s note for why losing it costs nothing. `bg-error/10` is the
          // frame's own tinted circle expressed as the theme's error colour at a tenth, so it
          // follows light and dark instead of pinning the frame's pink; `text-error` is what
          // the caller's `currentColor` glyph then picks up.
          <div className="flex flex-col items-center gap-4 text-center">
            {icon === undefined ? null : (
              <span
                aria-hidden="true"
                className="bg-error/10 text-error flex size-14 items-center justify-center rounded-full"
              >
                {icon}
              </span>
            )}
            <h2 id={titleId} className="text-lg font-bold">
              {title}
            </h2>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            {/* An h2, not an h1. PageHeader owns the page's only h1, and (app)/pages.test.tsx
                asserts there is exactly one - so a modal heading has to sit below it. */}
            <h2 id={titleId} className="text-lg font-bold">
              {title}
            </h2>

            {/* Not a `ui/Button`. Its `label` prop is required and renders as visible text, and
                its own doc says "nothing in the design is icon-only" - this is the exception that
                proves it, so forcing it through would mean either a visible label or weakening a
                prop that is right for every other control. daisyUI's own close-corner idiom
                instead, minus the absolute positioning, because the header row already has a slot
                for it. A visually hidden span rather than `aria-label`, which keeps
                getByRole('button', { name: 'Close' }) true. */}
            <button type="button" onClick={close} className="btn btn-sm btn-circle btn-ghost">
              <CloseGlyph />
              <span className="sr-only">Close</span>
            </button>
          </div>
        )}

        {onSubmit ? (
          <form noValidate onSubmit={onSubmit}>
            {content}
          </form>
        ) : (
          content
        )}
      </div>
    </dialog>
  );
}
