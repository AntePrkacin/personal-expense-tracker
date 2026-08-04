import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';

import { SETUP_DRAFT_KEY, type SetupDraft } from '../draft';
import { SetupDraftProvider } from '../SetupDraftProvider';
import type { RegisterResult } from './actions';
import { RegisterForm } from './RegisterForm';

// AC2 to AC5 of PET-11, plus the two behaviours the design does not draw. AC1 is the
// card itself and lives in SetupRegisterScreen.test.tsx.
//
// A package specifier, so the `@/` alias trap does not apply - see the note in
// frontend/src/app/CLAUDE.md about jest.mock and that alias.
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));

const mockPush = jest.fn();

/** The action, injected. The prop exists so this needs no module mock at all. */
const register = jest.fn<Promise<RegisterResult>, [unknown]>();

/** A complete draft, as steps 1 and 2 would have left it. */
const FILLED: SetupDraft = {
  currency: 'USD',
  budget: '2,000',
  categories: ['Groceries', 'Transport'],
  firstName: 'Marko',
  lastName: 'Kovač',
  email: 'marko@email.com',
};

function seed(draft: Partial<SetupDraft>) {
  sessionStorage.setItem(SETUP_DRAFT_KEY, JSON.stringify(draft));
}

function renderForm() {
  return render(
    <SetupDraftProvider>
      <RegisterForm register={register} />
    </SetupDraftProvider>,
  );
}

const firstNameField = () => screen.getByLabelText('First name');
const lastNameField = () => screen.getByLabelText('Last name');
const emailField = () => screen.getByLabelText('Email');
const finishButton = () => screen.getByRole('button', { name: 'Finish setup' });

const storedDraft = () => JSON.parse(sessionStorage.getItem(SETUP_DRAFT_KEY) ?? 'null');

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
  register.mockResolvedValue({ ok: true });
});

describe('AC1: the three fields', () => {
  it('lays the two names on one row and the email across both', () => {
    // The frame draws two 214px fields with a 12px gap inside a 440px content box,
    // and (440 - 12) / 2 is exactly 214 - so two equal columns is the design rather
    // than an approximation of it (node 129:1156). The email is a sibling of the
    // grid, not a third cell, which is what makes it full width.
    const { container } = renderForm();

    const row = container.querySelector('.grid')!;
    expect(row.className).toContain('grid-cols-2');
    expect(row.className).toContain('gap-3');
    expect(row).toContainElement(firstNameField());
    expect(row).toContainElement(lastNameField());
    expect(row).not.toContainElement(emailField());
  });

  it('types the email field as an email', () => {
    // REG-2 validates the format, and `ui/Input` declares the `email` type for this
    // screen. It also gets the right keyboard on a phone.
    renderForm();

    expect(emailField()).toHaveAttribute('type', 'email');
    expect(firstNameField()).toHaveAttribute('type', 'text');
  });

  it('marks all three required without an asterisk', () => {
    // A12 marks required fields by not saying "(optional)". `required` still carries
    // aria-required, and noValidate below is what stops the browser bubble replacing
    // the designed message.
    renderForm();

    for (const field of [firstNameField(), lastNameField(), emailField()]) {
      expect(field).toBeRequired();
    }
    expect(screen.queryByText(/\*/)).not.toBeInTheDocument();
  });

  it('sets noValidate so the designed messages are the ones that show', () => {
    const { container } = renderForm();

    expect(container.querySelector('form')).toHaveAttribute('novalidate');
  });

  it('carries no password field', () => {
    // A31: access is passwordless and no frame draws one. Cheap to assert on every
    // access screen, and the one regression nobody would question.
    const { container } = renderForm();

    expect(container.querySelector('input[type="password"]')).toBeNull();
  });
});

