import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { Profile } from '@/lib/profile';
import type { UpdateProfileResult } from '@/lib/updateProfile';

import { SettingsForm } from './SettingsForm';

// PET-46's acceptance suite. The action is injected as a prop rather than mocked as a module -
// `AddCategoryModal.test.tsx`'s shape - so the `@/` alias trap never comes up and every assertion
// about the request is made against a `jest.fn()` this file owns.
const refresh = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: (...args: unknown[]) => refresh(...args) }),
}));

/** Frame 17's own persona, which is also the fixtures'. */
const PROFILE: Profile = {
  firstName: 'Marko',
  lastName: 'Kovač',
  email: 'marko@email.com',
  currency: 'USD',
  monthlyBudget: 2000,
  monthStartDay: 1,
};

function renderForm(save: jest.Mock = jest.fn().mockResolvedValue({ ok: true })) {
  render(<SettingsForm profile={PROFILE} save={save} />);
  return save;
}

/**
 * The same render, plus the handle a `router.refresh()` needs to be simulated.
 *
 * `refresh` is a `jest.fn()` here, so nothing re-runs the Server Component on its own - the way a
 * refreshed profile actually reaches this component is as a **new prop**, which is what `land()`
 * delivers. A fresh object every time, deliberately: `page.tsx` builds one on every server render,
 * so a resync comparing by identity rather than by value would fire on refreshes that changed
 * nothing.
 */
function renderWithRefresh(save: jest.Mock = jest.fn().mockResolvedValue({ ok: true })) {
  const view = render(<SettingsForm profile={PROFILE} save={save} />);

  return {
    save,
    land: (next: Partial<Profile>) =>
      view.rerender(<SettingsForm profile={{ ...PROFILE, ...next }} save={save} />),
  };
}

const saveButton = () => screen.getByRole('button', { name: 'Save changes' });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AC1: the card shows the stored profile', () => {
  it('prefills the three fields', () => {
    renderForm();

    expect(screen.getByLabelText('First name')).toHaveValue('Marko');
    expect(screen.getByLabelText('Last name')).toHaveValue('Kovač');
    expect(screen.getByLabelText('Email')).toHaveValue('marko@email.com');
  });

  it('files the card under a Profile heading', () => {
    renderForm();

    expect(screen.getByRole('heading', { level: 2, name: 'Profile' })).toBeInTheDocument();
  });
});

describe('AC2: the avatar', () => {
  it('shows the initials derived from the stored name', () => {
    renderForm();

    expect(screen.getByText('MK')).toBeInTheDocument();
  });

  it('is announced rather than hidden, unlike the sidebar footer tile', () => {
    // The deliberate divergence from `ui/Sidebar`, which hides its identical tile because the full
    // name is read out right after it. Here the names live in inputs, so the initials are the only
    // place a screen reader meets them on this card.
    renderForm();

    expect(screen.getByText('MK').closest('[aria-hidden="true"]')).toBeNull();
  });

  it('carries the caption, naming Spendifico rather than the frame’s Expensa', () => {
    renderForm();

    expect(screen.getByText('Your avatar')).toBeInTheDocument();
    expect(screen.getByText('Your initials are used across Spendifico.')).toBeInTheDocument();
  });

  it('names the product Spendifico nowhere as Expensa', () => {
    // The same pin six other suites carry, so the rename cannot be half-reverted from the design
    // file.
    renderForm();

    expect(screen.queryByText(/Expensa/)).not.toBeInTheDocument();
  });

  it('offers no upload control of any kind', () => {
    // SET-2: the initials are derived and never stored, so there is nothing to replace them with.
    const { container } = render(<SettingsForm profile={PROFILE} save={jest.fn()} />);

    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /upload|change photo|avatar|remove/i }),
    ).not.toBeInTheDocument();
  });
});

