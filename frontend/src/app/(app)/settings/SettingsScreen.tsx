import type { CategoriesView } from '@/lib/categories';
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

import { toCategoriesSummary } from './categoriesSummary';
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
// **It takes the categories read whole as of PET-48, and reduces it here.** The card's three
// figures and the Manage modal's rows come from one response, so this screen derives the first from
// the second rather than taking both - which a review found let a call site hand the card and the
// modal data about different accounts. The failure policy is still `page.tsx`'s; what arrives here
// is either the response or `null`.

type SettingsScreenProps = {
  profile: Profile;
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
   * The account's categories and their allocation as `GET /api/categories` answered, or `null` when
   * that read failed.
   *
   * **One prop rather than the three this shipped with**, which a review of PET-48 is the reason
   * for. `summary`, `categories` and `allocation` were all derived from one response and passed
   * separately, so nothing stopped a caller handing the card figures for one account and the modal
   * rows for another - and the suite and the stories were both doing exactly that. The reduction to
   * the card's three figures happens below instead, so the two cannot disagree by construction.
   *
   * **`null` is the read having failed, and it is not the same fact as an empty list.** An account
   * with only the fallback is a real account the modal draws an empty state for; a failed read is
   * an outage, and drawing it as an empty account is the mistake this repo has paid for three times
   * already. See `canManage` below for what it costs the button.
   */
  categories: CategoriesView | null;
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
  save,
  themePref,
  categories,
  palette,
  periods,
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
}: SettingsScreenProps) {
  // **The card's three figures, derived here from the one response the modal also draws from.**
  // `null` when the read failed, which is what makes the card say so rather than print zeroes.
  const summary =
    categories === null ? null : toCategoriesSummary(categories.categories, categories.allocation);

  // **Whether "Manage" can open at all, and both halves are review findings.**
  //
  // Without `categories` the modal has nothing true to say: it would draw a $0 budget over "you
  // have no categories" during an outage. Without `periods` it is worse than uninformative -
  // `EditCategoryModal` falls through to an unanchored cap write when it can find no current
  // period, so a cap raised here would silently re-price the period already in progress, which is
  // the rewriting PET-72 exists to prevent. A `palette` of `null` is **not** in this list: both
  // sub-modals already model that as disabled pickers with a line saying why, which is a degraded
  // control rather than a wrong one.
  //
  // The card above the button already explains the failure, so the button is `disabled` rather than
  // announcing a reason of its own - the treatment "Save changes" uses for the same shape of
  // temporary unavailability, and deliberately not the `aria-disabled` this repo reserves for
  // drawn-but-unbuilt controls. There is nothing unbuilt here; there is something unavailable.
  const canManage = categories !== null && periods.length > 0;

  // **The fallback's name comes off the response rather than being written here**, which is
  // `CategoriesScreen`'s rule: that row's name is the backend's to choose, and the delete
  // confirmation quotes it.
  const fallbackName =
    categories?.categories.find((category) => category.isFallback)?.name ?? 'Uncategorized';

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
        <ManageCategoriesProvider view={categories} palette={palette} create={createCategoryAction}>
          <PageHeader overline="Manage your account" title="Settings" />
          <main className="flex-1 pb-10">
            <SettingsForm
              profile={profile}
              summary={summary}
              canManage={canManage}
              save={save}
              themePref={themePref}
            />
          </main>
        </ManageCategoriesProvider>
      </EditCategoryProvider>
    </DeleteCategoryProvider>
  );
}
