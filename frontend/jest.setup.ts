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
//   - Escape, which in a browser fires `cancel`, whose default action calls close().
//
// **Focus restoration used to be on that list and no longer is.** The platform does restore
// focus to whatever opened a dialog, so `Modal` originally wrote no code for it - and walking
// the real thing in Chrome showed focus landing on `<body>` instead, because `onClose` is where
// the owner unmounts the modal and React does that synchronously inside the event dispatch, so
// the dialog detaches before the browser's restore step completes. `Modal` now captures and
// restores it, which means it is our behaviour and therefore assertable: see "focus on close" in
// Modal.test.tsx.
//
// **Escape is left out on purpose, and that is the load-bearing decision.** Faking
// keydown -> cancel -> close would turn AC7's "Escape closes the modal" into a test
// of these few lines, passing just as happily with the real handler deleted. So the
// suite asserts the wiring it can see - that a native `close` event unmounts and
// calls `onClose` exactly once - and Escape and the trap are checked in Storybook
// and by hand. `frontend/src/app/CLAUDE.md` records that split, and it is
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

// ---------------------------------------------------------------------------
// ResizeObserver, which jsdom does not implement either, for Recharts.
//
// PET-22's retrofit put the dashboard charts on Recharts, whose
// `ResponsiveContainer` measures its box and renders no SVG children at all until
// that measurement comes back nonzero. jsdom runs no layout, so every
// `getBoundingClientRect()` is 0x0 forever and `window.ResizeObserver` is
// `undefined` - both verified in this repo before writing this, not assumed.
//
// **The failure this prevents is a silent one, which is why it is here rather
// than in one suite.** Recharts does not throw when `ResizeObserver` is missing;
// it renders nothing and resolves happily. So a chart test written without this
// finds zero bars and passes every assertion that counts them, which is worse
// than a red suite. The smoke test that established this logged `svg count: 0`
// against a chart that renders four bars in a browser.
//
// **Scoped to the observed element, deliberately.** The stub goes onto the node
// Recharts actually calls `.observe()` on, never onto `Element.prototype`. A
// global `getBoundingClientRect` override would hand every other suite in the app
// a fake layout - jsdom's honest zero is load-bearing elsewhere, and this repo has
// already shipped one defect (PET-22's flex-shrunk bars) that a fake measurement
// would have hidden rather than revealed.
//
// **The size is arbitrary and no test may read meaning into it.** It exists to be
// nonzero. What a suite may assert is that the right number of bars rendered with
// the right fills and the right labels; what it may never assert is a width, a
// height or a proportion, because those are this constant rather than the
// browser's layout. Chart geometry is a browser check, on the same list as
// `Modal`'s Escape and `BudgetForm`'s caret restore - `TrendCard.test.tsx` says so
// at its own call sites.
// ---------------------------------------------------------------------------
if (typeof window !== 'undefined' && typeof window.ResizeObserver === 'undefined') {
  const OBSERVED_WIDTH = 400;
  const OBSERVED_HEIGHT = 300;

  const fakeRect = (): DOMRect =>
    ({
      width: OBSERVED_WIDTH,
      height: OBSERVED_HEIGHT,
      top: 0,
      left: 0,
      right: OBSERVED_WIDTH,
      bottom: OBSERVED_HEIGHT,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;

  class ResizeObserverStub implements ResizeObserver {
    private readonly callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }

    observe(target: Element) {
      // Both channels, because which one a given Recharts version reads is an
      // implementation detail: the entry's `contentRect` and the element's own
      // `getBoundingClientRect`. Supplying one and guessing right is the kind of
      // thing that breaks on a minor upgrade with no test able to say why.
      Object.defineProperty(target, 'getBoundingClientRect', {
        configurable: true,
        value: fakeRect,
      });

      this.callback([{ target, contentRect: fakeRect() } as ResizeObserverEntry], this);
    }

    unobserve() {}

    disconnect() {}
  }

  window.ResizeObserver = ResizeObserverStub;
}
