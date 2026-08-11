import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { AssistantConversation } from '@/lib/assistant';
import type { SendMessageResult } from '@/lib/sendAssistantMessage';

import { AssistantChatScreen } from './AssistantChatScreen';
import { InsightsTabs } from './InsightsTabs';

// The assistant's Chat view, in every state it has.
//
// The import above is type-only on purpose. Importing any *value* from Storybook breaks the story
// smoke tests with an opaque ESM error, because @storybook/nextjs-vite will not load under Jest
// and only the erased type import keeps this module loadable there. Same note as the other screen
// stories.
//
// **This screen has no Figma frame at all**, which makes it the fourth in the app after the verify
// failure screen, the error boundary and the History view beside it. **Every string on it is
// invented** - both tab labels, the composer's label and placeholder, the typing indicator, the
// disclosure, the truncation notice, the empty-state copy, the "conversation no longer available"
// line and each of the seven failure arms - and they all join what A29 owes a designer. These
// stories exist to put them in front of one at once, which is what the Add category modal's
// `WithMessages` story is for.
//
// **`nextjs: { appDirectory: true }` is mandatory, and no gate will tell you.** The tab bar is two
// `next/link`s, and `next/link` throws `invariant expected app router to be mounted` outside a
// router - but `build-storybook` bundles stories without running them and
// `screens.stories.test.tsx` renders this module with `next/navigation` mocked, so both gates stay
// green and only opening the story finds it.
//
// **The send is defaulted in the shared frame below**, so a story added later cannot forget one -
// the harness builds each story from `render` and never applies the meta's decorators, which is
// the trap `frontend/src/app/CLAUDE.md` records.
//
// **The sidebar and the page header are deliberately absent.** These stories are the content
// column below the header; `Components/Sidebar` is where the left column is reviewed.

const SESSION_ID = '0198f3a1-2b4c-7d8e-9f01-234567890abc';

const CONVERSATION: AssistantConversation = {
  id: SESSION_ID,
  title: 'How much did I spend on groceries last month?',
  lastMessageAt: '2026-08-11T09:04:00.000Z',
  createdAt: '2026-08-11T09:00:00.000Z',
  messages: [
    {
      id: 'm1',
      role: 'user',
      content: 'How much did I spend on groceries last month?',
      createdAt: '2026-08-11T09:00:00.000Z',
    },
    {
      id: 'm2',
      role: 'assistant',
      content:
        'You spent 312.40 EUR on Groceries in July 2026, against a 300.00 EUR cap - so 12.40 over.\n\nMost of it went to Konzum (218.90 EUR across 11 visits). The rest is spread over Lidl and Plodine.',
      createdAt: '2026-08-11T09:00:12.000Z',
    },
    {
      id: 'm3',
      role: 'user',
      content: 'Is that more than June?',
      createdAt: '2026-08-11T09:04:00.000Z',
    },
    {
      id: 'm4',
      role: 'assistant',
      content: 'Yes - June was 271.10 EUR, so July is 41.30 EUR higher.',
      createdAt: '2026-08-11T09:04:09.000Z',
    },
  ],
};

/** Never resolves, so the pending state stays on screen for review. */
const neverSettles = () => new Promise<SendMessageResult>(() => {});

const Frame = ({
  active = 'chat' as const,
  ...props
}: Partial<React.ComponentProps<typeof AssistantChatScreen>> & { active?: 'chat' | 'history' }) => (
  <div className="bg-base-200 flex min-h-screen flex-col gap-6 p-10">
    <InsightsTabs active={active} />
    <AssistantChatScreen
      conversation={null}
      send={async () => ({ ok: true, data: {} as never })}
      {...props}
    />
  </div>
);

// `Meta<typeof Component>` rather than a bare `satisfies Meta`, which is `CategoriesScreen`'s
// shape and the one that lets every story supply its own `render` without also restating `args`.
// The `component` is declared because `screens.stories.test.tsx` asserts each module names one,
// which is what stops a story module drifting into a file that renders something else entirely.
const meta: Meta<typeof AssistantChatScreen> = {
  title: 'Screens/Assistant chat',
  component: AssistantChatScreen,
  parameters: {
    layout: 'fullscreen',
    // Mandatory - see the header comment. The tab bar's links reach the router.
    nextjs: { appDirectory: true },
  },
};

export default meta;

type Story = StoryObj<typeof AssistantChatScreen>;

/** Before the first message: the empty state, the composer and the disclosure. */
export const Empty: Story = {
  render: () => <Frame />,
};

/** A conversation in progress, which is what the screen looks like most of the time. */
export const Conversation: Story = {
  render: () => <Frame conversation={CONVERSATION} />,
};

/**
 * A turn in flight: the typing indicator up, the field disabled and Send replaced by Stop.
 *
 * The send never settles, so this is the one story where the abort affordance can be looked at.
 */
export const Pending: Story = {
  render: () => <Frame conversation={CONVERSATION} send={neverSettles} />,
};

/** The line a `?session=` naming nothing renders, instead of a 404 page. */
export const MissingSession: Story = {
  render: () => <Frame missingSession />,
};

/**
 * A failure, so the error treatment and the restored draft can be reviewed together.
 *
 * `timedOut` rather than `failed`, because it is the arm whose copy is easiest to get wrong:
 * retrying the identical question is the right next move, and no other arm says that.
 */
export const Failure: Story = {
  render: () => (
    <Frame
      conversation={CONVERSATION}
      send={async () => ({ ok: false, reason: 'timedOut' as const })}
    />
  ),
};

/**
 * The unconfigured deployment: `GEMINI_API_KEY` unset, answering 503.
 *
 * Its copy must not blame the message, because nothing the user does fixes it.
 */
export const Unconfigured: Story = {
  render: () => <Frame send={async () => ({ ok: false, reason: 'unavailable' as const })} />,
};
