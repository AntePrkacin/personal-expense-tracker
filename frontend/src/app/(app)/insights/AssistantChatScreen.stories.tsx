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
      // **Markdown, because that is what the model actually answers with (PET-76).** These strings
      // were plain prose while the prompt forbade markup and the bubble printed whatever arrived;
      // both halves of that changed, so a story in plain prose would review a state the screen no
      // longer reaches. `Markdown` below is the story that exercises the whole map.
      content:
        'You spent **312.40 EUR** on Groceries in July 2026, against a 300.00 EUR cap - so **12.40 over**.\n\nMost of it went to Konzum (218.90 EUR across 11 visits). The rest is spread over Lidl and Plodine.',
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
      content: 'Yes - June was 271.10 EUR, so **41.30 EUR** lower than July.',
      createdAt: '2026-08-11T09:04:09.000Z',
    },
  ],
};

/**
 * Every tag `AssistantMarkdown`'s map covers, in one reply.
 *
 * This is the review surface for that map, and it is a story rather than a browser check because
 * the whole point is seeing fifteen treatments beside each other on one screen. Four things in it
 * are here on purpose rather than for variety. The **table** is the case that carries a structural
 * requirement (it has to scroll inside its bubble rather than widen the page), and it is
 * deliberately wide enough to do so at a narrow viewport. The **raw HTML** line has to render as
 * visible characters: there is no `rehype-raw`, so a tag is escaped rather than parsed, and seeing
 * that is the only review of it. The **long link** exercises a treatment nothing in this app
 * expects the model to produce. And the user's own turn types **asterisks**, which must come back
 * unrendered - the one bubble that is still literal.
 */
const MARKDOWN: AssistantConversation = {
  id: '0198f3a1-2b4c-7d8e-9f01-234567890abd',
  title: 'Break my July down by category',
  lastMessageAt: '2026-08-11T09:10:00.000Z',
  createdAt: '2026-08-11T09:10:00.000Z',
  messages: [
    {
      id: 'k1',
      role: 'user',
      content: 'Break my July down by category, and what does **over** mean here?',
      createdAt: '2026-08-11T09:10:00.000Z',
    },
    {
      id: 'k2',
      role: 'assistant',
      content: [
        '### July 2026',
        '',
        'You spent **1,904.30 EUR** of a 2,000.00 EUR budget, so 95.70 EUR is left. "Over" means _above the cap you set for that category_, not above the budget.',
        '',
        '| Category | Spent | Cap | Over |',
        '| --- | --- | --- | --- |',
        '| Groceries | 312.40 | 300.00 | 12.40 |',
        '| Transport | 188.00 | 200.00 | — |',
        '| Eating out | 402.15 | 250.00 | 152.15 |',
        '| Utilities | 143.75 | none | — |',
        '',
        'Two categories are over:',
        '',
        '- **Eating out**, by 152.15 EUR - the largest single overage',
        '- **Groceries**, by 12.40 EUR',
        '',
        'If you want to bring that back, the order to look at is:',
        '',
        '1. Eating out, where 11 of 23 transactions are under 15.00 EUR',
        '2. Groceries, which is within 5% of its cap',
        '',
        'You can change a cap on the Transactions → Categories tab; I cannot edit anything myself.',
        '',
        '> Caps are monthly, so an overage does not carry into August.',
        '',
        'A note on one row: `Utilities` has no cap set, which is why its Over column is empty rather than zero. Raw HTML in a merchant name is shown as written, like <b>this</b>, and never rendered.',
      ].join('\n'),
      createdAt: '2026-08-11T09:10:14.000Z',
    },
  ],
};

/** Never resolves, so the pending state stays on screen for review. */
const neverSettles = () => new Promise<SendMessageResult>(() => {});

/**
 * What the default `send` answers, and it is a real shape rather than a cast (PET-76).
 *
 * This was `{} as never`, which typechecks and **cannot survive an actual submit**: the success
 * path reads `data.message` and `data.reply` off it, appends two `undefined`s to the list and throws
 * on the first `message.id`. So pressing Send in any story unmounted the screen - found by driving
 * the `Empty` story in this ticket's browser walk, and invisible to every gate, because
 * `build-storybook` bundles stories without running one and the story harness under Jest renders
 * them without interacting.
 */
