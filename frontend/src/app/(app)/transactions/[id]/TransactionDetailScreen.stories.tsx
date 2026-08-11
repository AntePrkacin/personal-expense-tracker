// **`PreferencesProvider` is mounted because the dialogs behind these providers call `useMoney()`.**
// A review caught it missing: the dialogs mount only while open, so every story rendered green under
// Jest and threw `usePreferences must be used inside PreferencesProvider` the moment a reviewer
// pressed Delete - on the only surface that flow can be reviewed at all. Mounted here rather than in
// `decorators`, for the reason `frontend/src/app/CLAUDE.md` records: the story smoke tests never
// apply a meta's decorators.

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { CategoryContext, TransactionDetail } from '@/lib/transactionDetail';

import { AddTransactionProvider } from '../../AddTransactionProvider';
import { DeleteTransactionProvider } from '../../DeleteTransactionProvider';
import { EditTransactionProvider } from '../../EditTransactionProvider';
import { TransactionDetailActions } from './TransactionDetailActions';
import { TransactionDetailScreen } from './TransactionDetailScreen';
import { PreferencesProvider } from '../../PreferencesProvider';

// 08 Transaction detail (node 34:349).
//
// Type-only Storybook import, for the reason `ui/Sidebar.stories.tsx` records: importing any
// *value* from Storybook breaks the Jest story smoke test with an opaque ESM error.
//
// **Three states here are ones the frame draws nothing for**, which makes this the review
// surface for them: an uncapped category, a category over its cap, and a transaction with no
// note. The uncapped one is the important one - it is the *common* case, since the preselected
// fallback category ships without a cap, so the frame draws the rarer state.

const CATEGORY: CategoryContext = {
  id: '0198c2a1-0000-7000-8000-0000000000a1',
  name: 'Groceries',
  color: 'success',
  // A real lucide name rather than `null`, which is what this story drew before
  // PET-64 made the sibling tiles render the category's own glyph. `null` is
  // reachable only for a row predating that change - `CreateCategoryDto.icon` is
  // required and no PATCH can clear one - so a sign-off story showing an empty
  // tile would be diffing the design against a state no new account can be in.
  icon: 'shopping-basket',
  description: null,
  isFallback: false,
  monthlyCap: 500,
  spent: 397,
  transactionCount: 3,
  percentUsed: 79.4,
  remaining: 103,
  over: null,
  status: 'near',
};

const TRANSACTION: TransactionDetail['transaction'] = {
  id: '0198c2a1-0000-7000-8000-000000000001',
  merchant: 'Whole Foods',
  categoryId: CATEGORY.id,
  amount: 62.4,
  date: '2025-10-08',
  note: 'Weekly groceries run — produce, pantry staples and household supplies. Split with flatmate (their half already settled).',
  createdAt: '2025-10-08T09:00:00.000Z',
  updatedAt: '2025-10-08T09:00:00.000Z',
};

const RECENT: TransactionDetail['recentInCategory'] = [
  {
    ...TRANSACTION,
    id: '0198c2a1-0000-7000-8000-000000000002',
    merchant: "Trader Joe's",
    amount: 44.1,
    date: '2025-10-03',
    note: null,
  },
  {
    // The September row the frame draws, and the whole point of A22: this list has no date
    // predicate, so it crosses the month boundary the card above it is scoped to.
    ...TRANSACTION,
    id: '0198c2a1-0000-7000-8000-000000000003',
    merchant: 'Costco',
    amount: 128.9,
    date: '2025-09-28',
    note: null,
  },
];

const DETAIL: TransactionDetail = {
  transaction: TRANSACTION,
  category: CATEGORY,
  recentInCategory: RECENT,
};

const meta: Meta<typeof TransactionDetailScreen> = {
  title: 'Screens/08 Transaction detail',
  component: TransactionDetailScreen,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    // Without this `next/navigation` throws "invariant expected app router to be mounted" -
    // `TransactionDetailActions` calls `useRouter`. No gate catches its absence:
    // `build-storybook` bundles stories without running one, and the Jest smoke suite mocks
    // `next/navigation` already. Opening the story is the only check.
    nextjs: { appDirectory: true },
  },
};

export default meta;

type Story = StoryObj<typeof TransactionDetailScreen>;

/**
 * All three providers, and the two stub actions are not decoration.
 *
 * Left real, both modals would import their `'use server'` actions, which Storybook's Vite
 * build bundles as ordinary browser modules - so Save changes or Delete would call `cookies()`
 * from `next/headers` in the page rather than making an RPC. Resolving `ok` lets both flows be
 * walked; nothing is written, and nothing on screen changes because no server answered.
 *
 * Inside `render` rather than in `meta.decorators`, because the Jest smoke harness never
 * applies decorators - which is how `Screens/02 Setup` first failed.
 *
 * `AddTransactionProvider` is here only because `EditTransactionProvider` sits inside
 * `DeleteTransactionProvider` on the real layout and the nesting order is load-bearing; keeping
 * all three in the same order means this story cannot drift from the shell.
 */
