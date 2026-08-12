// **`PreferencesProvider` is mounted because the dialogs behind these providers call `useMoney()`.**
// A review caught it missing: the dialogs mount only while open, so every story rendered green under
// Jest and threw `usePreferences must be used inside PreferencesProvider` the moment a reviewer
// pressed Delete - on the only surface that flow can be reviewed at all. Mounted here rather than in
// `decorators`, for the reason `frontend/src/app/CLAUDE.md` records: the story smoke tests never
// apply a meta's decorators.

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { CategoryLabel } from '@/lib/categories';
import type { Transaction, TransactionFilters, TransactionsView } from '@/lib/transactions';

import { AddTransactionProvider } from '../AddTransactionProvider';
import { DeleteTransactionProvider } from '../DeleteTransactionProvider';
import { EditTransactionProvider } from '../EditTransactionProvider';
import { TransactionFilterBar } from './TransactionFilterBar';
import { TransactionsScreen } from './TransactionsScreen';
import { TransactionsTable } from './TransactionsTable';
import { ShellStory } from '../shellStory';

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
  { id: 'c1', name: 'Groceries', color: 'success' as const, icon: 'shopping-basket' as const },
  { id: 'c2', name: 'Transport', color: 'info' as const, icon: 'car' as const },
  { id: 'c3', name: 'Entertainment', color: 'primary' as const, icon: 'tv' as const },
  { id: 'c4', name: 'Dining out', color: 'error' as const, icon: 'utensils' as const },
  { id: 'c5', name: 'Shopping', color: 'warning-content' as const, icon: 'gift' as const },
  { id: 'c6', name: 'Housing', color: 'accent' as const, icon: 'zap' as const },
  { id: 'c7', name: 'Health', color: 'secondary' as const, icon: 'heart-pulse' as const },
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
  const view: TransactionsView = {
    state: 'populated',
    transactions: TRANSACTIONS,
    total: 128,
    // The header's overline, straight off the read as of PET-72 rather than composed from a start
    // day and a clock - which is what lets this story draw the frame's own month in any month.
    period: { start: '2025-10-01', end: '2025-11-01', label: 'October 2025' },
  };

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
      <ShellStory currency="USD">
        <DeleteTransactionProvider remove={async () => ({ ok: true })}>
          {/* PET-32's, inside the delete provider because it consumes that context, and with a stub
            action for the identical reason: the real `updateTransaction` is `'use server'`, and
            Storybook would bundle it as a browser module and reach `cookies()` on Save changes.
            Resolving `ok` lets the whole edit flow be walked here - which is the only review it
            gets, since `build-storybook` never runs a story and the four `(app)` screens sit
            behind the session gate. Nothing is saved, and the row does not change because no
            server answered. */}
          <EditTransactionProvider update={async () => ({ ok: true })}>
            {/* `bg-base-200` is what the root layout paints `<body>`, and `px-*` stands in for the
              gutter the `(app)` shell owns, since neither wraps a story. */}
            <div className="bg-base-200 flex min-h-screen flex-col px-4 sm:px-6 lg:px-10">
              <TransactionsScreen
                view={view}
                filters={filters}
                categoryCount={CATEGORIES.length}
                filterBar={<TransactionFilterBar filters={filters} categories={CATEGORIES} />}
                table={
                  <TransactionsTable
                    currency="USD"
                    transactions={TRANSACTIONS}
                    categories={CATEGORIES}
                    filters={filters}
                  />
                }
              />
            </div>
          </EditTransactionProvider>
        </DeleteTransactionProvider>
      </ShellStory>
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
 * under that kebab, close on a click anywhere else and close on Escape. "Delete" closes the menu
 * and opens the confirmation over the page. In **Firefox**, where CSS anchor positioning is
 * unsupported, daisyUI's own fallback centres the menu behind a dimmed backdrop instead -
 * degraded and expected, not a bug to fix here.
 *
 * **"Edit" is live as of PET-32**, and it used to read dimmed here. It opens frame 11 prefilled
 * from that row, which makes this story the place to check three more things no suite can see:
 * that the focus trap keeps Tab inside the modal, that Escape closes it, and that with the
 * confirmation opened over it from "Delete transaction" only the top dialog is interactive - jsdom
 * has no top layer, so its suites can reach both. `Screens/11 Edit transaction` is where the box
 * itself is diffed against the frame.
 *
 * **Expect the Category picker to be disabled in both modals here, under "We couldn't load your
 * categories."** That is this story being honest rather than a defect: both providers read the
 * options from `app/api/categories/route.ts` when the modal opens, and Storybook serves no route
 * handlers at all, so the fetch fails and the designed unavailable state is what renders. It has
 * been true of "Add transaction" on this story since PET-31 and went unremarked until a browser walk
 * of PET-32 put a screenshot next to it. Every other field is still prefilled, which is the useful
 * half: the row carries its own values and only the *options* need the network. Review the populated
 * picker on `Screens/11 Edit transaction`, whose categories are a literal.
 *
 * **The merchant is a link as of PET-34, and the row around it still is not.** That is the last
 * dead affordance on this screen gone. Two things to check here that no suite can: hovering a
 * merchant underlines that cell alone rather than the row, and tabbing through reaches one link
 * per row rather than four. The link carries the bar's current filters in its query string, so
 * the detail page's breadcrumb can return you to this exact view - which the `Filtered` story
 * below is the better place to see. Following it in Storybook goes nowhere, because Storybook
 * routes nothing; `Screens/08 Transaction detail` is where the destination is diffed.
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
