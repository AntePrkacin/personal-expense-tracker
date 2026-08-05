import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { TransactionsView } from '@/lib/transactions';

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
// There is no populated story: the table is PET-29's, and a screen with an empty `<main>` below
// the tabs is not worth a frame to diff. The filter-bar slot is likewise left empty in both
// stories rather than filled with a stand-in - inventing three selects here would put
// undesigned controls in a screenshot, and the conditional itself is pinned in
// TransactionsScreen.test.tsx, which is the right place for it.

const meta: Meta<typeof TransactionsScreen> = {
  title: 'Screens/07 Transactions — Empty',
  component: TransactionsScreen,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
};

export default meta;

type Story = StoryObj<typeof TransactionsScreen>;

const EMPTY: TransactionsView = { state: 'empty', total: 0 };
const NO_RESULTS: TransactionsView = { state: 'noResults', total: 0 };

/** The column every state shares, supplying the height the empty card centres inside. */
function Frame({ view }: { view: TransactionsView }) {
  return (
    <div className="bg-surface-canvas flex h-screen flex-col">
      <TransactionsScreen view={view} />
    </div>
  );
}

/**
 * The frame as drawn (node 45:752), for an account with nothing in it.
 *
 * What to check against Figma: the badge reading 0, **no filter bar** between the tabs and the
 * card - the visible difference from frame 06 - and the card itself at node `45:1044`. On the
 * card: a 16px radius and **no shadow**, which makes it the only card in the app without one;
 * the 72px accent-soft circle; 16px from circle to heading and heading to copy, then 36px from
 * copy to button; and the copy wrapping at 440px into two lines.
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
 * other half. The bar is PET-29's, so there is nothing to show here yet.
 */
export const NoResults: Story = {
  render: () => <Frame view={NO_RESULTS} />,
};
