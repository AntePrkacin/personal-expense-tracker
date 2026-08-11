import { screen, waitFor } from '@testing-library/react';

// `render` comes from the shell wrapper: the modal below prefixes the profile's currency symbol as
// of PET-47, so it reaches `useMoney()`/`useCurrency()`. See `shellRender.tsx`.
import { render } from './shellRender';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';

import type { Transaction } from '../../lib/transactions';
import type { UpdateTransactionResult } from '../../lib/updateTransaction';

import { EditTransactionModal } from './EditTransactionModal';
import { politeAnnouncement, toastMessages } from './toastQueries';

// PET-32's acceptance suite. AC1 and AC2 to AC6 live here; AC1's focus style, AC5's Escape and
// backdrop arms and AC3's dashboard half are not observable in jsdom and are named in the plan's
// verification steps.
//
// A package specifier, so the `@/` alias trap does not apply. The action is injected as a prop
// instead of mocked, which is `AddTransactionModal`'s pattern and means this file needs no module
// mock at all.
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));

const refresh = jest.fn();
const onClose = jest.fn();
const onDelete = jest.fn();
const update = jest.fn<Promise<UpdateTransactionResult>, [string, unknown]>();

const CATEGORIES = [
  { id: '0198c2a1-0000-7000-8000-0000000000a1', name: 'Groceries' },
  { id: '0198c2a1-0000-7000-8000-0000000000a2', name: 'Transport' },
  { id: '0198c2a1-0000-7000-8000-0000000000ff', name: 'Uncategorized' },
];

/** Frame 11's own row: Whole Foods, $24.00, Oct 8, Groceries, "Weekly groceries". */
const TRANSACTION: Transaction = {
  id: '0198c2a1-0000-7000-8000-0000000000b1',
  amount: 24,
  categoryId: CATEGORIES[0]!.id,
  date: '2025-10-08',
  merchant: 'Whole Foods',
  note: 'Weekly groceries',
  createdAt: '2025-10-08T09:30:00.000Z',
  updatedAt: '2025-10-08T09:30:00.000Z',
};

// October 2025 is the month the whole Figma file is drawn in, and the 8th is frame 11's day.
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(new Date(2025, 9, 8, 12, 0));
  (useRouter as jest.Mock).mockReturnValue({ refresh });
  update.mockResolvedValue({ ok: true });
});

afterEach(() => {
  jest.useRealTimers();
});

const user = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

function open(props: Partial<React.ComponentProps<typeof EditTransactionModal>> = {}) {
  return render(
    <EditTransactionModal
      transaction={TRANSACTION}
      categories={CATEGORIES}
      update={update}
      onDelete={onDelete}
      onClose={onClose}
      {...props}
    />,
  );
}

const amount = () => screen.getByLabelText('Amount');
const category = () => screen.getByLabelText('Category');
const merchant = () => screen.getByLabelText('Merchant');
const note = () => screen.getByLabelText('Note (optional)');
const save = () => screen.getByRole('button', { name: 'Save changes' });
const deleteAction = () => screen.getByRole('button', { name: 'Delete transaction' });

/** The body of the one request, whatever it was. */
const sentBody = () => update.mock.calls[0]![1];

