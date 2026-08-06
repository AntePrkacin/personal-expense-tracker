'use client';

import { createContext, useCallback, useContext, useState } from 'react';

import { deleteTransaction, type DeleteTransactionResult } from '@/lib/deleteTransaction';

import { DeleteTransactionDialog, type DeleteTarget } from './DeleteTransactionDialog';

// The shell's single delete confirmation, and the seam every entry point opens it through.
//
// **One instance for the whole shell, and here the argument `AddTransactionProvider` makes gets
// sharper.** That one has five entry points, two of which happen to sit on the same page. This
// one has a trigger *per row*: a dialog owned by the row menu would mount one `<dialog>` per
// transaction, each with its own focus trap and its own copy of the heading id - a hundred of
// them on a full month. The provider is not a tidiness choice at that point.
//
// DEL-1 lists three entry points and only one exists. The row menu opens it today; PET-32's
// "Delete transaction" inside the edit modal and PET-34's "Delete" on the detail page each add
// a `useDeleteTransaction().open(...)` and nothing else.
//
// **The dialog takes its target as values rather than fetching one**, so there is no read here
// and nothing for this provider to do but hold which row is being asked about.
// `AddTransactionProvider`'s categories fetch has no counterpart.
//
// **PET-34's redirect is deliberately not built in.** AC7 wants deleting from the detail page to
// land back on the list, which looks like an `onDeleted` on `open()` - and a callback nothing
// passes is the shape PET-29 already shipped once and had to take back out, when
// `TransactionsTable` grew a `pending` prop no caller could reach. The ticket with the caller
// adds the parameter.
//
// **PET-32 is that ticket, and `onDeleted` arrived with it.** The edit modal opens this
// confirmation over itself, so a delete that succeeds has to take the modal down too - the row it
// was editing is gone. That is a caller rather than a forecast, which is the whole distinction the
// paragraph above draws. PET-34's redirect is still not built, and now needs no new parameter:
// its detail page passes an `onDeleted` that navigates.

type DeleteTransactionOptions = {
  /**
   * Called after a delete that really removed the row, and only then.
   *
   * The edit modal's use is to stop rendering itself. See `DeleteTransactionDialog`'s own note
   * for why the failure arms - including a 404 - deliberately do not call it.
   */
  onDeleted?: () => void;
};

type DeleteTransaction = {
  /**
   * Opens the confirmation for one transaction. Every trigger calls this and nothing else.
   *
   * The options argument is optional so the row menu's call site stays a bare `open(target)`.
   */
  open: (target: DeleteTarget, options?: DeleteTransactionOptions) => void;
};

const DeleteTransactionContext = createContext<DeleteTransaction | null>(null);

/**
 * The opener, for any component inside the shell.
 *
 * **Throws outside the provider rather than returning a no-op**, the call `useAddTransaction`
 * and `useFilterNavigation` both make: a Delete that silently does nothing is a bug that ships,
 * where a throw is a bug that fails the first test to render the page without the provider.
 */
export function useDeleteTransaction(): DeleteTransaction {
  const value = useContext(DeleteTransactionContext);

  if (value === null) {
    throw new Error('useDeleteTransaction must be used inside DeleteTransactionProvider.');
  }

  return value;
}

type DeleteTransactionProviderProps = {
  children: React.ReactNode;
  /**
   * The delete action, defaulting to the real one. Overridden only by Storybook.
   *
   * **This exists because a story was one click from running a Server Action in the browser.**
   * `Screens/06 Transactions — List` mounts this provider so its kebabs work, and its own text
   * invites a reviewer to open the confirmation and press Delete. Storybook's Vite build has no
   * notion of `'use server'`, so it bundles `lib/deleteTransaction.ts` as an ordinary module and
   * that press would call `cookies()` from `next/headers` in the browser rather than making an
   * RPC. The dialog already took its action as a prop for the same class of reason; the gap was
   * that the provider above it did not, so the delete-dialog stories were safe and the screen
   * story was not. A code review found it.
   *
   * Defaulted rather than required, so the app's three call sites - the layout today, PET-32 and
   * PET-34 later - stay a bare `<DeleteTransactionProvider>` with no action threaded through.
   */
  remove?: (id: string) => Promise<DeleteTransactionResult>;
};

export function DeleteTransactionProvider({
  children,
  remove = deleteTransaction,
}: DeleteTransactionProviderProps) {
  /**
   * Which transaction is being asked about and what to do after removing it, or `null` for "the
   * dialog is closed".
   *
   * One piece of state rather than a boolean beside a target, because the two cannot legally
   * disagree: there is no open dialog without a target and no target worth keeping once it
   * closes. It also means the copy cannot flash the previous row's merchant on the way out.
   *
   * PET-32's `onDeleted` joined the same object rather than becoming a second `useState` or a
   * ref, for that same reason: it belongs to the open it arrived with, so it has to be cleared by
   * the same assignment that clears the target.
   */
  const [request, setRequest] = useState<
    ({ target: DeleteTarget } & DeleteTransactionOptions) | null
  >(null);

  const open = useCallback(
    (target: DeleteTarget, options: DeleteTransactionOptions = {}) =>
      setRequest({ target, ...options }),
    [],
  );

  return (
    <DeleteTransactionContext.Provider value={{ open }}>
      {children}

      {/* Rendered only while open, and that is load-bearing rather than an optimisation, for
          the reason `AddTransactionProvider` gives: a closed `<dialog>` is `display: none`, so
          `queryByRole` cannot see inside it, but `queryAllByText` **can** - so an
          always-mounted dialog would put "Delete this transaction?" into every screen's tree
          forever. `(app)/pages.test.tsx` depends on it. */}
      {request !== null ? (
        <DeleteTransactionDialog
          target={request.target}
          remove={remove}
          onClose={() => setRequest(null)}
          onDeleted={request.onDeleted}
        />
      ) : null}
    </DeleteTransactionContext.Provider>
  );
}
