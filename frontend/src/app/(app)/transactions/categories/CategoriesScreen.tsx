import { monthOverline } from '@/lib/format';
import type { Allocation, Category } from '@/lib/categories';
import type { CreateCategoryResult } from '@/lib/createCategory';
import type { DeleteCategoryResult } from '@/lib/deleteCategory';
import type { Palette } from '@/lib/palette';
import type { UpdateCategoryResult } from '@/lib/updateCategory';
import type { UpdateCategoryCapsResult } from '@/lib/updateCategoryCaps';
import type { components } from '@/types/api';

import type { toAllocateBody } from './allocateForm';

import { PageHeader } from '../../PageHeader';
import { TransactionTabs } from '../TransactionTabs';
import { AddCategoryButton } from './AddCategoryButton';
import { CategoryCard } from './CategoryCard';
import { DeleteCategoryProvider } from './DeleteCategoryProvider';
import { EditCategoryProvider } from './EditCategoryProvider';
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

// **The inert `AddCategoryButton` that used to live here is gone, and PET-37 is the ticket its note
// named.** It was a local `<button aria-disabled>` rather than a `ui/Button`, because that primitive
// offers only `disabled`, which drops a control out of the tab order. What replaced it is
// `./AddCategoryButton.tsx`, a real trigger owning the modal - not the "provider-backed" one that
// note predicted, for the reason that file records: one trigger on one route does not want a context.

type CategoriesScreenProps = {
  /** Live categories, in the backend's own order. Never empty - see above. */
  categories: Category[];
  allocation: Allocation;
  /** The other tab's badge. See `readTransactionCount` for why this route has to ask for it. */
  transactionCount: number;
  /**
   * The colour and icon lists both category modals offer, or `null` if that read failed.
   *
   * **Threaded through this screen rather than read by the trigger**, which keeps this component
   * synchronous and Storybook able to render it - the whole reason `page.tsx` and this file are
   * separate. A story hands a fixture, or `null` to draw the degraded modals.
   *
   * **One prop, two destinations as of PET-38**: `AddCategoryButton` and `EditCategoryProvider`.
   * That is what the one request per view of the tab now buys, where PET-37 paid it for a single
   * modal; `docs/TODO.md` carries the price and it did not go up.
   */
  palette: Palette | null;
  /**
   * The category delete action, defaulting to the real one. Overridden only by Storybook.
   *
   * **It is threaded through the screen because the screen owns the provider**, and a code review
   * is why it exists at all. `DeleteCategoryProvider` takes the same prop for the reason
   * `DeleteTransactionProvider` does - Storybook's Vite build has no notion of `'use server'`, so
   * it bundles `lib/deleteCategory.ts` as an ordinary module and a press would reach `cookies()`
   * from `next/headers` in the browser. But the sibling tab's stories mount their provider
   * themselves and can pass it directly, while this screen constructs its own, so the seam existed
   * with **no path from the story to reach it** and `Screens/13 Categories` would have run the real
   * action. One optional prop is what closes that, and it is also what makes the delete's success
   * path reviewable on frame 13 at all.
   *
   * Optional, so `page.tsx` stays a bare `<CategoriesScreen ... />` with no action threaded through.
   */
  remove?: (id: string) => Promise<DeleteCategoryResult>;
  /**
   * The category update action, defaulting to the real one. Overridden only by Storybook.
   *
   * `remove`'s twin, and it exists for exactly the reason that prop's own note records at length:
   * Storybook's Vite build has no notion of `'use server'`, so a story that reached the real action
   * would call `cookies()` from `next/headers` in the browser. This screen constructs its own
   * providers, so a seam on `EditCategoryProvider` alone would be one no story could reach.
   */
  update?: (
    id: string,
    body: components['schemas']['UpdateCategoryDto'],
  ) => Promise<UpdateCategoryResult>;
  /**
   * The category create action, defaulting to the real one. Overridden only by Storybook.
   *
   * The third of three, and the one `docs/TODO.md` had been carrying as an open gap: unlike the
   * other two it is threaded to a plain component rather than to a provider, because
   * `AddCategoryButton` owns its own modal. See that file for why one trigger on one route wants no
   * context, and `AddCategoryButton`'s own prop for why the seam was owed.
   */
  create?: (body: components['schemas']['CreateCategoryDto']) => Promise<CreateCategoryResult>;
  /**
   * The bulk cap write behind the summary card's "Allocate", defaulting to the real one.
   *
   * The fourth of four, and threaded to a plain component rather than to a provider for
   * `create`'s reason: `AllocateBanner` owns its own modal, because one trigger on one route wants
   * no context. Same Storybook argument as the three above, and `CategoriesScreen.stories.tsx`
   * defaults it in the shared `Frame` rather than per story - that file records the seam-unreachable
   * defect happening twice, which is what makes the shared default the rule here rather than a
   * convenience.
   */
  save?: (body: ReturnType<typeof toAllocateBody>) => Promise<UpdateCategoryCapsResult>;
  /**
   * The profile's currency, threaded from the page rather than read here.
   *
   * A Server Component cannot reach `PreferencesProvider`, which is client-side, so the server
   * half of the app takes the currency as a prop while the client half uses `useMoney()`.
   * `lib/money.ts` records the split.
   */
  currency: string;
};

