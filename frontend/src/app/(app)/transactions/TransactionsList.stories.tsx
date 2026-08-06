import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { CategoryLabel } from '@/lib/categories';
import type { Transaction, TransactionFilters, TransactionsView } from '@/lib/transactions';

import { AddTransactionProvider } from '../AddTransactionProvider';
import { DeleteTransactionProvider } from '../DeleteTransactionProvider';
import { TransactionFilterBar } from './TransactionFilterBar';
import { TransactionsScreen } from './TransactionsScreen';
import { TransactionsTable } from './TransactionsTable';

// 06 Transactions — List (node 26:90), the populated frame.
//
// **A second stories module beside `TransactionsScreen.stories.tsx` rather than two more
// stories in it**, because a module carries one title and that one is `Screens/07
// Transactions — Empty`. The two frames are different screens in the design file and are
// reviewed as such.
//
// Every note that file carries applies here too, and three of them are the ones that bite:
// the Storybook import is **type-only** or the smoke tests fail with an opaque ESM error; the
// provider and the height column live **inside `render`** because the smoke harness never
// applies `meta.decorators`; and `nextjs: { appDirectory: true }` is mandatory because the
// search field and all three filter selects reach `useRouter`, which throws outside a mounted
// router - with `build-storybook` and the Jest harness both blind to it.
//
// **The rows are sample data and say so.** The ten below are frame 06's own mock rows
// (TRN-5), so this can be diffed against the design literally rather than against invented
// merchants. They are not real people's spending and the personas are the spec's.

const meta: Meta<typeof TransactionsScreen> = {
  title: 'Screens/06 Transactions — List',
  component: TransactionsScreen,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen', nextjs: { appDirectory: true } },
};

export default meta;

type Story = StoryObj<typeof TransactionsScreen>;

const CATEGORIES: CategoryLabel[] = [
  { id: 'c1', name: 'Groceries', color: '#57B368' },
  { id: 'c2', name: 'Transport', color: '#3F8EE6' },
  { id: 'c3', name: 'Entertainment', color: '#8A79F1' },
  { id: 'c4', name: 'Dining out', color: '#EF6F6C' },
  { id: 'c5', name: 'Shopping', color: '#E7C24A' },
  { id: 'c6', name: 'Housing', color: '#34B9AE' },
  { id: 'c7', name: 'Health', color: '#CE6FB8' },
];

/** Frame 06's ten rows, in its order, with the amounts and dates it draws. */
const ROWS: [string, string, number, string][] = [
  ['Whole Foods', 'c1', 62.4, '2025-10-08'],
  ['Uber', 'c2', 18.5, '2025-10-08'],
  ['Netflix', 'c3', 15.99, '2025-10-07'],
  ['Starbucks', 'c4', 6.8, '2025-10-07'],
  ['Shell', 'c2', 52, '2025-10-06'],
  ['Amazon', 'c5', 121.3, '2025-10-05'],
  ['Rent — October', 'c6', 1100, '2025-10-05'],
  ['Spotify', 'c3', 10.99, '2025-10-04'],
  ["Trader Joe's", 'c1', 44.1, '2025-10-03'],
  ['City Pharmacy', 'c7', 28.75, '2025-10-02'],
];

const TRANSACTIONS: Transaction[] = ROWS.map(([merchant, categoryId, amount, date], index) => ({
  id: `t${index}`,
  merchant,
  categoryId,
  amount,
  date,
  note: null,
  createdAt: `${date}T09:00:00.000Z`,
  updatedAt: `${date}T09:00:00.000Z`,
}));

/**
 * The whole screen, with both slots filled the way `page.tsx` fills them.
 *
 * `total` is 128 against ten rows deliberately: the frame draws that mismatch, and the badge
 * reads the post-filter total rather than `transactions.length`, so a page size could never
 * silently turn it into a page count.
 */
