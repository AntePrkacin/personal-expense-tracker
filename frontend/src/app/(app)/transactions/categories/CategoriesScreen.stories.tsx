import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { Allocation, Category } from '@/lib/categories';
import type { Palette } from '@/lib/palette';

import { category } from './categoryFixture';
import { CategoriesScreen } from './CategoriesScreen';

// The import above is type-only on purpose. Importing any *value* from Storybook breaks the
// story smoke tests with an opaque ESM error, because @storybook/nextjs-vite will not load under
// Jest and only the erased type import keeps this module loadable there. Same note as the other
// screen stories.
//
// **The screen takes its whole state as props**, which is the payoff of `page.tsx` owning the
// read: this module imports nothing server-only, so there is no `next/headers` in the browser
// bundle and no request scope to fake.
//
// **The sidebar is deliberately absent.** These stories are the content column, so diff them
// against node `36:469` (frame 13's right-hand column) rather than against the whole 1440px
// frame. `Components/Sidebar` is where the left column is reviewed.
//
// **`nextjs: { appDirectory: true }` is mandatory here**, and no gate will tell you. The tab bar
// is two `next/link`s as of PET-36, and `next/link` throws `invariant expected app router to be
// mounted` outside a router - but `build-storybook` bundles stories without running them and
// `screens.stories.test.tsx` renders this module with `next/navigation` mocked, so both gates
// stay green and only opening the story finds it.
//
// **No provider wrapper, unlike the sibling tab's stories.** Every control on this screen is
// inert - the header's "Add category", each card's kebab, "Set limit" and "Allocate" all belong
// to PET-37, PET-38 and PET-39 - so nothing here reaches `useAddTransaction` or any other
// context. When those tickets land, this file gains the provider the same way
// `TransactionsScreen.stories.tsx` did.
//
// **PET-37 landed and this file still needs no provider, which is the half of that prediction that
// turned out differently.** The header's "Add category" is live here: it opens the real modal, in the
// story, with no wrapper - because the trigger owns its own state rather than reaching for a context.
// See `AddCategoryButton.tsx` for why one button on one route does not want one. What stays inert is
// each card's kebab, "Set limit" and "Allocate", which are PET-38's and PET-39's.
//
// **PET-39 made the kebab live, and the two paragraphs above are dated in one respect each.** There
// is a provider now - `DeleteCategoryProvider` - but it is still not mounted *here*: `CategoriesScreen`
// constructs it, so this file passes a stub action instead of a wrapper. What stays inert is "Set
// limit", "Allocate" and the menu's own "Edit", all three PET-38's.
//
// **PET-38 landed two of those three, so read the sentence above as dated too.** The menu's "Edit"
// opens frame 21 and every uncapped card's "Set limit" opens the same modal focused on its budget
// field. **"Allocate" is the one that stays inert**, because no frame draws where it goes - so this
// screen still has exactly one control announcing `aria-disabled`, and the summary card is where to
// look at it. The other visible change is the `Uncategorized` card, which now draws **no kebab and
// no banner**: both of its actions are refused by the API, so nothing on it is drawn that cannot be
// acted on. `Default` and `SingleCategory` are the two stories to check that in.
//
// **PET-70 made "Allocate" live, so the paragraph above is dated in the one respect that matters
// here: this screen has no inert control on it at all, and nothing on it announces `aria-disabled`.**
// The summary card's banner opens the Allocate budget modal, which sets every category's cap in one
// write - so `CardBanner`'s optional `onAction` became an exclusive union and the `aria-disabled`
// treatment was deleted along with its two Tailwind variants. **A review of PET-70 caught this file
// still carrying the old inventory**, which matters more than a stale comment usually would: there is
// no Figma frame for the modal, so these stories are the whole review surface for the screen, and the
// next reader auditing it for unavailable controls would have been sent to the summary card to look at
// one that no longer exists. `Default` and `AllUncapped` are where the live banner is; `OverBudget` is
// where it correctly disappears.
//
// **Every story therefore passes all three actions, and a code review plus `docs/TODO.md` are why.**
// Storybook's Vite build has no notion of `'use server'`, so it bundles `lib/deleteCategory.ts`,
// `lib/updateCategory.ts` and `lib/createCategory.ts` as ordinary modules, and pressing Delete in the
// confirmation, or Save in either modal, would run `cookies()` from `next/headers` in the page
// instead of an RPC. The delete seam was closed at PET-39 after a review found it unreachable; the
// create seam was the open gap that register nominated PET-38 for, and the edit seam ships with one,
// so the screen is uniform now rather than two-thirds covered.
// The sibling tab's stories close that by mounting their own provider with a stub
// (`TransactionsList.stories.tsx`); this screen owns its provider, so for one commit the seam was
// unreachable from here and this story ran the real action. `CategoriesScreen` takes the stub as an
// optional prop for exactly that. Resolving `ok` also lets the whole delete flow be walked here,
// which is the only review frame 20's success path gets on a real grid - nothing is deleted, and the
// cards do not change, because no server answered.

