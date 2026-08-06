import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { TransactionsView } from '@/lib/transactions';

import { AddTransactionProvider } from '../AddTransactionProvider';
import { TransactionsScreen } from './TransactionsScreen';

// The import above is type-only on purpose. Importing any *value* from Storybook breaks the
// story smoke tests with an opaque ESM error, because @storybook/nextjs-vite will not load
// under Jest and only the erased type import keeps this module loadable there. Same note as
// the other screen stories.
//
// **The screen takes its whole state as one prop**, which is the payoff of `page.tsx` owning
// the read: this module imports nothing server-only, so there is no `next/headers` in the
// browser bundle and no request scope to fake. The three states are three values.
//
// **The sidebar is deliberately absent.** These stories are the content column, which is what
// `(app)/layout.tsx` puts beside `SidebarNav` - and `shell.stories.test.tsx` records that
// SidebarNav must not get a story at all, because its only job is reading a pathname there is
// no router for under Jest. `Components/Sidebar` is where the left column is reviewed. So diff
// these against node `45:754` (frame 07's "Main") rather than against the whole 1440px frame.
//
// **The height wrapper lives inside each `render` rather than in a decorator**, because the
// smoke harness never applies `meta.decorators` - a decorator here works in Storybook and
// throws under Jest. It is also load-bearing rather than cosmetic: the empty card is `flex-1`,
// so without a constrained column it collapses to its content's height and the vertical
// centring frame 07 draws cannot be seen at all. The real app gets that column from the root
// layout's `min-h-full flex flex-col` plus the shell's own `flex-1`.
//
// **The populated frame is `TransactionsList.stories.tsx`**, a separate module because a
// module carries one title and this one is frame 07's. The filter-bar slot stays empty in both
// stories here rather than being filled with a stand-in: the empty state must not draw one at
// all, and the no-results state's real bar needs a category list this module has no read for.
//
// **`nextjs: { appDirectory: true }` is mandatory as of PET-29, and no gate will tell you.**
// The header's search field reaches `useRouter`, which throws `invariant expected app router
// to be mounted` outside one - but `build-storybook` bundles stories without running them and
// `screens.stories.test.tsx` renders this module with `next/navigation` already mocked, so
// both gates stay green and only opening the story finds it. This parameter is what makes
// @storybook/nextjs-vite mount its mock router.

const meta: Meta<typeof TransactionsScreen> = {
  title: 'Screens/07 Transactions — Empty',
  component: TransactionsScreen,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen', nextjs: { appDirectory: true } },
};

export default meta;

type Story = StoryObj<typeof TransactionsScreen>;

const EMPTY: TransactionsView = { state: 'empty', total: 0 };
const NO_RESULTS: TransactionsView = { state: 'noResults', total: 0 };

/**
 * The column every state shares, supplying the height the empty card centres inside.
 *
 * **The provider is inside this frame rather than in a decorator**, for the reason the header
 * note gives about `meta.decorators` - the smoke harness never applies them, so a decorator
 * works in Storybook and throws under Jest. Both of this screen's "Add transaction" buttons
 * call `useAddTransaction`, which throws outside a provider by design, so it has to be here.
 *
 * A real provider rather than a stub, which means both buttons genuinely open modal 09 in
 * Storybook. That is worth having: it is the only place the two triggers on one page can be
 * checked against the single-dialog rule by hand.
 */
function Frame({ view }: { view: TransactionsView }) {
  return (
    <AddTransactionProvider>
      {/* `bg-base-200` is what the root layout paints `<body>`, and `px-*` stands in for the
          gutter the `(app)` shell owns, since neither wraps a story. */}
      <div className="bg-base-200 flex h-screen flex-col px-4 sm:px-6 lg:px-10">
        <TransactionsScreen view={view} filters={{}} />
      </div>
    </AddTransactionProvider>
  );
}

/**
 * The frame as drawn (node 45:752), for an account with nothing in it.
 *
 * What to check: the badge reading 0, **no filter bar** between the tabs and the card - the
 * visible difference from frame 06 - and the card itself (node `45:1044`), which is
 * `components/EmptyState`'s stock daisyUI box. Its radius, its shadow and its type come from
 * the theme as of PET-57, so the frame's own 16px-and-no-shadow pair no longer binds; what
 * still should hold is the circle, the heading, the copy wrapping into two lines, and the
 * button, all vertically centred in the remaining height.
 *
 * The copy keeps Figma's UK "categorised" (A30).
 */
export const Empty: Story = {
  render: () => <Frame view={EMPTY} />,
};

/**
 * A search or filter that matched nothing, which no frame draws (A15).
 *
 * The card is identical and the two strings are not, which is this ticket's one amendment to
 * A15 and to AC5: both said to reuse frame 07's message verbatim, and that message tells a user
 * with a full history to log their first expense. Compare the heading and body against the
 * story above; everything else should be pixel-identical.
 *
 * In the running app this state also keeps the search field and the filter bar, which is A15's
 * other half. The field is here and real; the bar needs a category list this module does not
 * read, so `Screens/06 Transactions — List` is where it is diffed.
 */
export const NoResults: Story = {
  render: () => <Frame view={NO_RESULTS} />,
};
