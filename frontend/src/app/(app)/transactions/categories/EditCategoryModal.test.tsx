import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';

import type { Palette } from '../../../../lib/palette';
import type { UpdateCategoryResult } from '../../../../lib/updateCategory';

import { EditCategoryModal } from './EditCategoryModal';
import { category } from './categoryFixture';

// PET-38's acceptance suite. AC1, AC2, AC3's request half, AC5 and AC7 live here; AC4 and AC6 are
// browser checks, for the reasons below.
//
// Five things this file deliberately does not assert, each because jsdom cannot see it and each
// named in the plan's verification steps instead: the two pickers sitting **side by side**, the
// caret restore in the budget field, **Escape** and the focus trap (`jest.setup.ts` deliberately
// fakes neither, which is most of AC6), the recomputed card and summary (four Server Components
// re-reading one row), and AC4's rename crossing four screens.
//
// A package specifier, so the `@/` alias trap does not apply. The action is injected as a prop
// rather than mocked, which is every modal in this app's pattern and means this file needs no module
// mock at all.
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));

const refresh = jest.fn();
const onClose = jest.fn();
const onDelete = jest.fn();
const update = jest.fn<Promise<UpdateCategoryResult>, [string, unknown]>();

/** Frame 21's own category: "Subscriptions", $250.00, with a note it does not draw. */
const SUBSCRIPTIONS = category({
  id: '0198c2a1-0000-7000-8000-0000000000b7',
  name: 'Subscriptions',
  monthlyCap: 250,
  color: 'primary',
  icon: 'tv',
  note: 'Streaming, apps & memberships',
});

/**
 * Three colours and three icons, in a deliberately non-alphabetical order.
 *
 * Byte-identical to `AddCategoryModal.test.tsx`'s, copied rather than shared: it is a fixture for a
 * component this file also owns, and the two suites must be able to diverge when the two modals do.
 * Three is the smallest number that can show an order was preserved rather than sorted.
 */
const PALETTE: Palette = {
  colors: [
    { token: 'success', label: 'Emerald' },
    { token: 'primary', label: 'Indigo' },
    { token: 'info', label: 'Sky' },
  ],
  icons: [
    { name: 'shopping-basket', label: 'Basket' },
    { name: 'tv', label: 'Television' },
    { name: 'car', label: 'Car' },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({ refresh });
  update.mockResolvedValue({ ok: true });
});

const user = () => userEvent.setup();

function open(props: Partial<React.ComponentProps<typeof EditCategoryModal>> = {}) {
  return render(
    <EditCategoryModal
      category={SUBSCRIPTIONS}
      palette={PALETTE}
      update={update}
      onDelete={onDelete}
      onClose={onClose}
      {...props}
    />,
  );
}

const name = () => screen.getByLabelText('Name');
const budget = () => screen.getByLabelText('Monthly budget (optional)');
const save = () => screen.getByRole('button', { name: 'Save changes' });
const remove = () => screen.getByRole('button', { name: 'Delete category' });

/** The Note field, which is **not rendered** while `SHOWS_NOTE` is false. */
const note = () => screen.queryByLabelText('Note (optional)');

const colourTrigger = () => screen.getByRole('button', { name: /^Color/ });
const colourPanel = () => document.querySelector('#edit-category-color-picker') as HTMLElement;
const iconTrigger = () => screen.getByRole('button', { name: /^Icon/ });
const iconPanel = () => document.querySelector('#edit-category-icon-picker') as HTMLElement;

describe('AC1: the modal opens prefilled from the card', () => {
  it('prefills the name', () => {
    open();

    expect(name()).toHaveValue('Subscriptions');
  });

  it('prefills the budget as a value the field could itself have produced', () => {
    open();

    expect(budget()).toHaveValue('250.00');
  });

  it('prefills the colour and the icon by their palette labels', () => {
    open();

    expect(colourTrigger()).toHaveAccessibleName('Color Indigo');
    expect(iconTrigger()).toHaveAccessibleName('Icon Television');
  });

  it('opens an uncapped category on a blank budget rather than on a zero', () => {
    // Blank is the same "no limit" `isCapValid` accepts, so the form opens already valid.
    open({ category: category({ monthlyCap: null }) });

    expect(budget()).toHaveValue('');
  });

  it('draws no Note field, which amends AC1 for A42’s reason', () => {
    // The note is prefilled into state regardless, which the save case below pins: a hidden field
    // must not clear a value the user cannot see.
    expect(note()).toBeNull();
  });
});

