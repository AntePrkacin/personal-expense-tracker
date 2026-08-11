import type { Allocation, Category } from '@/lib/categories';
import { withoutFallback } from '@/lib/fallbackCategory';

// The Categories summary card's one sentence, reduced to the three numbers behind it (SET-4).
//
// React-free on purpose, the same split `settingsForm.ts` beside it makes and that
// `categoryForm.ts`, `(app)/transactionForm.ts` and `allocateForm.ts` all make before it: the
// rules live in a module a fast suite can drive directly, and `CategoriesSummaryCard.tsx` is left
// with rendering. Nothing here formats money - that is the card's, through `useMoney()`, because
// the currency is a fact about the reader's profile rather than about these three integers.
//
// **This is the whole of PET-48's logic**, which is worth saying because PET-47's plan predicted
// five edits to `settingsForm.ts` for its card and this one predicts none: the Categories card
// holds no value, so `SettingsFormValues`, `invalidFields`, `sameSettingsValues` and
// `toUpdateProfileBody` are all untouched by it.

/**
 * The three figures the card draws.
 *
 * `allocated` and `monthlyBudget` are major units, straight off `AllocationResponseDto` and
 * deliberately not rounded here - `formatWhole` at the call site is what the design's whole-dollar
 * figures come from, and rounding twice is how a figure and its own formatter disagree.
 */
export type CategoriesSummary = {
  count: number;
  allocated: number;
  monthlyBudget: number;
};

/**
 * Every category this card counts, which is every one except the fallback.
 *
 * **The third consumer arrived and the lift happened, so this delegates to
 * `lib/fallbackCategory.ts` now.** This docblock used to argue for a deliberate second copy and set
 * the trigger for undoing it - "the rule of three says duplicate until a third consumer appears;
 * this is the second, so whichever ticket brings the third lifts both into `lib/`" - and PET-48's
 * own Manage categories modal is that third. The name stays for `lib/amount.ts`'s reason: these are
 * the categories a user *manages*, which is what this card counts, and the shared spelling cannot
 * say that.
 *
 * **The exclusion is a product decision and it costs an off-by-one against the tab badge.**
 * `TransactionTabs`' `categoryCount` is `categories.length`, the fallback included, and documents
 * itself as never 0 for exactly that reason - so this card reads one lower than the badge on the
 * same account. Accepted, because the card is about the categories a user manages and
 * `Uncategorized` is the one they cannot: `CategoryCard` draws it no kebab and no banner, and
 * `frontend/CLAUDE.md` records that it can be neither renamed nor capped from the UI.
 */
function managedCategories(categories: Category[]): Category[] {
  return withoutFallback(categories);
}

/**
 * The read's answer, reduced to what the card draws.
 *
 * **`allocated` is passed through rather than re-summed, and that is the point of taking the whole
 * `Allocation` instead of only the categories.** It is the same field the Categories tab's summary
 * card and the Allocate modal both read, so a private `reduce` over `monthlyCap` here would be a
 * second authority on one number - and the two would silently disagree the moment a cap is set on
 * the fallback, which the API accepts even though no screen offers it.
 *
 * That is the seam this function knowingly leaves open: `count` excludes the fallback while
 * `allocated` would include a cap on it. Unreachable through the UI, zero in practice because the
 * fallback is seeded uncapped, and recorded in `docs/TODO.md` rather than papered over with a
 * subtraction nothing could verify - `allocateForm.ts`'s `reservedCents` is what that subtraction
 * looks like when a caller genuinely needs it.
 */
export function toCategoriesSummary(
  categories: Category[],
  allocation: Allocation,
): CategoriesSummary {
  return {
    count: managedCategories(categories).length,
    allocated: allocation.allocated,
    monthlyBudget: allocation.monthlyBudget,
  };
}

/**
 * The count, pluralized (AC2).
 *
 * The app's **fourth** pluralized string, after `dashboard/BudgetCard.tsx`'s "days left" and the
 * two "transactions" in `transactions/categories/`. Still a local ternary rather than a shared
 * helper, and each of those three carries the same note for the same reason: four call sites with
 * two different nouns is not a pluralization library, and a helper would have to take the singular
 * and the plural as arguments to be worth having.
 *
 * Zero pluralizes to "0 categories", which is reachable: an account whose only category is the
 * fallback has nothing else to count.
 */
export function categoryCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'category' : 'categories'}`;
}