describe('AC3: the initials follow what is being typed', () => {
  it('updates the tile on a new first name, before any save', async () => {
    const user = userEvent.setup();
    const save = renderForm();

    await user.clear(screen.getByLabelText('First name'));
    await user.type(screen.getByLabelText('First name'), 'Ana');

    expect(screen.getByText('AK')).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('updates the tile on a new last name too', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.clear(screen.getByLabelText('Last name'));
    await user.type(screen.getByLabelText('Last name'), 'Marić');

    expect(screen.getByText('MM')).toBeInTheDocument();
  });

  it('empties the tile when both names are cleared', async () => {
    // Rather than falling back to a placeholder glyph the design does not draw. `initials('','')`
    // is the empty string, and this pins that the card renders it rather than inventing something.
    const user = userEvent.setup();
    renderForm();

    await user.clear(screen.getByLabelText('First name'));
    await user.clear(screen.getByLabelText('Last name'));

    expect(screen.queryByText('MK')).not.toBeInTheDocument();
  });
});

describe('AC4: a malformed or empty email persists nothing', () => {
  it('shows the required message and makes no request on an empty address', async () => {
    const user = userEvent.setup();
    const save = renderForm();

    await user.clear(screen.getByLabelText('Email'));
    await user.click(saveButton());

    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows the format message and makes no request on a malformed address', async () => {
    const user = userEvent.setup();
    const save = renderForm();

    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'not-an-address');
    await user.click(saveButton());

    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it('marks the field invalid and describes it by its message', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.clear(screen.getByLabelText('Email'));
    await user.click(saveButton());

    const email = screen.getByLabelText('Email');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    // Both ids: the standing hint must not be dropped the moment the field goes invalid.
    expect(email).toHaveAttribute('aria-describedby', 'settings-email-hint settings-email-error');
  });

  it('reports every invalid field at once', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.clear(screen.getByLabelText('First name'));
    await user.clear(screen.getByLabelText('Last name'));
    await user.clear(screen.getByLabelText('Email'));
    await user.click(saveButton());

    expect(screen.getByText('Enter your first name.')).toBeInTheDocument();
    expect(screen.getByText('Enter your last name.')).toBeInTheDocument();
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
  });

  it('clears a message on the next keystroke in that field and not another', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.clear(screen.getByLabelText('First name'));
    await user.clear(screen.getByLabelText('Email'));
    await user.click(saveButton());

    await user.type(screen.getByLabelText('Email'), 'marko@email.com');

    expect(screen.queryByText('Enter your email address.')).not.toBeInTheDocument();
    // Still on screen: the user has not been back to that field, so its message is still true.
    expect(screen.getByText('Enter your first name.')).toBeInTheDocument();
  });

  it('refuses a blank first name too', async () => {
    const user = userEvent.setup();
    const save = renderForm();

    await user.clear(screen.getByLabelText('First name'));
    await user.click(saveButton());

    expect(screen.getByText('Enter your first name.')).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
});

describe('AC5: a valid save', () => {
  it('sends exactly the field that changed', async () => {
    // The whole-profile PATCH is the expensive failure: it would write the five fields the user
    // never opened, and the endpoint would answer 200 while doing it.
    const user = userEvent.setup();
    const save = renderForm();

    await user.clear(screen.getByLabelText('First name'));
    await user.type(screen.getByLabelText('First name'), 'Ana');
    await user.click(saveButton());

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith({ firstName: 'Ana' });
  });

  it('refreshes the route, which is what redraws the sidebar footer', async () => {
    // The only half of AC5 jsdom can reach. The footer actually changing is a browser check,
    // because it is rendered by `(app)/layout.tsx` above this component.
    const user = userEvent.setup();
    renderForm();

    await user.clear(screen.getByLabelText('First name'));
    await user.type(screen.getByLabelText('First name'), 'Ana');
    await user.click(saveButton());

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('confirms the save in the polite live region', async () => {
    // Asserted by the region's *text* rather than its presence: the region ships mounted and
    // empty, because a polite region created in the same commit as its content is generally not
    // announced at all, and `getByRole('status')` cannot tell that apart from a working one.
    const user = userEvent.setup();
    renderForm();

    expect(screen.getByRole('status')).toHaveTextContent('');

    await user.clear(screen.getByLabelText('First name'));
    await user.type(screen.getByLabelText('First name'), 'Ana');
    await user.click(saveButton());

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Changes saved'));
  });

  it('clears the confirmation on the next edit', async () => {
    // "Changes saved" over a form that has since been edited is the one lie this form could tell.
    const user = userEvent.setup();
    renderForm();

    await user.clear(screen.getByLabelText('First name'));
    await user.type(screen.getByLabelText('First name'), 'Ana');
    await user.click(saveButton());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Changes saved'));

    await user.type(screen.getByLabelText('Last name'), 'x');

    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('sends a changed address with the casing the user typed', async () => {
    const user = userEvent.setup();
    const save = renderForm();

    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'Marko.Kovac@Email.com');
    await user.click(saveButton());

    await waitFor(() => expect(save).toHaveBeenCalledWith({ email: 'Marko.Kovac@Email.com' }));
  });
});

describe('the clean form', () => {
  it('sends nothing and says nothing', async () => {
    // `PATCH /api/profile` answers 400 to a body with no keys, so a press on an untouched form is
    // a correct answer to a question the user did not ask. No request, no refresh, and no
    // "Changes saved" - claiming a save that never happened is the failure this guards.
    const user = userEvent.setup();
    const save = renderForm();

    await user.click(saveButton());

    expect(save).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('keeps Save enabled rather than disabling it', async () => {
    // Deliberately not `AllocateBudgetModal`'s `!isDirty`: that modal has a designed disabled
    // state and this frame does not, so a dead button with nothing beside it explaining itself
    // would be worse than a press that does nothing.
    renderForm();

    expect(saveButton()).toBeEnabled();
  });

  it('treats a whitespace-only edit as no edit', async () => {
    const user = userEvent.setup();
    const save = renderForm();

    await user.type(screen.getByLabelText('First name'), '  ');
    await user.click(saveButton());

    expect(save).not.toHaveBeenCalled();
  });
});

describe('the four failures', () => {
  it.each([
    ['invalid', "We couldn't save your changes. Please check the values and try again."],
    ['taken', 'That email address already belongs to another account.'],
    ['unauthenticated', 'Your session has expired. Log in again to save your changes.'],
    ['failed', "We couldn't save your changes. Please try again."],
  ])('renders the %s copy on an assertive line', async (reason, message) => {
    const user = userEvent.setup();
    const save = renderForm(
      jest.fn().mockResolvedValue({ ok: false, reason } as UpdateProfileResult),
    );

    await user.clear(screen.getByLabelText('First name'));
    await user.type(screen.getByLabelText('First name'), 'Ana');
    await user.click(saveButton());

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(message));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('does not refresh or confirm on a failure', async () => {
    const user = userEvent.setup();
    renderForm(jest.fn().mockResolvedValue({ ok: false, reason: 'taken' }));

    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'taken@email.com');
    await user.click(saveButton());

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('keeps what was typed after a rejected address', async () => {
    // The 409 is the one failure a real user reaches, and retyping the address from scratch is
    // not what they should have to do about it.
    const user = userEvent.setup();
    renderForm(jest.fn().mockResolvedValue({ ok: false, reason: 'taken' }));

    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'taken@email.com');
    await user.click(saveButton());

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByLabelText('Email')).toHaveValue('taken@email.com');
  });

  it('recovers from a rejected RPC rather than freezing Save', async () => {
    // The regression the `try/catch` exists for. A Server Action called from the client *rejects*
    // on a transport that never completes, and an escaped rejection leaves `pending` true forever:
    // Save disabled for good, Enter dead with it, and nothing on screen saying why.
    const user = userEvent.setup();
    renderForm(jest.fn().mockRejectedValue(new Error('connection lost')));

    await user.clear(screen.getByLabelText('First name'));
    await user.type(screen.getByLabelText('First name'), 'Ana');
    await user.click(saveButton());

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        "We couldn't save your changes. Please try again.",
      ),
    );
    expect(saveButton()).toBeEnabled();
  });

  it('clears a failure on the next keystroke', async () => {
    const user = userEvent.setup();
    renderForm(jest.fn().mockResolvedValue({ ok: false, reason: 'failed' }));

    await user.clear(screen.getByLabelText('First name'));
    await user.type(screen.getByLabelText('First name'), 'Ana');
    await user.click(saveButton());
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    await user.type(screen.getByLabelText('First name'), 'x');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('the pending state', () => {
  it('disables Save while the request is out', async () => {
    const user = userEvent.setup();
    let settle: (result: UpdateProfileResult) => void = () => {};
    const save = jest.fn().mockReturnValue(
      new Promise<UpdateProfileResult>((resolve) => {
        settle = resolve;
      }),
    );
    renderForm(save);

    await user.clear(screen.getByLabelText('First name'));
    await user.type(screen.getByLabelText('First name'), 'Ana');
    await user.click(saveButton());

    await waitFor(() => expect(saveButton()).toBeDisabled());
    expect(screen.getByLabelText('First name')).toBeDisabled();

    settle({ ok: true });
    await waitFor(() => expect(saveButton()).toBeEnabled());
  });
});

describe('the form element', () => {
  it('submits on Enter inside a field', async () => {
    // **The only assertion that catches a missing `type="submit"`.** `ui/Button` defaults `type`
    // to `button`, so without it this form silently never submits, Enter does nothing, and every
    // test that clicks the button would still pass.
    const user = userEvent.setup();
    const save = renderForm();

    await user.clear(screen.getByLabelText('First name'));
    await user.type(screen.getByLabelText('First name'), 'Ana{Enter}');

    await waitFor(() => expect(save).toHaveBeenCalledWith({ firstName: 'Ana' }));
  });

  it('carries noValidate, so the browser bubble never replaces the inline message', async () => {
    // Without it the user agent's own validation fires on the `required` email and the designed
    // message never renders. daisyUI's `validator` class is unused for the same reason.
    const { container } = render(<SettingsForm profile={PROFILE} save={jest.fn()} />);

    expect(container.querySelector('form')).toHaveAttribute('novalidate');
  });
});

// The three defects a code review found in the first version of this form, all one root cause:
// `values` was seeded once at mount while the diff baseline read the live `profile` prop, so the
// two drifted apart the moment the server stored something other than what was typed.
describe('the resync after a save', () => {
  async function saveAnEdit(
    user: ReturnType<typeof userEvent.setup>,
    field: string,
    value: string,
  ) {
    await user.clear(screen.getByLabelText(field));
    await user.type(screen.getByLabelText(field), value);
    await user.click(saveButton());
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  }

  it('adopts the address the server actually stored, not the casing that was typed', async () => {
    // `UpdateProfileDto` lowercases through `normalizeEmail`, so the account holds a different
    // string from the one on screen. Without the resync the one screen whose job is to report the
    // login identifier goes on showing an address login links are not sent to.
    const user = userEvent.setup();
    const { land } = renderWithRefresh();

    await saveAnEdit(user, 'Email', 'Marko.Kovac@Email.com');
    land({ email: 'marko.kovac@email.com' });

    expect(screen.getByLabelText('Email')).toHaveValue('marko.kovac@email.com');
  });

  it('adopts the trimmed name, so the avatar stops disagreeing with the sidebar', async () => {
    // AC5's own requirement: `toUpdateProfileBody` sends the trimmed name, `initials()` does not
    // trim, so a leading space rendered " K" here while the refreshed sidebar footer showed "AK".
    const user = userEvent.setup();
    const { land } = renderWithRefresh();

    await saveAnEdit(user, 'First name', ' ana');
    expect(screen.getByText(/^\s*K$/)).toBeInTheDocument();

    land({ firstName: 'Ana' });

    expect(screen.getByText('AK')).toBeInTheDocument();
    expect(screen.getByLabelText('First name')).toHaveValue('Ana');
  });

  it('adopts a field another tab changed, so the next save cannot revert it', async () => {
    // The cross-tab revert: without this, `values.lastName` stays at the mount-time value and the
    // second save puts it back on the wire, undoing the other tab silently.
    const user = userEvent.setup();
    const { save, land } = renderWithRefresh();

    await saveAnEdit(user, 'First name', 'Ana');
    land({ firstName: 'Ana', lastName: 'Novak' });

    save.mockClear();
    refresh.mockClear();
    await user.clear(screen.getByLabelText('First name'));
    await user.type(screen.getByLabelText('First name'), 'Iva');
    await user.click(saveButton());

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith({ firstName: 'Iva' });
  });

  it('leaves the form alone when a refresh it did not cause arrives', async () => {
    // The other half, and the reason the resync is armed by a save rather than by any prop change:
    // a background refresh must never rewrite what somebody is in the middle of typing.
    const user = userEvent.setup();
    const { land } = renderWithRefresh();

    await user.clear(screen.getByLabelText('First name'));
    await user.type(screen.getByLabelText('First name'), 'Iva');
    land({ firstName: 'Somebody else' });

    expect(screen.getByLabelText('First name')).toHaveValue('Iva');
  });

  it('abandons the resync if the user types before the refresh lands', async () => {
    // `router.refresh()` resolves asynchronously while the fields re-enable immediately, so this
    // window is real. Keystrokes win; the normalisation is picked up by the next save.
    const user = userEvent.setup();
    const { land } = renderWithRefresh();

    await saveAnEdit(user, 'First name', 'Ana');
    await user.type(screen.getByLabelText('Last name'), 'x');
    land({ firstName: 'Ana', lastName: 'Overwritten' });

    expect(screen.getByLabelText('Last name')).toHaveValue('Kovačx');
  });
});

describe('focus', () => {
  it('moves to the first invalid field, so a refused submit is announced', async () => {
    // The inline messages are reached through `aria-describedby`, which announces on focus and at
    // no other time - so without this a screen-reader user pressed Save, got no request and heard
    // nothing at all. Draw order, so focus lands at the top of the problems.
    const user = userEvent.setup();
    renderForm();

    await user.clear(screen.getByLabelText('Last name'));
    await user.clear(screen.getByLabelText('Email'));
    await user.click(saveButton());

    expect(screen.getByLabelText('Last name')).toHaveFocus();
  });

  it('returns to the control the save was fired from', async () => {
    // Every control is disabled while the request is out, and the browser blurs a control the
    // moment it becomes disabled - so focus fell to <body> and the next Tab restarted at the top
    // of the page. Nothing unmounts, so the platform does not restore it.
    const user = userEvent.setup();
    renderForm();

    await user.clear(screen.getByLabelText('First name'));
    await user.type(screen.getByLabelText('First name'), 'Ana{Enter}');

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByLabelText('First name')).toHaveFocus());
  });

  it('returns focus on a failure too, not only on the happy path', async () => {
    const user = userEvent.setup();
    renderForm(jest.fn().mockResolvedValue({ ok: false, reason: 'taken' }));

    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'taken@email.com{Enter}');

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByLabelText('Email')).toHaveFocus();
  });

  it('returns focus after a rejected RPC', async () => {
    const user = userEvent.setup();
    renderForm(jest.fn().mockRejectedValue(new Error('connection lost')));

    await user.clear(screen.getByLabelText('First name'));
    await user.type(screen.getByLabelText('First name'), 'Ana{Enter}');

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByLabelText('First name')).toHaveFocus();
  });
});
