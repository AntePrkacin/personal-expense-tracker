'use client';

import { createContext, useCallback, useContext, useState } from 'react';

import { createTransaction } from '@/lib/createTransaction';

import { AddTransactionModal } from './AddTransactionModal';
import { useCategoryOptions } from './useCategoryOptions';

// The shell's single Add transaction modal, and the seam every entry point opens it through.
//
// **One instance for the whole shell, not one per trigger, and that is a correctness
// requirement rather than a tidiness one.** ADD-1 lists five entry points; three exist today
// and two of them are on the *same page*: `transactions/TransactionsScreen.tsx` has the header
// button and `transactions/TransactionsEmpty.tsx` has the empty card's. A component that owned
// its own modal would therefore mount two `<dialog>` elements on Transactions, with two focus
// traps, two backdrops, and two copies of every field id - which `ui/FieldShell` requires as a literal
// prop precisely because `useId` would force `'use client'` onto the field layer. Duplicate ids
// make `getByLabelText` ambiguous, which is the failure PET-30's own `pages.test.tsx` comment
// already names when it explains why that file mocks the populated state.
//
// The shape is `app/setup/layout.tsx`'s: a Server Component layout renders this client
// provider, so the layout and all four pages stay off the client bundle. Same rule as
// `SidebarNav` - push the boundary into the smallest wrapper.
//
// **The categories are fetched here, on open, through the frontend's own route handler.** Not
// in each `page.tsx`, which would pay for the request on every page load whether or not
// anybody opens the modal and make three otherwise-synchronous pages async; and not in the
// layout, which would add a second guarded read to the shell - the shape the `/dashboard` to
// `/login` redirect loop came out of. `app/api/categories/route.ts` explains its half.
//
// **PET-32 moved the read itself into `(app)/useCategoryOptions.ts` and left that decision
// here.** The edit modal needs the identical read, and the hook's own comment argues why a
// second copy of it was the wrong call. Nothing about the paragraph above changed: the read
// still happens on open, from a provider, through the route handler. What moved is the fetch,
// the path and the generation guard - and the `useEffect` they lived in is gone, because with
// `read()` called straight from the opener there is no longer any state for an effect to watch.

type AddTransaction = {
  /** Opens the modal. Every trigger in the shell calls this and nothing else. */
  open: () => void;
};

const AddTransactionContext = createContext<AddTransaction | null>(null);

/**
 * The opener, for any component inside the shell.
 *
 * **Throws outside the provider rather than returning a no-op**, which is `useSetupDraft`'s
 * call and the right one: a trigger that silently does nothing is a bug that ships, while a
 * throw is a bug that fails the first test to render the page without the provider.
 */
export function useAddTransaction(): AddTransaction {
  const value = useContext(AddTransactionContext);

  if (value === null) {
    throw new Error('useAddTransaction must be used inside AddTransactionProvider.');
  }

  return value;
}

export function AddTransactionProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { categories, failed, read } = useCategoryOptions();

  const openModal = useCallback(() => {
    // Opened immediately rather than after the fetch resolves. A button that does nothing for
    // a round trip reads as broken, and the modal has a designed state for absent options -
    // a disabled select - where it has none for "not open yet".
    read();
    setOpen(true);
  }, [read]);

  return (
    <AddTransactionContext.Provider value={{ open: openModal }}>
      {children}

      {/* Rendered only while open, and that is load-bearing rather than an optimisation. A
          closed `<dialog>` is `display: none`, so `queryByRole` cannot see inside it - but
          `queryAllByText` and `queryAllByLabelText` **can**, so an always-mounted modal would
          make every text and label query on every screen ambiguous forever. `(app)/pages.test.tsx`
          depends on this. */}
      {open ? (
        <AddTransactionModal
          categories={categories}
          categoriesFailed={failed}
          create={createTransaction}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </AddTransactionContext.Provider>
  );
}
