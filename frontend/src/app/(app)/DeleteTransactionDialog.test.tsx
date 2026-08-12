import { act, screen, waitFor } from '@testing-library/react';

import { render } from './shellRender';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';

import { moneyFormatters } from '@/lib/money';

import {
  DeleteTransactionDialog,
  deleteTransactionBody,
  type DeleteTarget,
} from './DeleteTransactionDialog';
import { toastMessages } from './toastQueries';

/** The formatters the shell's provider would hand the dialog; see `PreferencesProvider`. */
const USD = moneyFormatters('USD');

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
  onDeleted = jest.fn(),
  target = TARGET,
  navigates,
}: {
  remove?: jest.Mock;
  onClose?: jest.Mock;
  onDeleted?: jest.Mock;
  target?: DeleteTarget;
  navigates?: boolean;
} = {}) {
  render(
    <DeleteTransactionDialog
      target={target}
      remove={remove}
      onClose={onClose}
      onDeleted={onDeleted}
      navigates={navigates}
    />,
  );
  return { remove, onClose, onDeleted };
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
      deleteTransactionBody(
        {
          id: 'x',
          merchant: 'Rent — October',
          amount: 1100,
          date: '2025-10-05',
        },
        USD,
      ),
    ).toBe(
      'This permanently removes "Rent — October - $1,100.00" (Oct 5) from your records. This can\'t be undone.',
    );
  });

  it('is the string the dialog renders', () => {
    renderDialog();

    expect(screen.getByText(deleteTransactionBody(TARGET, USD))).toBeInTheDocument();
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

  // **This dialog is the sharpest case for PET-77.** A delete takes the row, the dialog and often
  // the control that opened it - a kebab dies with its row - so before this there was no surface
  // left to say anything on, and a delete reported itself with nothing at all.
  it('confirms the delete in the toast region, which survives the unwind', async () => {
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(toastMessages()).toEqual(['Transaction deleted.']));
  });

  it('does not quote the merchant in that confirmation', async () => {
    // Read after the dialog has gone, sometimes from another screen, so naming a row the user can
    // no longer see would invite them to look for it. The body above is where the target is named.
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(toastMessages()).toHaveLength(1));
    expect(toastMessages()[0]).not.toContain(TARGET.merchant);
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

    // Awaited rather than fired and forgotten: the success path posts a toast as of PET-77, so
    // resolving carries state updates on a provider above this dialog. Left unawaited they land
    // after the test has finished, which React reports as an update outside `act`.
    await act(async () => {
      settle({ ok: true });
    });
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

    // Awaited rather than fired and forgotten: the success path posts a toast as of PET-77, so
    // resolving carries state updates on a provider above this dialog. Left unawaited they land
    // after the test has finished, which React reports as an update outside `act`.
    await act(async () => {
      settle({ ok: true });
    });
  });
});

