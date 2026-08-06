import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import { Modal, type ModalHandle, type ModalShape } from './Modal';

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
  shape = { align: 'start' },
}: {
  onClose?: () => void;
  initialFocusId?: string;
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  /**
   * The header shape, spread into `Modal` as one value rather than two loose props.
   *
   * It has to be the union's own type: `Modal`'s `align` and `icon` became exclusive so that
   * `icon` without `align="center"` is a build error, and a harness holding them as two
   * independent optionals reconstructs exactly the impossible pair the union exists to reject.
   * `npx tsc --noEmit` is what caught that here - `npm run build` never reads this file, which
   * is the gap `frontend/CLAUDE.md` records.
   *
   * PET-32's `footerStart` joined the same union for the same reason and arrives the same way,
   * as `DELETE_BUTTON` below. Passing it as a separate harness prop was tried first and
   * `npx tsc --noEmit` rejected it outright, which is the union working: spread beside a `shape`
   * that might be the centred arm, it reconstructs the pairing the `never` exists to forbid.
   */
  shape?: ModalShape;
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
          {...shape}
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

describe('the centred shape', () => {
  // PET-33's addition, and frame 12's. The default shape above is unchanged; these pin the
  // three differences and, more importantly, that everything else survives them.

  it('draws no close control, because Cancel is the designed dismissal', async () => {
    // The one deliberate removal. A confirmation whose footer already names the way out does
    // not need a third way to say no - and Escape and the backdrop still reach the same exit,
    // which the two assertions after this one prove.
    render(<Harness shape={{ align: 'center' }} />);
    await userEvent.click(openIt());

    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('still closes on a scrim click with no X present', async () => {
    const onClose = jest.fn();
    render(<Harness shape={{ align: 'center' }} onClose={onClose} />);
    await userEvent.click(openIt());

    await userEvent.click(dialog());

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('still reports a native close event, which is the path Escape arrives through', async () => {
    // Escape itself is unassertable here for the reason at the top of this file. This is the
    // same stand-in the default shape uses, repeated because dropping the X is exactly the
    // change that could plausibly have taken the exit with it.
    const onClose = jest.fn();
    render(<Harness shape={{ align: 'center' }} onClose={onClose} />);
    await userEvent.click(openIt());

    await act(async () => {
      dialog().dispatchEvent(new Event('close'));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the dialog named by its title', async () => {
    // aria-labelledby points at the h2 either way. Worth its own assertion because the h2
    // moved into a different wrapper.
    render(<Harness shape={{ align: 'center' }} />);
    await userEvent.click(openIt());

    expect(screen.getByRole('dialog', { name: 'Add transaction' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Add transaction' })).toBeInTheDocument();
  });

  it('renders the icon and hides it from the accessibility tree', async () => {
    // The circle is decoration beside a heading that already says what this is - the same call
    // the step indicator, the chip dots and ui/Input's `$` prefix all make.
    render(<Harness shape={{ align: 'center', icon: <svg data-testid="glyph" /> }} />);
    await userEvent.click(openIt());

    expect(screen.getByTestId('glyph').parentElement).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders no circle when no icon is given', async () => {
    // An empty tinted disc above the title would be worse than nothing, so the wrapper is
    // conditional rather than always present.
    const { container } = render(<Harness shape={{ align: 'center' }} />);
    await userEvent.click(openIt());

    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it("leaves the default shape's X in place", async () => {
    // The regression that matters most: `align` defaults to 'start', so every existing caller
    // - frame 09 today, 11 and 21 later - keeps the header it had.
    render(<Harness />);
    await userEvent.click(openIt());

    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});

describe('the footer', () => {
  // PET-32's `footerStart`, and frame 11's. Two of these assert a layout class, which this file
  // otherwise refuses to do - the exception `frontend/src/components/CLAUDE.md` allows is where a
  // class *is* the behaviour, and each is paired with its negative so neither can pass vacuously.

  const cancel = () => screen.getByRole('button', { name: 'Cancel' });
  const del = () => screen.getByRole('button', { name: 'Delete transaction' });

  /**
   * Frame 11's left-hand control, declared once.
   *
   * `type="button"` is the whole reason frame 11's Delete does not submit the edit it sits inside
   * - `ui/Button`'s default is the same - and the last test here is what pins the consequence.
   */
  const DELETE_BUTTON = <button type="button">Delete transaction</button>;

  it('renders a left-hand control before the footer’s own', async () => {
    // DOM order rather than visual position, which is what a screen reader and the keyboard
    // follow - and frame 11 draws the same order left to right.
    render(<Harness shape={{ footerStart: DELETE_BUTTON }} />);
    await userEvent.click(openIt());

    expect(del().compareDocumentPosition(cancel())).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('groups the footer’s controls so they stay together', async () => {
    // The reason the right-hand pair gets a wrapper at all: with three children in a
    // `justify-between` row, Cancel would sit alone in the middle of the box.
    render(<Harness shape={{ footerStart: DELETE_BUTTON }} />);
    await userEvent.click(openIt());

    const save = screen.getByRole('button', { name: 'Add transaction' });

    expect(cancel().parentElement).toBe(save.parentElement);
    expect(del().parentElement).not.toBe(cancel().parentElement);
  });

  it('spreads the row when there is a left-hand control, and does not otherwise', async () => {
    const { unmount } = render(<Harness shape={{ footerStart: DELETE_BUTTON }} />);
    await userEvent.click(openIt());

    expect(del().parentElement).toHaveClass('modal-action', 'justify-between');

    unmount();

    render(<Harness />);
    await userEvent.click(openIt());

    expect(cancel().parentElement).toHaveClass('modal-action');
    expect(cancel().parentElement).not.toHaveClass('justify-between');
  });

  it('leaves the footer’s controls as direct children when there is no left-hand control', async () => {
    // The negative of the grouping test above: no `footerStart` means no wrapper, so the row is
    // exactly what every existing caller already renders.
    render(<Harness />);
    await userEvent.click(openIt());

    expect(cancel().parentElement).toHaveClass('modal-action');
  });

  it('keeps the centred shape’s split footer, which cannot have a left-hand control', async () => {
    // `footerStart` is `never` in that arm of the union, so this pairing is a build error rather
    // than a case to handle - and `npx tsc --noEmit` is the gate, since `npm run build` never
    // reads this file. What is assertable here is that the centred row is unchanged.
    render(<Harness shape={{ align: 'center' }} />);
    await userEvent.click(openIt());

    expect(cancel().parentElement).toHaveClass('modal-action', '*:flex-1');
    expect(cancel().parentElement).not.toHaveClass('justify-between');
  });

  it('still closes through the one exit with a left-hand control present', async () => {
    // The regression the new branch could plausibly cause: the footer row is inside `content`,
    // which is inside the optional `<form>`, so a change there is a change to the exit path.
    const onClose = jest.fn();
    render(<Harness shape={{ footerStart: DELETE_BUTTON }} onClose={onClose} />);
    await userEvent.click(openIt());

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not submit the form when the left-hand control is clicked', async () => {
    // Frame 11's Delete opens a confirmation; submitting the edit on the way would save changes
    // the user was in the middle of abandoning. It rests on the control's own `type="button"`,
    // which is `ui/Button`'s default and the harness's too.
    const onSubmit = jest.fn((event: React.FormEvent<HTMLFormElement>) => event.preventDefault());
    render(<Harness shape={{ footerStart: DELETE_BUTTON }} onSubmit={onSubmit} />);
    await userEvent.click(openIt());

    await userEvent.click(del());

    expect(onSubmit).not.toHaveBeenCalled();
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