const REPLY: SendMessageResult = {
  ok: true,
  data: {
    sessionId: SESSION_ID,
    title: 'How much did I spend on groceries last month?',
    message: {
      id: 'sent',
      role: 'user',
      content: 'How much did I spend on groceries last month?',
      createdAt: '2026-08-11T09:20:00.000Z',
    },
    reply: {
      id: 'answered',
      role: 'assistant',
      content: 'You spent **312.40 EUR** on Groceries in July 2026.',
      createdAt: '2026-08-11T09:20:11.000Z',
    },
    truncation: null,
  },
};

const Frame = ({
  active = 'chat' as const,
  ...props
}: Partial<React.ComponentProps<typeof AssistantChatScreen>> & { active?: 'chat' | 'history' }) => (
  <div className="bg-base-200 flex min-h-screen flex-col gap-6 p-10">
    <InsightsTabs active={active} />
    <AssistantChatScreen conversation={null} send={async () => REPLY} {...props} />
  </div>
);

/**
 * Types a question and presses Send, so a story can show a state that only a turn produces.
 *
 * **`pending` is not a prop and must not become one**: it is the screen's own state, set by
 * submitting, and a prop that forced it would be a second way to reach a state - the shape
 * `TransactionsTable`'s unreachable `pending` prop was taken back out for. So the story drives the
 * real control instead, which is also what makes it honest for the designer review these stories
 * exist for: opening `Pending` shows the disabled composer, the Stop button and the typing dots,
 * where before it showed an ordinary empty composer under a name claiming otherwise.
 *
 * **Plain DOM, and no import from `storybook/test`.** `ui/Button.stories.tsx` records why: importing
 * any *value* from Storybook breaks the story smoke tests with an opaque ESM error, since
 * `@storybook/nextjs-vite` will not load under Jest. `play` is a property rather than an import, so
 * this costs nothing there - and those suites never run it, they only render.
 *
 * The native value setter is what makes React see the change: assigning `field.value` directly on a
 * controlled textarea is overwritten on the next render, so the descriptor's setter is called and an
 * `input` event dispatched, which is the event React's `onChange` is really listening for.
 */
const askSomething = async (canvasElement: HTMLElement) => {
  const field = canvasElement.querySelector<HTMLTextAreaElement>('#assistant-message');
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;

  if (!field || !setValue) {
    return;
  }

  setValue.call(field, 'How much did I spend on groceries last month?');
  field.dispatchEvent(new Event('input', { bubbles: true }));

  // A microtask, so React has committed the enabled button before it is pressed.
  await new Promise((resolve) => setTimeout(resolve, 0));
  canvasElement.querySelector<HTMLButtonElement>('button[aria-label="Send"]')?.click();
};

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
 * Every markdown treatment in one reply - see `MARKDOWN` above for what each one is doing there.
 *
 * The cheapest review of `AssistantMarkdown`'s map, and the only one that does not need a session.
 */
export const Markdown: Story = {
  render: () => <Frame conversation={MARKDOWN} />,
};

/**
 * A turn in flight: the typing indicator up, the field disabled and Send replaced by Stop.
 *
 * The send never settles, so this is the one story where the abort affordance can be looked at.
 *
 * **It only reaches that state because `play` submits a question, and until PET-76 it did not.**
 * `pending` is the screen's own state rather than a prop, so a story that merely supplied a
 * never-resolving `send` rendered an ordinary idle composer under a name claiming a turn was in
 * flight - which meant the three things this story is the review surface for (the **disabled**
 * composer on its card, the Stop button, the typing dots) could not be seen in it at all. Found by
 * driving it in this ticket's browser walk.
 */
export const Pending: Story = {
  render: () => <Frame conversation={CONVERSATION} send={neverSettles} />,
  play: ({ canvasElement }) => askSomething(canvasElement),
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
