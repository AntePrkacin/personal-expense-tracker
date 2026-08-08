import { monthOverline } from '@/lib/format';
import type { Allocation, Category } from '@/lib/categories';

import { PageHeader } from '../../PageHeader';
import { TransactionTabs } from '../TransactionTabs';
import { CategoryCard } from './CategoryCard';
import { SpendingSummaryCard } from './SpendingSummaryCard';

// 13 Categories (Figma node 36:423), the second tab of the Transactions page.
//
// **Separate from `page.tsx` because the route is async and fetches**, which is the split
// `/transactions` set and every screen since has copied. Storybook cannot render an async
// Server Component that reads cookies, so this one takes a resolved response and renders it -
// which is what lets the capped, uncapped and over-budget cards be diffed against the frame
// with no request scope and no mocks.
//
// **No slots, unlike `TransactionsScreen`.** That screen takes its filter bar and table as
// nodes because both need a read it deliberately does not make. Everything on this screen comes
// out of the one categories response, so there is nothing a call site could supply that this
// file could not build - and a slot with only one possible occupant expresses no choice.
//
// **No empty state, and the ticket is right that none is designed.** The grid cannot be empty:
// `Uncategorized` is a system category that `DELETE /api/categories/:id` refuses to remove
// (PET-35 AC5), so every account has at least one card. The state that would need designing is
// unreachable, which is a different thing from undesigned - so nothing is invented for it and
// `docs/TODO.md` gains no entry.

/**
 * The header's primary action, present and announcing that it does nothing.
 *
 * CTG-1 swaps "Add transaction" for "Add category" on this tab, and PET-37 builds the modal it
 * opens. Shipping it inert is the same call PET-33 made for its disabled "Edit" item and the
 * same one the card kebab makes beside it: a control the design draws, announcing that it is
 * not available, rather than an enabled button that silently does nothing.
 *
 * **A local `<button>` rather than `ui/Button`**, and the reason is `aria-disabled`. That
 * component offers `disabled`, which removes the control from the tab order entirely - so the
 * screen's most prominent action would be unreachable by keyboard and would announce nothing at
 * all. Widening a shared primitive for a state that exists for exactly one ticket is the trade
 * `frontend/src/components/CLAUDE.md` sets the bar against, and PET-37 replaces this function
 * with a provider-backed trigger shaped like `AddTransactionButton` rather than extending it.
 *
 * The class string is `ui/Button`'s `primary` variant written out, which is the one cost of
 * keeping it local. It is a complete literal, so Tailwind's scanner finds it.
 */
function AddCategoryButton() {
  return (
    <button type="button" aria-disabled="true" className="btn btn-primary">
      Add category
    </button>
  );
}

type CategoriesScreenProps = {
  /** Live categories, in the backend's own order. Never empty - see above. */
  categories: Category[];
  allocation: Allocation;
  /** The other tab's badge. See `readTransactionCount` for why this route has to ask for it. */
  transactionCount: number;
};

export function CategoriesScreen({
  categories,
  allocation,
  transactionCount,
}: CategoriesScreenProps) {
  // **Summed here rather than read from a field, and the sum is sound rather than approximate.**
  // `GET /api/categories` publishes no period total of its own, but every transaction in the
  // period belongs to exactly one row of this list: `CategoriesService.withSpend` folds spend
  // whose category was tombstoned into the `Uncategorized` fallback, which is the invariant
  // `backend/CLAUDE.md` records and the same one the dashboard donut's percentages rely on. So
  // this cannot silently omit money the way summing a filtered list would.
  //
  // Reading the dashboard endpoint's `spent` instead would be a second request for a figure
  // already implied by this one, and would introduce the disagreement it looks like it avoids -
  // the two are computed over different windows only if `monthStartDay` changes mid-request.
  const spent = categories.reduce((total, category) => total + category.spent, 0);

  return (
    <>
      <PageHeader
        overline={monthOverline(new Date())}
        title="Transactions"
        // **No search field, which is CTG-1 and the visible difference from the sibling tab.**
        // `TransactionsScreen` keeps its field in the header specifically so React reconciles
        // it across filter changes; that reasoning is about a screen with a filter bar, and
        // this one has neither.
        action={<AddCategoryButton />}
      />

      {/* gap-5 is the designed 20px between the tabs and what follows, matching the sibling
          tab so the two routes do not sit on different grids. No horizontal padding:
          `(app)/layout.tsx` states the shared gutter exactly once. */}
      <main className="flex flex-1 flex-col gap-5 pb-10">
        <TransactionTabs
          active="categories"
          transactionCount={transactionCount}
          categoryCount={categories.length}
        />

        <SpendingSummaryCard spent={spent} allocation={allocation} />

        {/* **The column count is responsive, and the ladder is chosen against the *content*
            width rather than the viewport's.** The shell's sidebar is a fixed 260px from `lg`
            up and a drawer below it, and the gutter is 40px a side at that width - so a
            viewport breakpoint fires roughly 340px after the space actually available changes.
            Each step below is the viewport at which the resulting card is still wide enough to
            hold the tile, name, kebab, "spent of cap" row and chip without the chip wrapping:

              - 1 column below `md`, where a phone has room for one card and nothing else.
              - 2 from `md`, and **still 2 at the designed 1440**, where the content box is
                1100px and the frame draws exactly two 540px cards with a 20px gutter. That is
                the one width the design actually specifies, so it is the one the ladder must
                not contradict.
              - 3 from `2xl` (1536), where the content box reaches ~1196px and thirds are still
                ~385px.
              - 4 from 1920, an arbitrary variant because Tailwind ships no breakpoint above
                `2xl`. At 2560 that puts each card at ~550px, which lands back on the designed
                540 rather than stretching four cards across a wall.

            Capped at 4 deliberately: beyond it the cards stop being cards and start being a
            table with rounded corners, and the eye loses the row. `items-start` so a card
            carrying a banner does not stretch its neighbours to match its height.

            **Every step is an arbitrary `min-[...]` variant, and mixing them with the named
            breakpoints is a real bug rather than a style preference.** The first version read
            `md:grid-cols-2 2xl:grid-cols-3 min-[1920px]:grid-cols-4`, and the 4-column step
            never fired - not because the class failed to compile, which a browser probe
            confirmed it did, but because Tailwind emits arbitrary variants *before* the named
            breakpoints. `2xl` is `width >= 96rem`, so it still matches at 1920px, and being
            later in the sheet at equal specificity it won. Every rung has to come from the same
            family for the cascade to order them by width. 48rem/96rem/120rem are exactly
            `md`/`2xl`/1920px, so the ladder is unchanged - only its spelling is. */}
        <ul className="grid list-none grid-cols-1 items-start gap-5 p-0 min-[48rem]:grid-cols-2 min-[96rem]:grid-cols-3 min-[120rem]:grid-cols-4">
          {categories.map((category) => (
            // A list rather than bare divs: eight sibling cards are a set, and a screen reader
            // announcing "list of 8" is the cheapest way to say how many there are. Each card
            // is its own <section> with an <h2>, so the list adds structure without competing
            // with the headings inside it.
            <li key={category.id}>
              <CategoryCard category={category} />
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
