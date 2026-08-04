import { SetupCategoriesScreen } from './SetupCategoriesScreen';

// /setup/categories - 03 Setup, Starter categories. Step 2 of 3 (PET-10).
//
// Nested under /setup rather than a sibling /setup-categories, which is what puts it
// inside app/setup/layout.tsx and so inside the draft provider. That nesting is the
// mechanism behind "Back keeps my values" (AC4), not a cosmetic choice about the URL.
//
// The screen lives in its own module so Storybook can render it; this file only
// answers the route. No `export const dynamic`, and not gated on a session, both for
// the reasons app/setup/page.tsx records.
export default function SetupCategoriesPage() {
  return <SetupCategoriesScreen />;
}
