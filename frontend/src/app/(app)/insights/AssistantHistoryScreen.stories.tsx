import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { AssistantSession } from '@/lib/assistant';

import { AssistantHistoryScreen } from './AssistantHistoryScreen';
import { InsightsTabs } from './InsightsTabs';

// The assistant's History view, in both of its states.
//
// The import above is type-only on purpose - see `AssistantChatScreen.stories.tsx` for the ESM
// reason, and for why `nextjs: { appDirectory: true }` is mandatory here too: every row is a
// `next/link` and so are both tabs.
//
// **No Figma frame behind this screen either**, so both strings in the empty state and the "Last
// active" caption are invented and join what A29 owes a designer.
//
// **`today` is passed rather than read from a clock**, so "Today" and "Yesterday" are stable in a
// story - the same reason `formatRelativeDate` takes it as a parameter at all.

const TODAY = '2026-08-11';

const SESSIONS: AssistantSession[] = [
  {
    id: '0198f3a1-2b4c-7d8e-9f01-234567890abc',
    title: 'How much did I spend on groceries last month?',
    lastMessageAt: '2026-08-11T09:04:00.000Z',
    createdAt: '2026-08-11T09:00:00.000Z',
  },
  {
    id: '0198f3a1-2b4c-7d8e-9f01-234567890abd',
    title: 'Which category am I closest to going over?',
    lastMessageAt: '2026-08-10T18:22:00.000Z',
    createdAt: '2026-08-10T18:20:00.000Z',
  },
  {
    id: '0198f3a1-2b4c-7d8e-9f01-234567890abe',
    title:
      'What did I spend at Konzum in the last three months, and is it going up or down over that time?',
    lastMessageAt: '2026-07-29T11:05:00.000Z',
    createdAt: '2026-07-29T11:00:00.000Z',
  },
];

const Frame = ({ sessions }: { sessions: AssistantSession[] }) => (
  <div className="bg-base-200 flex min-h-screen flex-col gap-6 p-10">
    <InsightsTabs active="history" />
    <AssistantHistoryScreen sessions={sessions} today={TODAY} />
  </div>
);

// See the chat stories for the `Meta<typeof Component>` shape and why `component` is declared.
const meta: Meta<typeof AssistantHistoryScreen> = {
  title: 'Screens/Assistant history',
  component: AssistantHistoryScreen,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true },
  },
};

export default meta;

type Story = StoryObj<typeof AssistantHistoryScreen>;

/**
 * The populated list. The third row's title is deliberately long: a title is derived from the
 * first message, so a wrapping one is ordinary rather than exotic.
 */
export const List: Story = {
  render: () => <Frame sessions={SESSIONS} />,
};

/** Nothing asked yet, which is every account until it is not. */
export const Empty: Story = {
  render: () => <Frame sessions={[]} />,
};
