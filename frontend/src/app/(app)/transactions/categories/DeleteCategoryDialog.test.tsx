import { act, screen, waitFor } from '@testing-library/react';

// `render` comes from the shell wrapper: the confirmation below posts into the toast region as of
// PET-77, and `useToast()` throws outside its provider by design. See `(app)/shellRender.tsx`.
import { render } from '../../shellRender';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';

import { toastMessages } from '../../toastQueries';

import {
  DeleteCategoryDialog,
  deleteCategoryBody,
  DELETE_CATEGORY_TITLE,
  type DeleteCategoryTarget,
} from './DeleteCategoryDialog';

// 20 Delete confirmation for category. What this suite can and cannot see is `Modal.test.tsx`'s
// note: jsdom fakes `showModal()` and `close()` and nothing else, so Escape and the focus trap are
// Storybook and manual checks. Everything here is either this file's own behaviour or the wiring
// into Modal's single exit.
//
// A package specifier, which is the one case `jest.mock` takes without the relative-path dance.
// The action needs no mock at all: it arrives as a prop, which is exactly why it does.
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));

const refresh = jest.fn();

/** Frame 20's own target, and the card the copy quotes. */
const TARGET: DeleteCategoryTarget = {
  id: '0198c2a1-0000-7000-8000-0000000000c1',
  name: 'Groceries',
  transactionCount: 24,
};

/** The account's own fallback row, which is `Uncategorized` rather than the ticket's "Other". */
const FALLBACK = 'Uncategorized';

function renderDialog({
  remove = jest.fn().mockResolvedValue({ ok: true }),
  onClose = jest.fn(),
  onDeleted = jest.fn(),
  target = TARGET,
  fallbackName = FALLBACK,
}: {
  remove?: jest.Mock;
  onClose?: jest.Mock;
  onDeleted?: jest.Mock;
  target?: DeleteCategoryTarget;
  fallbackName?: string;
} = {}) {
  render(
    <DeleteCategoryDialog
      target={target}
      fallbackName={fallbackName}
      remove={remove}
      onClose={onClose}
      onDeleted={onDeleted}
    />,
  );
  return { remove, onClose, onDeleted };
}

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({ refresh });
});

