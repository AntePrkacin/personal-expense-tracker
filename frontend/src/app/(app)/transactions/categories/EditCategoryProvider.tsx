'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import type { Category } from '@/lib/categories';
import type { Palette } from '@/lib/palette';
import { updateCategory, type UpdateCategoryResult } from '@/lib/updateCategory';
import type { components } from '@/types/api';

import { useDeleteCategory } from './DeleteCategoryProvider';
import { EditCategoryModal, type EditCategoryFocus } from './EditCategoryModal';

// The Categories screen's single Edit modal, and the seam every entry point opens it through.
//
// **One instance for the screen, which is `DeleteCategoryProvider`'s shape rather than a new
// argument.** That file sets out in full why neither of the app's other two provider shapes fits
// this screen, and every clause of it transfers unchanged: a modal owned by each card sits **inside
// the card being edited**, so the success path's `router.refresh()` can unmount it out from under
// its own `close()`, and a modal on `(app)/layout.tsx` would put a category form on all four routes
// to serve one screen.
//
// What this feature adds is the evidence that file was reasoning ahead of. Its criterion for
// screen-scoped is "N triggers on one route", and PET-39 had one kind of trigger; this has **two** -
// a kebab on every non-fallback card, and a "Set limit" banner on every uncapped one - so a category
// with no cap draws two ways into the same modal. Neither is `AddCategoryButton`'s case, whose whole
// argument against a context is that one button on one route makes a consumer count of one.
//
// **It nests inside `DeleteCategoryProvider`, and the ordering is a requirement rather than a
// tidiness.** AC7's "Delete category" in the modal's footer opens that confirmation over this modal,
// which is a `useDeleteCategory().open(target, { onDeleted })` call - an option PET-39 shipped with
// no caller precisely because this ticket was one away with a concrete job for it. Two `<dialog>`
// elements open at once is a case `(app)/Modal.tsx` already handles, which is why its heading id is
// generated rather than constant.
//
// **It is a client component taking Server Component children.** `CategoriesScreen` renders it around
// the header and the grid, so the cards, the summary and the tabs all stay server-rendered.

/** What a trigger may say about how the modal should open. */
type EditCategoryOptions = {
  /**
   * Which field opens focused. Defaults to the name.
   *
   * The one thing the two trigger kinds disagree about, which is why it is an option rather than a
   * fact of the category: "Set limit" asks for the budget, the kebab's "Edit" asks for nothing in
   * particular. See `EditCategoryModal`'s `focus` for the argument.
   */
  focus?: EditCategoryFocus;
};

type EditCategory = {
  /**
   * Opens the Edit modal for one category. Every trigger calls this and nothing else.
   *
   * **It takes the whole category rather than an id**, which is the asymmetry `DeleteCategoryTarget`
   * already records from the other side: a confirmation has no business rendering a cap, a colour or
   * a note, and a prefilled form cannot do without them. Both triggers already have the whole row
   * rendered, so this costs no round trip and AC1's prefill is free.
   */
  open: (category: Category, options?: EditCategoryOptions) => void;
};

const EditCategoryContext = createContext<EditCategory | null>(null);

/**
 * The opener, for any component inside the Categories screen.
 *
 * **Throws outside the provider rather than returning a no-op**, the call every context in this app
 * makes: an Edit that silently does nothing is a bug that ships, where a throw is a bug that fails
 * the first test to render the screen without the provider.
 */
export function useEditCategory(): EditCategory {
  const value = useContext(EditCategoryContext);

  if (value === null) {
    throw new Error('useEditCategory must be used inside EditCategoryProvider.');
  }

  return value;
}