export function CategoriesScreen({
  categories,
  allocation,
  transactionCount,
  palette,
  remove,
  update,
  create,
  save,
  currency,
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

  // **The name the delete confirmation says transactions move to, resolved once for the screen.**
  // This is PET-39's amendment to the ticket, which asks for the literal "Other": that role was
  // deliberately split when the backend was built, so "Other" is an ordinary chip anyone can
  // rename or delete and the row deletions reassign to is the `isFallback` one. Reading it off the
  // response means no string in the frontend claims to know the backend's name for that row.
  //
  // The `??` is a last resort for a response carrying no fallback row at all, which the partial
  // unique index plus provisioning make unreachable - it is here so the copy degrades to a true
  // sentence rather than to `undefined`, not because the case is expected.
  const fallbackName = categories.find((category) => category.isFallback)?.name ?? 'Uncategorized';

  return (
    // **Both of this screen's dialogs are mounted once here, and neither is one of the two provider
    // shapes the app already has.** `DeleteCategoryProvider.tsx` carries the argument in full; the
    // short version is that a dialog owned by each card sits inside the card being deleted, where
    // the success path's `router.refresh()` can unmount it out from under its own `close()`, and a
    // dialog on `(app)/layout.tsx` would serve one screen from all four routes. Both wrap the header
    // as well as `<main>`, so a trigger anywhere on the screen reaches them.
    //
    // **The nesting order is a requirement rather than a style.** The edit modal's "Delete category"
    // is a `useDeleteCategory()` call, so the edit provider has to sit inside the delete one - which
    // is also the direction that keeps the confirmation outliving the form it was opened from.
    <DeleteCategoryProvider fallbackName={fallbackName} remove={remove}>
      <EditCategoryProvider palette={palette} update={update}>
        <PageHeader
          overline={monthOverline(new Date())}
          title="Transactions"
          // **No search field, which is CTG-1 and the visible difference from the sibling tab.**
          // `TransactionsScreen` keeps its field in the header specifically so React reconciles
          // it across filter changes; that reasoning is about a screen with a filter bar, and
          // this one has neither.
          action={<AddCategoryButton palette={palette} create={create} />}
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

          <SpendingSummaryCard
            currency={currency}
            spent={spent}
            allocation={allocation}
            categories={categories}
            save={save}
          />

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
                <CategoryCard category={category} currency={currency} />
              </li>
            ))}
          </ul>
        </main>
      </EditCategoryProvider>
    </DeleteCategoryProvider>
  );
}