describe('what it says', () => {
  it("is titled with CED-9's question", () => {
    renderDialog();

    expect(
      screen.getByRole('heading', { level: 2, name: DELETE_CATEGORY_TITLE }),
    ).toBeInTheDocument();
  });

  it('quotes the name and the count (AC2)', () => {
    // The two values are what makes this a confirmation rather than a generic warning, so the
    // whole sentence is asserted rather than its parts.
    renderDialog();

    expect(
      screen.getByText(
        'This permanently removes "Groceries" from your categories. Its 24 transactions this month will be moved to Uncategorized, along with any from earlier months. This can\'t be undone.',
      ),
    ).toBeInTheDocument();
  });

  it('names the account\'s own fallback row rather than the ticket\'s "Other"', () => {
    // The amendment recorded on the issue. "Other" is an ordinary chip anyone can rename or
    // delete; the row deletions reassign to is the `isFallback` one. Asserted through a
    // deliberately different name so the interpolation cannot be faked by a literal.
    renderDialog({ fallbackName: 'Somewhere else' });

    expect(screen.getByText(/moved to Somewhere else/)).toBeInTheDocument();
    expect(screen.queryByText(/moved to Other/)).not.toBeInTheDocument();
  });

  it('draws no close control, because Cancel is the way out', () => {
    renderDialog();

    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('offers exactly Cancel and Delete', () => {
    renderDialog();

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Cancel',
      'Delete',
    ]);
  });

  it('shows no failure line until something fails', () => {
    renderDialog();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('deleteCategoryBody', () => {
  // Exported so no test or story restates a shipped string, which is TransactionsEmpty's rule.
  // Pinned directly as well as through the render, because the interpolation is the part a future
  // copy change breaks and a fast unit assertion is where that should fail.

  it("says the count is this month's, which amends CED-9", () => {
    // `transactionCount` is the current period's, while the delete moves everything the category
    // ever held. Quoting it as a total would understate on any account with history, so the
    // sentence names the period and mentions the earlier months separately.
    expect(deleteCategoryBody(TARGET, FALLBACK)).toContain('Its 24 transactions this month');
    expect(deleteCategoryBody(TARGET, FALLBACK)).toContain('along with any from earlier months');
  });

  it('pluralizes a single transaction', () => {
    expect(deleteCategoryBody({ ...TARGET, transactionCount: 1 }, FALLBACK)).toContain(
      'Its 1 transaction this month',
    );
  });

  it('takes a different shape with nothing in the period, rather than printing a zero', () => {
    // "Its 0 transactions this month will be moved" is a sentence nobody writes, and with an
    // empty period the clause carrying the information is the one about earlier months.
    const body = deleteCategoryBody({ ...TARGET, transactionCount: 0 }, FALLBACK);

    expect(body).toBe(
      'This permanently removes "Groceries" from your categories. Any transactions filed under it will be moved to Uncategorized. This can\'t be undone.',
    );
    expect(body).not.toContain('0 transactions');
  });

  it('quotes the name in every shape', () => {
    for (const transactionCount of [0, 1, 24]) {
      expect(deleteCategoryBody({ ...TARGET, transactionCount }, FALLBACK)).toContain(
        '"Groceries"',
      );
    }
  });
});

describe('Cancel', () => {
  it('closes without deleting anything (AC5)', async () => {
    const { remove, onClose } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(remove).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not refresh, because nothing on the server changed', async () => {
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('Delete', () => {
  it('sends the target id and nothing else', async () => {
    const { remove } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(remove).toHaveBeenCalledWith(TARGET.id);
  });

  it('refreshes before it closes, so the grid, the badge and the summary redraw (AC3)', async () => {
    // All three read the same response, so one refresh recomputes them together. The order is
    // what keeps the focus restore aimed at an element still attached.
    const { onClose } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh.mock.invocationCallOrder[0]!).toBeLessThan(onClose.mock.invocationCallOrder[0]!);
  });

  // **PET-77, and this confirmation says more than the transaction one deliberately.** A category
  // delete has two effects and the second is the surprising half: the transactions are reassigned,
  // not deleted. The fallback's name comes off the list response rather than being assumed.
  it('confirms the delete in the toast region, naming where the transactions went', async () => {
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(toastMessages()).toEqual([`Category deleted. Its transactions moved to ${FALLBACK}.`]),
    );
  });

  it('disables itself while the request is out, and leaves Cancel enabled', async () => {
    let settle: (result: { ok: true }) => void = () => {};
    const remove = jest.fn().mockReturnValue(
      new Promise<{ ok: true }>((resolve) => {
        settle = resolve;
      }),
    );
    renderDialog({ remove });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    // Deliberately still enabled: no fetch in this app carries a timeout, so a hung request is
    // when a visible way out matters most, and the centred shape has no X beside it.
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();

    // Awaited: the success path posts a toast as of PET-77, and an unawaited resolution lands
    // after the test has finished, which React reports as an update outside `act`.
    await act(async () => {
      settle({ ok: true });
    });
  });
});

// **PET-77 split these four by where they are reported**, and this dialog is the clearest case for
// the rule: `missing` and `fallback` both describe the state of the account and ask the user to look
// at it, which they do from here, while the other two name nothing this dialog can act on.
describe('the four failures', () => {
  it.each([
    ['missing', 'That category is already gone. Close this to see the current list.'],
    [
      'fallback',
      'That category cannot be deleted: it is where deleting any other category moves its transactions.',
    ],
  ])('shows the %s line and keeps the dialog open', async (reason, message) => {
    const { onClose } = renderDialog({
      remove: jest.fn().mockResolvedValue({ ok: false, reason }),
    });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(onClose).not.toHaveBeenCalled();
    expect(toastMessages()).toEqual([]);
  });

  it.each([['failed', "We couldn't delete this category. Please try again."]])(
    'reports %s in the toast region and keeps the dialog open',
    async (reason, message) => {
      const { onClose } = renderDialog({
        remove: jest.fn().mockResolvedValue({ ok: false, reason }),
      });

      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(toastMessages()).toEqual([message]));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    },
  );

  it('re-enables Delete after a failure, so the user can retry', async () => {
    renderDialog({ remove: jest.fn().mockResolvedValue({ ok: false, reason: 'failed' }) });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(toastMessages()).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });

  it('refreshes on missing, because the grid is showing a card that is gone', async () => {
    renderDialog({ remove: jest.fn().mockResolvedValue({ ok: false, reason: 'missing' }) });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it.each(['fallback', 'unauthenticated', 'failed'])(
    'does not refresh on %s, because nothing on the server changed',
    async (reason) => {
      renderDialog({ remove: jest.fn().mockResolvedValue({ ok: false, reason }) });

      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(refresh).not.toHaveBeenCalled());
    },
  );
});

describe('when the request itself rejects', () => {
  it('reports the generic failure rather than leaving Delete disabled forever', async () => {
    // `deleteCategory` never throws, but the client-to-Server-Action RPC carrying it does when
    // the browser is offline or a deploy moves the action id. Without the catch, `setPending`
    // never clears and the dialog is stuck with no message.
    renderDialog({ remove: jest.fn().mockRejectedValue(new TypeError('Failed to fetch')) });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    // Classified as `failed`, so it reports where `failed` reports (PET-77).
    await waitFor(() =>
      expect(toastMessages()).toEqual(["We couldn't delete this category. Please try again."]),
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });
});

describe('onDeleted', () => {
  it('fires after the dialog has closed, so the focus restore lands on a live element', async () => {
    const { onClose, onDeleted } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(onClose.mock.invocationCallOrder[0]!).toBeLessThan(
      onDeleted.mock.invocationCallOrder[0]!,
    );
  });

  it.each(['missing', 'fallback', 'unauthenticated', 'failed'])(
    'never fires on %s',
    async (reason) => {
      // Including `missing`: that arm's copy asks the user to close the dialog and see the
      // current list, so dismissing whatever is behind it would be a dismissal caused by a
      // failure.
      const { onDeleted } = renderDialog({
        remove: jest.fn().mockResolvedValue({ ok: false, reason }),
      });

      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

      expect(onDeleted).not.toHaveBeenCalled();
    },
  );

  it('is optional, so the kebab call site needs no second argument', async () => {
    render(
      <DeleteCategoryDialog
        target={TARGET}
        fallbackName={FALLBACK}
        remove={jest.fn().mockResolvedValue({ ok: true })}
        onClose={jest.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
