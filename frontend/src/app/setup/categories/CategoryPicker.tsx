'use client';

import { STARTER_CATEGORIES, type StarterCategoryName } from '../starterCategories';
import { useSetupDraft } from '../SetupDraftProvider';
import { CategoryChip } from './CategoryChip';

// The ten chips on screen 03 (node 43:719), and the only client component on this
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
// The rows Figma draws - three, then three, then four - are `flex-wrap` doing its
// job inside the 600px card rather than a grid. The designed last row ends 7px short
// of the content box, so a browser whose text metrics run wider wraps differently.
// AC1 asks for the designed *order*, which wrapping preserves and a fixed grid would
// satisfy while breaking the copy.
//
// No `role="group"` and no `aria-label` on the wrapper: the screen's h1 immediately
// above it says "Pick your categories", and a group label restating that is the
// noise `SetupShell`'s indicator comment already argues against.

export function CategoryPicker() {
  const { draft, patchDraft } = useSetupDraft();
  const picked = new Set<StarterCategoryName>(draft.categories);

  function toggle(name: StarterCategoryName) {
    // **The updater form, not a plain patch.** This computes the next selection
    // *from* the current one, so reading it off the render's own `draft` would make
    // correctness depend on a re-render landing between two toggles: batch two in
    // one tick and both would start from the same list, so the second would
    // overwrite the first instead of extending it. One click per event means a real
    // user never hits that, which is exactly what makes it worth removing rather
    // than relying on - layout.test.tsx pins the same-tick case.
    patchDraft((current) => {
      const next = new Set<StarterCategoryName>(current.categories);
      if (!next.delete(name)) next.add(name);

      // Rebuilt by filtering the canonical list rather than by pushing onto the
      // stored array, so the order in storage is the designed one whatever order
      // the chips were clicked in. Two identical selections then serialize to
      // identical strings, and this agrees with what `parseDraft` hands back.
      return {
        categories: STARTER_CATEGORIES.filter((category) => next.has(category.name)).map(
          (category) => category.name,
        ),
      };
    });
  }

  return (
    <div className="flex flex-wrap gap-2.5">
      {STARTER_CATEGORIES.map(({ name, colour }) => (
        <CategoryChip
          key={name}
          label={name}
          colour={colour}
          selected={picked.has(name)}
          onToggle={() => toggle(name)}
        />
      ))}
    </div>
  );
}
