'use client';

import { useEffect, useId, useImperativeHandle, useRef } from 'react';

// The dialog box every modal in the app draws (Figma node 28:384, which is literally named
// "Modal"): the scrim, the centred 520px card, the titled header with its close button, the
// two hairline dividers, the padded body and the right-aligned footer row.
//
// **Built on the native `<dialog>` with `showModal()`**, which is the call `ui/Select.tsx`
// already argues for about native controls: the platform gives the top layer, focus
// containment, Escape, restoring focus to whatever opened it, `inert`-equivalent blocking of
// the page behind, and `::backdrop` - none of which a hand-rolled `role="dialog"` gets
// without a few hundred lines of the least reliable code in the category. Two things fall out
// of the top layer specifically and are worth knowing: nothing here picks a z-index, and the
// box paints over `SidebarNav`'s `sticky top-0` with no stacking context to arrange.
//
// **It lives here rather than in `components/ui/`.** That folder mirrors the Figma Components
// page and is complete, and this is not a tile. It is not `components/`' case either -
// `AccessCard` is there because it spans route segments in *different* trees with no common
// parent, whereas every frame that draws this box (09, 11, 19, 21 and both delete
// confirmations) sits inside the `(app)` group. So this is `PageHeader`'s situation: the
// signed-in shell's own component, beside the layout. Its stories are filed under **Shell**
// for that reason.
//
// **Three behaviours this component's suite cannot see**, because jsdom implements none of
// them and `jest.setup.ts` deliberately does not fake them: Escape, the focus trap, and focus
// returning to the trigger. They are Storybook and manual checks, recorded in
// `frontend/src/app/CLAUDE.md` and `docs/TODO.md`. The same split `BudgetForm`'s caret
// restore already lives with.

/**
 * The scrim.
 *
 * An arbitrary literal rather than a Foundations colour token, deliberately. The value is an
 * eyedropped frame fill on node 28:383 that is **not** `Surface/Ink` (#101720 against this
 * rgb(10, 15, 23)), it carries alpha where every `--color-*` token is opaque, and
 * `globals.test.ts` cross-checks the colour list against the Foundations Colour story - so
 * promoting it would put a translucent swatch on a page that draws no such thing. This is the
 * PET-8 side of the precedent: ship the literal, let a later ticket promote it if the
 * designer binds a variable. `docs/TODO.md` records it beside the unbound circle hex, and
 * `ui/utilities.test.ts` compiles it so it cannot silently generate nothing.
 *
 * Exported for that test rather than inlined, which is the rule `frontend/CLAUDE.md` sets for
 * every hard-coded class: a complete literal string, never interpolated.
 */
export const MODAL_BACKDROP = 'backdrop:bg-[rgba(10,15,23,0.5)]';

/**
 * The box itself, and two of these classes are load-bearing in a way that is invisible on
 * reading.
 *
 * **`m-auto` is mandatory.** Tailwind's preflight sets `margin: 0` on `*` and on `::backdrop`,
 * which overrides the user agent's own `dialog { margin: auto }` - and that rule is the entire
 * centring mechanism for a modal dialog. Without this class the box pins to the top-left
 * corner of the viewport, with nothing in the markup looking wrong.
 *
 * **`open:flex`, never a bare `flex`.** The UA hides a closed dialog with
 * `dialog:not([open]) { display: none }`, and an unconditional `display: flex` outranks it -
 * so the box would be visible for the frame between mount and the effect below running.
 * Scoping the display to the open state means the element is laid out only while it is
 * actually open.
 *
 * **No `overflow-clip`**, although Figma reports it on this frame. It would clip the footer
 * buttons' `focus-visible:outline-offset-2` rings, which is exactly why `AccessCard` omits it
 * too. The UA's own `dialog:modal { max-height: …; overflow: auto }` survives preflight, so a
 * viewport shorter than the box scrolls the box rather than losing its footer.
 */
export const MODAL_BOX = 'm-auto w-130 flex-col rounded-xl bg-surface-card shadow-modal open:flex';

/**
 * The 1px `Border/Subtle` rules under the header and above the footer.
 *
 * Two elements rather than `divide-y` on the dialog, because the optional `<form>` below
 * changes the box's child count - so `divide-y` would draw one line in the form case and two
 * in the other. An `<hr>` was the other candidate and publishes a `separator` to the
 * accessibility tree that the design does not intend.
 *
 * Exported so `ui/utilities.test.ts` compiles it; `bg-border-subtle` is this component's own
 * first use of that token.
 */
export const MODAL_DIVIDER = 'bg-border-subtle h-px w-full';