describe('AC1: every field is prefilled from the stored row', () => {
  it('opens as a dialog titled "Edit transaction"', () => {
    open();

    expect(screen.getByRole('dialog', { name: 'Edit transaction' })).toBeInTheDocument();
  });

  it('prefills all five fields', () => {
    open();

    expect(amount()).toHaveValue('24.00');
    expect(category()).toHaveValue(CATEGORIES[0]!.id);
    expect(screen.getByRole('button', { name: /Date/ })).toHaveTextContent('Oct 8, 2025');
    expect(merchant()).toHaveValue('Whole Foods');
    expect(note()).toHaveValue('Weekly groceries');
  });

  it('shows a whole amount with its cents, as frame 11 draws it', () => {
    // `24` stored, `24.00` drawn. The formatting lives in `toTransactionFormValues`, which pins
    // the conversion itself; this is the assertion that the modal actually uses it.
    open({ transaction: { ...TRANSACTION, amount: 24 } });

    expect(amount()).toHaveValue('24.00');
  });

  it('leaves the note empty when the row has none, rather than rendering null', () => {
    open({ transaction: { ...TRANSACTION, note: null } });

    expect(note()).toHaveValue('');
  });

  it('selects the stored category rather than the placeholder', () => {
    // The one field where editing and adding genuinely differ: the Add modal opens on `Select…`
    // to keep its missing-category criterion reachable, and here a stored row always has one.
    open();

    expect(category()).not.toHaveValue('');
    expect(screen.getByRole('option', { name: 'Groceries' })).toBeInTheDocument();
  });

  it('draws the five fields in ADD-2’s order, which EDT-4 inherits', () => {
    open();

    const labels = screen
      .getAllByText(/^(Amount|Category|Date|Merchant|Note \(optional\))$/)
      .map((node) => node.textContent);

    expect(labels).toEqual(['Amount', 'Category', 'Date', 'Merchant', 'Note (optional)']);
  });

  it('marks only the note as optional', () => {
    open();

    expect(screen.queryByText(/\*/)).not.toBeInTheDocument();
    expect(amount()).toBeRequired();
    expect(merchant()).toBeRequired();
    expect(note()).not.toBeRequired();
  });

  it('holds focus on the amount field, which frame 11 draws focused', () => {
    open();

    expect(amount()).toHaveFocus();
  });

  it('reformats the amount under the caret as it is typed', () => {
    // jsdom cannot observe a caret, so the assertion is that the offset was computed and set -
    // the same stand-in `BudgetForm` and the Add modal both live with.
    open();
    const field = amount() as HTMLInputElement;
    const setSelectionRange = jest.spyOn(field, 'setSelectionRange');

    field.focus();
    field.setSelectionRange(5, 5);
    // A raw four-digit value typed over the prefill: the grouping separator lands to the left of
    // the caret, which is the case React's own restore gets wrong.
    userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    field.value = '1240';
    field.dispatchEvent(new Event('input', { bubbles: true }));

    expect(setSelectionRange).toHaveBeenCalled();
  });
});

