import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { assertiveAnnouncement, politeAnnouncement } from './toastQueries';
import {
  ANNOUNCEMENT_CLEAR_MS,
  MAX_VISIBLE_TOASTS,
  TOAST_DURATION_MS,
  ToastProvider,
  useToast,
} from './ToastProvider';

// Fake timers throughout, because every guarantee in this file is a timer: the auto-dismiss, the
// two durations differing, and the announcement being cleared long before the toast goes. The
// numbers come from the component's own exports rather than being restated here, so a change to a
// duration cannot leave this suite asserting the old one.
function setup() {
  return userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
}

function Poster() {
  const { post } = useToast();

  return (
    <>
      <button
        type="button"
        onClick={() => post({ kind: 'success', message: 'Transaction added.' })}
      >
        post success
      </button>
      <button type="button" onClick={() => post({ kind: 'failure', message: 'Something failed.' })}>
        post failure
      </button>
    </>
  );
}

function renderProvider(children: React.ReactNode = <Poster />) {
  return render(<ToastProvider>{children}</ToastProvider>);
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('ToastProvider', () => {
  it('renders its children and holds nothing at rest', () => {
    renderProvider();

    expect(screen.getByRole('button', { name: 'post success' })).toBeInTheDocument();
    expect(screen.queryByText('Transaction added.')).not.toBeInTheDocument();
  });

  // The half that makes the region worth mounting unconditionally: both live regions exist from the
  // first render, before anything has been posted into them.
  it('mounts the announcers before there is anything to announce', () => {
    renderProvider();

    expect(politeAnnouncement()).toBe('');
    expect(assertiveAnnouncement()).toBe('');
  });

  it('puts a posted message on screen and into the polite region', async () => {
    const user = setup();
    renderProvider();

    await user.click(screen.getByRole('button', { name: 'post success' }));

    expect(screen.getAllByText('Transaction added.').length).toBeGreaterThan(0);
    expect(politeAnnouncement()).toBe('Transaction added.');
  });

  it('routes a failure to the assertive region instead', async () => {
    const user = setup();
    renderProvider();

    await user.click(screen.getByRole('button', { name: 'post failure' }));

    expect(assertiveAnnouncement()).toBe('Something failed.');
    expect(politeAnnouncement()).toBe('');
  });

  // The announcement is spent once it has been read; the toast is not. Without this the same
  // sentence sits in the DOM twice for the toast's whole life and is met twice in browse mode.
  it('clears the announcement long before the toast goes', async () => {
    const user = setup();
    renderProvider();

    await user.click(screen.getByRole('button', { name: 'post success' }));

    act(() => {
      jest.advanceTimersByTime(ANNOUNCEMENT_CLEAR_MS);
    });

    expect(politeAnnouncement()).toBe('');
    expect(screen.getByText('Transaction added.')).toBeInTheDocument();
  });

  it('dismisses a success on its own timer', async () => {
    const user = setup();
    renderProvider();

    await user.click(screen.getByRole('button', { name: 'post success' }));

    act(() => {
      jest.advanceTimersByTime(TOAST_DURATION_MS.success);
    });

    expect(screen.queryByText('Transaction added.')).not.toBeInTheDocument();
  });

  // The two durations differing is a decision rather than an accident, so it is pinned: a failure is
  // still up at the moment a success would already have gone.
  it('keeps a failure up longer than a success', async () => {
    const user = setup();
    renderProvider();

    await user.click(screen.getByRole('button', { name: 'post failure' }));

    act(() => {
      jest.advanceTimersByTime(TOAST_DURATION_MS.success);
    });
    expect(screen.getByText('Something failed.')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(TOAST_DURATION_MS.failure - TOAST_DURATION_MS.success);
    });
    expect(screen.queryByText('Something failed.')).not.toBeInTheDocument();
  });

  // **Queried through the dismiss controls rather than by text**, and every assertion below that
  // needs "is this toast on screen" does the same. The announcer holds the identical sentence for
  // ANNOUNCEMENT_CLEAR_MS, which is by design and documented in both components - so a bare
  // `queryByText` is ambiguous while it is up, and answers about the announcement when it means to
  // ask about the stack. The dismiss control exists only in the visible stack.
  it('dismisses on the control without waiting for the timer', async () => {
    const user = setup();
    renderProvider();

    await user.click(screen.getByRole('button', { name: 'post success' }));
    await user.click(screen.getByRole('button', { name: 'Dismiss: Transaction added.' }));

    expect(
      screen.queryByRole('button', { name: 'Dismiss: Transaction added.' }),
    ).not.toBeInTheDocument();
  });

  it('leaves the other toasts alone when one is dismissed', async () => {
    const user = setup();
    renderProvider();

    await user.click(screen.getByRole('button', { name: 'post success' }));
    await user.click(screen.getByRole('button', { name: 'post failure' }));
    await user.click(screen.getByRole('button', { name: 'Dismiss: Transaction added.' }));

    expect(
      screen.queryByRole('button', { name: 'Dismiss: Transaction added.' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss: Something failed.' })).toBeInTheDocument();
  });

  it('stacks up to the cap and drops the oldest past it', async () => {
    const user = setup();
    render(
      <ToastProvider>
        <Bursts />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'burst' }));

    expect(screen.getAllByRole('button', { name: /^Dismiss:/ })).toHaveLength(MAX_VISIBLE_TOASTS);
    expect(screen.queryByRole('button', { name: 'Dismiss: one' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss: four' })).toBeInTheDocument();
  });

  // A dropped toast's own timer is deliberately left to fire against an id that is no longer there,
  // so the updater stays a pure function under StrictMode. What must not happen is that firing
  // taking a survivor down with it.
  it('leaves the survivors alone when a dropped toast’s timer fires', async () => {
    const user = setup();
    render(
      <ToastProvider>
        <Bursts />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'burst' }));

    act(() => {
      jest.advanceTimersByTime(TOAST_DURATION_MS.success - 1);
    });

    expect(screen.getByRole('button', { name: 'Dismiss: four' })).toBeInTheDocument();
  });

  it('throws outside the provider rather than returning a no-op', () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Poster />)).toThrow(/ToastProvider/);

    errors.mockRestore();
  });
});

/** Four posts in one click, which is what a burst looks like from inside a handler. */
function Bursts() {
  const { post } = useToast();

  return (
    <button
      type="button"
      onClick={() => {
        for (const message of ['one', 'two', 'three', 'four']) {
          post({ kind: 'success', message });
        }
      }}
    >
      burst
    </button>
  );
}
