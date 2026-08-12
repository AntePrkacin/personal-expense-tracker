import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { assertiveAnnouncement, politeAnnouncement } from './toastQueries';
import { ToastRegion, type Toast } from './ToastRegion';

// What this suite can and cannot see is the whole reason the component is split in two. jsdom
// implements none of the Popover API and `jest.setup.ts` deliberately polyfills none of it, so the
// stacking - the thing the popover exists for - is a Chrome check, recorded in the plan and in the
// component. What is assertable here is the markup, the two live regions and the dismiss seam.

const SUCCESS: Toast = { id: 1, kind: 'success', message: 'Transaction added.' };
const FAILURE: Toast = {
  id: 2,
  kind: 'failure',
  message: 'Something went wrong. Please try again.',
};

function renderRegion(props: Partial<React.ComponentProps<typeof ToastRegion>> = {}) {
  const onDismiss = jest.fn();

  render(
    <ToastRegion
      toasts={[]}
      politeAnnouncement=""
      assertiveAnnouncement=""
      onDismiss={onDismiss}
      {...props}
    />,
  );

  return { onDismiss };
}

describe('ToastRegion', () => {
  // The regression that matters, and the one a presence check cannot state. A region created in the
  // same commit as its content is generally not announced at all, so both announcers must exist
  // before there is anything to say - which is why every assertion below is about their **text**.
  it('mounts both announcers empty', () => {
    renderRegion();

    expect(politeAnnouncement()).toBe('');
    expect(assertiveAnnouncement()).toBe('');
  });

  // **Neither announcer publishes a role, deliberately**, and this is the assertion that says so.
  // With `role="status"` and `role="alert"` on a region mounted for the whole session, every
  // form-level message query in the app would match two elements - see `ToastRegion.tsx`.
  it('publishes no role that could collide with a form’s own messages', () => {
    renderRegion({ toasts: [FAILURE], assertiveAnnouncement: FAILURE.message });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  // **The regression a review found in `toastQueries.ts`.** The announcers publish no role, so the
  // suites query them by attribute - and a bare `[aria-live="polite"]` matched whichever component
  // under test rendered one first. `DateField` and `AssistantMessageList` both do. This pins that a
  // competing live region earlier in the document cannot be mistaken for the toast's.
  it('is found past another component’s live region', () => {
    render(
      <>
        <div aria-live="polite">October 2025</div>
        <ToastRegion
          toasts={[SUCCESS]}
          politeAnnouncement={SUCCESS.message}
          assertiveAnnouncement=""
          onDismiss={jest.fn()}
        />
      </>,
    );

    expect(politeAnnouncement()).toBe('Transaction added.');
  });

  it('contributes no text to the page while it holds nothing', () => {
    renderRegion();

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(/./)).not.toBeInTheDocument();
  });

  it('announces a success politely and leaves the assertive region alone', () => {
    renderRegion({ toasts: [SUCCESS], politeAnnouncement: SUCCESS.message });

    expect(politeAnnouncement()).toBe('Transaction added.');
    expect(assertiveAnnouncement()).toBe('');
  });

  it('announces a failure assertively and leaves the polite region alone', () => {
    renderRegion({ toasts: [FAILURE], assertiveAnnouncement: FAILURE.message });

    expect(assertiveAnnouncement()).toBe('Something went wrong. Please try again.');
    expect(politeAnnouncement()).toBe('');
  });

  it('draws the message on screen beside the announcement', () => {
    renderRegion({ toasts: [SUCCESS], politeAnnouncement: SUCCESS.message });

    // Twice in the DOM on purpose - the visible stack and the announcer - which is what
    // ANNOUNCEMENT_CLEAR_MS in the provider bounds. Documented in both files.
    expect(screen.getAllByText('Transaction added.')).toHaveLength(2);
  });

  it('stacks in the order it was given, oldest first', () => {
    renderRegion({ toasts: [SUCCESS, FAILURE] });

    const dismissals = screen.getAllByRole('button');

    expect(dismissals).toHaveLength(2);
    expect(dismissals[0]).toHaveAccessibleName('Dismiss: Transaction added.');
  });

  // `PopoverMenu`'s rule about a page of identical buttons: with three toasts up, three controls
  // named "Dismiss" say which control the reader is on and nothing about which message.
  it('names each dismiss control for what it dismisses', () => {
    renderRegion({ toasts: [SUCCESS] });

    expect(screen.getByRole('button', { name: 'Dismiss: Transaction added.' })).toBeInTheDocument();
  });

  it('hands the dismissed id back to its owner', async () => {
    const user = userEvent.setup();
    const { onDismiss } = renderRegion({ toasts: [SUCCESS, FAILURE] });

    await user.click(screen.getByRole('button', { name: `Dismiss: ${FAILURE.message}` }));

    expect(onDismiss).toHaveBeenCalledWith(2);
  });

  // The visible half of the kind, which is the exception `frontend/src/components/CLAUDE.md` allows:
  // a class assertion earns its place where the class *is* the behaviour, and the tone is the only
  // thing distinguishing the two kinds on screen.
  it('tones each kind from the theme rather than from a palette colour', () => {
    renderRegion({ toasts: [SUCCESS, FAILURE] });

    const [success, failure] = screen.getAllByRole('button').map((button) => button.parentElement);

    expect(success).toHaveClass('alert-success');
    expect(failure).toHaveClass('alert-error');
    expect(success).not.toHaveClass('alert-error');
  });

  // **The control announces its own condition while a modal is open (PET-77 review).** The header
  // records the measurement: a popover shown after a modal `<dialog>` paints above it and is inert,
  // so the click never lands. Drawing a live-looking X for the toast's whole life is precisely the
  // "looks operable and is not" control this app says it does not ship.
  it('marks the dismiss control unavailable while a modal dialog is open', () => {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.append(dialog);

    try {
      const onDismiss = jest.fn();
      render(
        <ToastRegion
          toasts={[SUCCESS]}
          politeAnnouncement=""
          assertiveAnnouncement=""
          onDismiss={onDismiss}
        />,
      );

      const control = screen.getByRole('button', { name: 'Dismiss: Transaction added.' });

      expect(control).toHaveAttribute('aria-disabled', 'true');
      // `aria-disabled`, never `disabled`: the control stays reachable so a keyboard user is told
      // why rather than finding a gap.
      expect(control).toBeEnabled();
    } finally {
      dialog.remove();
    }
  });

  it('leaves the dismiss control live when nothing is open over it', () => {
    renderRegion({ toasts: [SUCCESS] });

    expect(screen.getByRole('button', { name: 'Dismiss: Transaction added.' })).not.toHaveAttribute(
      'aria-disabled',
    );
  });

  // jsdom has no `showPopover`, so what is pinned is that the attribute is on the element and that
  // its absence from the prototype is survivable. The raise itself is the browser check.
  it('carries a manual popover and survives a jsdom with no Popover API', () => {
    const { container } = render(
      <ToastRegion
        toasts={[SUCCESS]}
        politeAnnouncement=""
        assertiveAnnouncement=""
        onDismiss={jest.fn()}
      />,
    );

    expect(container.querySelector('[popover]')).toHaveAttribute('popover', 'manual');
  });
});