const meta: Meta<typeof CategoriesScreen> = {
  title: 'Screens/13 Categories',
  component: CategoriesScreen,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen', nextjs: { appDirectory: true } },
};

export default meta;

type Story = StoryObj<typeof CategoriesScreen>;

/**
 * The frame's eight categories, with every figure recomputed.
 *
 * A25 and A44 say to compute rather than to copy: the mock's caps sum to $2,970 against a stated
 * allocation of $1,800, so reproducing its numbers would ship a card that contradicts itself.
 * The names, the caps and the spends are the frame's; the percentages, remainders and statuses
 * are what the backend would derive from them.
 */
const CATEGORIES: Category[] = [
  category(),
  category({
    id: '0198c2a1-0000-7000-8000-0000000000a2',
    name: 'Dining out',
    color: 'error',
    icon: 'utensils',
    monthlyCap: 300,
    spent: 312,
    transactionCount: 18,
    percentUsed: 104,
    remaining: null,
    over: 12,
    status: 'over',
  }),
  category({
    id: '0198c2a1-0000-7000-8000-0000000000a3',
    name: 'Transport',
    color: 'info',
    icon: 'car',
    monthlyCap: 350,
    spent: 223,
    transactionCount: 12,
    percentUsed: 63.7,
    remaining: 127,
    over: null,
    status: 'on_track',
  }),
  category({
    id: '0198c2a1-0000-7000-8000-0000000000a4',
    name: 'Shopping',
    color: 'warning',
    // `gift` rather than a shopping bag: the icon allowlist is thirteen names until PET-65
    // widens it to sixty-four, and `shopping-bag` is one of the fifty-one still to come.
    icon: 'gift',
    monthlyCap: 250,
    spent: 174,
    transactionCount: 8,
    percentUsed: 69.6,
    remaining: 76,
    over: null,
    status: 'on_track',
  }),
  category({
    id: '0198c2a1-0000-7000-8000-0000000000a5',
    name: 'Housing',
    color: 'accent',
    icon: 'landmark',
    monthlyCap: 1100,
    spent: 1100,
    transactionCount: 1,
    percentUsed: 100,
    remaining: 0,
    over: null,
    status: 'full',
  }),
  category({
    id: '0198c2a1-0000-7000-8000-0000000000a6',
    name: 'Health',
    color: 'secondary',
    icon: 'heart-pulse',
    monthlyCap: 150,
    spent: 88,
    transactionCount: 5,
    percentUsed: 58.7,
    remaining: 62,
    over: null,
    status: 'on_track',
  }),
  category({
    id: '0198c2a1-0000-7000-8000-0000000000a7',
    name: 'Entertainment',
    color: 'primary',
    icon: 'tv',
    monthlyCap: 120,
    spent: 63,
    transactionCount: 9,
    percentUsed: 52.5,
    remaining: 57,
    over: null,
    status: 'on_track',
  }),
  category({
    id: '0198c2a1-0000-7000-8000-0000000000a8',
    name: 'Uncategorized',
    color: 'neutral',
    icon: 'circle-question-mark',
    isFallback: true,
    monthlyCap: null,
    spent: 148,
    transactionCount: 6,
    percentUsed: null,
    remaining: null,
    over: null,
    status: 'uncapped',
  }),
];

/** Caps summing to 2,770 against a 2,000 budget would be negative, so this set is trimmed. */
const ALLOCATION: Allocation = { monthlyBudget: 3000, allocated: 2770, unallocated: 230 };

/**
 * A small palette, so the header's trigger has something to hand the modal.
 *
 * Two of each rather than the real 16 and 64, for `lib/palette.ts`'s reason: no count is promised
 * anywhere, and the modal is where the lists are actually reviewed - `Shell/Add category` is the
 * story that draws them. A story wanting the degraded picker passes `palette={null}`.
 */
const PALETTE: Palette = {
  colors: [
    { token: 'success', label: 'Emerald' },
    { token: 'primary', label: 'Indigo' },
  ],
  icons: [
    { name: 'shopping-basket', label: 'Basket' },
    { name: 'tv', label: 'Television' },
  ],
};