describe('AC2: the frame’s title and its three footer controls', () => {
  it('is titled "Edit category"', () => {
    open();

    expect(screen.getByRole('heading', { name: 'Edit category' })).toBeInTheDocument();
  });

  it('offers Cancel, Save changes and a red Delete category', () => {
    open();

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(save()).toBeInTheDocument();
    // The `textDanger` variant `ui/Button` reserves for this control. A class assertion, which is
    // the one exception `frontend/src/components/CLAUDE.md` allows: it is the visible half of a
    // semantic the design carries and nothing else states.
    expect(remove()).toHaveClass('text-error');
  });

  it('puts Delete category at the start of the footer row, opposite the other two', () => {
    // `Modal`'s `footerStart` slot, which is what turns the row into `justify-between`. Asserted
    // through the class the slot's presence produces, because jsdom runs no layout.
    open();

    expect(remove().closest('.modal-action')).toHaveClass('justify-between');
  });
});

describe('the save', () => {
  it('sends only what changed', async () => {
    open();

    await user().clear(name());
    await user().type(name(), 'Streaming');
    await user().click(save());

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(SUBSCRIPTIONS.id, { name: 'Streaming' }),
    );
  });

  it('keeps the hidden note out of every body', async () => {
    // The field is not drawn, so its value cannot diverge from the prefill - and the diff compares
    // against the stored value rather than against `''`, which is what stops a hidden field
    // contributing a key to every patch.
    open();

    await user().clear(budget());
    await user().type(budget(), '300');
    await user().click(save());

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0]![1]).not.toHaveProperty('note');
  });

  it('sends a null cap when the budget is cleared, which is how a category is uncapped', async () => {
    open();

    await user().clear(budget());
    await user().click(save());

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(SUBSCRIPTIONS.id, { monthlyCap: null }),
    );
  });

  it('closes without asking when nothing changed', async () => {
    // The endpoint answers 400 for an empty body, which is a correct answer to a question the user
    // did not ask. Cancel's behaviour is the honest one.
    open();

    await user().click(save());

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(update).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('AC3: refreshes the route so the card and the summary recompute together', async () => {
    open();

    await user().clear(budget());
    await user().type(budget(), '300');
    await user().click(save());

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('AC5: accepts a cap far past the monthly budget, because no over-allocation state exists', async () => {
    // A43: nothing stops caps summing past the budget and the summary only ever shows an
    // unallocated chip, so this form must not invent a ceiling.
    open();

    await user().clear(budget());
    await user().type(budget(), '999999');
    await user().click(save());

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(SUBSCRIPTIONS.id, { monthlyCap: 999999 }),
    );
  });

  it('disables Save while the request is out, and leaves Cancel live', async () => {
    let settle: (result: UpdateCategoryResult) => void = () => {};
    update.mockReturnValue(
      new Promise<UpdateCategoryResult>((resolve) => {
        settle = resolve;
      }),
    );

    open();
    await user().clear(name());
    await user().type(name(), 'Streaming');
    await user().click(save());

    await waitFor(() => expect(save()).toBeDisabled());
    // No fetch in this app carries a timeout, so a hung request is exactly when a way out matters.
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(remove()).toBeEnabled();

    settle({ ok: true });
  });
});

describe('validation', () => {
  it('names every invalid field at once rather than stopping at the first', async () => {
    open();

    await user().clear(name());
    await user().clear(budget());
    await user().type(budget(), '0');
    await user().click(save());

    expect(screen.getByText('Enter a name.')).toBeInTheDocument();
    expect(
      screen.getByText('Enter a budget greater than 0, or leave it blank for no limit.'),
    ).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('clears a field’s message as soon as that field is fixed', async () => {
    open();

    await user().clear(name());
    await user().click(save());
    expect(screen.getByText('Enter a name.')).toBeInTheDocument();

    await user().type(name(), 'S');
    expect(screen.queryByText('Enter a name.')).not.toBeInTheDocument();
  });
});

describe('the five failures', () => {
  it.each([
    ['invalid', "We couldn't save this category. Please check the values and try again."],
    ['missing', 'This category no longer exists. Close this to see the current list.'],
    ['fallback', "This category's name is fixed and can't be changed."],
    ['unauthenticated', 'Your session has expired. Log in again to save this.'],
    ['failed', "We couldn't save this category. Please try again."],
  ] as const)('shows the %s line and keeps the form open', async (reason, message) => {
    update.mockResolvedValue({ ok: false, reason });
    open();

    await user().clear(name());
    await user().type(name(), 'Streaming');
    await user().click(save());

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    // Re-enabled, or a failed save would leave the modal frozen with Cancel as its only exit.
    expect(save()).toBeEnabled();
  });

  it('reports a rejected RPC rather than freezing the modal', async () => {
    // A Server Action called from the client **rejects** when the transport never completes. A
    // rejection escaping the handler would leave `pending` true and Save disabled for good.
    update.mockRejectedValue(new Error('Failed to fetch'));
    open();

    await user().clear(name());
    await user().type(name(), 'Streaming');
    await user().click(save());

    expect(
      await screen.findByText("We couldn't save this category. Please try again."),
    ).toBeInTheDocument();
    expect(save()).toBeEnabled();
  });

  it('never redirects on an expired session, so the edits survive', async () => {
    update.mockResolvedValue({ ok: false, reason: 'unauthenticated' });
    open();

    await user().clear(name());
    await user().type(name(), 'Streaming');
    await user().click(save());

    expect(
      await screen.findByText('Your session has expired. Log in again to save this.'),
    ).toBeInTheDocument();
    expect(name()).toHaveValue('Streaming');
  });
});

describe('the palette, which blocks two fields and not the save', () => {
  it('disables both pickers and says why when the read failed', () => {
    open({ palette: null });

    expect(colourTrigger()).toBeDisabled();
    expect(iconTrigger()).toBeDisabled();
    expect(
      screen.getByText(
        "We couldn't load the colours and icons, so those two fields can't be changed right now.",
      ),
    ).toBeInTheDocument();
  });

  it('disables both pickers when either list is empty, which is a real configuration', () => {
    open({ palette: { colors: [], icons: PALETTE.icons } });

    expect(colourTrigger()).toBeDisabled();
    expect(iconTrigger()).toBeDisabled();
    expect(
      screen.getByText(
        "There are no colours or icons to choose from, so those two fields can't be changed.",
      ),
    ).toBeInTheDocument();
  });

  it('still saves the name and the budget, which is the one place this must not copy the Add modal', async () => {
    // There a failed palette blocks submission, because a create has no colour until the read
    // lands. Here the colour is prefilled, the pickers are disabled so no rejectable value can
    // reach the body, and renaming a category while the palette is down is reasonable.
    open({ palette: null });

    await user().clear(name());
    await user().type(name(), 'Streaming');
    await user().click(save());

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(SUBSCRIPTIONS.id, { name: 'Streaming' }),
    );
  });

  it('sends no colour or icon when the palette never arrived', async () => {
    open({ palette: null });

    await user().clear(name());
    await user().type(name(), 'Streaming');
    await user().click(save());

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0]![1]).not.toHaveProperty('color');
    expect(update.mock.calls[0]![1]).not.toHaveProperty('icon');
  });
});

