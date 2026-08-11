import type { Allocation, Category } from '@/lib/categories';
import type { createCategory, CreateCategoryResult } from '@/lib/createCategory';
import type { deleteCategory, DeleteCategoryResult } from '@/lib/deleteCategory';
import type { Palette } from '@/lib/palette';
import type { Period } from '@/lib/periods';
import type { Profile } from '@/lib/profile';
import type { ThemePref } from '@/lib/theme';
import type { updateCategory, UpdateCategoryResult } from '@/lib/updateCategory';
import type { updateProfile, UpdateProfileResult } from '@/lib/updateProfile';

import { PageHeader } from '../PageHeader';
import { DeleteCategoryProvider } from '../transactions/categories/DeleteCategoryProvider';
import { EditCategoryProvider } from '../transactions/categories/EditCategoryProvider';

import type { CategoriesSummary } from './categoriesSummary';
import { ManageCategoriesProvider } from './ManageCategoriesProvider';
import { SettingsForm } from './SettingsForm';

// 17 Settings (frame `40:630`), the fourth and last routed view to get content under its header.
//
// **Synchronous, and a separate file from `page.tsx`, which is a requirement rather than a
// preference.** Storybook cannot render an async Server Component that reads cookies, and the story
// harness builds each story from `render` or `meta.component` while never applying a meta's
// decorators - so a screen that fetched for itself could not have a story at all. `page.tsx` awaits
// `requireProfile()` and hands the result down; this takes the whole state as required props. Same
// shape as `TransactionsScreen`, `DashboardScreen`, `InsightsScreen` and `CategoriesScreen`.
//
// **No `action` on `PageHeader`, which is SET-1's AC2**: this is the only one of the four routed
// views with no header control at all, because "Save changes" lives at the foot of the form. An
// omitted prop is what makes the header render nothing on the right rather than an empty box.
//
// **Two props rather than one as of PET-48**, and the second is not a second profile. `summary` is
// the Categories card's three figures, which come from a different endpoint and a different failure
// policy - `page.tsx` is where both of those are decided. This screen only threads it.

type SettingsScreenProps = {
  profile: Profile;
  /**
   * The Categories card's figures, or `null` when that read failed - passed straight through to the
   * form, which is where the reasoning lives.
   *
   * Required rather than defaulted to `null`, for the reason `TransactionsScreen`'s `filters` is:
   * `npm run build` never typechecks `*.test.tsx`, so a default would let a call site quietly test
   * a screen whose third card is permanently in its failure state.
   */
  summary: CategoriesSummary | null;
  /**
   * Threaded through to the form, which is where the reasoning lives: Storybook bundles a
   * `'use server'` module as an ordinary one, so a story pressing Save would reach `cookies()` in
   * the browser. The default is the real action, so `page.tsx` passes nothing.
   */
  save?: (body: Parameters<typeof updateProfile>[0]) => Promise<UpdateProfileResult>;
  /**
   * The theme preference the server rendered `<html>` with, read off the `spendifico.theme`
   * cookie by `page.tsx` and threaded through the form into the Preferences card. Required
   * rather than defaulted, `TransactionsScreen`'s reasoning about `filters`: `npm run build`
   * never reads `*.test.tsx`, so a default would let a call site quietly render the control
   * disagreeing with the server HTML.
   */
  themePref: ThemePref;
  /**
   * The account's categories whole, and their allocation, for the Manage categories modal.
   *
   * **Separate from `summary` rather than replacing it**, though the summary is derivable from these
   * two. The card's three figures are a *different* fact with a different failure mode: `summary` is
   * `null` when the read failed and the card says so, while an empty `categories` is a real account
   * the modal draws an empty state for. Collapsing them would make "the read failed" and "you have
   * no categories" one value again, which is the mistake `TransactionsScreen`'s no-results copy and
   * `InsightTeaserCard`'s third state each paid for separately.
   */
  categories: Category[];
  allocation: Allocation;
  /** The colours and icons both sub-modals offer, or `null` when that read failed. */
  palette: Palette | null;
  /** Every period, for the cap-anchor question `EditCategoryModal` asks. `[]` is a failed read. */
  periods: readonly Period[];
  /**
   * The three category writes, injected on the same terms as `save` and for the identical reason:
   * Storybook's Vite build has no notion of `'use server'`, so a story pressing any of them would
   * reach `cookies()` from `next/headers` in the browser. Each defaults to the real action inside
   * its own provider, so `page.tsx` passes none of them.
   */
  createCategoryAction?: (
    body: Parameters<typeof createCategory>[0],
  ) => Promise<CreateCategoryResult>;
  updateCategoryAction?: (
    ...args: Parameters<typeof updateCategory>
  ) => Promise<UpdateCategoryResult>;
  deleteCategoryAction?: (
    id: Parameters<typeof deleteCategory>[0],
  ) => Promise<DeleteCategoryResult>;
};

export function SettingsScreen({
  profile,
  summary,
  save,
  themePref,
  categories,
  allocation,
  palette,
  periods,
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
}: SettingsScreenProps) {
  // **The fallback's name comes off the response rather than being written here**, which is
  // `CategoriesScreen`'s rule: that row's name is the backend's to choose, and the delete
  // confirmation quotes it. The `??` covers a categories read that degraded to an empty list, where
  // no dialog can open anyway because the modal has no rows to open one from.
  const fallbackName = categories.find((category) => category.isFallback)?.name ?? 'Uncategorized';

  return (
    // **The nesting order is a requirement rather than tidiness.** `EditCategoryProvider` calls
    // `useDeleteCategory()` in its own body, because the edit modal's footer carries "Delete
    // category" - so reversed, this throws while rendering Settings rather than on the first click.
    // `(app)/layout.tsx` records the same requirement for the transaction pair, and
    // `CategoriesScreen` for this exact one.
    //
    // **All three wrap the header as well as `<main>`, and that is the point.** Their dialogs render
    // as siblings of `SettingsForm`'s `<form>` rather than as descendants of it, which is what stops
    // the sub-modals' own forms nesting inside the page's. `ManageCategoriesProvider` carries the
    // argument in full; it is innermost only because it is the one that consumes the other two.
    <DeleteCategoryProvider fallbackName={fallbackName} remove={deleteCategoryAction}>
      <EditCategoryProvider palette={palette} periods={periods} update={updateCategoryAction}>
        <ManageCategoriesProvider
          categories={categories}
          allocation={allocation}
          palette={palette}
          create={createCategoryAction}
        >
          <PageHeader overline="Manage your account" title="Settings" />
          <main className="flex-1 pb-10">
            <SettingsForm profile={profile} summary={summary} save={save} themePref={themePref} />
          </main>
        </ManageCategoriesProvider>
      </EditCategoryProvider>
    </DeleteCategoryProvider>
  );
}
