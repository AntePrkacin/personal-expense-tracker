import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';

import type { Transaction } from '../../lib/transactions';

import { DeleteTransactionProvider } from './DeleteTransactionProvider';
import { EditTransactionProvider, useEditTransaction } from './EditTransactionProvider';

// The provider's own contract: one modal for the shell, nothing fetched until it is opened, a hook
// that refuses to work outside it, and the confirmation opening *over* the modal rather than
// instead of it.
//
// `next/navigation` is a package specifier, so the `@/` alias trap does not apply. Both actions are
// injected as props on the two providers rather than mocked, which is why this file needs no module
// mock at all - and why a story cannot accidentally run a Server Action in a browser.
//
// **Four of the cases here cover `(app)/useCategoryOptions.ts` rather than this file**: the exact
// path, the nothing-before-open case, the failure line and the late-read guard.
// `AddTransactionProvider.test.tsx` pins the same four through the other consumer, deliberately -
// the read is shared, so a change that breaks it should fail in both places rather than in a
// harness. There is no `renderHook` anywhere in `frontend/src`.
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));

const refresh = jest.fn();
const update = jest.fn();
const remove = jest.fn();

const CATEGORIES = [
  { id: '0198c2a1-0000-7000-8000-0000000000a1', name: 'Groceries' },
  { id: '0198c2a1-0000-7000-8000-0000000000a2', name: 'Transport' },
];

/** Frame 11's own row. */
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

const originalFetch = global.fetch;

function respondWith(status: number, body: unknown = { categories: CATEGORIES }) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({ refresh });
  update.mockResolvedValue({ ok: true });
  remove.mockResolvedValue({ ok: true });
  respondWith(200);
});

afterEach(() => {
  global.fetch = originalFetch;
});

/** A trigger inside both providers, so opening is a real interaction rather than a mount. */
function Trigger({ transaction = TRANSACTION }: { transaction?: Transaction }) {
  const { open } = useEditTransaction();

  return (
    <button type="button" onClick={() => open(transaction)}>
      Edit it
    </button>
  );
}

/** The shell's real nesting: the delete provider outside, the edit provider inside it. */
function Shell({ children }: { children?: React.ReactNode }) {
  return (
    <DeleteTransactionProvider remove={remove}>
      <EditTransactionProvider update={update}>{children ?? <Trigger />}</EditTransactionProvider>
    </DeleteTransactionProvider>
  );
}

const editIt = () => screen.getByRole('button', { name: 'Edit it' });
const editDialog = () => screen.getByRole('dialog', { name: 'Edit transaction' });
const deleteAction = () => screen.getByRole('button', { name: 'Delete transaction' });

describe('the hook', () => {
  it('throws outside the provider rather than doing nothing', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Trigger />)).toThrow(/EditTransactionProvider/);

    error.mockRestore();
  });
});

