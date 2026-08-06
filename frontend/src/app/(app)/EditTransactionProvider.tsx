'use client';

import { createContext, useCallback, useContext, useState } from 'react';

import type { Transaction } from '@/lib/transactions';
import { updateTransaction, type UpdateTransactionResult } from '@/lib/updateTransaction';
import type { components } from '@/types/api';

import { useDeleteTransaction } from './DeleteTransactionProvider';
import { EditTransactionModal } from './EditTransactionModal';
import { useCategoryOptions } from './useCategoryOptions';

// The shell's single Edit transaction modal, and the seam every entry point opens it through.
//
// **One instance for the whole shell**, and the argument is `DeleteTransactionProvider`'s rather
// than `AddTransactionProvider`'s, because this trigger is also *per row*: a modal owned by the
// row menu would mount one `<dialog>` per transaction, each with its own focus trap and its own
// copy of all five field ids - and duplicate ids are what make `getByLabelText` ambiguous.
//
// MNU-2 and DET-2 list two entry points and one exists. The row menu opens it today; PET-34's
// "Edit" on the detail page adds a `useEditTransaction().open(transaction)` and nothing else.
//
// **It sits inside `DeleteTransactionProvider` on the layout, because it consumes that context.**
// The nesting was already there before anything needed it - `(app)/layout.tsx` predicted this
// pairing - and the ordering is now load-bearing rather than incidental.

type EditTransaction = {
  /**
   * Opens the modal for one transaction, prefilled from it.
   *
   * **The whole row rather than an id, which is what makes this need no read.**
   * `TransactionResponseDto` carries every field the form draws, `note` and `categoryId`
   * included, so a caller that rendered the row already holds everything AC1 asks for. This is
   * deliberately a wider payload than `useDeleteTransaction().open`, which takes four fields
   * because a confirmation quoting a note would be reading something it has no business
   * rendering.
   */
  open: (transaction: Transaction) => void;
};

const EditTransactionContext = createContext<EditTransaction | null>(null);

/**
 * The opener, for any component inside the shell.
 *
 * **Throws outside the provider rather than returning a no-op**, the call `useAddTransaction`,
 * `useDeleteTransaction` and `useFilterNavigation` all make: an Edit that silently does nothing is
 * a bug that ships, where a throw is a bug that fails the first test to render the page without
 * the provider.
 */
export function useEditTransaction(): EditTransaction {
  const value = useContext(EditTransactionContext);

  if (value === null) {
    throw new Error('useEditTransaction must be used inside EditTransactionProvider.');
  }

  return value;
}

type EditTransactionProviderProps = {
  children: React.ReactNode;
  /**
   * The update action, defaulting to the real one. Overridden only by Storybook.
   *
   * **The same escape hatch `DeleteTransactionProvider.remove` has, and for the same reason a code
   * review found there.** `Screens/06 Transactions — List` mounts this provider so its kebabs
   * work, and Storybook's Vite build has no notion of `'use server'` - so it bundles
   * `lib/updateTransaction.ts` as an ordinary module, and pressing Save changes in a story would
   * call `cookies()` from `next/headers` in the browser rather than making an RPC. The modal
   * already takes its action as a prop; without this the provider above it would not.
   *
   * Defaulted rather than required, so the app's call sites stay a bare
   * `<EditTransactionProvider>`.
   */
  update?: (
    id: string,
    body: components['schemas']['UpdateTransactionDto'],
  ) => Promise<UpdateTransactionResult>;
};

export function EditTransactionProvider({
  children,
  update = updateTransaction,
}: EditTransactionProviderProps) {
  /**
   * Which transaction is being edited, or `null` for "the modal is closed".
   *
   * One piece of state rather than a boolean beside a row, which is `DeleteTransactionProvider`'s
   * shape and its reasoning: the two cannot legally disagree, and it means the fields cannot flash
   * the previous row's values on the way out.
   */
  const [transaction, setTransaction] = useState<Transaction | null>(null);

  const { categories, failed, read } = useCategoryOptions();
  const { open: openDeleteConfirmation } = useDeleteTransaction();

  const open = useCallback(
    (next: Transaction) => {
      // Opened immediately rather than after the fetch resolves, which is
      // `AddTransactionProvider`'s call: a menu item that does nothing for a round trip reads as
      // broken, and the modal has a designed state for absent options - a disabled select - where
      // it has none for "not open yet". Every other field is prefilled from `next` and needs
      // nothing from the network at all.
      read();
      setTransaction(next);
    },
    [read],
  );

  return (
    <EditTransactionContext.Provider value={{ open }}>
      {children}

      {/* Rendered only while open, and that is load-bearing rather than an optimisation, for the
          reason both other providers give: a closed `<dialog>` is `display: none`, so
          `queryByRole` cannot see inside it, but `queryAllByLabelText` **can** - so an
          always-mounted modal would put five labels and a combobox into every screen's tree
          forever. `(app)/pages.test.tsx` depends on it. */}
      {transaction !== null ? (
        <EditTransactionModal
          // **`key` is a correctness requirement, not a reconciliation hint.** The modal seeds its
          // form state from `transaction` once per mount, deliberately, so a `router.refresh()`
          // cannot overwrite what the user is halfway through typing. The cost is that swapping
          // `transaction` while it stays mounted would leave row A's values in the fields and diff
          // them against row B - a write to the wrong row, silent rather than visible. Keying on the
          // id makes that a remount instead.
          //
          // Unreachable today, because the open dialog is modal and no other kebab can be clicked.
          // It is here for the entry point this file advertises as costing PET-34 two lines: a
          // detail page calling `open()` for a different row is exactly the caller that reaches it,
          // and one word now is cheaper than the bug report then.
          key={transaction.id}
          transaction={transaction}
          categories={categories}
          categoriesFailed={failed}
          update={update}
          onClose={() => setTransaction(null)}
          onDelete={() =>
            // **The confirmation opens over this modal, which stays mounted behind it** (AC6), so
            // Cancel returns the user to their form with their edits intact. `Modal` generates its
            // heading id with `useId()` for exactly this case, and the top layer stacks the two in
            // the order they opened with no z-index chosen anywhere.
            //
            // **It quotes the stored values, not the edited ones.** `transaction` is what the row
            // is, where the fields are what it might become - and the sentence describes what
            // pressing Delete removes. Quoting a half-typed merchant would misdescribe it.
            openDeleteConfirmation(
              {
                id: transaction.id,
                merchant: transaction.merchant,
                amount: transaction.amount,
                date: transaction.date,
              },
              // The row is gone, so there is nothing left to edit. Unmounting rather than closing
              // through the dialog is correct here and only here: the confirmation has already
              // restored focus to this modal's own Delete button by the time this runs, which is
              // the ordering `DeleteTransactionDialog` pins.
              { onDeleted: () => setTransaction(null) },
            )
          }
        />
      ) : null}
    </EditTransactionContext.Provider>
  );
}