type EditCategoryProviderProps = {
  children: React.ReactNode;
  /**
   * The colours and icons the modal offers, or `null` if that read failed.
   *
   * Threaded from `transactions/categories/page.tsx` through `CategoriesScreen`, exactly as
   * `AddCategoryButton`'s is and for the same reasons: the read is server-side so the token never
   * leaves the server, it costs no extra latency inside a `Promise.all` the route already had, and
   * it buys away a route handler, a hook and a loading state. The price - one request per view of
   * the tab for a modal that usually does not open - is `docs/TODO.md`'s and is now shared by two
   * modals rather than paid twice.
   */
  palette: Palette | null;
  /**
   * The update action, defaulting to the real one. Overridden only by Storybook.
   *
   * **This exists because a story would otherwise be one click from running a Server Action in the
   * browser**, which is the gap a code review found on `DeleteTransactionProvider` and then again on
   * this screen's own delete seam: Storybook's Vite build has no notion of `'use server'`, so it
   * bundles `lib/updateCategory.ts` as an ordinary module and a press would call `cookies()` from
   * `next/headers` in the browser rather than making an RPC.
   *
   * It reaches here through `CategoriesScreen` rather than from a story directly, for the reason
   * that file records about `remove`: this screen constructs its own providers, so a seam the story
   * cannot reach is a seam that does nothing.
   *
   * Defaulted rather than required, so the app's one real call site stays a bare
   * `<CategoriesScreen ... />` with no action threaded through.
   */
  update?: (
    id: string,
    body: components['schemas']['UpdateCategoryDto'],
  ) => Promise<UpdateCategoryResult>;
};

export function EditCategoryProvider({
  children,
  palette,
  update = updateCategory,
}: EditCategoryProviderProps) {
  const { open: openDelete } = useDeleteCategory();

  /**
   * Which category is being edited and how the modal was asked to open, or `null` for "closed".
   *
   * One piece of state rather than a boolean beside a target, which is `DeleteCategoryProvider`'s
   * reason: the two cannot legally disagree, and it means the form cannot flash the previous card's
   * values on the way out.
   */
  const [request, setRequest] = useState<({ category: Category } & EditCategoryOptions) | null>(
    null,
  );

  const open = useCallback(
    (category: Category, options: EditCategoryOptions = {}) => setRequest({ category, ...options }),
    [],
  );

  /**
   * Memoized, for `DeleteCategoryProvider`'s reason rather than as a reflex.
   *
   * `open` is already stable, so a bare `value={{ open }}` would still allocate a fresh object on
   * every render and hand every consumer a changed context. `children` keeps its identity across
   * this provider's state changes - it is a server-rendered subtree passed straight through - so
   * React would otherwise skip it entirely; the object literal is the one thing that would drag
   * **every** `CategoryCardMenu` and every `SetLimitBanner` into a re-render on each open, cancel
   * and save, and the cost grows with the category count rather than being fixed.
   */
  const value = useMemo(() => ({ open }), [open]);

  return (
    <EditCategoryContext.Provider value={value}>
      {children}

      {/* Rendered only while open, and that is load-bearing rather than an optimisation, for the
          reason `AddTransactionProvider` gives: a closed `<dialog>` is `display: none`, so
          `queryByRole` cannot see inside it, but `queryAllByText` and `queryAllByLabelText` **can** -
          so an always-mounted modal would make every text and label query on this screen ambiguous
          forever. `(app)/pages.test.tsx` depends on it. */}
      {request !== null ? (
        <EditCategoryModal
          category={request.category}
          palette={palette}
          update={update}
          focus={request.focus}
          onDelete={() =>
            // **Three fields, not the whole category.** The confirmation quotes a name and a period
            // count and must not render a cap, a colour or a note - the asymmetry
            // `DeleteCategoryTarget` records. They come off the **stored** category rather than off
            // whatever is currently typed in the form, because the dialog describes the row about to
            // be removed rather than the edit in progress.
            openDelete(
              {
                id: request.category.id,
                name: request.category.name,
                transactionCount: request.category.transactionCount,
              },
              // **The caller PET-39 built `onDeleted` for.** A delete that really removed the
              // category has to take this modal down with it; a cancelled confirmation, or one that
              // failed, deliberately leaves the form exactly as it was, which is why this is not on
              // `onClose`.
              { onDeleted: () => setRequest(null) },
            )
          }
          onClose={() => setRequest(null)}
        />
      ) : null}
    </EditCategoryContext.Provider>
  );
}