describe('before the first open', () => {
  it('renders no modal at all', () => {
    // Not merely closed: a closed <dialog> is display:none so queryByRole cannot see inside it,
    // but queryAllByText and queryAllByLabelText can - which would make every text query on every
    // screen ambiguous. (app)/pages.test.tsx depends on this.
    render(<Shell />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Amount')).not.toBeInTheDocument();
    expect(screen.queryByText('Note (optional)')).not.toBeInTheDocument();
  });

  it('fetches nothing', () => {
    const fetchMock = respondWith(200);

    render(<Shell />);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('opening', () => {
  it('opens the modal prefilled from the row it was given', async () => {
    render(<Shell />);

    await userEvent.click(editIt());

    expect(editDialog()).toBeInTheDocument();
    expect(screen.getByLabelText('Merchant')).toHaveValue('Whole Foods');
    expect(screen.getByLabelText('Amount')).toHaveValue('24.00');
  });

  it('needs no read to prefill, because the row carries every field', async () => {
    // The reason `open` takes a whole transaction. The categories fetch is for the *picker's
    // options*, not for the values - so every field is right before it resolves.
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {})) as unknown as typeof fetch;
    render(<Shell />);

    await userEvent.click(editIt());

    expect(screen.getByLabelText('Note (optional)')).toHaveValue('Weekly groceries');
    expect(screen.getByLabelText('Category')).toBeDisabled();
  });

  it('mounts exactly one dialog however many triggers there are', async () => {
    // The correctness requirement behind the provider: the table draws one kebab per row, and a
    // modal each would be a hundred focus traps and a hundred copies of every field id.
    render(
      <Shell>
        <Trigger />
        <Trigger transaction={{ ...TRANSACTION, id: 'second', merchant: 'Uber' }} />
      </Shell>,
    );

    await userEvent.click(screen.getAllByRole('button', { name: 'Edit it' })[0]!);

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getAllByLabelText('Amount')).toHaveLength(1);
  });

  /** The second row, for the two re-seeding cases below. */
  const SECOND: Transaction = {
    ...TRANSACTION,
    id: 'second',
    merchant: 'Uber',
    amount: 18.5,
    note: null,
  };

  it('re-seeds the form when it is opened for a different row while already open', async () => {
    // The `key={transaction.id}` on the modal. Without it the form keeps the first row's values -
    // seeded once per mount, deliberately, so a refresh cannot overwrite what is being typed - and
    // then diffs them against the second row, which is a write to the wrong transaction rather than
    // a visual glitch. Not reachable through the UI while the dialog is modal; reachable by any
    // second entry point that calls `open()`, which is what PET-34's detail page will be.
    //
    // **Two separate clicks, and that is the whole design of this test.** The first version put both
    // `open()` calls in one handler, where React batches them and the modal mounts once with the
    // second row - so it passed with the `key` deleted, which is no test at all. jsdom has no top
    // layer, so a second trigger really is clickable here even though a browser would not allow it.
    render(
      <Shell>
        <Trigger />
        <Trigger transaction={SECOND} />
      </Shell>,
    );
    const triggers = screen.getAllByRole('button', { name: 'Edit it' });

    await userEvent.click(triggers[0]!);
    expect(screen.getByLabelText('Merchant')).toHaveValue('Whole Foods');

    await userEvent.click(triggers[1]!);

    expect(screen.getByLabelText('Merchant')).toHaveValue('Uber');
    expect(screen.getByLabelText('Amount')).toHaveValue('18.50');
    expect(screen.getByLabelText('Note (optional)')).toHaveValue('');
  });

  it('diffs a save against the row the fields are showing, not the one opened first', async () => {
    // The half that actually matters: the wrong-row write. The body must name the second row's id
    // and carry only what changed relative to *it*.
    render(
      <Shell>
        <Trigger />
        <Trigger transaction={SECOND} />
      </Shell>,
    );
    const triggers = screen.getAllByRole('button', { name: 'Edit it' });

    await userEvent.click(triggers[0]!);
    await userEvent.click(triggers[1]!);

    await userEvent.type(screen.getByLabelText('Merchant'), ' Eats');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledWith('second', { merchant: 'Uber Eats' });
  });

  it("shows the second trigger's row when the second one opens it", async () => {
    render(
      <Shell>
        <Trigger />
        <Trigger transaction={{ ...TRANSACTION, merchant: 'Uber', amount: 18.5 }} />
      </Shell>,
    );

    await userEvent.click(screen.getAllByRole('button', { name: 'Edit it' })[1]!);

    expect(screen.getByLabelText('Merchant')).toHaveValue('Uber');
    expect(screen.getByLabelText('Amount')).toHaveValue('18.50');
  });

  it('reads the categories from the frontend’s own endpoint, uncached', async () => {
    // The exact path, because it is a contract with app/api/categories/route.ts that nothing else
    // checks - lib/routes.ts deliberately does not declare it.
    const fetchMock = respondWith(200);
    render(<Shell />);

    await userEvent.click(editIt());

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/categories', { cache: 'no-store' }),
    );
  });

  it('fills the picker once the options arrive, with the stored one selected', async () => {
    render(<Shell />);

    await userEvent.click(editIt());

    await waitFor(() => expect(screen.getByLabelText('Category')).toBeEnabled());
    expect(screen.getByLabelText('Category')).toHaveValue(CATEGORIES[0]!.id);
  });

  it('re-reads on every open, so a category added elsewhere shows up', async () => {
    const fetchMock = respondWith(200);
    render(<Shell />);

    await userEvent.click(editIt());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(editIt());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});

describe('a failed read', () => {
  it.each([401, 503, 500])('explains itself on a %d', async (status) => {
    respondWith(status, null);
    render(<Shell />);

    await userEvent.click(editIt());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't load your categories. Please close this and try again.",
    );
  });

  it('starts clean on the next open rather than showing a stale failure', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;
    render(<Shell />);

    await userEvent.click(editIt());
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    respondWith(200);
    await userEvent.click(editIt());

    await waitFor(() => expect(screen.getByLabelText('Category')).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not write a late read into a modal that was closed and reopened', async () => {
    // The generation guard, through the second consumer. Without it a slow first read could
    // resolve after a second open and overwrite that one's options.
    let settleFirst: (value: unknown) => void = () => {};
    const fetchMock = jest
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (settleFirst = resolve)))
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ categories: [] }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<Shell />);
    await userEvent.click(editIt());
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(editIt());

    // The first read lands now, for a generation that is no longer current.
    settleFirst({ ok: true, status: 200, json: async () => ({ categories: CATEGORIES }) });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('option', { name: 'Groceries' })).not.toBeInTheDocument();
  });
});

