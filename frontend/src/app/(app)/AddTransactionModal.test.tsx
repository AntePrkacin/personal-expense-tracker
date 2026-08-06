import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';

import type { CreateTransactionResult } from '../../lib/createTransaction';

import { AddTransactionModal } from './AddTransactionModal';

// PET-31's acceptance suite. AC1 and AC3 to AC7 live here; AC2's designed focus style and AC5's
// list half are not observable in jsdom and are named in the plan's verification steps.
//
// A package specifier, so the `@/` alias trap does not apply. The action is injected as a prop
// instead of mocked, which is `RegisterForm`'s pattern and means this file needs no module mock
// at all.
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));

const refresh = jest.fn();
const onClose = jest.fn();
const create = jest.fn<Promise<CreateTransactionResult>, [unknown]>();

const CATEGORIES = [
  { id: '0198c2a1-0000-7000-8000-0000000000a1', name: 'Groceries' },
  { id: '0198c2a1-0000-7000-8000-0000000000a2', name: 'Transport' },
  { id: '0198c2a1-0000-7000-8000-0000000000ff', name: 'Uncategorized' },
];

// October 2025 is the month the whole Figma file is drawn in, and the 8th is frame 09's day.
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(new Date(2025, 9, 8, 12, 0));
  (useRouter as jest.Mock).mockReturnValue({ refresh });
  create.mockResolvedValue({ ok: true });
});

afterEach(() => {
  jest.useRealTimers();
});

const user = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

function open(props: Partial<React.ComponentProps<typeof AddTransactionModal>> = {}) {
  return render(
    <AddTransactionModal categories={CATEGORIES} create={create} onClose={onClose} {...props} />,
  );
}

const amount = () => screen.getByLabelText('Amount');
const category = () => screen.getByLabelText('Category');
const merchant = () => screen.getByLabelText('Merchant');
const note = () => screen.getByLabelText('Note (optional)');
const submit = () => screen.getByRole('button', { name: 'Add transaction' });

/** Fills every required field with frame 09's own values. */
async function fill(u: ReturnType<typeof user>) {
  await u.type(amount(), '24.00');
  await u.selectOptions(category(), CATEGORIES[0]!.id);
  await u.type(merchant(), 'Whole Foods');
}

describe('AC1: the modal and its five fields', () => {
  it('opens as a dialog titled "Add transaction"', () => {
    open();

    expect(screen.getByRole('dialog', { name: 'Add transaction' })).toBeInTheDocument();
  });

  it('draws the five fields in ADD-2’s order', () => {
    open();

    const labels = screen
      .getAllByText(/^(Amount|Category|Date|Merchant|Note \(optional\))$/)
      .map((node) => node.textContent);

    expect(labels).toEqual(['Amount', 'Category', 'Date', 'Merchant', 'Note (optional)']);
  });

  it('marks only the note as optional, which is what makes the rest read as required', () => {
    // A12 and ADD-5: required fields carry no asterisk, and "(optional)" is the only marker.
    open();

    expect(screen.queryByText(/\*/)).not.toBeInTheDocument();
    expect(amount()).toBeRequired();
    expect(merchant()).toBeRequired();
    expect(note()).not.toBeRequired();
  });

  it('defaults the date to today rather than leaving it empty', () => {
    open();

    expect(screen.getByRole('button', { name: /Date/ })).toHaveTextContent('Oct 8, 2025');
  });

  it('offers the account’s categories behind a placeholder', () => {
    open();

    // A placeholder, not the fallback preselected - which is what keeps AC3's category clause
    // reachable at all.
    expect(category()).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Groceries' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Uncategorized' })).toBeInTheDocument();
  });
});

