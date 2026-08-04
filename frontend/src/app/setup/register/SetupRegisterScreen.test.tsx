import { render, screen } from '@testing-library/react';
import { useRouter } from 'next/navigation';

import { SetupDraftProvider } from '../SetupDraftProvider';
import { SetupRegisterScreen } from './SetupRegisterScreen';

// AC1 of PET-11: the card as frame 22 draws it. Everything the form *does* is in
// RegisterForm.test.tsx.
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));

// A relative specifier, because jest.mock cannot resolve the `@/` alias anywhere -
// see frontend/src/app/CLAUDE.md. Mocked so no assertion here can reach a real
// fetch, even though nothing in this suite submits.
jest.mock('./actions', () => ({ registerAccount: jest.fn() }));

const SUPPORTING_COPY = 'Create your account to start tracking your spending.';

function renderScreen() {
  return render(
    <SetupDraftProvider>
      <SetupRegisterScreen />
    </SetupDraftProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
});

describe('AC1: the card as designed', () => {
  it('shows the overline, heading and supporting copy', () => {
    renderScreen();

    expect(screen.getByText('STEP 3 OF 3')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Register' })).toBeInTheDocument();
    expect(screen.getByText(SUPPORTING_COPY)).toBeInTheDocument();
  });

  it('types the overline in the pressed accent, not the pill colour', () => {
    // Figma binds this line to Brand/Accent Pressed and the step pill above it to
    // Brand/Accent. Swapping them is a one-token diff nothing else catches.
    renderScreen();

    expect(screen.getByText('STEP 3 OF 3').className).toContain('text-brand-accent-pressed');
    expect(screen.getByText('STEP 3 OF 3').className).toContain('text-overline');
  });

  it('renders exactly one page-level heading', () => {
    // There is no PageHeader outside the (app) shell, so this screen owns its h1.
    // The overline and the wordmark are both <p>.
    renderScreen();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('marks the third of three steps active', () => {
    // The three-state coverage lives in SetupShell.test.tsx; this only pins that
    // step 3 is what this screen asks for.
    const { container } = renderScreen();

    const dots = [...container.querySelectorAll('[aria-hidden="true"] > span')];
    expect(dots).toHaveLength(3);
    expect(dots[0]!.className).toContain('bg-border-strong');
    expect(dots[1]!.className).toContain('bg-border-strong');
    expect(dots[2]!.className).toContain('bg-brand-accent');
  });

  it('draws the card at frame 22s width, not step 2s', () => {
    // Frame 03 is 600px and frames 02 and 22 are 520. STEP_WIDTH already recorded
    // that, so this pins that the screen asks for the right step rather than
    // inheriting the wider card.
    const { container } = renderScreen();

    expect(container.querySelector('.shadow-card')!.className).toContain('w-130');
  });

  it('renders the three fields in the designed order', () => {
    renderScreen();

    const labels = [...screen.getAllByText(/^(First name|Last name|Email)$/)].map(
      (node) => node.textContent,
    );
    expect(labels).toEqual(['First name', 'Last name', 'Email']);
  });

  it('carries no password field', () => {
    // A31: access is passwordless and no frame draws one.
    const { container } = renderScreen();

    expect(container.querySelector('input[type="password"]')).toBeNull();
  });
});
