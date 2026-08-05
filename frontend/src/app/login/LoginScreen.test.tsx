import { render, screen } from '@testing-library/react';

import { LoginScreen } from './LoginScreen';

// AC1: the card itself. The field's behaviour is LoginForm.test.tsx's.
//
// Both mocks use relative specifiers, because `jest.mock` cannot resolve the `@/`
// alias from any directory - see the note in frontend/src/app/CLAUDE.md.
//
// `./actions` is mocked purely so no assertion about the card can reach a real fetch:
// the module is a Server Action that would otherwise be imported for real. Same call
// SetupRegisterScreen.test.tsx makes.
jest.mock('./actions', () => ({ sendLoginLink: jest.fn() }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const SUPPORTING_COPY =
  "Enter the email you signed up with and we'll send you a secure login link.";

describe('LoginScreen', () => {
  it('shows the heading and the supporting copy (LOG-1)', () => {
    render(<LoginScreen />);

    expect(screen.getByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByText(SUPPORTING_COPY)).toBeInTheDocument();
  });

  it('owns exactly one h1', () => {
    // The chrome renders no heading of its own, so this screen's is the only one - the
    // same division every other access screen keeps.
    render(<LoginScreen />);

    expect(screen.getAllByRole('heading')).toHaveLength(1);
  });

  it('has no step indicator, because this is not a step in anything (LOG-1)', () => {
    // The centred column holds the lockup and the card and nothing between them. On
    // the three onboarding frames the three dots sit in that gap; here there is
    // nothing to indicate, and a stray indicator would claim this screen was part of
    // onboarding.
    //
    // Asserted by counting the column's children rather than by looking for an
    // aria-hidden element, which would match the lockup's own cedi glyph first - the
    // trap SetupShell.test.tsx records for its `indicator()` helper.
    const { container } = render(<LoginScreen />);

    expect(container.firstElementChild!.children).toHaveLength(2);
  });

  it('has no overline either (LOG-1)', () => {
    render(<LoginScreen />);

    expect(screen.queryByText(/step \d of \d/i)).not.toBeInTheDocument();
  });

  it('draws the 520px card', () => {
    // Frame 132:1139 is 520px, the same as frames 02 and 22, which is `AccessCard`'s
    // default - so this screen passes no width and this assertion is what pins that
    // the default is the right one for it.
    const { container } = render(<LoginScreen />);

    expect(container.querySelector('.shadow-card')!.className).toContain('w-130');
  });

  it('renders the form inside the card', () => {
    const { container } = render(<LoginScreen />);

    const card = container.querySelector('.shadow-card')!;
    expect(card).toContainElement(screen.getByLabelText('Email'));
    expect(card).toContainElement(screen.getByRole('button', { name: 'Log in' }));
  });

  it('shows the brand lockup above the card', () => {
    render(<LoginScreen />);

    expect(screen.getByText('Spendifico')).toBeInTheDocument();
    expect(screen.queryByText(/Expensa/)).not.toBeInTheDocument();
  });

  it('has no password field anywhere on the screen (A31)', () => {
    const { container } = render(<LoginScreen />);

    expect(container.querySelector('input[type="password"]')).toBeNull();
  });
});
