import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { Transaction } from '../../../../lib/transactions';

import { TransactionDetailActions } from './TransactionDetailActions';

// DET-2's two header buttons. Both providers are mocked rather than wrapped, the call
// `TransactionRowMenu.test.tsx` makes for the same reason: this suite is about what each
// button hands over, and a real provider would put a modal's five field labels into the tree
// and make text queries ambiguous.
//
// Relative specifiers throughout - `jest.mock('@/…')` fails with "Cannot find module" from
// anywhere, which is the alias trap `frontend/src/app/CLAUDE.md` records.

const openEdit = jest.fn();
const openDelete = jest.fn();
const replace = jest.fn();
const push = jest.fn();

jest.mock('../../EditTransactionProvider', () => ({
  useEditTransaction: () => ({ open: mockOpenEdit() }),
}));

jest.mock('../../DeleteTransactionProvider', () => ({
  useDeleteTransaction: () => ({ open: mockOpenDelete() }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace(), push: mockPush() }),
}));

function mockOpenEdit() {
  return openEdit;
}

function mockOpenDelete() {
  return openDelete;
}

function mockReplace() {
  return replace;
}

function mockPush() {
  return push;
}

const TRANSACTION: Transaction = {
  id: '0198c2a1-0000-7000-8000-000000000001',
  merchant: 'Whole Foods',
  categoryId: '0198c2a1-0000-7000-8000-0000000000a1',
  amount: 62.4,
  date: '2025-10-08',
  note: 'Weekly groceries run',
  createdAt: '2025-10-08T09:00:00.000Z',
  updatedAt: '2025-10-08T09:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

function renderActions(backHref = '/transactions') {
  return render(<TransactionDetailActions transaction={TRANSACTION} backHref={backHref} />);
}

describe('Edit', () => {
  it('opens the edit modal with the whole transaction', async () => {
    // The asymmetry with the confirmation is the point: the modal takes every field the form
    // draws, so prefilling costs no request. This closes PET-32's AC1.
    renderActions();

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(openEdit).toHaveBeenCalledWith(TRANSACTION);
  });

  it('navigates nowhere on its own', () => {
    renderActions();

    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});

describe('Delete', () => {
  it('opens the confirmation with the four fields it takes, and no more', async () => {
    // The confirmation stays narrow deliberately - it would otherwise be able to read a note
    // it has no business rendering.
    renderActions();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(openDelete).toHaveBeenCalledWith(
      {
        id: TRANSACTION.id,
        merchant: 'Whole Foods',
        amount: 62.4,
        date: '2025-10-08',
      },
      expect.objectContaining({ onDeleted: expect.any(Function) }),
    );
  });

  it('does not navigate until the delete actually succeeds', async () => {
    // `onDeleted` fires on success only. Navigating on the click would leave the list showing
    // a row the user only thought about deleting.
    renderActions();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(replace).not.toHaveBeenCalled();
  });

  it('replaces this page with the list once the delete succeeds', async () => {
    // PET-33's AC7 and A18. `replace` rather than `push`, so Back does not land on a detail
    // page for a transaction that no longer exists.
    renderActions();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    openDelete.mock.calls[0][1].onDeleted();

    expect(replace).toHaveBeenCalledWith('/transactions');
    expect(push).not.toHaveBeenCalled();
  });

  it('lands on the same filtered list the breadcrumb goes to', async () => {
    renderActions('/transactions?period=all&search=whole');

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    openDelete.mock.calls[0][1].onDeleted();

    expect(replace).toHaveBeenCalledWith('/transactions?period=all&search=whole');
  });
});
