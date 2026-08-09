import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { InsightSet } from '@/lib/insights';

import { AddTransactionProvider } from '../AddTransactionProvider';
import { InsightsScreen } from './InsightsScreen';

// Frames 14 (ready), 15 (generating) and 16 (empty), node 38:495.
//
// The import above is type-only on purpose. Importing any *value* from Storybook breaks the
// story smoke tests with an opaque ESM error, because @storybook/nextjs-vite will not load
// under Jest and only the erased type import keeps this module loadable there. Same note as
// the other screen stories.
//
// **The screen takes its whole state as one prop**, which is the payoff of `page.tsx` owning
// the read: this module imports nothing server-only, so there is no `next/headers` in the
// browser bundle and no request scope to fake. Six stories are six values.
//
// **The sidebar is deliberately absent**, as on every other screen story: these are the content
// column, so diff them against the frame's "Main" rather than against the whole 1440px frame.
// `Components/Sidebar` is where the left column is reviewed.
//
// **The height wrapper and the provider both live inside each `render` rather than in a
// decorator**, because the smoke harness never applies `meta.decorators` - a decorator here
// works in Storybook and throws under Jest. The provider is load-bearing rather than tidy: the
// empty state's "Add your first transaction" calls `useAddTransaction`, which throws outside
// one by design.
//
// **`nextjs: { appDirectory: true }` is mandatory and no gate will tell you.** The screen is a
// client component whose provider subtree reaches `useRouter`, which throws `invariant expected
// app router to be mounted` outside one - but `build-storybook` bundles stories without running
// them and `screens.stories.test.tsx` renders this module with `next/navigation` already
// mocked, so both gates stay green and only opening the story finds it.
//
// **The Regenerate button really fires the Server Action in Storybook, and there is no backend
// behind it**, so the failure path is what a click here exercises: the previous set stays on
// screen and the button re-enables, which is A26's undesigned failure being survivable rather
// than a bug in the story. The generating frames below are the states to diff, reached by
// passing them rather than by clicking into them.

const meta: Meta<typeof InsightsScreen> = {
  title: 'Screens/14 AI Insights',
  component: InsightsScreen,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen', nextjs: { appDirectory: true } },
};

export default meta;

type Story = StoryObj<typeof InsightsScreen>;

/** INS-3's first two cards, the two rules that survive PET-42-43-44's cut. */
const CARDS: InsightSet['insights'] = [
  {
    tone: 'warning',
    title: 'Dining out is over budget',
    body: "$312 of $300 - $12 over. It's your only category above its limit this month.",
  },
  {
    tone: 'positive',
    title: 'Transport is down 22%',
    body: 'You spent $63 less than September - fewer rideshares, more walking. Keep it up.',
  },
];

const READY: InsightSet = {
  state: 'ready',
  monthLabel: 'October 2025',
  summary: {
    headline: "You're on track to finish October about $20 under budget.",
    body: "You've spent $1,240 of $2,000 with 8 days left. Dining out is your only category over its limit - everything else is comfortably within range.",
  },
  insights: CARDS,
  generatedAt: '2025-10-08T09:00:00.000Z',
};

const EMPTY: InsightSet = {
  state: 'empty',
  monthLabel: null,
  summary: null,
  insights: [],
  generatedAt: null,
};

function Frame({ set }: { set: InsightSet }) {
  return (
    <AddTransactionProvider>
      {/* `bg-base-200` is what the root layout paints `<body>`, and `px-*` stands in for the
          gutter the `(app)` shell owns, since neither wraps a story. `h-screen` supplies the
          column the empty card's `flex-1` centres inside. */}
      <div className="bg-base-200 flex h-screen flex-col px-4 sm:px-6 lg:px-10">
        <InsightsScreen set={set} overline="October 2025" />
      </div>
    </AddTransactionProvider>
  );
}

/**
 * Frame 14 as drawn, at the maximum two cards.
 *
 * What to check: the dark banner (`bg-neutral`, the always-dark slot rather than a `dark:`
 * variant), its `✦ OCTOBER 2025 SUMMARY` overline, and the two cards side by side above `md`.
 * The tones are the ones that invert against daisyUI's names - the over-budget card must be
 * **red** (`error`) and not amber.
 *
 * **The frame draws four cards in a 2x2 and only two are reachable now.** PET-42-43-44 cut the
 * projection card as duplicating the banner's own headline and the recurring-merchant card as
 * unable to separate a subscription from a habit, so INS-3's third and fourth entries describe
 * content the generator no longer produces. Read the frame as amended.
 */
export const Ready: Story = {
  render: () => <Frame set={READY} />,
};

/**
 * One card, which is what most accounts with a cap actually see.
 *
 * The single card fills its row rather than sitting in a half-width box beside a hole.
 */
export const OneCard: Story = {
  render: () => <Frame set={{ ...READY, insights: [CARDS[0]] }} />,
};

/**
 * A ready set with no cards at all, which is the steady state rather than an edge case.
 *
 * Over-cap can only fire for a category that has a cap, and month-over-month needs a previous
 * month - so a first-month user who set no caps sees the banner standing alone, indefinitely.
 * What to check: **no empty container and no placeholder** under the banner, just the banner.
 */
export const NoCards: Story = {
  render: () => <Frame set={{ ...READY, insights: [] }} />,
};

/**
 * Frame 15, mid-run, carrying two skeleton cards.
 *
 * What to check: the `✦ ANALYZING YOUR SPENDING...` overline with three bars where the headline
 * and body were, a skeleton card per card the last-good set had, and the header button reading
 * "Generating..." and disabled. The skeleton count comes from the previous set rather than
 * from INS-5's literal four, which stopped describing anything reachable after the cut.
 *
 * The poll runs in the story and every tick 404s against Storybook's own origin, which is
 * harmless: the state holds, the skeletons stay, and that is exactly the frame to diff.
 */
export const Generating: Story = {
  render: () => <Frame set={{ ...READY, state: 'generating' }} />,
};

/**
 * The same frame for an account whose last set carried no cards.
 *
 * No skeleton cards at all, rather than promising cards that are not coming.
 */
export const GeneratingNoCards: Story = {
  render: () => <Frame set={{ ...READY, state: 'generating', insights: [] }} />,
};

/**
 * Frame 16, an account that has never logged an expense (node 39:665, INS-7).
 *
 * What to check: `components/EmptyState`'s box centred in the remaining height, the single
 * four-pointed `Sparkle` rather than `Sparkles`, the US "analyze" the design draws against
 * frame 07's UK "categorised" (A30), and **no Regenerate button in the header at all**.
 *
 * As of PET-42-43-44 this state is literally what its copy claims: every transaction write
 * regenerates the set backend-side, so an account with expenses can never reach this card.
 * The button really opens modal 09.
 */
export const Empty: Story = {
  render: () => <Frame set={EMPTY} />,
};
