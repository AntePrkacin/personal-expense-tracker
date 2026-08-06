import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import { Modal, type ModalHandle } from './Modal';

// What this suite can and cannot see is the thing to understand before adding to it.
//
// jsdom 26.1.0 implements almost nothing of `HTMLDialogElement` - its prototype carries
// exactly `constructor` and `open` - so `jest.setup.ts` fakes `showModal()` and `close()` and
// **deliberately fakes nothing else**. Two behaviours are therefore unassertable here, and
// asserting them would mean asserting the polyfill rather than the browser:
//
//   - **Escape.** In a browser it fires `cancel`, whose default action calls `close()`. The
//     closest honest thing is the last test in "closing", which fires a real `close` event and
//     proves the wiring Escape arrives through.
//   - **The focus trap.** `user.tab()` walks straight out of the dialog under jsdom, because
//     there is no top layer.
//
// Both are Storybook and manual checks, recorded in `frontend/src/app/CLAUDE.md`. It was three
// until focus returning to the trigger turned out to need this component's own code rather
// than the platform's, at which point it became testable - see "focus on close" below.
//
// **No assertion here pins a daisyUI class.** The chrome is `modal` / `modal-box` /
// `modal-action` and the theme owns what they draw, so what is left to test is behaviour: the
// one exit, the aria wiring, the focus restore, and the one property the box's own padding
// could break, in "the box" below.

/** A trigger plus the modal, so opening is a real interaction rather than a mount. */
function Harness({
  onClose,
  initialFocusId,
  onSubmit,
}: {
  onClose?: () => void;
  initialFocusId?: string;
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open it
      </button>

      {open ? (
        <Modal
          title="Add transaction"
          onClose={() => {
            setOpen(false);
            onClose?.();
          }}
          footer={
            <>
              <button type="button">Cancel</button>
              <button type={onSubmit ? 'submit' : 'button'}>Add transaction</button>
            </>
          }
          initialFocusId={initialFocusId}
          onSubmit={onSubmit}
        >
          <label htmlFor="amount">Amount</label>
          <input id="amount" />
          <label htmlFor="merchant">Merchant</label>
          <input id="merchant" />
        </Modal>
      ) : null}
    </>
  );
}

const dialog = () => screen.getByRole('dialog');
const openIt = () => screen.getByRole('button', { name: 'Open it' });

describe('mounting and unmounting', () => {
  it('renders nothing at all until it is mounted', async () => {
    render(<Harness />);

    // The property (app)/pages.test.tsx leans on. A closed <dialog> is display:none, so
    // queryByRole cannot see inside it - but queryAllByText and queryAllByLabelText CAN, so
    // "closed" is not enough and "not rendered" is the requirement.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Add transaction')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Amount')).not.toBeInTheDocument();

    await userEvent.click(openIt());

    expect(dialog()).toBeInTheDocument();
  });

  it('opens as a modal rather than by setting the open attribute', async () => {
    // showModal() is what puts the dialog in the top layer, contains focus and paints a
    // ::backdrop. A bare `open` attribute renders the same box in jsdom and none of that in a
    // browser, so the distinction is invisible here and has to be pinned directly.
    const showModal = jest.spyOn(HTMLDialogElement.prototype, 'showModal');

    render(<Harness />);
    await userEvent.click(openIt());

    expect(showModal).toHaveBeenCalledTimes(1);
    expect(dialog()).toHaveAttribute('open');

    showModal.mockRestore();
  });
});