describe('AC2: the amount field', () => {
  it('holds focus on open', () => {
    // The precondition for the designed focus style. The 1.5px accent border is a focus style,
    // so nothing renders it unless focus really lands here - but the border itself is CSS and
    // is a Storybook check.
    open();

    expect(amount()).toHaveFocus();
  });

  it('uses the currency variant, which is what draws the "$" prefix', () => {
    open();

    // The prefix is aria-hidden, so it is found by text rather than by role.
    expect(screen.getByText('$')).toBeInTheDocument();
    expect(amount()).toHaveAttribute('inputmode', 'decimal');
  });

  it('formats the value as it is typed, and restores the caret by hand', async () => {
    const setSelectionRange = jest.spyOn(HTMLInputElement.prototype, 'setSelectionRange');
    open();

    await user().type(amount(), '1240.5');

    // Grouped under the caret, which is what formatAmountInput does and formatCurrency would
    // not - the latter would make '1240.' become '$1,240.00' mid-keystroke.
    expect(amount()).toHaveValue('1,240.5');
    // jsdom cannot observe the caret's final position, so the assertion is that the computed
    // offset was applied. BudgetForm documents the same limitation.
    expect(setSelectionRange).toHaveBeenCalled();

    setSelectionRange.mockRestore();
  });
});

