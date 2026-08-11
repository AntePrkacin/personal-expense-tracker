'use client';

import { useState } from 'react';

import { Button, type ButtonVariant } from '@/components/ui/Button';
import { createCategory, type CreateCategoryResult } from '@/lib/createCategory';
import type { Palette } from '@/lib/palette';
import type { components } from '@/types/api';

import { AddCategoryModal } from './AddCategoryModal';

// The Categories tab's header action (CTG-1, CED-3), and as of PET-48 also the Manage categories
// modal's footer action - so "the only trigger this feature has", which this line said until then,
// is now two on two routes.
//
// **It replaces the inert `<button aria-disabled>` PET-36 shipped inside `CategoriesScreen`**, which
// that file's own note said PET-37 would swap for "a provider-backed trigger shaped like
// `AddTransactionButton`". It is the second half of that sentence and not the first.
//
// **There is no provider, and the difference from `AddTransactionButton` is the reason.** That
// component exists because ADD-1 lists five triggers across three routes and two of them sit on the
// same page - so a component owning its own modal would mount two `<dialog>` elements with two focus
// traps and two copies of every field id, which `ui/FieldShell` requires as literal props precisely
// because `useId` would force `'use client'` onto the field layer. "Add category" was one button on one route
// until PET-48 added the Manage categories modal's footer, and two triggers that never share a
// screen still want no context between them - each owns its own modal, and neither can observe the
// other's. A context with a single consumer expresses no choice, and `useAddCategory` would be a
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
  /**
   * The create action, defaulting to the real one. Overridden only by Storybook.
   *
   * **`docs/TODO.md` nominated PET-38 for this and the reason was that it would otherwise be the
   * third copy of one gap on one screen.** Storybook's Vite build has no notion of `'use server'`,
   * so it bundles `lib/createCategory.ts` as an ordinary module and pressing Save in
   * `Screens/13 Categories` reached `cookies()` from `next/headers` in the browser. The delete seam
   * was fixed at PET-39 after a code review, the edit seam ships with one, and this closes the set -
   * so the rule on this screen is now uniform rather than two-thirds true.
   *
   * Defaulted rather than required, so the app's one real call site stays a bare
   * `<AddCategoryButton palette={palette} />`.
   */
  create?: (body: components['schemas']['CreateCategoryDto']) => Promise<CreateCategoryResult>;
  /**
   * How the trigger is drawn, because it is no longer one button on one route.
   *
   * **PET-48's Manage categories modal is the second consumer**, and it needs `secondary`: the
   * source draws "Add category" against a primary "Done", and a screen - or a dialog - has one
   * emphasized action. The Categories tab's header keeps the default, so its call site is unchanged.
   *
   * A prop rather than a second component, because what would be duplicated is the pairing of this
   * trigger with the modal it owns, which is the whole of what this file is. Note this widens a
   * *feature* component for a second consumer, which is a different thing from widening a `ui/`
   * primitive for one - the move `frontend/src/components/CLAUDE.md` warns about.
   */
  variant?: ButtonVariant;
};

export function AddCategoryButton({
  palette,
  create = createCategory,
  variant = 'primary',
}: AddCategoryButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button label="Add category" variant={variant} onClick={() => setOpen(true)} />

      {/* Rendered only while open, and that is load-bearing rather than an optimisation. A closed
          `<dialog>` is `display: none`, so `queryByRole` cannot see inside it - but `queryAllByText`
          and `queryAllByLabelText` **can**, so an always-mounted modal would make every text and
          label query on this screen ambiguous forever. `(app)/pages.test.tsx` depends on this. */}
      {open ? (
        <AddCategoryModal palette={palette} create={create} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
