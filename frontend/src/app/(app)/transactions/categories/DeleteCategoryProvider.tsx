'use client';

import { createContext, useCallback, useContext, useState } from 'react';

import { deleteCategory, type DeleteCategoryResult } from '@/lib/deleteCategory';

import { DeleteCategoryDialog, type DeleteCategoryTarget } from './DeleteCategoryDialog';

// The Categories screen's single delete confirmation, and the seam every entry point opens it
// through.
//
// **One instance for the screen, which is neither of the two shapes this app already has.** Both
// were available and both are wrong here, so the reasoning is worth keeping rather than reaching
// for whichever precedent is nearest.
//
// **Not one per card**, which is `AddCategoryButton`'s shape. That component owns its own modal
// because one trigger on one route makes a context with a single consumer, and the objection it
// raises against a provider is real. What it does not have is this one's problem: a dialog owned by
// the card menu sits **inside the card being deleted**, so the success path's `router.refresh()`
// can unmount the dialog out from under its own `close()`. That is the same class of defect as
// `Modal`'s focus restore, which `frontend/src/app/CLAUDE.md` states as a rule - a platform
// guarantee that fires during an event React unmounts inside is not a guarantee - and it would also
// mount one `<dialog>` per card the moment anything rendered them unconditionally.
//
// **Not one on the shell**, which is `DeleteTransactionProvider`'s shape. That one is mounted on
// `(app)/layout.tsx` because DEL-1 lists three entry points across three route segments, and
// `AddTransactionProvider`'s own criterion is five triggers across three routes. Every entry point
// this dialog has - the card kebab now, PET-38's "Delete category" later - is on
// `/transactions/categories`, so mounting it on the layout would put a category dialog on the
// Dashboard, AI Insights and Settings to serve one screen.
//
// So it wraps the screen: one `<dialog>` for N cards, it outlives the card that opened it, and
// PET-38 adds its entry point as a `useDeleteCategory().open(...)` and nothing else.
//
// **It is a client component taking Server Component children.** `CategoriesScreen` renders it
// around the grid, so the cards, the summary and the tabs all stay server-rendered - the ordinary
// arrangement, and the reason the boundary lands here rather than on the screen itself.

type DeleteCategoryOptions = {
  /**
   * Called after a delete that really removed the category, and only then.
   *
   * **No caller today, and PET-33 would have left it out for exactly that reason.** That ticket
   * refused an `onDeleted` on the transaction confirmation because a callback nothing passes is
   * the shape `TransactionsTable`'s unreachable `pending` prop already took. The difference here
   * is that the caller is one ticket away and its job is concrete: PET-38's edit modal opens this
   * confirmation over itself, so a successful delete has to take that modal down too. It costs one
   * optional property to say so now and nothing to leave unused.
   *
   * See `DeleteCategoryDialog`'s own note for why the failure arms - including a 404 - deliberately
   * do not call it.
   */
  onDeleted?: () => void;
};

type DeleteCategory = {
  /**
   * Opens the confirmation for one category. Every trigger calls this and nothing else.
   *
   * The options argument is optional so the card menu's call site stays a bare `open(target)`.
   */
  open: (target: DeleteCategoryTarget, options?: DeleteCategoryOptions) => void;
};

const DeleteCategoryContext = createContext<DeleteCategory | null>(null);

/**
 * The opener, for any component inside the Categories screen.
 *
 * **Throws outside the provider rather than returning a no-op**, the call `useAddTransaction`,
 * `useDeleteTransaction` and `useFilterNavigation` all make: a Delete that silently does nothing is
 * a bug that ships, where a throw is a bug that fails the first test to render the screen without
 * the provider.
 */
export function useDeleteCategory(): DeleteCategory {
  const value = useContext(DeleteCategoryContext);

  if (value === null) {
    throw new Error('useDeleteCategory must be used inside DeleteCategoryProvider.');
  }

  return value;
}

type DeleteCategoryProviderProps = {
  children: React.ReactNode;
  /**
   * The name of the category deletions reassign to, resolved once for the screen.
   *
   * **This is the ticket's "Other" amendment, and it lives here so it is resolved once rather than
   * N times.** The reassignment target is the account's own `isFallback` row, which the list
   * response already carries; `CategoriesScreen` finds it and passes it down, so no card scans the
   * list and no string in the frontend claims to know the backend's name for that row.
   */
  fallbackName: string;
  /**
   * The delete action, defaulting to the real one. Overridden only by Storybook.
   *
   * **This exists because a story would otherwise be one click from running a Server Action in the
   * browser**, which is the gap a code review found on `DeleteTransactionProvider`: Storybook's
   * Vite build has no notion of `'use server'`, so it bundles `lib/deleteCategory.ts` as an
   * ordinary module and a press would call `cookies()` from `next/headers` in the browser rather
   * than making an RPC. `Screens/13 Categories` mounts this provider so its kebabs work.
   *
   * Defaulted rather than required, so the app's one real call site stays a bare
   * `<DeleteCategoryProvider fallbackName={...}>` with no action threaded through.
   */
  remove?: (id: string) => Promise<DeleteCategoryResult>;
};

export function DeleteCategoryProvider({
  children,
  fallbackName,
  remove = deleteCategory,
}: DeleteCategoryProviderProps) {
  /**
   * Which category is being asked about and what to do after removing it, or `null` for "the
   * dialog is closed".
   *
   * One piece of state rather than a boolean beside a target, because the two cannot legally
   * disagree: there is no open dialog without a target and no target worth keeping once it closes.
   * It also means the copy cannot flash the previous card's name on the way out, and a cancelled
   * open cannot leave an `onDeleted` behind to fire for somebody else's delete.
   */
  const [request, setRequest] = useState<
    ({ target: DeleteCategoryTarget } & DeleteCategoryOptions) | null
  >(null);

  const open = useCallback(
    (target: DeleteCategoryTarget, options: DeleteCategoryOptions = {}) =>
      setRequest({ target, ...options }),
    [],
  );

  return (
    <DeleteCategoryContext.Provider value={{ open }}>
      {children}

      {/* Rendered only while open, and that is load-bearing rather than an optimisation, for the
          reason `AddTransactionProvider` gives: a closed `<dialog>` is `display: none`, so
          `queryByRole` cannot see inside it, but `queryAllByText` **can** - so an always-mounted
          dialog would put "Delete this category?" into this screen's tree forever.
          `(app)/pages.test.tsx` depends on it. */}
      {request !== null ? (
        <DeleteCategoryDialog
          target={request.target}
          fallbackName={fallbackName}
          remove={remove}
          onClose={() => setRequest(null)}
          onDeleted={request.onDeleted}
        />
      ) : null}
    </DeleteCategoryContext.Provider>
  );
}
