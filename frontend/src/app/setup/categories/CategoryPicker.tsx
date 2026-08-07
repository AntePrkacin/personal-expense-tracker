'use client';

import { useEffect } from 'react';

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

  // **This is where the membership filter `parseDraft` lost went.** That module
  // used to drop a stored value the picker could not have produced, and PET-64
  // took the guarantee away with the canonical constant: it is React-free and
  // fetches nothing, so it has no list to filter against and now only dedupes
  // and caps. This component is the one place that holds both halves - the
  // stored pick and the offered list - so the reconciliation belongs here.
  //
  // Without it a stored id that is no longer offered survives to step 3 and
  // `AuthService` answers 400, which `RegisterForm` renders as its generic
  // failure line. That failure is **self-perpetuating**: the draft is untouched
  // by a rejected submit, so every retry sends the same dead id, and the one
  // control that could clear it is a chip the screen no longer draws. The user
  // cannot get out of onboarding without emptying sessionStorage by hand.
  //
  // Three ways to arrive there, none exotic: an admin disables or deletes a
  // template between two visits to this step, a tab sits open across a deploy,
  // or the value was written from that tab's devtools console - the same threat
  // model `parseDraft`'s own totality is written against.
  //
  // An effect rather than a render-phase adjustment, because this writes to
  // sessionStorage and notifies a store: doing that during render is a side
  // effect in the render phase, which is a worse trade than one extra commit on
  // the visits that actually need it. It is guarded on "would this change
  // anything", so the ordinary visit writes nothing and re-renders once.
  // **An empty list is never reconciled against, and that exception is
  // load-bearing.** `readCategoryTemplates` degrades to `[]` rather than
  // throwing, so "no chips" means "the backend could not be read" every bit as
  // much as it means "an admin disabled everything" - the two are deliberately
  // indistinguishable there, because Continue is unconditional (A4) and an
  // error page is the worse trade. Reconciling against it would read a
  // momentary outage as proof that every chip the user picked is gone and
  // delete the lot. A stale id surviving costs a 400 the paragraph above
  // describes; this would cost a correct selection, silently, on the more
  // likely of the two.
  const offered = new Set(categories.map((category) => category.id));
  const stale = categories.length > 0 && draft.categories.some((id) => !offered.has(id));

  useEffect(() => {
    if (!stale) return;

    // Same rebuild as `toggle` below, so a reconciled draft and a toggled one
    // are canonical in exactly the same way: the admin's order, not the click
    // order.
    patchDraft((current) => ({
      categories: categories
        .filter((category) => current.categories.includes(category.id))
        .map((category) => category.id),
    }));
  }, [stale, categories, patchDraft]);

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
      //
      // **This filter is not the membership check** and must not be mistaken for
      // one: it drops a stale id as a side effect of rebuilding, so it fires only
      // if the user happens to touch a chip, and a user who lands here and clicks
      // straight through never reaches it. The mount reconciliation above is what
      // actually guarantees it, which is why deleting that in favour of "toggle
      // already filters" would restore the bug.
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
