import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ResendResult } from './actions';
import { ResendLink } from './ResendLink';

// AC5, plus the states A36 says do not exist. No mocks: the action is a prop.

const resend = jest.fn<Promise<ResendResult>, []>();

const resendButton = () => screen.getByRole('button', { name: 'Resend link' });

beforeEach(() => {
  jest.clearAllMocks();
  resend.mockResolvedValue({ ok: true });
});

describe('AC5: Resend link requests a fresh link', () => {
  it('calls the action once per click', async () => {
    const user = userEvent.setup();
    render(<ResendLink resend={resend} />);

    await user.click(resendButton());

    await waitFor(() => expect(resend).toHaveBeenCalledTimes(1));
  });

  it('passes no address, because the action reads it from the cookie', async () => {
    // Load-bearing rather than incidental: an address parameter would make the action a
    // link-sender for arbitrary addresses, which is the whole reason it takes none.
    const user = userEvent.setup();
    render(<ResendLink resend={resend} />);

    await user.click(resendButton());

    await waitFor(() => expect(resend).toHaveBeenCalledWith());
  });

  it('requests nothing until it is clicked', async () => {
    render(<ResendLink resend={resend} />);

    expect(resend).not.toHaveBeenCalled();
  });

  it('is a button rather than a link, because it acts instead of navigating', () => {
    render(<ResendLink resend={resend} />);

    expect(resendButton()).toHaveAttribute('type', 'button');
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('can be clicked again after it settles', async () => {
    // A36 makes this the only recovery the design gives, and the backend sends a fresh
    // link rather than duplicating (REG-6), so repeat use is the intended path and not
    // an abuse to guard against.
    const user = userEvent.setup();
    render(<ResendLink resend={resend} />);

    await user.click(resendButton());
    await screen.findByRole('status');
    await user.click(resendButton());

    await waitFor(() => expect(resend).toHaveBeenCalledTimes(2));
  });
});

describe('the states A36 designs none of', () => {
  it('confirms a successful send politely', async () => {
    // Without this a click has no observable effect whatsoever: the request goes out and
    // nothing on screen changes. `status` rather than `alert` because a confirmation
    // should wait for a pause in speech, where a failure interrupts.
    const user = userEvent.setup();
    render(<ResendLink resend={resend} />);

    await user.click(resendButton());

    const confirmation = await screen.findByRole('status');
    expect(confirmation).toHaveTextContent('A new link is on its way.');
    expect(confirmation.className).toContain('text-text-secondary');
  });

  it('disables the button while the request is out', async () => {
    // A double submit spends one of the five per-address attempts the backend allows,
    // and the second comes back a 429 - which, before this, would have rendered as
    // nothing at all.
    let settle: (result: ResendResult) => void = () => {};
    resend.mockReturnValue(
      new Promise<ResendResult>((resolve) => {
        settle = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<ResendLink resend={resend} />);

    await user.click(resendButton());

    expect(resendButton()).toBeDisabled();

    settle({ ok: true });
    await screen.findByRole('status');
    expect(resendButton()).toBeEnabled();
  });

  it.each([
    ['a validation rejection', { ok: false as const, status: 400 }],
    ['a server fault', { ok: false as const, status: 500 }],
    ['an unreachable backend', { ok: false as const }],
  ])('reports %s in one line', async (_label, result) => {
    resend.mockResolvedValue(result);
    const user = userEvent.setup();
    render(<ResendLink resend={resend} />);

    await user.click(resendButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("We couldn't send a new link. Please try again.");
    expect(alert.className).toContain('text-status-danger-text');
  });

  it('tells a throttled user to wait rather than that it failed', async () => {
    // The one status worth distinguishing, because it is the only failure the user can
    // act on - and it is reachable precisely because A36 designs no cooldown to prevent
    // it. "Please try again" would be actively wrong advice here.
    resend.mockResolvedValue({ ok: false, status: 429 });
    const user = userEvent.setup();
    render(<ResendLink resend={resend} />);

    await user.click(resendButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Too many requests. Please wait a few minutes and try again.');
    expect(alert).not.toHaveTextContent('Please try again.');
  });

  it('clears the previous outcome when clicked again', async () => {
    // Otherwise a failure line sits under a button that is working again, describing a
    // request that is no longer the latest one.
    resend.mockResolvedValueOnce({ ok: false, status: 500 });
    let settle: (result: ResendResult) => void = () => {};
    resend.mockReturnValueOnce(
      new Promise<ResendResult>((resolve) => {
        settle = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<ResendLink resend={resend} />);

    await user.click(resendButton());
    await screen.findByRole('alert');

    await user.click(resendButton());

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    settle({ ok: true });
    await screen.findByRole('status');
  });

  it('says nothing at all before the first click', async () => {
    render(<ResendLink resend={resend} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('has no cooldown, counter or timer', async () => {
    // A36 mentions a simple cooldown and this deliberately does not build one: the
    // backend's per-address throttler is the real limit, and a timer here would be a
    // second, weaker authority a reload defeats. Pinned as a decision rather than an
    // omission - what replaces it is the throttled message above.
    const user = userEvent.setup();
    render(<ResendLink resend={resend} />);

    await user.click(resendButton());
    await screen.findByRole('status');

    expect(resendButton()).toBeEnabled();
    expect(screen.queryByText(/\d+\s*(second|minute)/i)).not.toBeInTheDocument();
  });
});