function Frame({ detail }: { detail: TransactionDetail }) {
  return (
    <AddTransactionProvider>
      <PreferencesProvider currency="USD">
        <DeleteTransactionProvider remove={async () => ({ ok: true })}>
          <EditTransactionProvider update={async () => ({ ok: true })}>
            {/* `bg-base-200` is what the root layout paints `<body>`, and `px-*` stands in for
              the gutter the `(app)` shell owns, since neither wraps a story. */}
            <div className="bg-base-200 flex min-h-screen flex-col px-4 sm:px-6 lg:px-10">
              <TransactionDetailScreen
                currency="USD"
                detail={detail}
                backHref="/transactions"
                query=""
                actions={
                  <TransactionDetailActions
                    transaction={detail.transaction}
                    backHref="/transactions"
                  />
                }
              />
            </div>
          </EditTransactionProvider>
        </DeleteTransactionProvider>
      </PreferencesProvider>
    </AddTransactionProvider>
  );
}

/**
 * The frame as drawn, for a category with a cap (node 34:349).
 *
 * What to check, which since PET-57 is structure and behaviour rather than pixels. The header:
 * a breadcrumb above the merchant, then the date and the category chip below it, with Edit and
 * a **soft** red Delete on the right - solid red is the confirmation dialog's treatment, and
 * this one sits beside a neutral button. The bar: filled to 79%, with "$397.00 spent" left and
 * "$103.00 left of $500.00" right.
 *
 * **Three rows the frame draws are deliberately absent from the Details card** - Time, Payment
 * and Status - along with the frame's "· 2:32 PM" in the caption and its "Debited from Everyday
 * account" under the amount. No column stores any of them (DET-8, A20), so PET-34 dropped them
 * rather than rendering blanks. Expect Merchant, Category and Date and nothing else.
 *
 * **Amounts carry cents where the frame draws whole dollars.** `formatCurrency` forces two
 * decimals; `docs/TODO.md` records that as an app-wide deviation rather than this card's.
 *
 * **Narrow the viewport**, which the design file cannot show you: the two columns stack, the
 * chip wraps under the date rather than crushing the title, and nothing scrolls sideways.
 *
 * Edit and Delete both work here, which is the only review either gets on this screen - open
 * the confirmation and check that only the top dialog is interactive, since jsdom has no top
 * layer and the suites can reach both. Expect the edit modal's Category picker to be disabled
 * under "We couldn't load your categories": Storybook serves no route handlers, so that fetch
 * fails and the designed unavailable state is what renders.
 */
export const Capped: Story = {
  render: () => <Frame detail={DETAIL} />,
};

/**
 * A category with no cap, which is the common case and which no frame draws.
 *
 * Caps are optional and the preselected `Uncategorized` fallback ships without one, so
 * `monthlyCap`, `percentUsed`, `remaining` and `over` all come back null. **Expect the chip,
 * the bar and the remaining figure to be absent rather than empty or zeroed** - there is no cap
 * to draw against, and a 0% bar would claim a budget that does not exist. The spent figure and
 * the whole recent list stay, because both are true either way.
 *
 * This is the state that owes a designer's answer. It is the one to put in front of them.
 */
export const Uncapped: Story = {
  render: () => (
    <Frame
      detail={{
        ...DETAIL,
        category: {
          ...CATEGORY,
          name: 'Uncategorized',
          color: 'warning-content',
          isFallback: true,
          monthlyCap: null,
          percentUsed: null,
          remaining: null,
          over: null,
          status: 'uncapped',
        },
      }}
    />
  ),
};

/**
 * A category past its cap, also undrawn.
 *
 * `remaining` is null once a category is over and `over` carries the excess instead, so the
 * right-hand line changes shape rather than going negative. Check that the bar fills its track
 * and does not overflow it, and that the chip reads the real percentage rather than a clamped
 * 100.
 */
export const OverBudget: Story = {
  render: () => (
    <Frame
      detail={{
        ...DETAIL,
        category: {
          ...CATEGORY,
          spent: 620,
          percentUsed: 124,
          remaining: null,
          over: 120,
          status: 'over',
        },
      }}
    />
  ),
};

/**
 * A transaction with no note (A21).
 *
 * The Note card is not rendered at all rather than rendered empty, so the right column is the
 * Details card alone. Not designed - the frame draws only the with-note case.
 */
export const WithoutANote: Story = {
  render: () => <Frame detail={{ ...DETAIL, transaction: { ...TRANSACTION, note: null } }} />,
};

/**
 * The first transaction in a category.
 *
 * Reached more often than it looks: the backend excludes the transaction being viewed from this
 * list, so any category holding exactly one row lands here. The frame draws three rows and no
 * variant for none, so the line is ours and owes A29 sign-off with the rest.
 */
export const NoRecent: Story = {
  render: () => <Frame detail={{ ...DETAIL, recentInCategory: [] }} />,
};
