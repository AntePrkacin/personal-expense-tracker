// Adds custom DOM matchers (e.g. toBeInTheDocument, toHaveTextContent) to expect().
import '@testing-library/jest-dom';

// ---------------------------------------------------------------------------
// HTMLDialogElement.showModal / close, which jsdom does not implement.
//
// `(app)/Modal.tsx` is built on the native <dialog>, for the reason ui/Select.tsx
// gives about native controls generally: the top layer, focus containment, Escape
// and ::backdrop come from the platform instead of from several hundred lines of
// ours. jsdom 26.1.0 ships the element but almost none of the behaviour -
// `Object.getOwnPropertyNames(HTMLDialogElement.prototype)` is exactly
// `['constructor', 'open']` - so without this, every suite that mounts a modal dies
// on "showModal is not a function" rather than on anything it meant to assert.
//
// **What this fakes is deliberately minimal: two methods and the `open` attribute.**
// It does NOT fake, and no test may assume:
//
//   - the top layer, so nothing here proves the modal paints above the sidebar;
//   - focus containment, so `user.tab()` walks straight out of the dialog;
//   - focus restoration to the trigger on close, which the browser does and we
//     write no code for;
//   - Escape, which in a browser fires `cancel`, whose default action calls close().
//
// **Escape is left out on purpose, and that is the load-bearing decision.** Faking
// keydown -> cancel -> close would turn AC7's "Escape closes the modal" into a test
// of these few lines, passing just as happily with the real handler deleted. So the
// suite asserts the wiring it can see - that a native `close` event unmounts and
// calls `onClose` exactly once - and Escape, the trap and the restore are checked in
// Storybook and by hand. `frontend/src/app/CLAUDE.md` records that split, and it is
// the same call BudgetForm's caret restore already documents: jsdom cannot observe
// the outcome, so assert the wiring and eyeball the behaviour.
//
// The guard means this evaporates the day jsdom implements the real thing, rather
// than shadowing it with a worse version. `typeof` rather than a bare truthiness
// test because TypeScript rejects the latter on a non-optional method (TS2774).
// ---------------------------------------------------------------------------
if (
  typeof HTMLDialogElement !== 'undefined' &&
  typeof HTMLDialogElement.prototype.showModal !== 'function'
) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    // Only the attribute. No focus move: the component focuses `initialFocusId`
    // itself, which is the half a test can honestly assert, and inventing the
    // browser's default here would hide it if the component stopped doing so.
    this.setAttribute('open', '');
  };

  HTMLDialogElement.prototype.close = function close(
    this: HTMLDialogElement,
    returnValue?: string,
  ) {
    // A close() on an already-closed dialog is a no-op per spec, and that matters
    // rather than being pedantry: Modal funnels Cancel, the X, the backdrop click
    // and `cancel` into one exit, so a second call is an ordinary path and must not
    // fire `onClose` twice.
    if (!this.hasAttribute('open')) return;

    this.removeAttribute('open');
    if (returnValue !== undefined) this.returnValue = returnValue;

    // Non-bubbling, exactly like the real event. React lists `close` among its
    // non-delegated events, so `onClose` is attached to the element itself rather
    // than to the root - which is what lets a non-bubbling dispatch reach it.
    this.dispatchEvent(new Event('close'));
  };
}