/**
 * The 34px close target (node 28:387).
 *
 * `cursor-pointer` is **not** redundant here, and this is the one place in the app where
 * forgetting it is easy: `BUTTON_BASE` is not in play because this is not a `ui/Button`, and
 * the user agent draws an arrow over a `<button>`. That is the defect PET-10 fixed app-wide.
 *
 * The focus ring is the repo's standard `focus-visible:` trio. No hover or pressed treatment,
 * because the file draws none - one of the answers `docs/TODO.md` records as owed.
 */
export const MODAL_CLOSE =
  'inline-flex size-8.5 shrink-0 cursor-pointer items-center justify-center rounded-full ' +
  'bg-surface-muted text-text-secondary focus-visible:outline-brand-accent ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2';

/**
 * The X, traced from node 28:388: a 10x10 box, two crossing strokes, round caps.
 *
 * `overflow-visible` for the reason `ui/Select`'s chevron and `CategoryChip`'s checkmark both
 * document: an SVG viewport clips its own overflow, and half of a round-capped 1.5 stroke
 * falls outside the box at all four ends, so without it every tip renders shorn flat.
 *
 * `currentColor` so the button owns the colour. The stroke width and that colour are both
 * inferred rather than read - the frame exports this as a flattened image - and are on the
 * list of things the designer still owes an answer on.
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
  /** The body's rows. Wrapped in the designed padding and 16px gap; pass the fields alone. */
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
   * An id rather than a ref, which is not a workaround in this codebase: `ui/Field` makes `id`
   * a required prop precisely so no field needs one, every form declares its ids as module
   * constants, and `ui/Input` exposes no `ref` at all - the same constraint `BudgetForm`
   * works within for its caret restore.
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
  ref,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  /**
   * The heading's id, generated rather than required.
   *
   * `ui/Field` bans `useId` because it would force `'use client'` onto the whole field layer;
   * this component already carries the directive, so the objection does not apply. And it must
   * be generated rather than a constant: frame 11 opening frame 12 is a real two-dialog case,
   * and a hard-coded id would collide the moment both are mounted.
   */
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Guarded because `showModal()` on an already-open dialog throws InvalidStateError, and
    // this effect re-runs if `initialFocusId` changes. Re-running should only move focus.
    if (!dialog.open) dialog.showModal();

    if (initialFocusId) document.getElementById(initialFocusId)?.focus();
  }, [initialFocusId]);

  /** Every affordance goes through here. Escape needs no code: the UA's own default calls it. */
  function close() {
    dialogRef.current?.close();
  }

  // React 19 takes `ref` as an ordinary prop, so no forwardRef wrapper is needed.
  useImperativeHandle(ref, () => ({ close }));

  /**
   * A click on the scrim, and the target test is the whole of it.
   *
   * A click on `::backdrop` reports the dialog element itself as its target, while a click on
   * anything inside reports that child - and the box carries no padding of its own, because
   * the header, body and footer hold all of it, so there is no band of dialog left for a stray
   * click to land on.
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
      {/* px-6 py-5.5 and gap-4 are node 28:390's own 24 / 22 / 16. */}
      <div className="flex w-full flex-col gap-4 px-6 py-5.5">{children}</div>
      <div className={MODAL_DIVIDER} />
      {/* justify-end is hard-coded, and frame 11 is what will change that: it puts a
          "Delete transaction" text button at the left of this row. A Record keyed by
          alignment is the shape then, exactly the sequence STEP_WIDTH went through when a
          second width appeared. One consumer, one literal, for now. */}
      <div className="flex w-full justify-end gap-3 px-6 pt-4.5 pb-5.5">{footer}</div>
    </>
  );

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={onDialogClick}
      aria-labelledby={titleId}
      className={`${MODAL_BOX} ${MODAL_BACKDROP}`}
    >
      {/* The designed padding is asymmetric: 24 left against 20 right, because the close
          target carries its own visual inset (node 28:385). */}
      <div className="flex w-full items-center justify-between pt-5.5 pr-5 pb-4.5 pl-6">
        {/* An h2, not an h1. PageHeader owns the page's only h1, and (app)/pages.test.tsx
            asserts there is exactly one - so a modal heading has to sit below it. */}
        <h2 id={titleId} className="text-heading-l text-text-primary">
          {title}
        </h2>

        {/* Not a `ui/Button`. Its `label` prop is required and renders as visible text, and
            its own doc says "nothing in the design is icon-only" - this is the exception that
            proves it, so forcing it through would mean either a visible label or weakening a
            prop that is right for every other control. A visually hidden span rather than
            `aria-label`, which keeps getByRole('button', { name: 'Close' }) true. */}
        <button type="button" onClick={close} className={MODAL_CLOSE}>
          <CloseGlyph />
          <span className="sr-only">Close</span>
        </button>
      </div>

      <div className={MODAL_DIVIDER} />

      {onSubmit ? (
        <form noValidate onSubmit={onSubmit} className="flex w-full flex-col">
          {content}
        </form>
      ) : (
        content
      )}
    </dialog>
  );
}
