import { screen } from '@testing-library/react';

import { render } from './shellRender';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';

import { DeleteTransactionProvider, useDeleteTransaction } from './DeleteTransactionProvider';
import type { DeleteTarget } from './DeleteTransactionDialog';

jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));

// A relative specifier, because `jest.mock('@/lib/deleteTransaction')` fails with "Cannot find
// module" from anywhere - the alias trap `frontend/src/app/CLAUDE.md` records. The provider
// imports the real action rather than taking it as a prop (the dialog is the seam that takes
// props), so this one genuinely needs mocking or the assertions would reach a real fetch.
jest.mock('../../lib/deleteTransaction', () => ({ deleteTransaction: jest.fn() }));

const TARGET: DeleteTarget = {
  id: '0198c2a1-0000-7000-8000-0000000000b1',
  merchant: 'Whole Foods',
  amount: 62.4,
  date: '2025-10-08',
};

/** A trigger inside the provider, so opening is a real interaction rather than a mount. */
function Trigger({
  target = TARGET,
  onDeleted,
}: {
  target?: DeleteTarget;
  onDeleted?: () => void;
}) {
  const { open } = useDeleteTransaction();

  return (
    <button
      type="button"
      onClick={() => open(target, onDeleted === undefined ? undefined : { onDeleted })}
    >
      Open it
    </button>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({ refresh: jest.fn() });
});

describe('what it renders', () => {
  it('renders nothing of the dialog until a trigger opens it', async () => {
    // The property `(app)/pages.test.tsx` leans on, and the reason has to be text rather than
    // roles: a closed <dialog> is display:none so queryByRole cannot see inside it, but
    // queryAllByText can - so "not rendered" is the requirement, not "closed".
    render(
      <DeleteTransactionProvider>
        <Trigger />
      </DeleteTransactionProvider>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete this transaction?')).not.toBeInTheDocument();
  });

  it('opens the dialog for the target it was given', async () => {
    render(
      <DeleteTransactionProvider>
        <Trigger />
      </DeleteTransactionProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));

    expect(screen.getByRole('dialog', { name: 'Delete this transaction?' })).toBeInTheDocument();
    expect(screen.getByText(/Whole Foods - \$62\.40/)).toBeInTheDocument();
  });

  it('stops rendering the dialog once it closes', async () => {
    render(
      <DeleteTransactionProvider>
        <Trigger />
      </DeleteTransactionProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete this transaction?')).not.toBeInTheDocument();
  });

  it('mounts exactly one dialog however many triggers there are', async () => {
    // The whole reason this is a provider on the layout rather than state in the row menu: a
    // full table draws one kebab per row, and a dialog each would be a hundred <dialog>
    // elements with a hundred focus traps.
    render(
      <DeleteTransactionProvider>
        <Trigger />
        <Trigger target={{ ...TARGET, id: 'second', merchant: 'Uber' }} />
      </DeleteTransactionProvider>,
    );

    await userEvent.click(screen.getAllByRole('button', { name: 'Open it' })[0]!);

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it("shows the second trigger's target when the second one opens it", async () => {
    render(
      <DeleteTransactionProvider>
        <Trigger />
        <Trigger target={{ ...TARGET, merchant: 'Uber', amount: 18.5 }} />
      </DeleteTransactionProvider>,
    );

    await userEvent.click(screen.getAllByRole('button', { name: 'Open it' })[1]!);

    expect(screen.getByText(/Uber - \$18\.50/)).toBeInTheDocument();
  });
});

describe('the open options', () => {
  // PET-32's `onDeleted`, threaded from the call site through to the dialog. The dialog's own
  // suite pins when it fires; these pin that it arrives at all, and that it belongs to the open it
  // came with.

  it('passes onDeleted through to the dialog', async () => {
    const onDeleted = jest.fn();
    const remove = jest.fn().mockResolvedValue({ ok: true });
    render(
      <DeleteTransactionProvider remove={remove}>
        <Trigger onDeleted={onDeleted} />
      </DeleteTransactionProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it('forgets it when the dialog closes, so the next open starts clean', async () => {
    // The reason it lives in the same state object as the target rather than in a ref: an
    // `onDeleted` left behind by a cancelled open would fire for somebody else's delete.
    const onDeleted = jest.fn();
    const remove = jest.fn().mockResolvedValue({ ok: true });
    render(
      <DeleteTransactionProvider remove={remove}>
        <Trigger onDeleted={onDeleted} />
        <Trigger target={{ ...TARGET, merchant: 'Uber' }} />
      </DeleteTransactionProvider>,
    );
    const triggers = screen.getAllByRole('button', { name: 'Open it' });

    await userEvent.click(triggers[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(triggers[1]!);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('stays optional, so the row menu opens it with a target alone', async () => {
    const remove = jest.fn().mockResolvedValue({ ok: true });
    render(
      <DeleteTransactionProvider remove={remove}>
        <Trigger />
      </DeleteTransactionProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(remove).toHaveBeenCalledWith(TARGET.id);
  });
});

describe('useDeleteTransaction', () => {
  it('throws outside the provider rather than returning a no-op', () => {
    // The call `useAddTransaction` and `useFilterNavigation` both make: a Delete that silently
    // does nothing is a bug that ships, where a throw fails the first test to render a page
    // without the provider.
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Trigger />)).toThrow(
      'useDeleteTransaction must be used inside DeleteTransactionProvider.',
    );

    error.mockRestore();
  });
});
