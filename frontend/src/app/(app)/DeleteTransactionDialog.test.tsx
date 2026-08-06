import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';

import {
  DeleteTransactionDialog,
  deleteTransactionBody,
  type DeleteTarget,
} from './DeleteTransactionDialog';

// 12 Delete confirmation. What this suite can and cannot see is `Modal.test.tsx`'s note: jsdom
// fakes `showModal()` and `close()` and nothing else, so Escape and the focus trap are Storybook
// and manual checks. Everything here is either this file's own behaviour or the wiring into
// Modal's single exit.
//
// A package specifier, which is the one case `jest.mock` takes without the relative-path dance.
// The action needs no mock at all: it arrives as a prop, which is exactly why it does.
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));

const refresh = jest.fn();

/** Frame 12's own target, and the row the copy quotes. */
const TARGET: DeleteTarget = {
  id: '0198c2a1-0000-7000-8000-0000000000b1',
  merchant: 'Whole Foods',
  amount: 62.4,
  date: '2025-10-08',
};

function renderDialog({
  remove = jest.fn().mockResolvedValue({ ok: true }),
  onClose = jest.fn(),
  target = TARGET,
}: {
  remove?: jest.Mock;
  onClose?: jest.Mock;
  target?: DeleteTarget;
} = {}) {
  render(<DeleteTransactionDialog target={target} remove={remove} onClose={onClose} />);
  return { remove, onClose };
}

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({ refresh });
});

describe('what it says', () => {
  it('is titled with DEL-1s question', async () => {
    renderDialog();

    expect(
      screen.getByRole('heading', { level: 2, name: 'Delete this transaction?' }),
    ).toBeInTheDocument();
  });

  it('quotes the merchant, the amount and the short date', async () => {
    // AC3. The three values are what makes this a confirmation rather than a generic warning,
    // so the whole sentence is asserted rather than its parts.
    renderDialog();

    expect(
      screen.getByText(
        'This permanently removes "Whole Foods - $62.40" (Oct 8) from your records. This can\'t be undone.',
      ),
    ).toBeInTheDocument();
  });

  it('renders the amount positive, not as the negative the table draws', async () => {
    // `formatCurrency`, not `formatNegative`. Every row in the table is a debit and is drawn
    // negative for that reason; this sentence names a purchase, and "removes ... −$62.40"
    // reads as removing a credit. The frame draws $62.40 too.
    renderDialog();

    expect(screen.getByText(/\$62\.40/)).toBeInTheDocument();
    expect(screen.queryByText(/−\$62\.40/)).not.toBeInTheDocument();
  });

  it('draws no close control, because Cancel is the way out', async () => {
    renderDialog();

    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('offers exactly Cancel and Delete', async () => {
    renderDialog();

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Cancel',
      'Delete',
    ]);
  });
});

describe('deleteTransactionBody', () => {
  // Exported so no test or story restates a shipped string, which is TransactionsEmpty's rule.
  // Pinned directly as well as through the render, because the interpolation is the part a
  // future locale change breaks and a fast unit assertion is where that should fail.

  it('interpolates a different target', () => {
    expect(
      deleteTransactionBody({
        id: 'x',
        merchant: 'Rent — October',
        amount: 1100,
        date: '2025-10-05',
      }),
    ).toBe(
      'This permanently removes "Rent — October - $1,100.00" (Oct 5) from your records. This can\'t be undone.',
    );
  });

  it('is the string the dialog renders', () => {
    renderDialog();

    expect(screen.getByText(deleteTransactionBody(TARGET))).toBeInTheDocument();
  });
});

describe('Cancel', () => {
  it('changes nothing (AC5)', async () => {
    // The criterion is about what does *not* happen, so the assertion is that the action was
    // never called - not that the dialog closed, which the next test covers.
    const { remove } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(remove).not.toHaveBeenCalled();
  });

  it('closes through the dialog, so focus goes back to whatever opened it', async () => {
    const { onClose } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('never refreshes the page', async () => {
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('Delete', () => {
  it('calls the action once with the id and nothing else', async () => {
    const { remove } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(TARGET.id);
  });

  it('refreshes the page, which is what drops the row and the badge together', async () => {
    // AC4, as far as this file can reach it: `router.refresh()` re-runs the route's Server
    // Components, and the list and the count both come from that read.
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('closes after a successful delete', async () => {
    const { onClose } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('refreshes before closing', async () => {
    // The order is AddTransactionModal's and matters for the same reason: closing first
    // unmounts this component mid-handler.
    const onClose = jest.fn();
    renderDialog({ onClose });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(refresh.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0]!);
  });

  it('disables itself while the request is out', async () => {
    // A second delete cannot remove a second row, but it does answer 404 - so a double click
    // would replace a succeeding delete with "that transaction is already gone".
    let settle: (value: { ok: true }) => void = () => {};
    const remove = jest.fn().mockReturnValue(
      new Promise<{ ok: true }>((resolve) => {
        settle = resolve;
      }),
    );
    renderDialog({ remove });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();

    settle({ ok: true });
  });

  it('leaves Cancel live while the request is out', async () => {
    // Deliberate, and AddTransactionModal's call: no fetch in this app carries a timeout, so a
    // hung request is exactly when a way out matters most - and there is no X here to fall
    // back on.
    let settle: (value: { ok: true }) => void = () => {};
    const remove = jest.fn().mockReturnValue(
      new Promise<{ ok: true }>((resolve) => {
        settle = resolve;
      }),
    );
    renderDialog({ remove });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();

    settle({ ok: true });
  });
});

describe('the three failures', () => {
  it.each([
    ['missing', 'That transaction is already gone. Close this to see the current list.'],
    ['unauthenticated', 'Your session has expired. Log in again to delete this.'],
    ['failed', "We couldn't delete this transaction. Please try again."],
  ])('shows its own line for %s', async (reason, message) => {
    const remove = jest.fn().mockResolvedValue({ ok: false, reason });
    renderDialog({ remove });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.getByRole('alert')).toHaveTextContent(message);
  });

  it('does not tell a user whose row is already gone to try again', async () => {
    // The reason `missing` exists as its own arm rather than folding into `failed`: retrying a
    // 404 answers 404 forever.
    const remove = jest.fn().mockResolvedValue({ ok: false, reason: 'missing' });
    renderDialog({ remove });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.getByRole('alert')).not.toHaveTextContent('try again');
  });

  it('stays open and re-enables Delete after a failure', async () => {
    const remove = jest.fn().mockResolvedValue({ ok: false, reason: 'failed' });
    const { onClose } = renderDialog({ remove });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });

  it('does not refresh when the delete failed', async () => {
    const remove = jest.fn().mockResolvedValue({ ok: false, reason: 'failed' });
    renderDialog({ remove });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(refresh).not.toHaveBeenCalled();
  });

  it('clears a stale message when Delete is pressed again', async () => {
    const remove = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: 'failed' })
      .mockResolvedValueOnce({ ok: true });
    renderDialog({ remove });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows nothing at rest', async () => {
    renderDialog();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
