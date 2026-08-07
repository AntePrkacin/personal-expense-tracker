import { readCategoryTemplates } from '@/lib/categoryTemplates';

import { SetupCategoriesScreen } from './SetupCategoriesScreen';

// /setup/categories - 03 Setup, Starter categories. Step 2 of 3 (PET-10).
//
// Nested under /setup rather than a sibling /setup-categories, which is what puts it
// inside app/setup/layout.tsx and so inside the draft provider. That nesting is the
// mechanism behind "Back keeps my values" (AC4), not a cosmetic choice about the URL.
//
// **Async as of PET-64, and the split below is what that forces.** The chips used to
// come from a constant, so this file was a one-line wrapper and the screen imported the
// list itself. They are admin-managed data now, so the read happens here and the screen
// takes the result as a required prop - which is the shape `frontend/src/app/CLAUDE.md`
// already calls "the one the other three should copy", for a reason that binds harder
// here than style: **Storybook cannot render an async Server Component**, and the story
// harness builds each story from `render` or `meta.component` while never applying the
// meta's decorators. A screen that fetched for itself could not have a story at all.
//
// No `export const dynamic`, and not gated on a session, both for the reasons
// app/setup/page.tsx records. The read is unauthenticated on purpose: no account exists
// at step 2, which is why `GET /api/templates/categories` is `@Public()`.
export default async function SetupCategoriesPage() {
  const categories = await readCategoryTemplates();

  return <SetupCategoriesScreen categories={categories} />;
}
