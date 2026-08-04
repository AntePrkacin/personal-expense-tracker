import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';

import type { LoginLinkResult } from './actions';
import { LoginForm } from './LoginForm';

// AC2, AC3 and AC5's request half, plus the state the design does not draw. AC1 is
// the card itself and lives in LoginScreen.test.tsx.
//
// A package specifier, so the `@/` alias trap does not apply - see the note in
// frontend/src/app/CLAUDE.md about jest.mock and that alias.
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));

const mockPush = jest.fn();

/** The action, injected. The prop exists so this needs no module mock at all. */
const sendLink = jest.fn<Promise<LoginLinkResult>, [string]>();

const emailField = () => screen.getByLabelText('Email');
const loginButton = () => screen.getByRole('button', { name: 'Log in' });

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
  sendLink.mockResolvedValue({ ok: true });
});

describe('AC1: the one field', () => {
  it('is an email field, required, with no asterisk', () => {
    // `required` carries aria-required for assistive technology; A12 marks required
    // fields only by not saying "(optional)", so an asterisk would be invented.
    render(<LoginForm sendLink={sendLink} />);

    expect(emailField()).toHaveAttribute('type', 'email');
    expect(emailField()).toBeRequired();
    expect(screen.queryByText(/\*/)).not.toBeInTheDocument();
  });

  it('has no password field, because access is passwordless', () => {
    // A31. No password input exists anywhere in the frame, and this is the assertion
    // that stops one being added by reflex on a screen called "Log in".
    const { container } = render(<LoginForm sendLink={sendLink} />);

    expect(container.querySelector('input[type="password"]')).toBeNull();
  });

  it('turns the browser validation bubble off', () => {
    // Without noValidate the browser's own bubble fires first and the designed inline
    // message never renders, which reads as broken validation rather than as a missing
    // attribute. Fails silently, hence the assertion.
    const { container } = render(<LoginForm sendLink={sendLink} />);

    expect(container.querySelector('form')).toHaveAttribute('novalidate');
  });

  it('is the only field on the screen', () => {
    // LOG-2: one field. A second one would mean this screen had started collecting
    // something the design does not ask a returning user for.
    render(<LoginForm sendLink={sendLink} />);

    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });
});

