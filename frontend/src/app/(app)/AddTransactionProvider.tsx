'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import type { CategoryOption } from '@/lib/categories';
import { createTransaction } from '@/lib/createTransaction';

import { AddTransactionModal } from './AddTransactionModal';

// The shell's single Add transaction modal, and the seam every entry point opens it through.
//
// **One instance for the whole shell, not one per trigger, and that is a correctness
// requirement rather than a tidiness one.** ADD-1 lists five entry points; three exist today
// and two of them are on the *same page*: `transactions/TransactionsScreen.tsx` has the header
// button and `transactions/TransactionsEmpty.tsx` has the empty card's. A component that owned
// its own modal would therefore mount two `<dialog>` elements on Transactions, with two focus
// traps, two backdrops, and two copies of every `ui/Field` id - which is a required literal
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

/** Where the fetch goes. `app/api/categories/route.ts` is the other half of this string. */
const CATEGORIES_PATH = '/api/categories';

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
  const [categories, setCategories] = useState<CategoryOption[] | null>(null);
  const [failed, setFailed] = useState(false);

  /**
   * Which open the in-flight request belongs to.
   *
   * Bumped on every open, and compared when the response lands, so a read that resolves after
   * the modal was closed - or after it was closed and opened again - cannot write stale options
   * into the current one. An `AbortController` would cancel the request instead; this is
   * simpler and covers the case that actually matters, which is the late *write* rather than
   * the wasted bytes.
   */
  const openCount = useRef(0);

  const openModal = useCallback(() => {
    // Opened immediately rather than after the fetch resolves. A button that does nothing for
    // a round trip reads as broken, and the modal has a designed state for absent options -
    // a disabled select - where it has none for "not open yet".
    openCount.current += 1;
    setCategories(null);
    setFailed(false);
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const generation = openCount.current;
    let live = true;

    async function read() {
      try {
        // `no-store` on the browser hop as well as the server one, so a second open in the same
        // session cannot render a list the account no longer has. Re-read on **every** open for
        // the same reason: a category created in another tab has to show up.
        const response = await fetch(CATEGORIES_PATH, { cache: 'no-store' });

        if (!response.ok) throw new Error(`Categories read failed: ${response.status}`);

        const body = (await response.json()) as { categories: CategoryOption[] };

        if (!live || generation !== openCount.current) return;
        setCategories(body.categories);
      } catch {
        // A 401, a 503, an unreachable server or a body that will not parse. The modal shows
        // one line for all of them, because the user's next move is the same either way: close
        // this and try again. The 401 case is the session dying with the modal open, which the
        // create action reports separately if they get as far as submitting.
        if (!live || generation !== openCount.current) return;
        setFailed(true);
      }
    }

    void read();

    return () => {
      live = false;
    };
  }, [open]);

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
