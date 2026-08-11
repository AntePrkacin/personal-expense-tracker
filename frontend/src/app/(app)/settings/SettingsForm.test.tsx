import { act, render, screen, waitFor, within } from '@testing-library/react';
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
  fullName: 'Marko Kovač',
  email: 'marko@email.com',
  currency: 'USD',
  monthlyBudget: 2000,
  monthStartDay: 1,
};

/**
 * Today, pinned, so the paycheck dialog's nine-month window is the same list in every run.
 *
 * The component takes `today` as a prop with a default for exactly this: the list is relative to
 * now, and a suite that let it read a clock would assert a different set of month labels every month.
 */
const TODAY = '2026-03-10';

/**
 * The schedule write, separate from `save` so a test can assert which of the two a press reached.
 *
 * PET-72 made one "Save changes" potentially two requests - the ordinary patch and
 * `POST /api/profile/schedule` - and the whole point of injecting them apart is that "the budget was
 * written and the profile was not" is a distinction the suite can see.
 */
let saveSchedule: jest.Mock;

function renderForm(save: jest.Mock = jest.fn().mockResolvedValue({ ok: true })) {
  render(
    <SettingsForm
      profile={PROFILE}
      save={save}
      saveSchedule={saveSchedule}
      today={TODAY}
      themePref="system"
    />,
  );
  return save;
}

/**
 * Presses Save and answers the paycheck dialog, which is the whole flow for a budget or pay-day
 * change.
 *
 * Every schedule save goes through this rather than through `saveButton()` alone: the dialog is not
 * optional and a test that skipped it would be asserting a request the app never makes.
 */
async function saveThroughDialog(user: ReturnType<typeof userEvent.setup>, month?: string) {
  await user.click(saveButton());

  if (month !== undefined) {
    await user.selectOptions(screen.getByLabelText('First paycheck'), month);
  }

  // The dialog's own affirmative, which is named identically to the button that opened it - so this
  // has to reach for the one inside the dialog rather than the form's.
  const dialog = screen.getByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
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
  const view = render(
    <SettingsForm
      profile={PROFILE}
      save={save}
      saveSchedule={saveSchedule}
      today={TODAY}
      themePref="system"
    />,
  );

  return {
    save,
    land: (next: Partial<Profile>) =>
      view.rerender(
        <SettingsForm
          profile={{ ...PROFILE, ...next }}
          save={save}
          saveSchedule={saveSchedule}
          today={TODAY}
          themePref="system"
        />,
      ),
  };
}

const saveButton = () => screen.getByRole('button', { name: 'Save changes' });

beforeEach(() => {
  jest.clearAllMocks();
  saveSchedule = jest.fn().mockResolvedValue({ ok: true });
});

describe('AC1: the card shows the stored profile', () => {
  it('prefills the two fields', () => {
    // Two since PET-72 collapsed the name pair into one "Display name".
    renderForm();

    expect(screen.getByLabelText('Display name')).toHaveValue('Marko Kovač');
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
    const { container } = render(
      <SettingsForm profile={PROFILE} save={jest.fn()} themePref="system" />,
    );

    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /upload|change photo|avatar|remove/i }),
    ).not.toBeInTheDocument();
  });
});

