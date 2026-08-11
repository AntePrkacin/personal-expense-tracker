import type { Category } from '@/lib/categories';
import { withoutFallback } from '@/lib/fallbackCategory';

// The Manage categories modal's two derived facts, with no DOM and no React in them.
//
// The same split `categoriesSummary.ts` beside it makes, and `allocateForm.ts`, `categoryForm.ts`
// and `(app)/transactionForm.ts` all make before it: the rules a reviewer wants pinned live in a
// module a fast suite can drive directly, and the component is left holding state and markup.
//
// **There is very little here, and that is the shape of this feature rather than an omission.** The
// modal performs no write of its own - every one belongs to `AddCategoryModal`, `EditCategoryModal`
// or `DeleteCategoryDialog`, which it opens over itself - and its three summary figures come from
// `allocateForm.ts`'s `toAllocateTotals`, reused rather than re-derived. So what is left for this
// module is the row filter and one sentence.

/**
 * The categories the modal lists, which is every one except the fallback.
 *
 * **A product decision, and the same one PET-70 already took for the Allocate modal.** Claude
 * Design's `ManageCategoriesModal.jsx` draws its "Other" row like any other, with Edit and Delete
 * beside it; both of those are refused for this repo's `Uncategorized` - `PATCH` answers 409 for a
 * rename and `DELETE` answers 409 because it is where every other deletion sends its transactions -
 * so drawing the row would put two controls on screen that cannot work. `CategoryCard` reached the
 * same conclusion by drawing that card no kebab and no banner at all.
 *
 * Delegates to `lib/fallbackCategory.ts`, which this ticket is the third consumer of; the name says
 * what the rows are *for* here, which is the vocabulary point that file's own comment makes.
 */
export function manageableCategories(categories: Category[]): Category[] {
  return withoutFallback(categories);
}

/**
 * How many of the listed categories carry no cap.
 *
 * Counted over the **listed** rows rather than over everything handed in, so it cannot report a
 * fallback the modal does not draw. That row ships uncapped on every account, so counting it would
 * make the caption below read one high for everybody.
 */
export function noLimitCount(categories: Category[]): number {
  return manageableCategories(categories).filter((category) => category.monthlyCap === null).length;
}

/**
 * The caption under the summary island.
 *
 * Claude Design's own composition, kept: a count sentence that disappears entirely at zero, followed
 * by the standing one. The second half is what tells the user where caps are set at all, which this
 * modal deliberately does **not** do inline - so it has to be present even when every category has a
 * limit, and that is why it is concatenated rather than being the `else` arm.
 *
 * Pluralized, which makes it the app's **fifth** pluralized string after `dashboard/BudgetCard.tsx`,
 * the two in `transactions/categories/` and `categoriesSummary.ts`'s own. Still a local ternary
 * rather than a shared helper, for the reason all four of those carry: five call sites across three
 * nouns is not a pluralization library, and a helper taking the singular and the plural as arguments
 * would not be worth having.
 *
 * Invented copy, so it owes A29 a sign-off with everything else on this screen.
 */
/**
 * A row's caption: what the category has spent, beside what it has been given.
 *
 * **The formatter is a parameter rather than a hook call**, which is `cappedMessage`'s documented
 * reason next door: money follows the profile's currency through a React context that only a hook
 * can reach, and keeping this a plain function is what lets its suite drive it with no provider and
 * no DOM. The caller passes `useMoney().formatWhole`.
 *
 * `formatWhole` for both halves, because both are aggregates - the rule every aggregate figure in
 * this app follows. Neither is a residual, so neither carries cents; that asymmetry is
 * `AllocateBudgetModal`'s to make, because it draws an overage and this does not.
 *
 * **An uncapped category reads "No limit" rather than dropping the second half**, and that is the
 * one part of this the product owner's instruction did not settle. Two things argue for it. The
 * summary island above already says "N categories have no limit", and without a per-row marker that
 * sentence names a quantity the reader cannot then locate. And "No limit" is the app's existing
 * word for the state - `AllocateBudgetModal`'s cap field draws it as its placeholder - so this
 * borrows a string rather than inventing one. A blank second half was the alternative and says the
 * same thing by omission, which is the weaker way to say it.
 */
export function rowCaption(
  category: Pick<Category, 'spent' | 'monthlyCap'>,
  formatWhole: (amount: number) => string,
): string {
  const assigned =
    category.monthlyCap === null ? 'No limit' : `${formatWhole(category.monthlyCap)} assigned`;

  return `${formatWhole(category.spent)} spent · ${assigned}`;
}

export function capsCaption(count: number): string {
  const lead =
    count === 1
      ? '1 category has no limit. '
      : count > 1
        ? `${count} categories have no limit. `
        : '';

  return `${lead}Set caps per category from Edit.`;
}