describe('AC2: an empty field blocks the submit', () => {
  it('reports all three at once rather than the first', async () => {
    // Stopping at the first failure would make a user with three empty fields submit
    // three times to discover that.
    const user = userEvent.setup();
    renderForm();

    await user.click(finishButton());

    expect(screen.getByText('Enter your first name.')).toBeInTheDocument();
    expect(screen.getByText('Enter your last name.')).toBeInTheDocument();
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('reports only the field that is empty', async () => {
    const user = userEvent.setup();
    seed({ ...FILLED, lastName: '' });
    renderForm();

    await user.click(finishButton());

    expect(screen.getByText('Enter your last name.')).toBeInTheDocument();
    expect(screen.queryByText('Enter your first name.')).not.toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it('treats a field holding only spaces as empty', async () => {
    // The DTO's @IsNotEmpty() runs after its own trim, so spaces are a 400 rather
    // than a name - and this screen has no error surface designed for one.
    const user = userEvent.setup();
    seed({ ...FILLED, firstName: '   ' });
    renderForm();

    await user.click(finishButton());

    expect(screen.getByText('Enter your first name.')).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it('shows nothing before the first submit', async () => {
    // Validation runs on submit only, which is step 1's rule. A message on an
    // untouched field reads as an error the user caused.
    const user = userEvent.setup();
    renderForm();

    await user.type(firstNameField(), 'M');

    expect(screen.queryByText('Enter your first name.')).not.toBeInTheDocument();
  });

  it('wires the message to the field it belongs to', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(finishButton());

    const message = screen.getByText('Enter your first name.');
    expect(firstNameField()).toHaveAttribute('aria-invalid', 'true');
    expect(firstNameField()).toHaveAttribute('aria-describedby', message.id);
    expect(lastNameField()).not.toHaveAttribute('aria-describedby', message.id);
  });

  it('clears one field s message without clearing the others', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(finishButton());
    await user.type(firstNameField(), 'Marko');

    expect(screen.queryByText('Enter your first name.')).not.toBeInTheDocument();
    expect(screen.getByText('Enter your last name.')).toBeInTheDocument();
  });
});

describe('AC3: a malformed email blocks the submit', () => {
  it.each(['marko', 'marko@', 'marko@email', '@email.com'])(
    'rejects %s with the format message',
    async (email) => {
      const user = userEvent.setup();
      seed({ ...FILLED, email });
      renderForm();

      await user.click(finishButton());

      expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
      expect(register).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    },
  );

  it('distinguishes empty from malformed', async () => {
    // Two messages because AC2 and AC3 are two criteria. One string for both would
    // tell a user who typed something that they typed nothing.
    const user = userEvent.setup();
    seed({ ...FILLED, email: 'marko' });
    renderForm();

    await user.click(finishButton());

    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.queryByText('Enter your email address.')).not.toBeInTheDocument();
  });
});

describe('AC4: a valid form submits everything and opens Check your email', () => {
  it('sends the two earlier steps values along with this screen s', async () => {
    // AC4 in one assertion. The account does not exist until now (A32), so this one
    // request is the only thing that ever carries the budget and the categories.
    const user = userEvent.setup();
    seed(FILLED);
    renderForm();

    await user.click(finishButton());

    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith({
      firstName: 'Marko',
      lastName: 'Kovač',
      email: 'marko@email.com',
      currency: 'USD',
      monthlyBudget: 2000,
      categories: ['Groceries', 'Transport'],
    });
  });

  it('opens Check your email on a clean path, carrying no address', async () => {
    // VER-1 interpolates the address and the draft is cleared by the time that screen
    // renders, so something has to carry it - but **not the URL**. PET-12 moved it into
    // an httpOnly cookie the action sets, because Next's request log and any proxy in
    // front of it record the full path including the query string, so an address here
    // would be written into the server's logs on every registration.
    //
    // Asserted as an exact string rather than a prefix: a `?email=` that came back
    // would satisfy `toContain('/check-email')` and defeat the whole point.
    const user = userEvent.setup();
    seed(FILLED);
    renderForm();

    await user.click(finishButton());

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(mockPush).toHaveBeenCalledWith('/check-email');
  });

  it('carries no address for an address that would have needed encoding', async () => {
    // This replaces an assertion about percent-encoding `marko+tag@email.com`, which
    // had nothing left to test once the query string went away. What is worth keeping
    // is the inverse: the address that most obviously *would* have shown up in a URL
    // does not show up in one.
    const user = userEvent.setup();
    seed({ ...FILLED, email: 'marko+tag@email.com' });
    renderForm();

    await user.click(finishButton());

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/check-email'));
    expect(mockPush.mock.calls[0][0]).not.toContain('marko');
  });

  it('submits what was typed rather than what was seeded', async () => {
    // Only steps 1 and 2's half is seeded; this screen's three fields are typed, the
    // way a user who walked the flow would leave them.
    const user = userEvent.setup();
    seed({ budget: '2,000', categories: ['Groceries'] });
    renderForm();

    await user.type(firstNameField(), 'Marko');
    await user.type(lastNameField(), 'Kovač');
    await user.type(emailField(), 'marko@email.com');
    await user.click(finishButton());

    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: 'Marko', email: 'marko@email.com' }),
    );
  });

  it('submits on Enter in a field', async () => {
    // A card with three fields where Enter does nothing reads as broken, which is
    // why this is a real form with a submit button rather than an onClick.
    const user = userEvent.setup();
    seed(FILLED);
    renderForm();

    await user.type(emailField(), '{Enter}');

    expect(register).toHaveBeenCalledTimes(1);
  });

  it('clears the draft, so an abandoned registration does not outlive the flow', async () => {
    // docs/TODO.md called this the only natural moment. Note the consequence it
    // records: the browser s own Back button then reaches an empty Register, which is
    // accepted because the account already exists by then.
    const user = userEvent.setup();
    seed(FILLED);
    renderForm();

    await user.click(finishButton());

    await waitFor(() => expect(sessionStorage.getItem(SETUP_DRAFT_KEY)).toBeNull());
  });

  it('keeps the card filled while the next route loads', async () => {
    // clearDraft re-renders this form synchronously, but the push it precedes takes
    // a moment - so without freezing the values first, the user watches the card
    // empty itself before the next screen arrives. Visible for as long as the
    // navigation takes, which on PET-11 alone ends at a 404.
    const user = userEvent.setup();
    seed(FILLED);
    renderForm();

    await user.click(finishButton());

    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(sessionStorage.getItem(SETUP_DRAFT_KEY)).toBeNull();
    expect(firstNameField()).toHaveValue('Marko');
    expect(emailField()).toHaveValue('marko@email.com');
  });

  it('cannot be typed back into once it has succeeded', async () => {
    // The draft is gone by now, so an unguarded keystroke would write a fresh one
    // holding a single field.
    const user = userEvent.setup();
    seed(FILLED);
    renderForm();

    await user.click(finishButton());
    await waitFor(() => expect(mockPush).toHaveBeenCalled());

    await user.type(firstNameField(), 'X');

    expect(sessionStorage.getItem(SETUP_DRAFT_KEY)).toBeNull();
    expect(firstNameField()).toHaveValue('Marko');
  });

  it('leaves the submit disabled after a success', async () => {
    // The account exists now. Re-enabling would offer a second registration of the
    // same address while the next route loads.
    const user = userEvent.setup();
    seed(FILLED);
    renderForm();

    await user.click(finishButton());
    await waitFor(() => expect(mockPush).toHaveBeenCalled());

    expect(finishButton()).toBeDisabled();
  });

  it('clears the draft only after a success', async () => {
    register.mockResolvedValue({ ok: false, status: 429 });

    const user = userEvent.setup();
    seed(FILLED);
    renderForm();

    await user.click(finishButton());

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(storedDraft()).toMatchObject({ email: 'marko@email.com', budget: '2,000' });
  });
});

