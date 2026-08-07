'use client';

import type { CategoryTemplate } from '@/lib/categoryTemplates';

import { useSetupDraft } from '../SetupDraftProvider';
import { CategoryChip } from './CategoryChip';

// The chips on screen 03 (node 43:719), and the only client component on this
// screen.
//
// It holds no state of its own: the draft *is* the state, read through
// `useSetupDraft()` and written on every toggle. That is what makes AC4 free -
// leaving for step 1 and coming back re-renders from sessionStorage, so there is no
// in-memory copy that could disagree with what step 3 will submit.
//
// Writing on toggle rather than on Continue also keeps this screen free of a form.
// There is nothing to submit and no validation to run: A4 enforces no minimum
// selection, so both exits just navigate, and SetupCategoriesScreen renders them as
// links from the server.
//
// **The list is a prop as of PET-64, not an import.** It used to read
// `STARTER_CATEGORIES` out of a module beside it; the chips are admin-managed data
// now, so `page.tsx` fetches them and threads them through the screen. Nothing about
// the toggling changed.
//
// The rows Figma draws - three, then three, then four - are `flex-wrap` doing its
// job inside the 600px card rather than a grid. The designed last row ends 7px short
// of the content box, so a browser whose text metrics run wider wraps differently.
// AC1 asks for the designed *order*, which wrapping preserves and a fixed grid would
// satisfy while breaking the copy. The API returns them in the admin's `sort_order`,
// and this renders them as given rather than sorting.
//
// No `role="group"` and no `aria-label` on the wrapper: the screen's h1 immediately
// above it says "Pick your categories", and a group label restating that is the
// noise `SetupShell`'s indicator comment already argues against.

type CategoryPickerProps = {
  categories: CategoryTemplate[];
};

export function CategoryPicker({ categories }: CategoryPickerProps) {
  const { draft, patchDraft } = useSetupDraft();
  const picked = new Set(draft.categories);

  function toggle(id: string) {
    // **The updater form, not a plain patch.** This computes the next selection
    // *from* the current one, so reading it off the render's own `draft` would make
    // correctness depend on a re-render landing between two toggles: batch two in
    // one tick and both would start from the same list, so the second would
    // overwrite the first instead of extending it. One click per event means a real
    // user never hits that, which is exactly what makes it worth removing rather
    // than relying on - layout.test.tsx pins the same-tick case.
    patchDraft((current) => {
      const next = new Set(current.categories);
      if (!next.delete(id)) next.add(id);

      // Rebuilt by filtering the **offered** list rather than by pushing onto the
      // stored array, so the order in storage is the admin's order whatever order
      // the chips were clicked in. That used to be the canonical constant's order;
      // it is the fetched list's now, which is the same property with a different
      // authority behind it. Note `parseDraft` can no longer agree with this - it
      // is React-free and has no list to filter - so it preserves the stored order
      // instead, and nothing depends on the two matching.
      return {
        categories: categories
          .filter((category) => next.has(category.id))
          .map((category) => category.id),
      };
    });
  }

  return (
    <div className="flex flex-wrap gap-2.5">
      {categories.map((category) => (
        <CategoryChip
          key={category.id}
          label={category.name}
          colour={category.color}
          selected={picked.has(category.id)}
          onToggle={() => toggle(category.id)}
        />
      ))}
    </div>
  );
}