// `palette` is defaulted here rather than repeated in every story's `render`, since none of the four
// is about the picker and all four would otherwise carry the same noise.
//
// **`remove` and `update` are defaulted for a sharper reason than noise**: every story draws a live
// kebab, and as of PET-38 a live "Set limit" beside it, so any of them could otherwise reach a real
// Server Action in the browser. Defaulting them here means a story added later cannot forget one,
// which is the failure mode that made this necessary in the first place - the seam existed and
// nothing was passing through it.
// `save` joins them as of PET-70, and it is the sharpest case yet: every story with unassigned
// budget draws a live "Allocate", and the modal behind it writes every cap on the screen at once.
function Frame({
  palette = PALETTE,
  remove = async () => ({ ok: true }),
  update = async () => ({ ok: true }),
  create = async () => ({ ok: true }),
  save = async () => ({ ok: true }),
  // Defaulted here rather than per story for the same reason the four actions are: a story that
  // forgot it would render a screen with no currency to format with, and the shared default is
  // what makes that unreachable.
  currency = 'USD',
  ...props
}: Omit<React.ComponentProps<typeof CategoriesScreen>, 'palette' | 'currency'> & {
  palette?: Palette | null;
  currency?: string;
}) {
  return (
    // `bg-base-200` is what the root layout paints `<body>`, and `px-*` stands in for the gutter
    // the `(app)` shell owns, since neither wraps a story.
    <div className="bg-base-200 flex min-h-screen flex-col px-4 sm:px-6 lg:px-10">
      <CategoriesScreen
        {...props}
        currency={currency}
        palette={palette}
        remove={remove}
        update={update}
        create={create}
        save={save}
      />
    </div>
  );
}

/**
 * The frame as drawn (node 36:423), plus the state it does not draw.
 *
 * What to check against Figma: the two-column grid at 1440 with a 20px gutter, the tile, name
 * and kebab across each card's top, "spent of cap" beside the status chip, the bar, and the
 * footer pairing the remaining figure with the transaction count. The Categories tab is the
 * current one and carries the category count; the other tab keeps a real transaction count.
 *
 * **Three deliberate departures from the frame, all recorded in the ticket.** The summary card
 * reports spending rather than allocation (AC4, amended 2026-08-08). The on-track bars are green
 * rather than violet, so the bar follows its chip. And the last card is `Uncategorized`, which
 * is uncapped - a state frame 13 draws nowhere and which every real account has.
 *
 * Housing is the "$0 over" boundary (CTG-6, A28) and reads "1 transaction", singular, where the
 * mock's typo reads "1 transactions".
 */
export const Default: Story = {
  render: () => <Frame categories={CATEGORIES} allocation={ALLOCATION} transactionCount={128} />,
};

/**
 * Every category uncapped, which is what a brand-new account actually looks like.
 *
 * Onboarding does not require a cap and the preselected fallback has none, so this is the shape
 * a person sees before they have budgeted anything - and no frame draws it. Each card keeps its
 * footprint and shows spend and count with no bar and no chip, over a banner offering to set a
 * limit. It owes A29 a designer's answer, which is what this story is for.
 */
export const AllUncapped: Story = {
  render: () => (
    <Frame
      categories={CATEGORIES.map((entry) => ({
        ...entry,
        monthlyCap: null,
        percentUsed: null,
        remaining: null,
        over: null,
        status: 'uncapped' as const,
      }))}
      allocation={{ monthlyBudget: 3000, allocated: 0, unallocated: 3000 }}
      transactionCount={128}
    />
  ),
};

/**
 * Spending past the monthly budget, with the caps over-allocated too.
 *
 * Two things to check, and both are guards rather than decoration. The summary chip flips to
 * "Over budget" - the two-tone split `dashboard/BudgetCard.tsx` uses, rather than the 80% band
 * neither design's threshold justified. And the unassigned banner **disappears**: `unallocated`
 * is returned unclamped and goes negative when caps exceed the budget (A43), so a truthy guard
 * would announce that money is unassigned at the exact moment the opposite is true.
 */
export const OverBudget: Story = {
  render: () => (
    <Frame
      categories={CATEGORIES.map((entry) =>
        entry.status === 'uncapped'
          ? entry
          : {
              ...entry,
              spent: entry.monthlyCap! * 1.2,
              percentUsed: 120,
              remaining: null,
              over: entry.monthlyCap! * 0.2,
              status: 'over' as const,
            },
      )}
      allocation={{ monthlyBudget: 2000, allocated: 2770, unallocated: -770 }}
      transactionCount={128}
    />
  ),
};

/**
 * One category, which is the smallest a real account can be.
 *
 * The grid cannot be empty: `Uncategorized` is a system category `DELETE /api/categories/:id`
 * refuses to remove, so this is the floor rather than an empty state. Worth opening to check the
 * single card does not stretch to two columns.
 *
 * **It is also the fallback card on its own, which is the one to open after PET-38.** That row draws
 * no kebab and no banner, so this story is a whole screen whose only operable controls are the two
 * tabs and the header's "Add category" - deliberately, since both actions behind a kebab are refused
 * for it. Check that the bare card still reads as a card rather than as a truncated one.
 */
export const SingleCategory: Story = {
  render: () => (
    <Frame
      categories={[CATEGORIES[CATEGORIES.length - 1]]}
      allocation={{ monthlyBudget: 2000, allocated: 0, unallocated: 2000 }}
      transactionCount={6}
    />
  ),
};