describe('AC2: the footer', () => {
  it('shows Cancel, Save changes and a Delete transaction action', () => {
    open();

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(save()).toBeInTheDocument();
    expect(deleteAction()).toBeInTheDocument();
  });

  it('puts the delete action before the other two, which is frame 11’s left', () => {
    // DOM order rather than pixels: it is what the keyboard and a screen reader follow, and
    // `Modal.test.tsx` pins the `justify-between` that turns it into the drawn layout.
    open();

    expect(deleteAction().compareDocumentPosition(save())).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('marks the delete action as destructive and gives it the designed glyph', () => {
    // `text-error` is the visible half of "this is destructive", which is the one kind of class
    // this repo's tests do assert. The glyph is hidden because the label already says it.
    open();

    expect(deleteAction()).toHaveClass('text-error');
    expect(deleteAction().querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps the X, because this is the left-aligned shape rather than a confirmation', () => {
    open();

    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});

describe('AC3: a successful save', () => {
  it('sends only the field that changed', async () => {
    const u = user();
    open();

    await u.clear(amount());
    await u.type(amount(), '31.50');
    await u.click(save());

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledWith(TRANSACTION.id, { amount: 31.5 });
  });

  it('refreshes the route, which is what puts the new value in the list', async () => {
    const u = user();
    open();

    await u.type(merchant(), ' Market');
    await u.click(save());

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  // **"saved", not "added" (PET-77).** One word separates this from the create modal's, and it is
  // the word that decides whether a user believes they have just made a second transaction.
  it('confirms the save in the toast region', async () => {
    const u = user();
    open();

    await u.type(merchant(), ' Market');
    await u.click(save());

    await waitFor(() => expect(toastMessages()).toEqual(['Transaction saved.']));
    expect(politeAnnouncement()).toBe('Transaction saved.');
  });

  it('refreshes before closing, so the list is already re-reading', async () => {
    const u = user();
    open();

    await u.type(merchant(), ' Market');
    await u.click(save());

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(refresh.mock.invocationCallOrder[0]!).toBeLessThan(onClose.mock.invocationCallOrder[0]!);
  });

  it('closes through the dialog rather than by unmounting', async () => {
    // The difference is the browser's focus restore: removing an open dialog from the DOM skips
    // it, so the user would be left on `<body>` after saving. Going through `close()` fires the
    // native close event, which is what calls `onClose` - so the assertion is on the method, not
    // on the element being gone. This component never unmounts itself; its owner does.
    const close = jest.spyOn(HTMLDialogElement.prototype, 'close');
    const u = user();
    open();

    await u.type(merchant(), ' Market');
    await u.click(save());

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(close).toHaveBeenCalledTimes(1);

    close.mockRestore();
  });

  it('clears a note by sending null, which is the only way to clear one', async () => {
    const u = user();
    open();

    await u.clear(note());
    await u.click(save());

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(sentBody()).toEqual({ note: null });
  });

  it('sends a changed category', async () => {
    const u = user();
    open();

    await u.selectOptions(category(), CATEGORIES[1]!.id);
    await u.click(save());

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(sentBody()).toEqual({ categoryId: CATEGORIES[1]!.id });
  });

  it('disables Save while the request is out, and leaves every exit live', async () => {
    // A double submit would fire two patches and race their answers into one line. Cancel, the X
    // and the delete action stay live, because no fetch here carries a timeout and a hung request
    // is exactly when a way out matters most.
    update.mockReturnValue(new Promise(() => {}));
    const u = user();
    open();

    await u.type(merchant(), ' Market');
    await u.click(save());

    expect(save()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled();
    expect(deleteAction()).toBeEnabled();
  });
});

describe('saving with nothing changed', () => {
  it('closes without sending a request', async () => {
    // The endpoint answers 400 `Provide at least one field to update.` for an empty body, which
    // is a correct answer to a question the user did not ask. `toUpdateTransactionBody` returns
    // `{}` here and this is the half that acts on it.
    const u = user();
    open();

    await u.click(save());

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(update).not.toHaveBeenCalled();
  });

  it('does not refresh either, because there is nothing new to read', async () => {
    const u = user();
    open();

    await u.click(save());

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(refresh).not.toHaveBeenCalled();
  });

  it('closes when a field was edited and put back', async () => {
    // The diff is by value, not by whether anything was touched - so retyping the same amount is
    // not an edit, and `24.00` versus `24` is not one either.
    const u = user();
    open();

    await u.clear(amount());
    await u.type(amount(), '24');
    await u.click(save());

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(update).not.toHaveBeenCalled();
  });
});

describe('AC4: validation, unchanged from Add transaction', () => {
  it('rejects a cleared amount with the same message the Add modal uses', async () => {
    const u = user();
    open();

    await u.clear(amount());
    await u.click(save());

    expect(screen.getByText('Enter an amount greater than 0.')).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a zero amount on the same rule', async () => {
    const u = user();
    open();

    await u.clear(amount());
    await u.type(amount(), '0');
    await u.click(save());

    expect(screen.getByText('Enter an amount greater than 0.')).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a cleared merchant', async () => {
    const u = user();
    open();

    await u.clear(merchant());
    await u.click(save());

    expect(screen.getByText('Enter a merchant.')).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('shows every invalid field at once rather than stopping at the first', async () => {
    const u = user();
    open();

    await u.clear(amount());
    await u.clear(merchant());
    await u.click(save());

    expect(screen.getByText('Enter an amount greater than 0.')).toBeInTheDocument();
    expect(screen.getByText('Enter a merchant.')).toBeInTheDocument();
  });

  it('marks the invalid control for assistive technology, not only visually', async () => {
    const u = user();
    open();

    await u.clear(merchant());
    await u.click(save());

    expect(merchant()).toHaveAttribute('aria-invalid', 'true');
    expect(merchant()).toHaveAccessibleDescription('Enter a merchant.');
  });

  it('clears a field’s message as soon as that field is being fixed', async () => {
    const u = user();
    open();
    await u.clear(merchant());
    await u.click(save());

    await u.type(merchant(), 'T');

    expect(screen.queryByText('Enter a merchant.')).not.toBeInTheDocument();
  });

  it('leaves another field’s message alone while one is being fixed', async () => {
    const u = user();
    open();
    await u.clear(amount());
    await u.clear(merchant());
    await u.click(save());

    await u.type(merchant(), 'T');

    expect(screen.getByText('Enter an amount greater than 0.')).toBeInTheDocument();
  });

  it('never rejects the note, the one field that cannot be invalid', async () => {
    // Cleared and submitted: an empty note is a valid note, so nothing marks the field and the
    // save goes through. `invalidFields` cannot name it, which `transactionForm.test.ts` pins
    // from the other side.
    const u = user();
    open();

    await u.clear(note());
    await u.click(save());

    expect(note()).not.toHaveAttribute('aria-invalid');
    expect(note()).not.toHaveAccessibleDescription();
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
  });
});

describe('AC5: closing without saving', () => {
  it('closes on Cancel and sends nothing', async () => {
    const u = user();
    open();

    await u.type(merchant(), ' Market');
    await u.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('closes on the X and sends nothing', async () => {
    const u = user();
    open();

    await u.type(merchant(), ' Market');
    await u.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it('closes on a scrim click and sends nothing', async () => {
    // A click on ::backdrop reports the dialog element itself as its target, which is what this
    // simulates. Escape is unassertable in jsdom and is a manual check.
    const u = user();
    open();

    await u.click(screen.getByRole('dialog'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('AC6: the delete action', () => {
  it('asks its owner to open the confirmation', async () => {
    const u = user();
    open();

    await u.click(deleteAction());

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('deletes nothing itself and saves nothing on the way', async () => {
    // Two failures in one assertion, both real: a submit-typed control there would save the
    // half-finished edits the user was abandoning, and a delete call from here would bypass the
    // confirmation DEL-3 requires.
    const u = user();
    open();

    await u.type(merchant(), ' Market');
    await u.click(deleteAction());

    expect(update).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('leaves this modal open, so cancelling the confirmation returns to the form', async () => {
    // The nested-dialog decision: the edit modal stays mounted behind the confirmation, with the
    // edits still in it. The owner is what closes this one, and only on a real delete.
    const u = user();
    open();

    await u.type(merchant(), ' Market');
    await u.click(deleteAction());

    expect(screen.getByRole('dialog', { name: 'Edit transaction' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(merchant()).toHaveValue('Whole Foods Market');
  });
});

// **PET-77 split these five in two, per reason rather than per surface.** The three that keep the
// inline line are the ones the user can act on here - a body they can fix, and the two `missing`
// arms whose copy asks them to close and see the current list. `unauthenticated` and `failed` can
// be acted on nowhere on this screen, so they leave the form. `(app)/failureReporting.ts` owns it.
describe('the five failure lines', () => {
  async function submitAndRead(result: UpdateTransactionResult) {
    update.mockResolvedValue(result);
    const u = user();
    open();

    await u.type(merchant(), ' Market');
    await u.click(save());

    return screen.findByRole('alert');
  }

  /** The same submit, for the two arms that now report in the toast region instead. */
  async function submitAndReadToast(result: UpdateTransactionResult) {
    update.mockResolvedValue(result);
    const u = user();
    open();

    await u.type(merchant(), ' Market');
    await u.click(save());

    await waitFor(() => expect(toastMessages()).toHaveLength(1));
    return toastMessages()[0];
  }

  it('says to check the values on a 400, never to try again', async () => {
    // A body the DTO rejects will be rejected again forever, so "try again" would be advice that
    // cannot work - the reason this reason exists at all.
    const line = await submitAndRead({ ok: false, reason: 'invalid' });

    expect(line).toHaveTextContent(
      "We couldn't save this transaction. Please check the values and try again.",
    );
  });

  it('says the transaction is gone when the category was not touched', async () => {
    const line = await submitAndRead({ ok: false, reason: 'transactionMissing' });

    expect(line).toHaveTextContent(
      'This transaction no longer exists. Close this and refresh the list.',
    );
  });

  it('names both when the category was part of the patch', async () => {
    const line = await submitAndRead({ ok: false, reason: 'transactionOrCategoryMissing' });

    expect(line).toHaveTextContent(
      'This transaction or that category no longer exists. Close this and try again.',
    );
  });

  it('says the session expired on a 401, without navigating anywhere', async () => {
    const message = await submitAndReadToast({ ok: false, reason: 'unauthenticated' });

    expect(message).toBe('Your session has expired. Log in again to save this.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says to try again on anything else', async () => {
    const message = await submitAndReadToast({ ok: false, reason: 'failed' });

    expect(message).toBe("We couldn't save this transaction. Please try again.");
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('stays open with the edits intact after a failure', async () => {
    await submitAndReadToast({ ok: false, reason: 'failed' });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(merchant()).toHaveValue('Whole Foods Market');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('re-enables Save after a failure, so the user can retry', async () => {
    await submitAndReadToast({ ok: false, reason: 'failed' });

    expect(save()).toBeEnabled();
  });

  it('survives the action itself rejecting', async () => {
    // The client-to-Server-Action RPC can reject - offline, or a deploy that moved the action id
    // - and that is not a result. Without the try/catch the modal would throw past its own error
    // handling and sit there with Save disabled forever.
    update.mockRejectedValue(new Error('Failed to fetch'));
    const u = user();
    open();

    await u.type(merchant(), ' Market');
    await u.click(save());

    // A rejection is classified as `failed`, so it reports where `failed` reports (PET-77).
    await waitFor(() =>
      expect(toastMessages()).toEqual(["We couldn't save this transaction. Please try again."]),
    );
    expect(save()).toBeEnabled();
  });

  it('clears a stale failure when the next attempt starts', async () => {
    update.mockResolvedValueOnce({ ok: false, reason: 'invalid' });
    const u = user();
    open();
    await u.type(merchant(), ' Market');
    await u.click(save());
    await screen.findByRole('alert');

    update.mockResolvedValue({ ok: true });
    await u.click(save());

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('clears a stale failure as soon as a field is edited', async () => {
    // `invalid` rather than `failed`: after PET-77 only the three actionable arms render an inline
    // line at all, and this test is about that line.
    await submitAndRead({ ok: false, reason: 'invalid' });

    await user().type(merchant(), '!');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('the categories read', () => {
  it('disables the picker while the options are still out', () => {
    open({ categories: null });

    expect(category()).toBeDisabled();
  });

  it('keeps the rest of the form usable while they are out', () => {
    // The value is in state throughout, so nothing is lost - only the picker is inert, and it has
    // a designed state for that where it has none for "not open yet".
    open({ categories: null });

    expect(amount()).toHaveValue('24.00');
    expect(merchant()).toBeEnabled();
  });

  it('explains a failed read', async () => {
    open({ categories: null, categoriesFailed: true });

    expect(screen.getByRole('alert')).toHaveTextContent(
      "We couldn't load your categories. Please close this and try again.",
    );
  });

  it('still saves a change to another field while the options are unavailable', async () => {
    // **This is the inverse of what the first version of this file asserted, and the assertion was
    // pinning a defect.** The submit handler copied `AddTransactionModal`'s
    // `if (categoriesFailed) return;`, whose premise does not hold here: an edit already has a
    // valid category, so a failed read leaves every other field saveable. With the guard in place,
    // pressing Save did nothing observable - the categories line was already on screen from the
    // read, so there was no new message and no state change either.
    const u = user();
    open({ categories: null, categoriesFailed: true });

    await u.type(merchant(), ' Market');
    await u.click(save());

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(sentBody()).toEqual({ merchant: 'Whole Foods Market' });
  });

  it('closes on that save, rather than leaving the form open over a completed write', async () => {
    const u = user();
    open({ categories: null, categoriesFailed: true });

    await u.type(merchant(), ' Market');
    await u.click(save());

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('never sends a categoryId when the picker never offered one', async () => {
    // What made the guard unnecessary as well as harmful: the select is disabled, so the id cannot
    // change, so nothing the backend could reject on a 404 reaches the body.
    const u = user();
    open({ categories: null, categoriesFailed: true });

    await u.type(merchant(), ' Market');
    await u.click(save());

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect('categoryId' in (sentBody() as object)).toBe(false);
  });

  it('still refuses an invalid field with the options unavailable', async () => {
    // Removing the guard must not remove validation with it: the fields the user *can* edit are
    // still checked, and the two messages coexist.
    const u = user();
    open({ categories: null, categoriesFailed: true });

    await u.clear(merchant());
    await u.click(save());

    expect(screen.getByText('Enter a merchant.')).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });
});