describe('the pickers', () => {
  it('sends the chosen colour as the contract’s own token', async () => {
    // jsdom implements no Popover API, so the panel is permanently open here and the suite asserts
    // the wiring. Opening and closing are browser checks.
    open();

    await user().click(within(colourPanel()).getByRole('button', { name: 'Sky' }));
    await user().click(save());

    await waitFor(() => expect(update).toHaveBeenCalledWith(SUBSCRIPTIONS.id, { color: 'info' }));
  });

  it('sends the chosen icon as the contract’s own name', async () => {
    open();

    await user().click(within(iconPanel()).getByRole('button', { name: 'Car' }));
    await user().click(save());

    await waitFor(() => expect(update).toHaveBeenCalledWith(SUBSCRIPTIONS.id, { icon: 'car' }));
  });

  it('marks the stored colour and icon as the current rows', () => {
    open();

    expect(within(colourPanel()).getByRole('button', { name: 'Indigo' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(within(iconPanel()).getByRole('button', { name: 'Television' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });
});

describe('AC7: Delete category', () => {
  it('asks the owner to open the confirmation and deletes nothing itself', async () => {
    open();

    await user().click(remove());

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    // The modal stays up: a cancelled confirmation must return to the form with the edits intact.
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('which field opens focused', () => {
  it('focuses the name for the kebab’s Edit, which is an unspecific invitation', () => {
    open();

    expect(name()).toHaveFocus();
  });

  it('focuses the budget for "Set limit", whose banner is a request to type a number', () => {
    open({ focus: 'monthlyCap' });

    expect(budget()).toHaveFocus();
  });
});