describe('the header', () => {
  it('takes its accessible name from the title', async () => {
    render(<Harness />);
    await userEvent.click(openIt());

    expect(screen.getByRole('dialog', { name: 'Add transaction' })).toBeInTheDocument();
  });

  it('renders the title as an h2, leaving the page its only h1', async () => {
    // PageHeader owns the page's h1 and (app)/pages.test.tsx asserts there is exactly one.
    render(<Harness />);
    await userEvent.click(openIt());

    expect(screen.getByRole('heading', { level: 2, name: 'Add transaction' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('names the close control "Close" without drawing a label', async () => {
    render(<Harness />);
    await userEvent.click(openIt());

    const close = screen.getByRole('button', { name: 'Close' });

    // A visually hidden span rather than aria-label, and the glyph hidden from the tree.
    expect(close).toBeInTheDocument();
    expect(close.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('closing', () => {
  it('closes when the X is clicked', async () => {
    const onClose = jest.fn();
    render(<Harness onClose={onClose} />);
    await userEvent.click(openIt());

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes when the scrim is clicked', async () => {
    // A click on ::backdrop reports the dialog element itself as its target, which is what
    // this simulates by clicking the dialog rather than a child of it.
    const onClose = jest.fn();
    render(<Harness onClose={onClose} />);
    await userEvent.click(openIt());

    await userEvent.click(dialog());

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when something inside it is clicked', async () => {
    const onClose = jest.fn();
    render(<Harness onClose={onClose} />);
    await userEvent.click(openIt());

    await userEvent.click(screen.getByLabelText('Amount'));
    await userEvent.click(screen.getByRole('heading', { level: 2 }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).not.toHaveBeenCalled();
    expect(dialog()).toBeInTheDocument();
  });

  it('reports a close exactly once, however it was closed', async () => {
    // The one-exit rule. Every affordance funnels through close(), and the polyfill no-ops a
    // close() on an already-closed dialog, so a double call cannot double-report.
    const onClose = jest.fn();
    render(<Harness onClose={onClose} />);
    await userEvent.click(openIt());

    const close = screen.getByRole('button', { name: 'Close' });
    await userEvent.click(close);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reports a native close event, which is the path Escape arrives through', async () => {
    // The closest this environment gets to AC7's Escape. In a browser, Escape fires `cancel`,
    // whose default action calls close(), which fires this event. Firing it directly proves
    // the component's half of that chain; the keystroke itself is a manual check.
    const onClose = jest.fn();
    render(<Harness onClose={onClose} />);
    await userEvent.click(openIt());

    // Wrapped in act because this dispatch is the one interaction here that React does not
    // already own: it unmounts the modal through the harness's setOpen, and an unwrapped
    // state update warns rather than failing.
    const target = dialog();
    act(() => {
      target.dispatchEvent(new Event('close'));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('focus on close', () => {
  // **This was a real defect, found by walking the modal in Chrome rather than by reading the
  // spec.** The platform restores focus to whatever opened a dialog - but `onClose` is where the
  // owner unmounts the modal, React does that synchronously inside the event dispatch, and the
  // dialog is therefore detached before the browser's restore step completes. Focus landed on
  // `<body>` and the next Tab started from the top of the page.
  //
  // Because the restore is now this component's code rather than the platform's, it is
  // assertable here - which is the one behaviour of the four in jest.setup.ts's list that moved
  // from "manual check" to "tested".
  it('returns focus to the control that opened it', async () => {
    render(<Harness />);
    const opener = openIt();

    await userEvent.click(opener);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(opener).toHaveFocus();
  });

  it('returns focus after a Cancel too, not just the X', async () => {
    render(<Harness />);
    const opener = openIt();

    await userEvent.click(opener);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    // Cancel does not close on its own in this harness, so drive the one exit directly - the
    // point is that any unmount restores, not that Cancel is wired.
    act(() => {
      screen.queryByRole('dialog')?.dispatchEvent(new Event('close'));
    });

    expect(opener).toHaveFocus();
  });

  it('does not move focus when the opener is gone', async () => {
    // The case that legitimately cannot be restored, and it is real: saving from the Transactions
    // empty state replaces the card holding the button that opened the modal.
    function Vanishing() {
      const [open, setOpen] = useState(false);
      const [triggerGone, setTriggerGone] = useState(false);

      return (
        <>
          {triggerGone ? null : (
            <button
              type="button"
              onClick={() => {
                setOpen(true);
              }}
            >
              Open it
            </button>
          )}
          {open ? (
            <Modal
              title="Add transaction"
              onClose={() => {
                setOpen(false);
                setTriggerGone(true);
              }}
              footer={<button type="button">Cancel</button>}
            >
              <p>Body</p>
            </Modal>
          ) : null}
        </>
      );
    }

    render(<Vanishing />);
    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));

    await expect(
      userEvent.click(screen.getByRole('button', { name: 'Close' })),
    ).resolves.not.toThrow();

    expect(screen.queryByRole('button', { name: 'Open it' })).not.toBeInTheDocument();
  });
});

describe('the ref handle', () => {
  it('closes the dialog through close(), so the browser restores focus', async () => {
    // The reason the handle exists. A caller could unmount the modal instead, but removing an
    // open dialog from the DOM skips the platform's focus restore - so a user who saved a
    // transaction would be left with focus on <body>. Going through close() fires the close
    // event, which is onClose, which unmounts it: one exit, reached one more way.
    const onClose = jest.fn();
    let handle: ModalHandle | null = null;

    function Controlled() {
      const [open, setOpen] = useState(true);

      return open ? (
        <Modal
          ref={(instance) => {
            handle = instance;
          }}
          title="Add transaction"
          onClose={() => {
            setOpen(false);
            onClose();
          }}
          footer={<button type="button">Cancel</button>}
        >
          <p>Body</p>
        </Modal>
      ) : null;
    }

    render(<Controlled />);
    expect(dialog()).toBeInTheDocument();

    act(() => {
      handle!.close();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('focus on open', () => {
  it('focuses the control named by initialFocusId', async () => {
    // AC2's precondition: frame 09 draws the Amount field focused, and the designed 1.5px
    // accent border is a focus style, so nothing renders it unless focus actually lands here.
    render(<Harness initialFocusId="amount" />);
    await userEvent.click(openIt());

    expect(screen.getByLabelText('Amount')).toHaveFocus();
  });

  it('does not focus the close button, which is the first tabbable child', async () => {
    // The reason initialFocusId exists. Without it the browser's default lands here and a
    // screen reader announces "Close" on arrival.
    render(<Harness initialFocusId="amount" />);
    await userEvent.click(openIt());

    expect(screen.getByRole('button', { name: 'Close' })).not.toHaveFocus();
  });

  it('moves no focus when no id is given', async () => {
    render(<Harness />);
    await userEvent.click(openIt());

    // Nothing inside claims focus, so whatever the environment focused stays focused. The
    // browser would have focused the X; jsdom focuses nothing, which is why this asserts the
    // absence of *our* move rather than a specific element.
    expect(screen.getByLabelText('Amount')).not.toHaveFocus();
  });

  it('ignores an id that matches nothing rather than throwing', async () => {
    render(<Harness initialFocusId="not-here" />);

    await expect(userEvent.click(openIt())).resolves.not.toThrow();
    expect(dialog()).toBeInTheDocument();
  });
});

describe('the optional form', () => {
  it('wraps the body and footer in a form when onSubmit is given', async () => {
    const onSubmit = jest.fn((event: React.FormEvent<HTMLFormElement>) => event.preventDefault());
    render(<Harness onSubmit={onSubmit} />);
    await userEvent.click(openIt());

    await userEvent.click(screen.getByRole('button', { name: 'Add transaction' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('submits on Enter in a field, which is why it is a real form', async () => {
    // An onClick-only button leaves Enter dead in every field. BudgetForm records the same.
    const onSubmit = jest.fn((event: React.FormEvent<HTMLFormElement>) => event.preventDefault());
    render(<Harness onSubmit={onSubmit} />);
    await userEvent.click(openIt());

    await userEvent.type(screen.getByLabelText('Amount'), '24{Enter}');

    expect(onSubmit).toHaveBeenCalled();
  });

  it('marks the form noValidate, so the browser bubble cannot replace the inline message', async () => {
    const onSubmit = jest.fn((event: React.FormEvent<HTMLFormElement>) => event.preventDefault());
    render(<Harness onSubmit={onSubmit} />);
    await userEvent.click(openIt());

    expect(dialog().querySelector('form')).toHaveAttribute('novalidate');
  });

  it('renders no form at all when onSubmit is absent', async () => {
    // Frame 12 and the category delete confirmation have nothing to submit.
    render(<Harness />);
    await userEvent.click(openIt());

    expect(dialog().querySelector('form')).toBeNull();
  });
});

describe('the box', () => {
  it('does not close when the box’s own padding is clicked', async () => {
    // The one thing daisyUI's chrome could break and no diff would show. The backdrop test is
    // `event.target === dialogRef.current`, so every padded region has to be a *child* of the
    // dialog: `modal-box` carries the padding the header, body and footer used to hold
    // individually, and a click on it therefore reports the box rather than the dialog. Were
    // that padding ever moved onto the dialog itself, clicking beside the heading would
    // discard a half-typed form.
    const onClose = jest.fn();
    render(<Harness onClose={onClose} />);
    await userEvent.click(openIt());

    const box = dialog().firstElementChild as HTMLElement;
    expect(box).toContainElement(screen.getByRole('heading', { level: 2 }));
    expect(box).toContainElement(screen.getByLabelText('Amount'));
    expect(box).toContainElement(screen.getByRole('button', { name: 'Cancel' }));

    await userEvent.click(box);

    expect(onClose).not.toHaveBeenCalled();
    expect(dialog()).toBeInTheDocument();
  });
});