function Frame({ filters }: { filters: TransactionFilters }) {
  const view: TransactionsView = { state: 'populated', transactions: TRANSACTIONS, total: 128 };

  return (
    <AddTransactionProvider>
      {/* Both providers, and the second is not optional: every row draws a kebab whose
          `useDeleteTransaction()` throws outside it. Inside `render` with the first one, for
          the reason the header note gives - the smoke harness never applies `meta.decorators`.
          This is also what makes the row menu and the delete dialog reviewable here at all,
          which is the only review either gets: `build-storybook` never runs a story. */}
      {/* A stub action, and it is not decoration: without it this provider imports the real
          `'use server'` `deleteTransaction`, which Storybook's Vite build bundles as an ordinary
          browser module - so pressing Delete in the confirmation would run `cookies()` from
          `next/headers` in the page instead of an RPC. The story text below invites exactly that
          click. Resolving `ok` lets the whole flow be walked; nothing is deleted, and the list
          does not change because no server answered. */}
      <DeleteTransactionProvider remove={async () => ({ ok: true })}>
        {/* `bg-base-200` is what the root layout paints `<body>`, and `px-*` stands in for the
            gutter the `(app)` shell owns, since neither wraps a story. */}
        <div className="bg-base-200 flex min-h-screen flex-col px-4 sm:px-6 lg:px-10">
          <TransactionsScreen
            view={view}
            filters={filters}
            filterBar={<TransactionFilterBar filters={filters} categories={CATEGORIES} />}
            table={<TransactionsTable transactions={TRANSACTIONS} categories={CATEGORIES} />}
          />
        </div>
      </DeleteTransactionProvider>
    </AddTransactionProvider>
  );
}

/**
 * The frame as drawn (node 26:90).
 *
 * What to check, which since PET-57 is structure and behaviour rather than pixels - radius,
 * border colour, type scale and cell padding are the theme's now, so a diff against the frame's
 * own numbers is expected to disagree. On the bar: three `select select-sm` controls, category
 * and period grouped left, sort flush right. On the card: one rule under the header and one
 * between every pair of rows, none after the last. On a row: the coloured tile, the dot before
 * the category name in the same colour, "Oct 8" without its year, and the amount right-aligned
 * with a **U+2212** minus rather than a hyphen.
 *
 * **Narrow the viewport, which is the check the design file cannot give you.** The card is
 * `overflow-x-auto`, so the table scrolls inside its own box; the page body must not scroll
 * sideways with it, and the filter bar should wrap rather than crush its selects.
 *
 * **The kebab is live as of PET-33, and this story is where its two browser-only behaviours are
 * checked** - jsdom implements no Popover API at all and `jest.setup.ts` deliberately fakes
 * none of it, so nothing in the suite can see either. Open a row's menu: it should sit anchored
 * under that kebab, close on a click anywhere else and close on Escape. "Edit" reads dimmed and
 * does nothing, which is PET-32's to finish. "Delete" closes the menu and opens the
 * confirmation over the page. In **Firefox**, where CSS anchor positioning is unsupported,
 * daisyUI's own fallback centres the menu behind a dimmed backdrop instead - degraded and
 * expected, not a bug to fix here.
 *
 * A row click still does nothing, because the detail page is PET-34's.
 */
export const List: Story = {
  render: () => <Frame filters={{}} />,
};

/**
 * The same screen with three filters active, which no frame draws.
 *
 * Here to check what the default story cannot: that each pill renders the value the URL is
 * filtered by rather than its first option, and that the two undesigned option sets read
 * sensibly closed - "Last month" and "Oldest first" are this ticket's amendment to A16 and
 * owe a designer's sign-off with the rest of what A29 tracks.
 *
 * The rows are the unfiltered ten regardless, since nothing here queries a backend.
 */
export const Filtered: Story = {
  render: () => (
    <Frame filters={{ search: 'Whole', categoryId: 'c1', period: 'previous', sort: 'date_asc' }} />
  ),
};
