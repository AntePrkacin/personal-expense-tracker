'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { createCategory } from '@/lib/createCategory';
import type { Palette } from '@/lib/palette';

import { AddCategoryModal } from './AddCategoryModal';

// The Categories tab's header action (CTG-1, CED-3), and the only trigger this feature has.
//
// **It replaces the inert `<button aria-disabled>` PET-36 shipped inside `CategoriesScreen`**, which
// that file's own note said PET-37 would swap for "a provider-backed trigger shaped like
// `AddTransactionButton`". It is the second half of that sentence and not the first.
//
// **There is no provider, and the difference from `AddTransactionButton` is the reason.** That
// component exists because ADD-1 lists five triggers across three routes and two of them sit on the
// same page - so a component owning its own modal would mount two `<dialog>` elements with two focus
// traps and two copies of every field id, which `ui/FieldShell` requires as literal props precisely
// because `useId` would force `'use client'` onto the field layer. "Add category" is one button on
// one route. A context with a single consumer expresses no choice, and `useAddCategory` would be a
// seam nothing else could ever enter through. PET-38's Edit modal does not change that: it opens
// from a card kebab, per-card, which is a different trigger with different state rather than a second
// entry point into this one.
//
// **It is still a client component for `AddTransactionButton`'s reason**, which does transfer:
// `CategoriesScreen` is a Server Component and cannot pass a function to `ui/Button`, so without this
// wrapper the whole screen would cross into the client bundle to make one button work.

type AddCategoryButtonProps = {
  /**
   * The colours and icons to offer, read server-side by the route.
   *
   * Passed through untouched rather than fetched here, which is the decision the plan records:
   * `transactions/categories/page.tsx` already awaits two reads in parallel, so a third costs no
   * latency, and it saves the route handler, the hook and the three loading states
   * `AddTransactionProvider` needs for a modal that can open from anywhere.
   */
  palette: Palette | null;
};

export function AddCategoryButton({ palette }: AddCategoryButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button label="Add category" onClick={() => setOpen(true)} />

      {/* Rendered only while open, and that is load-bearing rather than an optimisation. A closed
          `<dialog>` is `display: none`, so `queryByRole` cannot see inside it - but `queryAllByText`
          and `queryAllByLabelText` **can**, so an always-mounted modal would make every text and
          label query on this screen ambiguous forever. `(app)/pages.test.tsx` depends on this. */}
      {open ? (
        <AddCategoryModal
          palette={palette}
          create={createCategory}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