describe('the values steps 1 and 2 were supposed to collect', () => {
  it('sends me back to step 1 rather than posting a budget that is not there', async () => {
    // Reachable without a bug anywhere: the draft is per tab, so opening
    // /setup/register in a new tab starts empty, and nothing gates the route. Before
    // this guard, toRegisterBody produced monthlyBudget: NaN, JSON.stringify wrote
    // it as null, and RegisterDto's @IsNumber answered 400 - surfaced as the generic
    // failure message on a screen that cannot fix a budget.
    const user = userEvent.setup();
    seed({ ...FILLED, budget: '' });
    renderForm();

    await user.click(finishButton());

    expect(register).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/setup');
  });

  it.each([
    ['a bare zero', '0'],
    ['zero with cents', '0.00'],
    ['junk', 'abc'],
  ])('treats %s the same way', async (_label, budget) => {
    const user = userEvent.setup();
    seed({ ...FILLED, budget });
    renderForm();

    await user.click(finishButton());

    expect(register).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/setup');
  });

  it('keeps the draft so step 1 opens filled in and the names survive', async () => {
    // The reason a redirect is enough on its own: nothing is lost by the detour.
    const user = userEvent.setup();
    seed({ ...FILLED, budget: '' });
    renderForm();

    await user.click(finishButton());

    expect(storedDraft()).toMatchObject({
      firstName: 'Marko',
      lastName: 'Kovač',
      email: 'marko@email.com',
      categories: ['Groceries', 'Transport'],
    });
  });

  it('still checks this screen s own fields first', async () => {
    // Order matters: an empty form with an empty budget should say what is wrong
    // here rather than silently bouncing to step 1.
    const user = userEvent.setup();
    seed({ ...FILLED, budget: '', firstName: '' });
    renderForm();

    await user.click(finishButton());

    expect(screen.getByText('Enter your first name.')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('lets an empty category selection through, because A4 allows it', async () => {
    const user = userEvent.setup();
    seed({ ...FILLED, categories: [] });
    renderForm();

    await user.click(finishButton());

    expect(register).toHaveBeenCalledWith(expect.objectContaining({ categories: [] }));
  });
});

describe('AC5: Back returns to step 2 with the selection intact', () => {
  it('links to step 2 rather than pushing to it', async () => {
    // Back always navigates, so it is a link - Welcome s rule. Finish setup cannot
    // be one, because its navigation is conditional on validation and an anchor
    // cannot be blocked. Exactly one of each is what catches a regression either way.
    renderForm();

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName('Back');
    expect(links[0]).toHaveAttribute('href', '/setup/categories');

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAttribute('type', 'submit');
  });

  it('leaves the categories untouched while this screen is used', async () => {
    // What "with my category selection unchanged" needs: patchDraft merges, so
    // typing a name here cannot disturb what step 2 stored.
    const user = userEvent.setup();
    seed(FILLED);
    renderForm();

    await user.type(firstNameField(), '!');

    expect(storedDraft().categories).toEqual(['Groceries', 'Transport']);
    expect(storedDraft().budget).toBe('2,000');
  });

  it('comes back filled in after the screen unmounts', async () => {
    // AC5 literally. Clicking Back leaves /setup/register, which unmounts this
    // route; returning mounts it again. An unmount and a second render are exactly
    // those two events, with no router needed to stage them.
    const user = userEvent.setup();
    const { unmount } = renderForm();

    await user.type(firstNameField(), 'Marko');
    await user.type(emailField(), 'marko@email.com');
    unmount();

    renderForm();

    expect(firstNameField()).toHaveValue('Marko');
    expect(emailField()).toHaveValue('marko@email.com');
  });

  it('does not persist anything before the user touches the form', () => {
    renderForm();

    expect(sessionStorage.getItem(SETUP_DRAFT_KEY)).toBeNull();
  });
});

describe('the request, which the design draws no states for', () => {
  it('disables the submit while it is out', async () => {
    // A19 designs no pending state, but a live control is not a missing nicety here:
    // a double submit spends one of the five per-address attempts the backend s
    // throttler allows, and the second would be refused with a 429.
    let settle: (result: RegisterResult) => void = () => {};
    register.mockReturnValue(
      new Promise<RegisterResult>((resolve) => {
        settle = resolve;
      }),
    );

    const user = userEvent.setup();
    seed(FILLED);
    renderForm();

    await user.click(finishButton());

    expect(finishButton()).toBeDisabled();

    settle({ ok: true });
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
  });

  it('cannot be submitted twice', async () => {
    let settle: (result: RegisterResult) => void = () => {};
    register.mockReturnValue(
      new Promise<RegisterResult>((resolve) => {
        settle = resolve;
      }),
    );

    const user = userEvent.setup();
    seed(FILLED);
    renderForm();

    await user.click(finishButton());
    await user.click(finishButton());

    expect(register).toHaveBeenCalledTimes(1);

    settle({ ok: true });
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
  });

  it.each([
    ['a validation rejection', { ok: false as const, status: 400 }],
    ['the rate limiter', { ok: false as const, status: 429 }],
    ['an unreachable backend', { ok: false as const }],
  ])('reports %s in one line and stays put', async (_label, result) => {
    // A29 designs no error surface and the spec says so outright, so this line is
    // ours: the same red-text treatment ui/Field uses, and one message for every
    // failure because the screen cannot act on the difference.
    register.mockResolvedValue(result);

    const user = userEvent.setup();
    seed(FILLED);
    renderForm();

    await user.click(finishButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("We couldn't create your account. Please try again.");
    expect(alert.className).toContain('text-status-danger-text');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('re-enables the submit after a failure', async () => {
    register.mockResolvedValue({ ok: false, status: 500 });

    const user = userEvent.setup();
    seed(FILLED);
    renderForm();

    await user.click(finishButton());

    await waitFor(() => expect(finishButton()).toBeEnabled());
  });

  it('clears the failure once the user changes something', async () => {
    register.mockResolvedValue({ ok: false, status: 400 });

    const user = userEvent.setup();
    seed(FILLED);
    renderForm();

    await user.click(finishButton());
    await screen.findByRole('alert');

    await user.type(emailField(), 'x');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows no message before a submit is attempted', () => {
    renderForm();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('makes the request itself, rather than letting the form post natively', async () => {
    // A native post would reload the page and lose the draft. The form carries no
    // action or method, so nothing can.
    const user = userEvent.setup();
    seed(FILLED);
    const { container } = renderForm();

    await user.click(finishButton());

    const form = container.querySelector('form')!;
    expect(form).not.toHaveAttribute('action');
    expect(form).not.toHaveAttribute('method');
    expect(register).toHaveBeenCalledTimes(1);
  });
});
