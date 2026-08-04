import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';

import { SETUP_DRAFT_KEY } from './draft';
import { SetupBudgetScreen } from './SetupBudgetScreen';
import { SetupDraftProvider } from './SetupDraftProvider';

// AC1 to AC5 of PET-9.
//
// jsdom has no App Router, so useRouter() throws without the mock below. A package
// specifier, so the `@/` alias trap does not apply here - see the note in
// frontend/src/app/CLAUDE.md about jest.mock and that alias.
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));

// **This suite introduces @testing-library/user-event**, which was a declared
// devDependency that nothing used. fireEvent cannot cover AC2: `fireEvent.change`
// assigns a value in one shot and jsdom then parks the caret at the end, so it can
// neither reproduce incremental typing - where a formatter that breaks between
// keystrokes lives - nor observe a caret at all. userEvent.type() dispatches
// per-character events with real selection handling, re-reading the DOM between
// them, which is exactly the controlled-reformat loop under test.
//
// Conventions worth copying: setup() is called before render (a v14 requirement),
// and every interaction is awaited. No act() wrapping is needed.
//
// next/jest maps every .css import to an empty object, so nothing here can assert
// a rendered colour or size; class names are the only appearance signal, and that
// they generate CSS is proved in components/ui/utilities.test.ts.

/** U+2014, so a substitution in the currency label fails loudly rather than invisibly. */
const EM_DASH = '—';

const SUPPORTING_COPY =
  'How much do you plan to spend each month? You can change this anytime in Settings.';

const mockPush = jest.fn();

/** The screen inside the provider its steps always render within. */
function renderScreen() {
  return render(
    <SetupDraftProvider>
      <SetupBudgetScreen />
    </SetupDraftProvider>,
  );
}

const budgetField = () => screen.getByLabelText('Monthly budget');
const currencyField = () => screen.getByLabelText('Currency');
const continueButton = () => screen.getByRole('button', { name: 'Continue' });

const storedDraft = () => JSON.parse(sessionStorage.getItem(SETUP_DRAFT_KEY) ?? 'null');

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
});

