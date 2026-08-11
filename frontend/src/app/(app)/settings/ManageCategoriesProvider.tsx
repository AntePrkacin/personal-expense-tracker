'use client';

import { createContext, use, useMemo, useState } from 'react';

import type { Allocation, Category } from '@/lib/categories';
import type { CreateCategoryResult } from '@/lib/createCategory';
import type { Palette } from '@/lib/palette';
import type { components } from '@/types/api';

import { ManageCategoriesModal } from './ManageCategoriesModal';

// Holds the Manage categories modal for the Settings screen, and is the seam its "Manage" button
// opens through.
//
// **This is a provider for a reason no other modal in this app has, and it is not the usual one.**
// `AddCategoryButton`'s criterion - one trigger on one route owns its own state, a context with a
// single consumer expresses no choice - would say to put the state in `CategoriesSummaryCard` and be
// done. It cannot be there, and the reason is the DOM rather than the design:
//
// **the card sits inside `SettingsForm`'s `<form>`, and the modals this one opens have forms of
// their own.** `AddCategoryModal` and `EditCategoryModal` both pass `onSubmit`, which is what makes
// `Modal` wrap their bodies in a real `<form>`. A `<dialog>` does not break form association, so a
// modal rendered from inside the card would nest a `<form>` inside the page's `<form>` - invalid
// HTML, which React will happily build via `appendChild` even though a parser would not, leaving
// submit ownership and validation resting on something the spec does not define.
//
// So the state is lifted above the boundary: this provider wraps the header and `<main>` both, the
// modal renders as a **sibling** of the form rather than a descendant of it, and the trigger reaches
// it through `useManageCategories()`. That is `transactions/FilterNavigation.tsx`'s shape, arrived at
// from a different direction - there a control above the boundary needed state below it, and here a
// control inside a form needs a dialog outside it.
//
// **It must be mounted inside `DeleteCategoryProvider` and `EditCategoryProvider`, in that order**,
// because the modal calls both hooks and the edit modal's own footer calls `useDeleteCategory()`.
// Reversed, it throws while rendering Settings rather than on the first click - the requirement
// `(app)/layout.tsx` already records for the transaction pair and `CategoriesScreen` for this one.
//
// **`useManageCategories()` throws outside the provider** rather than returning a no-op, the call
// `AddTransactionProvider` and `useFilterNavigation` both make: a control that quietly stops opening
// is a bug that looks like a slow render.

type ManageCategories = {
  /** Opens the modal. The trigger calls this and nothing else. */
  open: () => void;
};

const ManageCategoriesContext = createContext<ManageCategories | null>(null);

export function useManageCategories(): ManageCategories {
  const value = use(ManageCategoriesContext);

  if (value === null) {
    throw new Error('useManageCategories must be used inside ManageCategoriesProvider');
  }

  return value;
}

type ManageCategoriesProviderProps = {
  /**
   * The account's categories and their allocation, threaded from `settings/page.tsx`.
   *
   * **Passed whole and re-read on every render, which is the modal's own resync rule reaching one
   * level up.** A delete lands, `router.refresh()` re-runs the route, new props arrive here and the
   * open modal drops the dead row. Holding these in state on open - `AllocateBudgetModal`'s call -
   * would freeze the list against the writes its own buttons perform.
   */
  categories: Category[];
  allocation: Allocation;
  /** For both sub-modals' pickers. `null` is a failed read, which they already model as disabled. */
  palette: Palette | null;
  /** The create action, injected so a story can press "Add category" without reaching `cookies()`. */
  create?: (body: components['schemas']['CreateCategoryDto']) => Promise<CreateCategoryResult>;
  children: React.ReactNode;
};

export function ManageCategoriesProvider({
  categories,
  allocation,
  palette,
  create,
  children,
}: ManageCategoriesProviderProps) {
  const [open, setOpen] = useState(false);

  const value = useMemo(() => ({ open: () => setOpen(true) }), []);

  return (
    <ManageCategoriesContext value={value}>
      {children}

      {/* **Rendered only while open, which is load-bearing rather than an optimisation.** A closed
          `<dialog>` is `display: none` so `queryByRole` cannot see inside it, but `queryAllByText`
          and `queryAllByLabelText` **can** - so an always-mounted modal would put a row per category
          into the Settings tree forever and make every text query on that screen ambiguous.
          `(app)/pages.test.tsx` depends on this, and `AllocateBanner` records the same rule. */}
      {open ? (
        <ManageCategoriesModal
          categories={categories}
          allocation={allocation}
          palette={palette}
          create={create}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </ManageCategoriesContext>
  );
}