describe('AC2: an empty email blocks the submit', () => {
  it('shows the message and requests no link', async () => {
    const user = userEvent.setup();
    render(<LoginForm sendLink={sendLink} />);

    await user.click(loginButton());

    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(sendLink).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('treats a field holding only spaces as empty', async () => {
    const user = userEvent.setup();
    render(<LoginForm sendLink={sendLink} />);

    await user.type(emailField(), '   ');
    await user.click(loginButton());

    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(sendLink).not.toHaveBeenCalled();
  });

  it('says nothing before the first submit', async () => {
    // Validation runs on submit only, which is step 1's convention: a message that
    // appeared while the field was still being typed into would fire on the first
    // keystroke of every valid address.
    const user = userEvent.setup();
    render(<LoginForm sendLink={sendLink} />);

    await user.type(emailField(), 'marko');

    expect(screen.queryByText('Enter your email address.')).not.toBeInTheDocument();
    expect(screen.queryByText('Enter a valid email address.')).not.toBeInTheDocument();
  });

  it('clears the message on the next change', async () => {
    const user = userEvent.setup();
    render(<LoginForm sendLink={sendLink} />);

    await user.click(loginButton());
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();

    await user.type(emailField(), 'm');

    expect(screen.queryByText('Enter your email address.')).not.toBeInTheDocument();
  });

  it('wires the message to the field for assistive technology', async () => {
    // `ui/Field` owns the aria-invalid and aria-describedby pair; this asserts the
    // error prop actually reaches it, which is the part this form is responsible for.
    const user = userEvent.setup();
    render(<LoginForm sendLink={sendLink} />);

    await user.click(loginButton());

    expect(emailField()).toHaveAttribute('aria-invalid', 'true');
    const describedBy = emailField().getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent('Enter your email address.');
  });
});

describe('AC3: a malformed email blocks the submit', () => {
  it.each(['marko', 'marko@', 'marko@email', '@email.com', 'marko kovac@email.com'])(
    'rejects %s',
    async (value) => {
      const user = userEvent.setup();
      render(<LoginForm sendLink={sendLink} />);

      await user.type(emailField(), value);
      await user.click(loginButton());

      expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
      expect(sendLink).not.toHaveBeenCalled();
    },
  );

  it('distinguishes malformed from empty', async () => {
    // "Enter your email address" is wrong advice for somebody who did. Two messages
    // rather than one, which is the split RegisterForm already makes.
    const user = userEvent.setup();
    render(<LoginForm sendLink={sendLink} />);

    await user.type(emailField(), 'marko@');
    await user.click(loginButton());

    expect(screen.queryByText('Enter your email address.')).not.toBeInTheDocument();
  });
});

describe('AC3 and AC5: a valid email requests a link and opens Check your email', () => {
  it('sends the address it was given', async () => {
    const user = userEvent.setup();
    render(<LoginForm sendLink={sendLink} />);

    await user.type(emailField(), 'marko@email.com');
    await user.click(loginButton());

    await waitFor(() => expect(sendLink).toHaveBeenCalledTimes(1));
    expect(sendLink).toHaveBeenCalledWith('marko@email.com');
  });

  it('trims before sending, so a stray space is not part of the address', async () => {
    const user = userEvent.setup();
    render(<LoginForm sendLink={sendLink} />);

    await user.type(emailField(), '  marko@email.com  ');
    await user.click(loginButton());

    await waitFor(() => expect(sendLink).toHaveBeenCalledWith('marko@email.com'));
  });

  it('opens Check your email on a clean path, carrying no address', async () => {
    // AC8: the address travels in an httpOnly cookie the action set, not in the URL,
    // because Next's request log records the full path including the query string.
    // Asserted as an exact string - a `?email=` that came back would still satisfy a
    // prefix check.
    const user = userEvent.setup();
    render(<LoginForm sendLink={sendLink} />);

    await user.type(emailField(), 'marko@email.com');
    await user.click(loginButton());

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(mockPush).toHaveBeenCalledWith('/check-email');
  });
});

describe('AC1: Back returns to Welcome', () => {
  it('is a link to the root, not a button', () => {
    // LOG-4, and WEL-3 is the only way in. A link rather than a button because it
    // always navigates - Welcome's rule - where the submit's navigation is conditional.
    render(<LoginForm sendLink={sendLink} />);

    const back = screen.getByRole('link', { name: 'Back' });
    expect(back).toHaveAttribute('href', '/');
  });
});

describe('the request, which the design draws no states for', () => {
  it('disables the submit while it is out', async () => {
    // A19 designs no pending state. This is ours: a double submit spends one of the
    // five per-address attempts the backend allows, and the second returns a 429.
    let settle: (result: LoginLinkResult) => void = () => {};
    sendLink.mockReturnValue(
      new Promise<LoginLinkResult>((resolve) => {
        settle = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<LoginForm sendLink={sendLink} />);

    await user.type(emailField(), 'marko@email.com');
    await user.click(loginButton());

    expect(loginButton()).toBeDisabled();

    settle({ ok: true });
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
  });

  it.each([
    ['a validation rejection', { ok: false as const, status: 400 }],
    ['the rate limiter', { ok: false as const, status: 429 }],
    ['an unreachable backend', { ok: false as const }],
  ])('reports %s in one line and stays put', async (_label, result) => {
    sendLink.mockResolvedValue(result);
    const user = userEvent.setup();
    render(<LoginForm sendLink={sendLink} />);

    await user.type(emailField(), 'marko@email.com');
    await user.click(loginButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("We couldn't send your login link. Please try again.");
    expect(alert.className).toContain('text-status-danger-text');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('re-enables the submit after a failure, so it can be retried', async () => {
    sendLink.mockResolvedValue({ ok: false, status: 500 });
    const user = userEvent.setup();
    render(<LoginForm sendLink={sendLink} />);

    await user.type(emailField(), 'marko@email.com');
    await user.click(loginButton());

    await screen.findByRole('alert');
    expect(loginButton()).toBeEnabled();
  });

  it('clears the failure line on the next change', async () => {
    sendLink.mockResolvedValue({ ok: false, status: 500 });
    const user = userEvent.setup();
    render(<LoginForm sendLink={sendLink} />);

    await user.type(emailField(), 'marko@email.com');
    await user.click(loginButton());
    await screen.findByRole('alert');

    await user.type(emailField(), 'x');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