describe('AC1: the card as designed', () => {
  it('shows the overline, heading and supporting copy', () => {
    renderScreen();

    expect(screen.getByText('STEP 1 OF 3')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Set your monthly budget' }),
    ).toBeInTheDocument();
    expect(screen.getByText(SUPPORTING_COPY)).toBeInTheDocument();
  });

  it('types the overline in the pressed accent, not the pill colour', () => {
    // Figma binds this line to Brand/Accent Pressed and the step pill 60px above
    // it to Brand/Accent. Swapping them is a one-token diff nothing else catches.
    renderScreen();

    expect(screen.getByText('STEP 1 OF 3').className).toContain('text-brand-accent-pressed');
    expect(screen.getByText('STEP 1 OF 3').className).toContain('text-overline');
  });

  it('renders exactly one page-level heading', () => {
    // There is no PageHeader outside the (app) shell, so this screen owns its h1.
    // The overline and the wordmark are both <p>.
    renderScreen();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('marks the first of three steps active', () => {
    // The three-state coverage lives in SetupShell.test.tsx; this only pins that
    // step 1 is what this screen asks for.
    const { container } = renderScreen();

    const dots = [...container.querySelectorAll('[aria-hidden="true"] > span')];
    expect(dots).toHaveLength(3);
    expect(dots[0]!.className).toContain('bg-brand-accent');
    expect(dots[1]!.className).toContain('bg-border-strong');
  });
});

describe('the currency field', () => {
  it('offers the one option the design shows, with a hyphen', () => {
    // A6: only "USD - $" appears anywhere in the file. The em-dash assertion is
    // the point - Figma types U+2014 and the repo normalised to a hyphen, and the
    // two are indistinguishable in a diff.
    renderScreen();

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('USD - $');
    expect(screen.queryByText(`USD ${EM_DASH} $`)).not.toBeInTheDocument();
  });

  it('holds the ISO code as its value, not the label', () => {
    // RegisterDto validates @IsISO4217CurrencyCode, so the code is what step 3
    // eventually posts. Storing the label would fail that validation.
    renderScreen();

    expect(currencyField()).toHaveValue('USD');
  });
});

describe('AC2: the budget field', () => {
  it('takes focus and carries the designed focus treatment', async () => {
    // The designed 1.5px accent border is a focus-within rule, and next/jest gives
    // jsdom no stylesheet, so what is assertable here is that the box carries the
    // rule and the input suppresses the browser's own ring. The visual check is
    // Storybook's.
    const user = userEvent.setup();
    renderScreen();

    await user.click(budgetField());

    expect(budgetField()).toHaveFocus();
    expect(budgetField().className).toContain('outline-none');
    expect(budgetField().parentElement!.className).toContain('focus-within:border-brand-accent');
  });

  it('groups thousands as they are typed', async () => {
    // The AC's own example. Typed character by character, so a formatter that only
    // works on a complete value fails here.
    const user = userEvent.setup();
    renderScreen();

    await user.type(budgetField(), '2000');

    expect(budgetField()).toHaveValue('2,000');
  });

  it('shows the currency prefix, hidden from assistive technology', () => {
    // The label already says "Monthly budget"; a screen reader announcing a bare
    // "dollar sign" before the value is noise, which is ui/Input's own reasoning.
    renderScreen();

    const prefix = screen.getByText('$');
    expect(prefix).toBeInTheDocument();
    expect(prefix).toHaveAttribute('aria-hidden', 'true');
  });

  it('truncates a third decimal rather than rounding it', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.type(budgetField(), '2000.555');

    expect(budgetField()).toHaveValue('2,000.55');
  });

  it('stays a text input with a numeric keypad', async () => {
    // ui/Input refuses type="number" for three reasons, one of which is this
    // screen's: selectionStart throws on a number input, so the caret restore
    // would be impossible.
    renderScreen();

    expect(budgetField()).toHaveAttribute('type', 'text');
    expect(budgetField()).toHaveAttribute('inputmode', 'decimal');
  });

  it('restores the caret itself rather than leaving it to React', async () => {
    // **Read this before "simplifying" the assertion into a selectionStart check.**
    // Under jsdom the caret's final position is not evidence of anything: React
    // saves and restores the selection offset around its own controlled-input
    // commit, and user-event keeps separate cursor bookkeeping on top. An earlier
    // version of this test asserted `field.selectionStart` and passed identically
    // with the restore deleted from BudgetForm - it proved nothing.
    //
    // React's restore is by raw *offset*, which is wrong exactly when the
    // reformat inserts a separator to the left of the caret: typing the last 0 of
    // 2000 turns '200|0' into '2,00|0' instead of '2,000|'. amountCaret computes
    // the semantic position instead, and lib/format.test.ts covers that
    // arithmetic directly. What is falsifiable *here* is only that the wiring
    // runs and with which offset, so that is what this asserts.
    //
    // The visible outcome is a browser check: Storybook, and the manual walk in
    // the plan doc. docs/TODO.md records the gap.
    const setSelectionRange = jest.spyOn(HTMLInputElement.prototype, 'setSelectionRange');

    const user = userEvent.setup();
    renderScreen();

    await user.type(budgetField(), '2000');

    // The final keystroke: raw '2000' with the caret at 4, formatted '2,000', so
    // the caret belongs at 5 - past the separator React would have stopped before.
    expect(setSelectionRange).toHaveBeenCalledWith(5, 5);
    expect(budgetField()).toHaveValue('2,000');

    setSelectionRange.mockRestore();
  });
});

describe('AC3: an empty or zero budget', () => {
  it.each([
    ['an untouched field', ''],
    ['a bare zero', '0'],
    ['zero with cents', '0.00'],
  ])('refuses to continue on %s', async (_label, typed) => {
    const user = userEvent.setup();
    renderScreen();

    if (typed !== '') await user.type(budgetField(), typed);
    await user.click(continueButton());

    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByText('Enter an amount greater than 0.')).toBeInTheDocument();
  });

  it('wires the message to the field for assistive technology', async () => {
    // ui/Field owns this pairing; the assertion is that the screen actually passes
    // its error through rather than rendering its own line of copy.
    const user = userEvent.setup();
    renderScreen();

    await user.click(continueButton());

    const message = screen.getByText('Enter an amount greater than 0.');
    expect(budgetField()).toHaveAttribute('aria-invalid', 'true');
    expect(budgetField()).toHaveAttribute('aria-describedby', message.id);
  });

  it('shows no message before a submit is attempted', async () => {
    // Validation on submit only, matching ui/Field's own note. Typing a zero must
    // not scold the user mid-keystroke.
    const user = userEvent.setup();
    renderScreen();

    await user.type(budgetField(), '0');

    expect(screen.queryByText('Enter an amount greater than 0.')).not.toBeInTheDocument();
    expect(budgetField()).not.toHaveAttribute('aria-invalid');
  });

  it('clears the message as soon as the field changes', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(continueButton());
    expect(screen.getByText('Enter an amount greater than 0.')).toBeInTheDocument();

    await user.type(budgetField(), '5');

    expect(screen.queryByText('Enter an amount greater than 0.')).not.toBeInTheDocument();
  });

  it('rejects an empty budget submitted with Enter as well', async () => {
    // Proves the <form> wiring rather than a click handler: Enter in the field has
    // to reach the same validation, and preventDefault has to stop the GET that a
    // form with no action would otherwise make.
    const user = userEvent.setup();
    renderScreen();

    await user.type(budgetField(), '{Enter}');

    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByText('Enter an amount greater than 0.')).toBeInTheDocument();
  });
});

