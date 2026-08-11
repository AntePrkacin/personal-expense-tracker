import type { Category } from '@/lib/categories';

// The one rule three screens share about `Uncategorized`: it is a category the user cannot act on,
// so a list offering actions must not draw it.
//
// **Lifted here by PET-48's Manage modal, which is the third consumer that
// `settings/categoriesSummary.ts` said would have to do it.** That file's own comment set the
// trigger in as many words - "the rule of three says duplicate until a third consumer appears; this
// is the second, so whichever ticket brings the third lifts both into `lib/`" - and this is that
// ticket, so the lift is a contract being honoured rather than a refactor taken on the way past.
//
// **`lib/` rather than either folder that had a copy**, which is `lib/pickerScroll.ts`'s move at
// PET-47 for the identical reason: the consumers sit on two different routes, and a settings module
// reaching into `transactions/categories/` for a one-line filter inverts the layering rather than
// sharing it.
//
// **It is type-only against `lib/categories.ts` and must stay that way.** That module reaches
// `authorizedGet`, which reaches `next/headers`; a value import here would drag the server-side
// fetch machinery into every client bundle that draws a category list. `import type` is erased, so
// this module is safe on both sides of the boundary - which is what lets `allocateForm.ts` and
// `categoriesSummary.ts` both keep importing it.

/**
 * Every category except the fallback.
 *
 * `isFallback` is the contract's own flag rather than a name comparison, because the fallback's name
 * is the backend's to choose and `CategoriesScreen` already resolves it off the response rather than
 * hard-coding one.
 *
 * **The two existing names delegate to this and keep their own spellings**, which is
 * `lib/amount.ts`'s documented call about the same kind of lift: what a lift like this buys is one
 * copy of each rule to fix, and deliberately **not** one vocabulary. `allocatableCategories` says
 * something true where it lives (these are the rows a budget can be allocated to) and
 * `managedCategories` says something true where *it* lives (these are the categories a user
 * manages), and collapsing them onto one word would lose both.
 */
export function withoutFallback(categories: Category[]): Category[] {
  return categories.filter((category) => !category.isFallback);
}