describe('closing', () => {
  it('unmounts the modal so nothing of it is left in the tree', async () => {
    render(<Shell />);
    await userEvent.click(editIt());

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Amount')).not.toBeInTheDocument();
  });

  it('discards edits, so a reopen shows the stored row again', async () => {
    render(<Shell />);
    await userEvent.click(editIt());
    await userEvent.type(screen.getByLabelText('Merchant'), ' Market');

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(editIt());

    expect(screen.getByLabelText('Merchant')).toHaveValue('Whole Foods');
  });
});

describe('the delete confirmation opening over it (AC6)', () => {
  it('opens the confirmation for the row being edited', async () => {
    render(<Shell />);
    await userEvent.click(editIt());

    await userEvent.click(deleteAction());

    expect(screen.getByRole('dialog', { name: 'Delete this transaction?' })).toBeInTheDocument();
    expect(screen.getByText(/Whole Foods - \$24\.00/)).toBeInTheDocument();
  });

  it('quotes the stored values, not the edited ones', async () => {
    // The confirmation describes the row that will be removed, so a half-typed merchant in the
    // form behind it must not reach the sentence.
    render(<Shell />);
    await userEvent.click(editIt());
    await userEvent.clear(screen.getByLabelText('Merchant'));
    await userEvent.type(screen.getByLabelText('Merchant'), 'Trader Joe');

    await userEvent.click(deleteAction());

    expect(screen.getByText(/Whole Foods - \$24\.00/)).toBeInTheDocument();
    expect(screen.queryByText(/Trader Joe/)).not.toBeInTheDocument();
  });

  it('leaves the edit modal mounted behind it', async () => {
    render(<Shell />);
    await userEvent.click(editIt());

    await userEvent.click(deleteAction());

    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    expect(editDialog()).toBeInTheDocument();
  });

  it('returns to the form with the edits intact when the delete is cancelled', async () => {
    // The whole point of keeping it mounted: cancelling a delete must not also discard an edit.
    render(<Shell />);
    await userEvent.click(editIt());
    await userEvent.type(screen.getByLabelText('Merchant'), ' Market');
    await userEvent.click(deleteAction());

    // Scoped, because there are genuinely two "Cancel" buttons on screen once both dialogs are
    // mounted - which is this decision working rather than a problem. In a browser only the top
    // dialog is interactive; jsdom has no top layer, so the query has to say which one it means.
    const confirmation = screen.getByRole('dialog', { name: 'Delete this transaction?' });
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }));

    expect(
      screen.queryByRole('dialog', { name: 'Delete this transaction?' }),
    ).not.toBeInTheDocument();
    expect(editDialog()).toBeInTheDocument();
    expect(screen.getByLabelText('Merchant')).toHaveValue('Whole Foods Market');
    expect(remove).not.toHaveBeenCalled();
  });

  it('closes both dialogs when the delete succeeds', async () => {
    // The row is gone, so there is nothing left to edit. This is what `onDeleted` is for.
    render(<Shell />);
    await userEvent.click(editIt());
    await userEvent.click(deleteAction());

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(remove).toHaveBeenCalledWith(TRANSACTION.id);
    expect(screen.queryByLabelText('Amount')).not.toBeInTheDocument();
  });

  it('keeps the edit modal open when the delete fails', async () => {
    // Including a 404: its copy asks the user to close the dialog and see the current list, so
    // dismissing the form under it would be a dismissal caused by a failure.
    remove.mockResolvedValue({ ok: false, reason: 'missing' });
    render(<Shell />);
    await userEvent.click(editIt());
    await userEvent.click(deleteAction());

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(editDialog()).toBeInTheDocument();
  });

  it('saves nothing when the delete action is used', async () => {
    render(<Shell />);
    await userEvent.click(editIt());
    await userEvent.type(screen.getByLabelText('Merchant'), ' Market');

    await userEvent.click(deleteAction());

    expect(update).not.toHaveBeenCalled();
  });
});

describe('saving', () => {
  it('calls the injected action rather than the real one', async () => {
    // The Storybook escape hatch, and the reason it exists: without it a story would run a Server
    // Action in the browser and reach `cookies()` from `next/headers`.
    render(<Shell />);
    await userEvent.click(editIt());

    await userEvent.type(screen.getByLabelText('Merchant'), ' Market');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledWith(TRANSACTION.id, { merchant: 'Whole Foods Market' });
  });

  it('closes the modal on success', async () => {
    render(<Shell />);
    await userEvent.click(editIt());

    await userEvent.type(screen.getByLabelText('Merchant'), ' Market');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
