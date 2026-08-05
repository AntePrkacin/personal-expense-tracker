import { render, screen } from '@testing-library/react';

import type { ResendResult } from '../../../../lib/resend';

import { VerifyFailedScreen } from './VerifyFailedScreen';

// A38's "plain messages and a way to request a new link", which is the whole of what the
// design says about this screen. No mocks: `page.tsx` owns the cookie read and the
// action, so nothing here reaches `next/headers`.

const resend = jest.fn<Promise<ResendResult>, []>();

beforeEach(() => {
  jest.clearAllMocks();
  resend.mockResolvedValue({ ok: true });
});

describe('AC2: a dead link says so and offers a resend', () => {
  it('names the two things that kill a link', async () => {
    render(<VerifyFailedScreen reason="invalid" hasAddress resend={resend} />);

    expect(screen.getByRole('heading', { name: 'This link no longer works' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Login links can only be used once and expire after a short time. Send yourself a new one.',
      ),
    ).toBeInTheDocument();
  });

  it('offers Resend link as the way to request a new one', async () => {
    render(<VerifyFailedScreen reason="invalid" hasAddress resend={resend} />);

    expect(screen.getByRole('button', { name: 'Resend link' })).toBeInTheDocument();
  });
});

describe('AC3: a superseded link points at the newest email', () => {
  it('says to open the most recent email rather than that the link expired', async () => {
    // The distinction the backend's 409 exists for. Told "this link expired", a user
    // whose newer link is sitting unopened in the same Gmail thread would request a
    // third one and supersede that.
    render(<VerifyFailedScreen reason="superseded" hasAddress resend={resend} />);

    expect(screen.getByRole('heading', { name: 'A newer link was sent' })).toBeInTheDocument();
    expect(screen.getByText(/Open the most recent email to sign in\./)).toBeInTheDocument();
    expect(screen.queryByText(/expire/)).not.toBeInTheDocument();
  });
});

describe('the two reasons that are not about the link', () => {
  it('tells a throttled user to wait rather than that the link is dead', async () => {
    render(<VerifyFailedScreen reason="busy" hasAddress resend={resend} />);

    expect(screen.getByRole('heading', { name: 'Too many attempts' })).toBeInTheDocument();
    expect(
      screen.getByText('Please wait a few minutes and then request a new link.'),
    ).toBeInTheDocument();
  });

  it('does not claim a fault is the link, since that link may still work', async () => {
    render(<VerifyFailedScreen reason="failed" hasAddress resend={resend} />);

    expect(screen.getByRole('heading', { name: "We couldn't sign you in" })).toBeInTheDocument();
    expect(
      screen.getByText('Something went wrong on our end. Please try again.'),
    ).toBeInTheDocument();
  });

  it('gives every reason its own wording', () => {
    // Four rather than one generic apology, because three of the four would be
    // misleading if collapsed. Pinned as a decision rather than left to drift.
    const headings = (['invalid', 'superseded', 'busy', 'failed'] as const).map((reason) => {
      const { unmount } = render(<VerifyFailedScreen reason={reason} hasAddress resend={resend} />);
      const heading = screen.getByRole('heading').textContent;
      unmount();
      return heading;
    });

    expect(new Set(headings).size).toBe(4);
  });
});

describe('with no address to resend to', () => {
  // Reached when the fifteen-minute cookie has gone, which is likely here rather than
  // exotic: a user who opens a link the next morning has a dead link *and* a dead
  // cookie, so this is the ordinary shape of an expired-link arrival.

  it('offers a way forward instead of a control that cannot work', async () => {
    render(<VerifyFailedScreen reason="invalid" hasAddress={false} />);

    const onward = screen.getByRole('link', { name: 'Log in again' });
    expect(onward).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('button', { name: 'Resend link' })).not.toBeInTheDocument();
  });

  it('still says what went wrong', async () => {
    render(<VerifyFailedScreen reason="superseded" hasAddress={false} />);

    expect(screen.getByRole('heading', { name: 'A newer link was sent' })).toBeInTheDocument();
  });

  it('leaves exactly one action on screen', async () => {
    render(<VerifyFailedScreen reason="failed" hasAddress={false} />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('link')).toHaveLength(1);
  });
});

describe('what the screen deliberately does not show', () => {
  it('never renders the address, even when there is one', async () => {
    // It does not take one. The screen is already delivering bad news and the address is
    // a detail nobody asked about - and not accepting it means it cannot leak into this
    // markup by accident.
    const { container } = render(
      <VerifyFailedScreen reason="invalid" hasAddress resend={resend} />,
    );

    expect(container.textContent).not.toContain('@');
  });

  it('has no Back control, the same call screens 23 and 24 make', async () => {
    render(<VerifyFailedScreen reason="invalid" hasAddress resend={resend} />);

    expect(screen.queryByRole('link', { name: 'Back' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('draws the same card as screen 24', async () => {
    // No Figma frame exists for this screen, so borrowing the one next to it is what
    // keeps it looking like the flow it interrupts.
    const { container } = render(
      <VerifyFailedScreen reason="invalid" hasAddress resend={resend} />,
    );

    expect(container.querySelector('.shadow-card')).not.toBeNull();
  });
});