describe('AC4: a valid budget continues', () => {
  it('opens step 2', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.type(budgetField(), '2000');
    await user.click(continueButton());

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/setup/categories');
  });

  it('continues on Enter in the budget field', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.type(budgetField(), '2000{Enter}');

    expect(mockPush).toHaveBeenCalledWith('/setup/categories');
  });

  it('creates nothing server side', async () => {
    // A32: the account does not exist until step 3. Asserted rather than commented,
    // because it is a requirement - and made falsifiable two ways, since a fetch
    // spy alone would miss a native form post.
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof global.fetch;

    const user = userEvent.setup();
    const { container } = renderScreen();

    await user.type(budgetField(), '2000');
    await user.click(continueButton());

    expect(fetchSpy).not.toHaveBeenCalled();

    const form = container.querySelector('form')!;
    expect(form).not.toHaveAttribute('action');
    expect(form).not.toHaveAttribute('method');
  });
});

describe('AC5: the draft survives leaving and coming back', () => {
  it('persists what was entered', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.type(budgetField(), '2000');

    expect(storedDraft()).toEqual({ currency: 'USD', budget: '2,000' });
  });

  it('comes back filled in after the screen unmounts', async () => {
    // This is AC5 literally. Clicking "Back" to Welcome leaves /setup, which
    // unmounts the layout and everything under it; returning mounts it again. An
    // unmount and a second render are exactly those two events, with no router
    // needed to stage them.
    const user = userEvent.setup();
    const { unmount } = renderScreen();

    await user.type(budgetField(), '2000');
    unmount();

    renderScreen();

    expect(budgetField()).toHaveValue('2,000');
  });

  it('reads a draft that was already in storage before the first render', async () => {
    sessionStorage.setItem(
      SETUP_DRAFT_KEY,
      JSON.stringify({ currency: 'USD', budget: '1,500.25' }),
    );

    renderScreen();

    expect(budgetField()).toHaveValue('1,500.25');
  });

  it('does not persist anything before the user touches the form', () => {
    // The provider must not write on mount. If it did, the mount write would race
    // its own read and could overwrite a real draft with the empty one.
    renderScreen();

    expect(sessionStorage.getItem(SETUP_DRAFT_KEY)).toBeNull();
  });
});

describe('the two controls', () => {
  it('makes Back a link home and Continue a button', async () => {
    // The inverted mirror of WelcomeScreen's "both exits are links" assertion.
    // Continue cannot be a link, because its navigation is conditional on
    // validation and an anchor cannot be blocked - so a regression to a link would
    // silently delete AC3. Exactly one of each is what catches that.
    renderScreen();

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName('Back');
    expect(links[0]).toHaveAttribute('href', '/');

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName('Continue');
    expect(buttons[0]).toHaveAttribute('type', 'submit');
  });

  it('carries no password field, here or anywhere in onboarding', () => {
    // A31: access is passwordless and no frame draws a password field. Cheap to
    // assert on every access screen, and the one regression nobody would question.
    const { container } = renderScreen();

    expect(container.querySelector('input[type="password"]')).toBeNull();
  });
});
