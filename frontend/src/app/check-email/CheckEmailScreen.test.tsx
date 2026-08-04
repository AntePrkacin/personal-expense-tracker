import { render, screen } from '@testing-library/react';

import { CheckEmailScreen } from './CheckEmailScreen';

// AC6 and AC7: the card, both of its branches, and what it deliberately does not
// carry. The resend behaviour is ResendLink.test.tsx's and the cookie read is
// page.test.tsx's.
//
// No mocks at all, which is the payoff of `page.tsx` owning the server-only imports:
// this component takes the address and the action as props, so there is nothing here
// to stub.

const ADDRESS = 'marko@email.com';
const resend = jest.fn();

const SENT_COPY =
  "We've sent a secure login link to marko@email.com. Open the link on this device to access your account.";
const FALLBACK_COPY =
  "We've sent you a secure login link. Open the link on this device to access your account.";

/** The card's copy as one string, since the address is interpolated mid-sentence. */
const bodyCopy = () => screen.getByRole('heading', { level: 1 }).nextElementSibling?.textContent;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AC7: the address it was given', () => {
  it('shows the exact address in VER-1s copy', () => {
    render(<CheckEmailScreen email={ADDRESS} resend={resend} />);

    expect(bodyCopy()).toBe(SENT_COPY);
  });

  it.each(['marko+tag@email.com', 'marko.kovac@email.co.uk'])('shows %s verbatim', (email) => {
    // Nothing decodes or transforms it on the way in: the cookie carries what was
    // submitted, so an address that would have needed percent-encoding in a URL is
    // shown as typed rather than as `marko%2Btag%40email.com` - which is what a
    // half-finished migration off the query parameter would have produced.
    render(<CheckEmailScreen email={email} resend={resend} />);

    expect(bodyCopy()).toContain(email);
  });

  it('interpolates into one sentence rather than leaving the address adrift', () => {
    // The address sits mid-sentence, so this pins that both halves of the copy survive
    // around it - a body that rendered only the address would still pass a `toContain`.
    render(<CheckEmailScreen email={ADDRESS} resend={resend} />);

    expect(bodyCopy()).toMatch(/^We've sent a secure login link to .+\. Open the link/);
  });
});

describe('AC7: no address available', () => {
  it('reads correctly rather than leaving a gap or a placeholder', () => {
    // The two failures this replaces: "...login link to . Open the link" from an empty
    // slot, and a literal `{email}` from an uninterpolated template.
    render(<CheckEmailScreen email={null} resend={resend} />);

    expect(bodyCopy()).toBe(FALLBACK_COPY);
    expect(bodyCopy()).not.toContain('{');
    expect(bodyCopy()).not.toMatch(/ to \./);
  });

  it('names no address at all', () => {
    render(<CheckEmailScreen email={null} resend={resend} />);

    expect(bodyCopy()).not.toContain('@');
  });

  it('offers a way onwards instead of a dead Resend', () => {
    // Amends AC6's wording rather than ignoring it: with no address there is nothing to
    // resend, and a disabled button would leave a screen with no working control and no
    // exit. This goes forward to Log in, never backwards into a completed form.
    render(<CheckEmailScreen email={null} resend={resend} />);

    const onward = screen.getByRole('link', { name: 'Log in again' });
    expect(onward).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('button', { name: 'Resend link' })).not.toBeInTheDocument();
  });

  it('still carries exactly one control', () => {
    render(<CheckEmailScreen email={null} resend={resend} />);

    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('AC6: no Back control at all', () => {
  it.each([
    ['with an address', ADDRESS],
    ['without one', null],
  ])('has no Back %s', (_label, email) => {
    // PET-11's amendment to VER-3 and A37: the account exists and the link is sent by
    // the time this renders, so there is nowhere backwards to go. The Figma frame still
    // draws the button, which makes this the assertion that stops somebody restoring it
    // from the design.
    render(<CheckEmailScreen email={email} resend={resend} />);

    expect(screen.queryByRole('link', { name: 'Back' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    expect(screen.queryByText('Back')).not.toBeInTheDocument();
  });

  it('makes Resend the only action when there is an address (VER-2)', () => {
    render(<CheckEmailScreen email={ADDRESS} resend={resend} />);

    expect(screen.getByRole('button', { name: 'Resend link' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});

describe('the card', () => {
  it('shows the heading and owns exactly one h1', () => {
    render(<CheckEmailScreen email={ADDRESS} resend={resend} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading')).toHaveLength(1);
  });

  it('has no step indicator and no overline (VER-1)', () => {
    // Counted rather than queried by aria-hidden, which would match the lockup's own
    // cedi glyph first - the trap SetupShell.test.tsx records.
    const { container } = render(<CheckEmailScreen email={ADDRESS} resend={resend} />);

    expect(container.firstElementChild!.children).toHaveLength(2);
    expect(screen.queryByText(/step \d of \d/i)).not.toBeInTheDocument();
  });

  it('draws the 520px card', () => {
    const { container } = render(<CheckEmailScreen email={ADDRESS} resend={resend} />);

    expect(container.querySelector('.shadow-card')!.className).toContain('w-130');
  });

  it('has no field to fill in', () => {
    // Nothing is collected here; both entry points have already asked for the address.
    render(<CheckEmailScreen email={ADDRESS} resend={resend} />);

    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('shows the brand lockup above the card', () => {
    render(<CheckEmailScreen email={ADDRESS} resend={resend} />);

    expect(screen.getByText('Spendifico')).toBeInTheDocument();
    expect(screen.queryByText(/Expensa/)).not.toBeInTheDocument();
  });

  it('does not call the action just by rendering', () => {
    // A resend is a user's decision. An effect that fired one on mount would send a
    // second link to everybody arriving from Register, spending a rate-limit attempt
    // and invalidating the link they were just emailed.
    render(<CheckEmailScreen email={ADDRESS} resend={resend} />);

    expect(resend).not.toHaveBeenCalled();
  });
});