describe('AC3: the initials follow what is being typed', () => {
  it('updates the tile as the display name is typed, before any save', async () => {
    const user = userEvent.setup();
    const save = renderForm();

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Ana Marić');

    expect(screen.getByText('AM')).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows one letter for a single-word display name', async () => {
    // Ordinary rather than exotic since PET-72: the field's placeholder invites a nickname, so a
    // one-word name is a value the form actively offers and the tile has to read as one letter
    // rather than as a letter and a blank.
    const user = userEvent.setup();
    renderForm();

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Marko');

    expect(screen.getByText('M')).toBeInTheDocument();
  });

  it('empties the tile when the name is cleared', async () => {
    // Rather than falling back to a placeholder glyph the design does not draw. `initials('')`
    // is the empty string, and this pins that the card renders it rather than inventing something.
    const user = userEvent.setup();
    renderForm();

    await user.clear(screen.getByLabelText('Display name'));
    await user.clear(screen.getByLabelText('Display name'));

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

    await user.clear(screen.getByLabelText('Display name'));
    await user.clear(screen.getByLabelText('Display name'));
    await user.clear(screen.getByLabelText('Email'));
    await user.click(saveButton());

    expect(screen.getByText('Enter a display name.')).toBeInTheDocument();
    expect(screen.getByText('Enter a display name.')).toBeInTheDocument();
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
  });

  it('clears a message on the next keystroke in that field and not another', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.clear(screen.getByLabelText('Display name'));
    await user.clear(screen.getByLabelText('Email'));
    await user.click(saveButton());

    await user.type(screen.getByLabelText('Email'), 'marko@email.com');

    expect(screen.queryByText('Enter your email address.')).not.toBeInTheDocument();
    // Still on screen: the user has not been back to that field, so its message is still true.
    expect(screen.getByText('Enter a display name.')).toBeInTheDocument();
  });

  it('refuses a blank first name too', async () => {
    const user = userEvent.setup();
    const save = renderForm();

    await user.clear(screen.getByLabelText('Display name'));
    await user.click(saveButton());

    expect(screen.getByText('Enter a display name.')).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
});

describe('AC5: a valid save', () => {
  it('sends exactly the field that changed', async () => {
    // The whole-profile PATCH is the expensive failure: it would write the five fields the user
    // never opened, and the endpoint would answer 200 while doing it.
    const user = userEvent.setup();
    const save = renderForm();

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Ana');
    await user.click(saveButton());

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith({ fullName: 'Ana' });
  });

  it('refreshes the route, which is what redraws the sidebar footer', async () => {
    // The only half of AC5 jsdom can reach. The footer actually changing is a browser check,
    // because it is rendered by `(app)/layout.tsx` above this component.
    const user = userEvent.setup();
    renderForm();

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Ana');
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

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Ana');
    await user.click(saveButton());

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Changes saved'));
  });

  it('clears the confirmation on the next edit', async () => {
    // "Changes saved" over a form that has since been edited is the one lie this form could tell.
    const user = userEvent.setup();
    renderForm();

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Ana');
    await user.click(saveButton());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Changes saved'));

    await user.type(screen.getByLabelText('Display name'), 'x');

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

describe('the Preferences card (PET-47)', () => {
  it('prefills all three from the stored profile', () => {
    renderForm();

    expect(screen.getByLabelText('Monthly budget')).toHaveValue('2,000.00');
    expect(screen.getByRole('button', { name: /^Currency/ })).toHaveAccessibleName('Currency USD');
    expect(screen.getByRole('button', { name: /^Month starts on/ })).toHaveAccessibleName(
      'Month starts on 1st of the month',
    );
  });

  it('sends both cards from one press, as two writes, which is AC6 amended', async () => {
    // **The criterion this card rested on, restated for PET-72.** One "Save changes" beneath two
    // cards still serves both - what changed is that it is two requests rather than one body, because
    // the pay day applies from a date and the display name does not. A press that reached only one of
    // them, or reached either twice, is what this catches.
    const user = userEvent.setup();
    const save = jest.fn().mockResolvedValue({ ok: true });
    renderForm(save);

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Ana');
    await user.click(screen.getByRole('button', { name: '15th of the month' }));
    await saveThroughDialog(user);

    await waitFor(() => expect(saveSchedule).toHaveBeenCalledTimes(1));
    expect(saveSchedule).toHaveBeenCalledWith({
      monthlyBudget: 2000,
      monthStartDay: 15,
      // The month the dialog opens on, which is the current one.
      firstPaycheckDate: '2026-03-15',
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ fullName: 'Ana' });
  });

  it('writes the schedule before the profile, so the confirmed change is not lost', async () => {
    // No transaction spans the two endpoints, so the order is the only guarantee: the schedule write
    // is the one the user was asked a question about, and it must not be skipped because an unrelated
    // name change failed.
    const user = userEvent.setup();
    const save = jest.fn().mockResolvedValue({ ok: true });
    renderForm(save);

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Ana');
    await user.click(screen.getByRole('button', { name: '15th of the month' }));
    await saveThroughDialog(user);

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(saveSchedule.mock.invocationCallOrder[0]).toBeLessThan(
      save.mock.invocationCallOrder[0]!,
    );
  });

  it('sends no patch at all when only the budget moved', async () => {
    // The ordinary budget-only save. A patch here would be a body with no keys, which the endpoint
    // answers 400 to.
    const user = userEvent.setup();
    const save = jest.fn().mockResolvedValue({ ok: true });
    renderForm(save);

    await user.clear(screen.getByLabelText('Monthly budget'));
    await user.type(screen.getByLabelText('Monthly budget'), '2500');
    await saveThroughDialog(user);

    await waitFor(() => expect(saveSchedule).toHaveBeenCalledTimes(1));
    expect(saveSchedule).toHaveBeenCalledWith(expect.objectContaining({ monthlyBudget: 2500 }));
    expect(save).not.toHaveBeenCalled();
  });

  it('never asks the paycheck question when neither field moved', async () => {
    // Most presses. A dialog over a name change would be asking about a write that is not happening.
    const user = userEvent.setup();
    const save = jest.fn().mockResolvedValue({ ok: true });
    renderForm(save);

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Ana');
    await user.click(saveButton());

    await waitFor(() => expect(save).toHaveBeenCalledWith({ fullName: 'Ana' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(saveSchedule).not.toHaveBeenCalled();
  });

  it('anchors on the month the user picks', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.clear(screen.getByLabelText('Monthly budget'));
    await user.type(screen.getByLabelText('Monthly budget'), '2500');
    await saveThroughDialog(user, '2026-01');

    await waitFor(() =>
      expect(saveSchedule).toHaveBeenCalledWith(
        expect.objectContaining({ firstPaycheckDate: '2026-01-01' }),
      ),
    );
  });

  // **The PR #84 review finding, end to end.** Every account in this suite and in
  // `backend/test/periods.e2e-spec.ts` is paid on the 1st, where today is never before pay day - so
  // these three render a profile paid mid-month, which is the only shape that can see the defect.
  describe('the paycheck the dialog defaults to', () => {
    /** The same render as `renderForm`, on an account paid on the 15th rather than the 1st. */
    function renderPaidOnThe15th(save = jest.fn().mockResolvedValue({ ok: true })) {
      render(
        <SettingsForm
          profile={{ ...PROFILE, monthStartDay: 15 }}
          save={save}
          saveSchedule={saveSchedule}
          today={TODAY}
          themePref="system"
        />,
      );

      return save;
    }

    it('opens on the paycheck the current period started on, not the calendar month', async () => {
      // `TODAY` is the 10th, so a person paid on the 15th is still spending February's paycheck. The
      // version this pins preselected March - a paycheck five days away - so the change applied from
      // the next period and this one kept the old budget under a green "Changes saved".
      const user = userEvent.setup();
      renderPaidOnThe15th();

      await user.clear(screen.getByLabelText('Monthly budget'));
      await user.type(screen.getByLabelText('Monthly budget'), '2500');
      await user.click(saveButton());

      expect(screen.getByLabelText('First paycheck')).toHaveValue('2026-02');
    });

    it('sends that paycheck as the anchor', async () => {
      // The half that matters on the wire: the month is completed with the form's pay day, so what
      // reaches `POST /api/profile/schedule` is the current period's own start.
      const user = userEvent.setup();
      renderPaidOnThe15th();

      await user.clear(screen.getByLabelText('Monthly budget'));
      await user.type(screen.getByLabelText('Monthly budget'), '2500');
      await saveThroughDialog(user);

      await waitFor(() => expect(saveSchedule).toHaveBeenCalledTimes(1));
      expect(saveSchedule).toHaveBeenCalledWith(
        expect.objectContaining({ firstPaycheckDate: '2026-02-15' }),
      );
    });

    it('anchors a pay-day change on the first paycheck under the new schedule', async () => {
      // The other arm, and deliberately **not** the most recent occurrence: the account is paid on
      // the 1st and moving to the 15th, so the first 15th under the new schedule is this month's.
      // Anchoring at a past 15th would assert a paycheck that never arrived and remove a boundary
      // inside the period the user is already living in.
      const user = userEvent.setup();
      renderForm();

      await user.click(screen.getByRole('button', { name: '15th of the month' }));
      await saveThroughDialog(user);

      await waitFor(() => expect(saveSchedule).toHaveBeenCalledTimes(1));
      expect(saveSchedule).toHaveBeenCalledWith(
        expect.objectContaining({ monthStartDay: 15, firstPaycheckDate: '2026-03-15' }),
      );
    });
  });

  it('writes nothing when the dialog is dismissed', async () => {
    // Cancel abandons the whole save rather than only the dialog: nothing has been written, and the
    // form is left exactly as the user had it.
    const user = userEvent.setup();
    const save = jest.fn().mockResolvedValue({ ok: true });
    renderForm(save);

    await user.clear(screen.getByLabelText('Monthly budget'));
    await user.type(screen.getByLabelText('Monthly budget'), '2500');
    await user.click(saveButton());

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(saveSchedule).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Monthly budget')).toHaveValue('2,500');
  });

  it('groups and truncates the budget as it is typed, like every other amount field', async () => {
    // **The regression this pins is a review finding, and it was silent.** This card adapted
    // `BudgetField` without the `reformatAmountInput` its contract requires, so nothing sanitised a
    // keystroke: `parseAmountInput` is `Number()` over the raw string, so `1234.567` passed
    // validation and 400d at the DTO with no message under the field, and `0x10` passed validation
    // and saved a monthly budget of 16. Typing rather than setting the value, because the defect
    // lived in the change handler.
    const user = userEvent.setup();
    renderForm();

    await user.clear(screen.getByLabelText('Monthly budget'));
    await user.type(screen.getByLabelText('Monthly budget'), '1234.567');

    expect(screen.getByLabelText('Monthly budget')).toHaveValue('1,234.56');
  });

  it('cannot be made to save a hex or exponent literal', async () => {
    // `Number('0x10')` is 16 and `Number('1e5')` is 100000, so an unsanitised field could save a
    // budget the user never typed. The formatter strips both to digits, which is what makes this a
    // property of the field rather than of the validator.
    const user = userEvent.setup();
    const save = jest.fn().mockResolvedValue({ ok: true });
    renderForm(save);

    await user.clear(screen.getByLabelText('Monthly budget'));
    await user.type(screen.getByLabelText('Monthly budget'), '0x10');
    await saveThroughDialog(user);

    await waitFor(() => expect(saveSchedule).toHaveBeenCalledTimes(1));
    expect(saveSchedule).toHaveBeenCalledWith(expect.objectContaining({ monthlyBudget: 10 }));
    expect(save).not.toHaveBeenCalled();
  });

  it('sends a picked currency as its ISO code', async () => {
    const user = userEvent.setup();
    const save = jest.fn().mockResolvedValue({ ok: true });
    renderForm(save);

    await user.click(screen.getByRole('button', { name: /British Pound/ }));
    await user.click(saveButton());

    await waitFor(() => expect(save).toHaveBeenCalledWith({ currency: 'GBP' }));
  });

  it('refuses a budget of zero inline, and sends nothing', async () => {
    // AC3: an inline message and nothing persisted. One message for blank, zero and junk alike,
    // because `isPositiveAmount` folds all three onto one comparison.
    const user = userEvent.setup();
    const save = jest.fn().mockResolvedValue({ ok: true });
    renderForm(save);

    await user.clear(screen.getByLabelText('Monthly budget'));
    await user.type(screen.getByLabelText('Monthly budget'), '0');
    await user.click(saveButton());

    expect(screen.getByText('Enter an amount greater than 0.')).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it('refuses a cleared budget the same way', async () => {
    const user = userEvent.setup();
    const save = jest.fn().mockResolvedValue({ ok: true });
    renderForm(save);

    await user.clear(screen.getByLabelText('Monthly budget'));
    await user.click(saveButton());

    expect(screen.getByText('Enter an amount greater than 0.')).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it('freezes its controls while the save is in flight', async () => {
    // Every field on the page, not just the card that was edited: `pending` is one flag threaded to
    // both cards, so a save begun from Profile must not leave a preference editable underneath it.
    const user = userEvent.setup();
    let release: (value: UpdateProfileResult) => void = () => {};
    const save = jest.fn().mockReturnValue(new Promise<UpdateProfileResult>((r) => (release = r)));
    renderForm(save);

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Ana');
    await user.click(saveButton());

    await waitFor(() => expect(screen.getByLabelText('Monthly budget')).toBeDisabled());
    expect(screen.getByRole('button', { name: /^Month starts on/ })).toBeDisabled();

    release({ ok: true });
    await waitFor(() => expect(screen.getByLabelText('Monthly budget')).not.toBeDisabled());
  });
});

describe('the baseline the diff is taken against', () => {
  it('never reverts a field another device changed and this form did not touch', async () => {
    // **The revert this pins is a review finding, and the resync docblock claimed it was closed.**
    // `edited` compared against `synced` while the gate and the submit diff compared against the
    // live `profile` prop. Those two baselines come apart whenever a refresh lands with
    // `awaitingSaved` false - one keystroke during a save's round trip is enough - and then a field
    // present in `profile` but not in `values` reads as a local edit and gets **sent**, silently
    // reverting the other device under a green "Changes saved".
    //
    // Both now read one `syncedProfile`, so an untouched field contributes no key whatever the
    // server says. The cost is a staleness rather than a loss, which is the right trade.
    const user = userEvent.setup();
    const { save, land } = renderWithRefresh();

    // The user edits one field, which is what clears `awaitingSaved` in the real defect.
    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Ana');

    // Another device changes the month start, and a refresh delivers it as a new prop.
    land({ monthStartDay: 15 });

    await user.click(saveButton());

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith({ fullName: 'Ana' });
    expect(save.mock.calls[0][0]).not.toHaveProperty('monthStartDay');
  });

  it('still sends a preference the user did change', async () => {
    // The other half: one baseline must not make a real edit invisible. The pay day goes through the
    // schedule write since PET-72, so this asserts against that endpoint rather than the patch.
    const user = userEvent.setup();
    renderWithRefresh();

    await user.click(screen.getByRole('button', { name: '15th of the month' }));
    await saveThroughDialog(user);

    await waitFor(() =>
      expect(saveSchedule).toHaveBeenCalledWith(expect.objectContaining({ monthStartDay: 15 })),
    );
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

  it('disables Save until something has changed', async () => {
    // This asserted the opposite for one ticket, on the reasoning that the frame draws no disabled
    // treatment. Reversed by the product owner, and rightly: the submit guards already made a
    // clean press do nothing, so the button was live, pressable and silently inert - a control
    // that looks actionable and is not.
    renderForm();

    expect(saveButton()).toBeDisabled();
  });

  it('enables Save on the first keystroke and disables it again when the edit is undone', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Display name'), 'x');
    expect(saveButton()).toBeEnabled();

    await user.keyboard('{Backspace}');
    expect(saveButton()).toBeDisabled();
  });

  it('stays disabled when a stored name carries whitespace', async () => {
    // The button must not be enabled by the diff alone: `toUpdateProfileBody` trims on the way out
    // and compares untrimmed, so a stored "  Marko  " differs from itself and would light up a
    // Save the user has no reason to press.
    render(
      <SettingsForm
        profile={{ ...PROFILE, fullName: '  Marko  ' }}
        save={jest.fn()}
        themePref="system"
      />,
    );

    expect(saveButton()).toBeDisabled();
  });

  it('stays disabled when the only edit is the address in a different case', async () => {
    // And it must not be enabled by "did they type" alone either: this diffs to nothing, because
    // the comparison is case-insensitive, so pressing Save would be a silent no-op.
    const user = userEvent.setup();
    renderForm();

    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'MARKO@EMAIL.COM');

    expect(saveButton()).toBeDisabled();
  });

  it('stays enabled while a field is blank, so the message can still be reached', async () => {
    // Clearing a field is an edit, so the button lights up and the press produces the inline
    // message rather than a control that refuses to explain itself.
    const user = userEvent.setup();
    renderForm();

    await user.clear(screen.getByLabelText('Display name'));

    expect(saveButton()).toBeEnabled();
  });

  it('treats a whitespace-only edit as no edit', async () => {
    const user = userEvent.setup();
    const save = renderForm();

    await user.type(screen.getByLabelText('Display name'), '  ');
    await user.click(saveButton());

    expect(save).not.toHaveBeenCalled();
  });
});

describe('the four failures', () => {
  it.each([
    ['invalid', "We couldn't save your changes. Please check the values and try again."],
    ['taken', 'That email address already belongs to another account.'],
    ['unauthenticated', 'Your session has expired. Log in again in a new tab, then save.'],
    ['failed', "We couldn't save your changes. Please try again."],
  ])('renders the %s copy on an assertive line', async (reason, message) => {
    const user = userEvent.setup();
    const save = renderForm(
      jest.fn().mockResolvedValue({ ok: false, reason } as UpdateProfileResult),
    );

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Ana');
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

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Ana');
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

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Ana');
    await user.click(saveButton());
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    await user.type(screen.getByLabelText('Display name'), 'x');

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

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Ana');
    await user.click(saveButton());

    await waitFor(() => expect(saveButton()).toBeDisabled());
    expect(screen.getByLabelText('Display name')).toBeDisabled();

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

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Ana{Enter}');

    await waitFor(() => expect(save).toHaveBeenCalledWith({ fullName: 'Ana' }));
  });

  it('carries noValidate, so the browser bubble never replaces the inline message', async () => {
    // Without it the user agent's own validation fires on the `required` email and the designed
    // message never renders. daisyUI's `validator` class is unused for the same reason.
    const { container } = render(
      <SettingsForm profile={PROFILE} save={jest.fn()} themePref="system" />,
    );

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

    await saveAnEdit(user, 'Display name', ' ana kovac');
    // The untrimmed value: `initials` splits on whitespace, so a leading space gives "AK" here too -
    // what disagrees with the sidebar is the *field*, which still holds the space the save removed.
    expect(screen.getByLabelText('Display name')).toHaveValue(' ana kovac');

    land({ fullName: 'Ana Kovac' });

    expect(screen.getByText('AK')).toBeInTheDocument();
    expect(screen.getByLabelText('Display name')).toHaveValue('Ana Kovac');
  });

  it('adopts a field another tab changed, so the next save cannot revert it', async () => {
    // The cross-tab revert: without this, `values.currency` stays at the mount-time value and the
    // second save puts it back on the wire, undoing the other tab silently. Asserted on `currency`
    // rather than on a second name field, which PET-72 removed - it is the remaining patch field the
    // form does not touch in this flow.
    const user = userEvent.setup();
    const { save, land } = renderWithRefresh();

    await saveAnEdit(user, 'Display name', 'Ana');
    land({ fullName: 'Ana', currency: 'GBP' });

    save.mockClear();
    refresh.mockClear();
    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Iva');
    await user.click(saveButton());

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith({ fullName: 'Iva' });
  });

  it('leaves the form alone when a refresh it did not cause arrives', async () => {
    // The other half, and the reason the resync is armed by a save rather than by any prop change:
    // a background refresh must never rewrite what somebody is in the middle of typing.
    const user = userEvent.setup();
    const { land } = renderWithRefresh();

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Iva');
    land({ fullName: 'Somebody else' });

    expect(screen.getByLabelText('Display name')).toHaveValue('Iva');
  });

  it('abandons the resync if the user types before the refresh lands', async () => {
    // `router.refresh()` resolves asynchronously while the fields re-enable immediately, so this
    // window is real. Keystrokes win; the normalisation is picked up by the next save.
    const user = userEvent.setup();
    const { land } = renderWithRefresh();

    await saveAnEdit(user, 'Display name', 'Ana');
    await user.type(screen.getByLabelText('Display name'), 'x');
    land({ fullName: 'Overwritten' });

    expect(screen.getByLabelText('Display name')).toHaveValue('Anax');
  });

  it('ends a save clean even when the server reports the same values back', async () => {
    // **The second PR #84 review finding.** A *retroactive* schedule change appends a row older than
    // the newest, and `GET /api/profile` reports the newest - so this save lands and the profile comes
    // back byte-identical. The resync compared by value, so it short-circuited: `awaitingSaved` was
    // never cleared, `values` kept the typed figure against a `syncedProfile` holding the old one, and
    // the form stayed dirty with Save live - where a second press re-asked the paycheck question and
    // appended another duplicate row. A save that landed was indistinguishable from one that did not.
    //
    // Adopting on identity ends it on the configured value, which reads as a revert and is the truth:
    // the account's current budget really is unchanged, and what moved is January's row.
    const user = userEvent.setup();
    const { land } = renderWithRefresh();

    await user.clear(screen.getByLabelText('Monthly budget'));
    await user.type(screen.getByLabelText('Monthly budget'), '2500');
    await saveThroughDialog(user, '2026-01');

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    land({});

    expect(screen.getByLabelText('Monthly budget')).toHaveValue('2,000.00');
    expect(saveButton()).toBeDisabled();
  });

  it('closes the dialog rather than leaving it open over the finished save', async () => {
    // The same flow's other half, and the reason the two are one test apart: the dialog unmounting is
    // what stops a second confirm re-POSTing the schedule, and it has never depended on the resync.
    const user = userEvent.setup();
    const { land } = renderWithRefresh();

    await user.clear(screen.getByLabelText('Monthly budget'));
    await user.type(screen.getByLabelText('Monthly budget'), '2500');
    await saveThroughDialog(user, '2026-01');

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    land({});

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(saveSchedule).toHaveBeenCalledTimes(1);
  });
});

describe('focus', () => {
  it('moves to the first invalid field, so a refused submit is announced', async () => {
    // The inline messages are reached through `aria-describedby`, which announces on focus and at
    // no other time - so without this a screen-reader user pressed Save, got no request and heard
    // nothing at all. Draw order, so focus lands at the top of the problems.
    const user = userEvent.setup();
    renderForm();

    await user.clear(screen.getByLabelText('Display name'));
    await user.clear(screen.getByLabelText('Email'));
    await user.click(saveButton());

    expect(screen.getByLabelText('Display name')).toHaveFocus();
  });

  it('returns to the control the save was fired from', async () => {
    // Every control is disabled while the request is out, and the browser blurs a control the
    // moment it becomes disabled - so focus fell to <body> and the next Tab restarted at the top
    // of the page. Nothing unmounts, so the platform does not restore it.
    const user = userEvent.setup();
    renderForm();

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Ana{Enter}');

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByLabelText('Display name')).toHaveFocus());
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

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Ana{Enter}');

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByLabelText('Display name')).toHaveFocus();
  });
});

describe('a form nobody touched', () => {
  it('sends nothing even when the stored name carries whitespace', async () => {
    // The diff cannot answer this on its own: `toUpdateProfileBody` trims on the way out and
    // compares against the untrimmed stored value, so `"  Marko  "` differs from itself and an
    // untouched form fired a PATCH announcing "Changes saved" for an edit nobody made.
    const user = userEvent.setup();
    const save = jest.fn().mockResolvedValue({ ok: true });
    render(
      <SettingsForm
        profile={{ ...PROFILE, fullName: '  Marko  ' }}
        save={save}
        themePref="system"
      />,
    );

    await user.click(saveButton());

    expect(save).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('still normalises that whitespace on a save that changes something else', async () => {
    // The behaviour the guard must not cost: the asymmetric trim is deliberate, so a stored name
    // with stray whitespace tidies itself the first time the user really edits the form.
    const user = userEvent.setup();
    const save = jest.fn().mockResolvedValue({ ok: true });
    render(
      <SettingsForm
        profile={{ ...PROFILE, fullName: '  Marko Kovač  ' }}
        save={save}
        saveSchedule={saveSchedule}
        today={TODAY}
        themePref="system"
      />,
    );

    await user.type(screen.getByLabelText('Display name'), 'ić');
    await user.click(saveButton());

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith({ fullName: 'Marko Kovač  ić'.trim() });
  });

  it('sends nothing when an edit is typed and undone', async () => {
    const user = userEvent.setup();
    const save = renderForm();

    await user.type(screen.getByLabelText('Display name'), 'x');
    await user.keyboard('{Backspace}');
    await user.click(saveButton());

    expect(save).not.toHaveBeenCalled();
  });
});

describe('the expired session', () => {
  async function expire(user: ReturnType<typeof userEvent.setup>) {
    renderForm(jest.fn().mockResolvedValue({ ok: false, reason: 'unauthenticated' }));

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Ana');
    await user.click(saveButton());

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  }

  it('offers a real way to log in, inside the same alert as the sentence', async () => {
    // The dead end this replaces: the copy named a control the signed-in shell does not publish,
    // so the only way to follow it discarded the edits it promised were still savable.
    const user = userEvent.setup();
    await expire(user);

    const alert = screen.getByRole('alert');
    const link = within(alert).getByRole('link', { name: 'Log in again' });
    expect(link).toHaveAttribute('href', '/login');
  });

  it('opens that link in a new tab, which is what makes the copy true', async () => {
    // The action deliberately does not redirect, so a dead session does not discard a half-edited
    // form; a same-tab link would throw that away at the last step. Signing in elsewhere sets the
    // cookie for this origin, so returning and pressing Save works.
    const user = userEvent.setup();
    await expire(user);

    const link = within(screen.getByRole('alert')).getByRole('link', { name: 'Log in again' });
    expect(link).toHaveAttribute('target', '_blank');
    // Mandatory with target="_blank".
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('keeps the edits on screen', async () => {
    const user = userEvent.setup();
    await expire(user);

    expect(screen.getByLabelText('Display name')).toHaveValue('Ana');
  });

  it('clears the whole alert on the next keystroke', async () => {
    const user = userEvent.setup();
    await expire(user);

    await user.type(screen.getByLabelText('Display name'), 'x');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Log in again' })).not.toBeInTheDocument();
  });

  it('offers no such link on the other three failures', async () => {
    // The link belongs to the one arm a login can fix. On a 409 it would be advice that changes
    // nothing.
    const user = userEvent.setup();
    renderForm(jest.fn().mockResolvedValue({ ok: false, reason: 'taken' }));

    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'taken@email.com');
    await user.click(saveButton());

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('after a successful save', () => {
  it('disables Save again, because the form now matches the server', async () => {
    // The resync makes this fall out rather than needing its own reset: adopting the refreshed
    // profile into `values` leaves the form equal to `synced`, so there is nothing to save.
    const user = userEvent.setup();
    const { land } = renderWithRefresh();

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Ana');
    expect(saveButton()).toBeEnabled();

    await user.click(saveButton());
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    land({ fullName: 'Ana' });

    expect(saveButton()).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Changes saved');
  });

  it('shows the confirmation in the success colour, not the muted caption one', async () => {
    // One of the two places this repo allows a class assertion: a daisyUI state class that is the
    // visible half of what the live region says.
    const user = userEvent.setup();
    renderForm();

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Ana');
    await user.click(saveButton());

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Changes saved'));
    expect(screen.getByRole('status')).toHaveClass('badge-success');
  });

  it('re-enables Save and clears the confirmation on the next edit', async () => {
    const user = userEvent.setup();
    const { land } = renderWithRefresh();

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Ana');
    await user.click(saveButton());
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    land({ fullName: 'Ana' });

    await user.type(screen.getByLabelText('Display name'), 'x');

    expect(saveButton()).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });
});

describe('the confirmation retires itself', () => {
  // Fake timers only in this block: `userEvent` schedules its own work on real ones, so it needs
  // the advance-aware setup rather than the default.
  function withTimers() {
    jest.useFakeTimers();
    return userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  it('clears "Changes saved" after five seconds', async () => {
    const user = withTimers();
    renderForm();

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Ana');
    await user.click(saveButton());

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Changes saved'));

    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });

    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('keeps it up until then', async () => {
    const user = withTimers();
    renderForm();

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Ana');
    await user.click(saveButton());

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Changes saved'));

    await act(async () => {
      jest.advanceTimersByTime(4_900);
    });

    expect(screen.getByRole('status')).toHaveTextContent('Changes saved');
  });

  it('leaves the region mounted, so the next save is still announced', async () => {
    // The whole reason it ships empty rather than conditionally rendered: a live region created in
    // the same commit as its content is generally not announced at all.
    const user = withTimers();
    renderForm();

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Ana');
    await user.click(saveButton());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Changes saved'));

    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('does not set state after the form has gone', async () => {
    // Without the cleanup, a save immediately before an unmount updates a component that is no
    // longer there. React logs rather than throws, so the assertion is on the console.
    const user = withTimers();
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    const view = render(
      <SettingsForm
        profile={PROFILE}
        save={jest.fn().mockResolvedValue({ ok: true })}
        themePref="system"
      />,
    );

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Ana');
    await user.click(saveButton());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Changes saved'));

    view.unmount();
    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });

    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