// **PET-77 split these three by where they are reported.** `missing` asks the user to close this
// and see the current list, which is an instruction they carry out here; the other two name nothing
// this dialog can do anything about, so they leave it. `(app)/failureReporting.ts` owns the rule.
describe('the three failures', () => {
  it('shows its own line for missing, which asks the user to act here', async () => {
    const remove = jest.fn().mockResolvedValue({ ok: false, reason: 'missing' });
    renderDialog({ remove });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'That transaction is already gone. Close this to see the current list.',
    );
    expect(toastMessages()).toEqual([]);
  });

  it('keeps the unauthenticated line inline, because the user must act on it', async () => {
    const remove = jest.fn().mockResolvedValue({ ok: false, reason: 'unauthenticated' });
    renderDialog({ remove });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your session has expired. Log in again to delete this.',
    );
    expect(toastMessages()).toEqual([]);
  });

  it.each([['failed', "We couldn't delete this transaction. Please try again."]])(
    'reports %s in the toast region instead',
    async (reason, message) => {
      const remove = jest.fn().mockResolvedValue({ ok: false, reason });
      renderDialog({ remove });

      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(toastMessages()).toEqual([message]));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

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

    await waitFor(() => expect(toastMessages()).toHaveLength(1));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });

  it('does not refresh when the delete failed', async () => {
    const remove = jest.fn().mockResolvedValue({ ok: false, reason: 'failed' });
    renderDialog({ remove });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(refresh).not.toHaveBeenCalled();
  });

  it('does refresh on a 404, because the row really is gone', async () => {
    // The one failure arm that re-reads. `missing` means the server no longer has the row, so
    // the list behind this dialog is stale - and the copy tells the user closing it will show
    // the current list, which was untrue until this. Reached by deleting the same transaction
    // from two tabs.
    const remove = jest.fn().mockResolvedValue({ ok: false, reason: 'missing' });
    renderDialog({ remove });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('stays open on a 404 rather than closing on a refresh', async () => {
    // The refresh above must not be mistaken for success: the message still has to be read.
    const remove = jest.fn().mockResolvedValue({ ok: false, reason: 'missing' });
    const { onClose } = renderDialog({ remove });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('when the request itself rejects', () => {
  // **The gap a code review found, and the reason every test above could not see it.** They all
  // mock a *resolved* result, which is what `deleteTransaction` promises - but that promise
  // covers the action's body, not the RPC carrying it. Offline, a dropped connection or a
  // deployment that moves the action id all reject instead, and without a catch the handler
  // died mid-flight leaving Delete disabled forever with nothing on screen.

  it('reports it as a failure rather than hanging', async () => {
    const remove = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    renderDialog({ remove });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    // Classified as `failed`, so it reports where `failed` reports (PET-77).
    await waitFor(() =>
      expect(toastMessages()).toEqual(["We couldn't delete this transaction. Please try again."]),
    );
  });

  it('re-enables Delete, so the user can retry', async () => {
    // The half that actually bit: `setPending(false)` never ran, so the only control that could
    // retry stayed disabled and the centred shape has no X to leave by.
    const remove = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    renderDialog({ remove });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });

  it('neither refreshes nor closes', async () => {
    const remove = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const { onClose } = renderDialog({ remove });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(refresh).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('clears a stale message when Delete is pressed again', async () => {
    // `missing` rather than `failed`: after PET-77 only the arm the user can act on here renders an
    // inline line at all, and the line is what this test is about.
    const remove = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: 'missing' })
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

describe('onDeleted', () => {
  // PET-32's addition, and the caller PET-33 declined to invent one for. The edit modal opens this
  // confirmation over itself, so a real delete has to take that modal down too.

  it('runs after a delete that removed the row', async () => {
    const { onDeleted } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it('runs after the dialog has closed, not before', async () => {
    // The ordering the nested case depends on: `close()` restores focus to whatever opened this -
    // the edit modal's own Delete button - and only then may that modal be unmounted. Reversed,
    // the restore would aim at an element already detached.
    const onClose = jest.fn();
    const onDeleted = jest.fn();
    renderDialog({ onClose, onDeleted });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onClose.mock.invocationCallOrder[0]!).toBeLessThan(
      onDeleted.mock.invocationCallOrder[0]!,
    );
  });

  it('runs after the refresh, so the list is already re-reading', async () => {
    const { onDeleted } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(refresh.mock.invocationCallOrder[0]!).toBeLessThan(
      onDeleted.mock.invocationCallOrder[0]!,
    );
  });

  it('skips the refresh entirely when the caller navigates away', async () => {
    // PET-34, from a code review. On `/transactions/[id]` the refresh re-runs the route the
    // user is *currently* on - which is the one about to 404 on the row just deleted - and
    // races the navigation `onDeleted` starts. The caller says so and the refresh is dropped.
    const { onDeleted } = renderDialog({ navigates: true });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(refresh).not.toHaveBeenCalled();
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it('still closes before calling onDeleted when navigating', async () => {
    // The focus-restore ordering is unchanged by the skip: `close()` first, so the restore
    // aims at an element still attached.
    const onClose = jest.fn();
    const onDeleted = jest.fn();
    renderDialog({ onClose, onDeleted, navigates: true });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onClose.mock.invocationCallOrder[0]!).toBeLessThan(
      onDeleted.mock.invocationCallOrder[0]!,
    );
  });

  it('still refreshes on a 404 even when navigating, because that arm never navigates', async () => {
    // The `missing` arm returns early and does not call `onDeleted`, so there is no navigation
    // to race and the list behind genuinely needs re-reading.
    renderDialog({
      remove: jest.fn().mockResolvedValue({ ok: false, reason: 'missing' }),
      navigates: true,
    });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not run when Cancel closes the dialog', async () => {
    const { onDeleted } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onDeleted).not.toHaveBeenCalled();
  });

  it.each(['missing', 'unauthenticated', 'failed'] as const)(
    'does not run on a %s failure',
    async (reason) => {
      // Including `missing`, deliberately: a 404 means the row was already gone, and its copy asks
      // the user to close the dialog to see the current list - so whatever is behind it stays put
      // with the message in front of it rather than being dismissed by something that failed.
      const remove = jest.fn().mockResolvedValue({ ok: false, reason });
      const { onDeleted } = renderDialog({ remove });

      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

      expect(onDeleted).not.toHaveBeenCalled();
    },
  );

  it('does not run when the request itself rejects', async () => {
    const remove = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const { onDeleted } = renderDialog({ remove });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('is optional, so the row menu can open the dialog without one', async () => {
    // The call site that has nothing to do afterwards stays `open(target)`, and this pins that the
    // absent callback is not an absent guard.
    render(
      <DeleteTransactionDialog
        target={TARGET}
        remove={jest.fn().mockResolvedValue({ ok: true })}
        onClose={jest.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