describe('AC3: a missing required field', () => {
  it('shows all four messages at once and saves nothing', async () => {
    open();

    await user().click(submit());

    expect(screen.getByText('Enter an amount greater than 0.')).toBeInTheDocument();
    expect(screen.getByText('Choose a category.')).toBeInTheDocument();
    expect(screen.getByText('Enter a merchant.')).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not complain about the date, which defaults to today', async () => {
    open();

    await user().click(submit());

    expect(screen.queryByText('Choose a date.')).not.toBeInTheDocument();
  });

  it('names only the field that is wrong', async () => {
    const u = user();
    open();
    await fill(u);
    await u.clear(merchant());

    await u.click(submit());

    expect(screen.getByText('Enter a merchant.')).toBeInTheDocument();
    expect(screen.queryByText('Enter an amount greater than 0.')).not.toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('clears a message when that field changes, and leaves the others alone', async () => {
    const u = user();
    open();
    await u.click(submit());

    await u.type(merchant(), 'W');

    expect(screen.queryByText('Enter a merchant.')).not.toBeInTheDocument();
    // The amount's message survives, because validation clears per field rather than wholesale.
    expect(screen.getByText('Enter an amount greater than 0.')).toBeInTheDocument();
  });

  it('never lets the browser’s own bubble replace the designed message', () => {
    // noValidate on the form. Without it the browser validates `required` first and the inline
    // message never renders.
    open();

    expect(screen.getByRole('dialog').querySelector('form')).toHaveAttribute('novalidate');
  });
});

describe('AC4: a zero or negative amount', () => {
  it.each(['0', '0.00'])('rejects %p with the amount message', async (typed) => {
    const u = user();
    open();
    await u.selectOptions(category(), CATEGORIES[0]!.id);
    await u.type(merchant(), 'Whole Foods');
    await u.type(amount(), typed);

    await u.click(submit());

    expect(screen.getByText('Enter an amount greater than 0.')).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('uses the same string as the missing case, which is one message for both criteria', async () => {
    const u = user();
    open();

    await u.click(submit());
    const whenMissing = screen.getByText('Enter an amount greater than 0.').textContent;

    await u.type(amount(), '0');
    await u.click(submit());

    expect(screen.getByText('Enter an amount greater than 0.').textContent).toBe(whenMissing);
  });

  it('accepts a pasted minus sign as a magnitude, because the field strips it', async () => {
    // ADD-4 and A13: amounts are entered positive and rendered negative everywhere else.
    const u = user();
    open();
    await u.selectOptions(category(), CATEGORIES[0]!.id);
    await u.type(merchant(), 'Whole Foods');
    await u.type(amount(), '-24');

    expect(amount()).toHaveValue('24');

    await u.click(submit());

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0]![0]).toMatchObject({ amount: 24 });
  });
});

describe('AC5: a successful save', () => {
  it('sends the designed transaction', async () => {
    const u = user();
    open();
    await fill(u);
    await u.type(note(), 'Weekly groceries');

    await u.click(submit());

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith({
      amount: 24,
      date: '2025-10-08',
      merchant: 'Whole Foods',
      categoryId: CATEGORIES[0]!.id,
      note: 'Weekly groceries',
    });
  });

  it('closes the modal', async () => {
    const u = user();
    open();
    await fill(u);

    await u.click(submit());

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('refreshes the page, which is what makes the tab badge tick up', async () => {
    // AC5's testable half. PET-30's TransactionTabs reads `total` from readTransactionsView, so
    // re-running the route's Server Components is what increments the badge. The list itself is
    // PET-29's table slot and cannot be asserted here.
    const u = user();
    open();
    await fill(u);

    await u.click(submit());

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('refreshes before it closes, so the reload is already in flight', async () => {
    const u = user();
    open();
    await fill(u);

    await u.click(submit());

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(refresh.mock.invocationCallOrder[0]!).toBeLessThan(onClose.mock.invocationCallOrder[0]!);
  });

  it('disables the submit while the request is out, and leaves every exit live', async () => {
    // A19 designs no pending state, but a double submit here creates two transactions the user
    // then has to find and delete - so the submit is disabled and nothing else is. Cancel used to
    // be disabled too, which prevented nothing and left one dead control beside three working
    // ones: the X, Escape and a backdrop click are all unaffected by `pending`, and no fetch here
    // carries a timeout, so a hung request is when a way out matters most.
    let settle: (result: CreateTransactionResult) => void = () => {};
    create.mockImplementation(() => new Promise((resolve) => (settle = resolve)));

    const u = user();
    open();
    await fill(u);
    await u.click(submit());

    await waitFor(() => expect(submit()).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled();

    settle({ ok: true });
  });

  it('can still be cancelled while the request is out', async () => {
    let settle: (result: CreateTransactionResult) => void = () => {};
    create.mockImplementation(() => new Promise((resolve) => (settle = resolve)));

    const u = user();
    open();
    await fill(u);
    await u.click(submit());
    await waitFor(() => expect(submit()).toBeDisabled());

    await u.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);

    settle({ ok: true });
  });

  it('cannot be submitted twice', async () => {
    let settle: (result: CreateTransactionResult) => void = () => {};
    create.mockImplementation(() => new Promise((resolve) => (settle = resolve)));

    const u = user();
    open();
    await fill(u);
    await u.click(submit());
    await u.click(submit());

    expect(create).toHaveBeenCalledTimes(1);

    settle({ ok: true });
  });
});

describe('AC6: a blank note', () => {
  it('creates the transaction with no note key at all', async () => {
    // `note: ''` would pass every DTO check and be stored, breaking the contract's promise that
    // note is "null when the transaction has no note, never absent".
    const u = user();
    open();
    await fill(u);

    await u.click(submit());

    await waitFor(() => expect(create).toHaveBeenCalled());
    const body = create.mock.calls[0]![0] as Record<string, unknown>;
    expect('note' in body).toBe(false);
  });

  it('treats a note of only spaces as blank', async () => {
    const u = user();
    open();
    await fill(u);
    await u.type(note(), '   ');

    await u.click(submit());

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect('note' in (create.mock.calls[0]![0] as object)).toBe(false);
  });
});

describe('AC7: closing without saving', () => {
  it('closes on Cancel and saves nothing', async () => {
    const u = user();
    open();
    await fill(u);

    await u.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  it('closes on the X and saves nothing', async () => {
    const u = user();
    open();
    await fill(u);

    await u.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  it('closes on a click outside the box and saves nothing', async () => {
    const u = user();
    open();
    await fill(u);

    // A click on ::backdrop reports the dialog element itself as its target.
    await u.click(screen.getByRole('dialog'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  it('does not close when the form itself is clicked', async () => {
    const u = user();
    open();

    await u.click(merchant());
    await u.click(screen.getByText('Amount'));

    expect(onClose).not.toHaveBeenCalled();
  });

  // Escape is not asserted here and cannot be: jsdom implements no close-request behaviour, and
  // jest.setup.ts deliberately does not fake it, because a faked Escape would test the polyfill
  // rather than the browser. It is a manual and Storybook check, recorded in the plan.
});

describe('the four failure lines', () => {
  it.each([
    ['invalid', "We couldn't add this transaction. Please check the values and try again."],
    ['categoryMissing', 'That category no longer exists. Pick another one.'],
    ['unauthenticated', 'Your session has expired. Log in again to save this.'],
    ['failed', "We couldn't add this transaction. Please try again."],
  ] as const)('shows its own message for %s', async (reason, message) => {
    create.mockResolvedValue({ ok: false, reason });

    const u = user();
    open();
    await fill(u);
    await u.click(submit());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(message);
  });

  it('announces the failure, where a field message deliberately does not', async () => {
    // role="alert" because this appears after a network round trip with nothing else on screen
    // changing. ui/Field omits it because its message appears beside the field just left.
    create.mockResolvedValue({ ok: false, reason: 'failed' });

    const u = user();
    open();
    await fill(u);
    await u.click(submit());

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('stays open and re-enables the submit so the user can retry', async () => {
    create.mockResolvedValue({ ok: false, reason: 'failed' });

    const u = user();
    open();
    await fill(u);
    await u.click(submit());

    await screen.findByRole('alert');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(submit()).toBeEnabled();
    expect(onClose).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('clears the failure line on the next edit', async () => {
    create.mockResolvedValue({ ok: false, reason: 'failed' });

    const u = user();
    open();
    await fill(u);
    await u.click(submit());
    await screen.findByRole('alert');

    await u.type(merchant(), '!');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('the categories read', () => {
  it('disables the category select while the options are still loading', () => {
    open({ categories: null });

    expect(category()).toBeDisabled();
  });

  it('explains itself and blocks submission when the read failed', async () => {
    open({ categories: null, categoriesFailed: true });

    // A disabled control with no reason given is worse than a message, so both appear.
    expect(category()).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      "We couldn't load your categories. Please close this and try again.",
    );

    const u = user();
    await u.type(amount(), '24');
    await u.type(merchant(), 'Whole Foods');
    await u.click(submit());

    expect(create).not.toHaveBeenCalled();
  });

  it('does not also tell the user to choose a category they cannot choose', async () => {
    // The guard on `categoriesFailed` runs **before** field validation for exactly this reason.
    // With the two the other way round, `categoryId` is '' so `invalidFields` reported it and the
    // user got "Choose a category." beside the real explanation - from a disabled select with no
    // options in it. One message, and it is the true one.
    open({ categories: null, categoriesFailed: true });

    const u = user();
    await u.type(amount(), '24');
    await u.type(merchant(), 'Whole Foods');
    await u.click(submit());

    expect(screen.queryByText('Choose a category.')).not.toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
  });

  it('still blocks a submit driven by Enter in another field', async () => {
    // The guard has to be real rather than decorative: the submit button is reachable, but so is
    // Enter from any field, which is what a `<form>` gives us.
    open({ categories: null, categoriesFailed: true });

    const u = user();
    await u.type(amount(), '24');
    await u.type(merchant(), 'Whole Foods{Enter}');

    expect(create).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('leaves the select live but empty for an account with no categories', async () => {
    // `[]` and `null` mean different things and the control treats them differently on purpose:
    // null is "the read is still out", so the select is disabled and will resolve, while an
    // empty array is an answer. It is not reachable today - provisioning seeds the fallback
    // "Uncategorized" - so nothing invents a state for it. What happens is that the placeholder
    // is the only option and validation blocks the submit, which is honest rather than pretty.
    open({ categories: [] });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(category()).toBeEnabled();
    expect(screen.queryAllByRole('option')).toHaveLength(0);

    const u = user();
    await u.type(amount(), '24');
    await u.type(merchant(), 'Whole Foods');
    await u.click(submit());

    expect(screen.getByText('Choose a category.')).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });
});
