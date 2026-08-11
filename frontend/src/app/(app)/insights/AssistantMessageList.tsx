import { Sparkle } from 'lucide-react';

import type { AssistantMessage } from '@/lib/assistant';

import { AssistantMarkdown } from './AssistantMarkdown';
import { MessageTime } from './MessageTime';

// The conversation itself: daisyUI `chat` rows, one per stored message.
//
// **`role="log"` with `aria-live="polite"`**, which is the role for a running record that grows at
// the end - a chat is the ARIA spec's own example of one. Polite rather than assertive: a reply
// arriving must not interrupt whatever the reader is on.
//
// **Each turn is labelled in text rather than by colour or side alone**, which is the rule the
// trend chart's `sr-only` list settled: `chat-start` versus `chat-end` and the bubble's tint are
// both invisible to a screen reader, and colour alone is a WCAG failure besides. The `chat-header`
// carries "You" or "Assistant" as real text on every row.
//
// **A Server Component.** It renders markup from props and holds nothing - the boundary is the
// screen above it, which is the smallest-wrapper rule `SidebarNav` and `TrendChart` follow. (It is
// only ever rendered from inside a client component today, so this buys correctness of structure
// rather than a bundle saving.)
//
// **No avatars.** The `chat-image` part is optional, and there is no photograph of either
// participant to put in one - `ui/Sidebar`'s initials tile is the account's own mark and repeating
// it on every row would be noise on a screen with exactly two speakers, both named in text.
//
// **The assistant's own turns render their markdown as of PET-76**, through `AssistantMarkdown`
// beside this file. The model was already answering in markdown and this bubble printed the
// asterisks; that file carries why it is rendered to React elements and never to HTML.

// **"AI Assistant" now names two things on one screen** - the page's `h1` and every assistant row -
// which is a consequence of PET-76 renaming both rather than an accident. Nothing breaks, because
// no tree holds both: `pages.test.tsx` renders the page with an empty chat and
// `AssistantChatScreen.test.tsx` renders the screen with no header. It does make
// `getByText('AI Assistant')` a trap, so the assertions on either string are by role.
const ROLE_LABEL: Record<AssistantMessage['role'], string> = {
  user: 'You',
  assistant: 'AI Assistant',
};

/**
 * Whole class strings per role, never interpolated.
 *
 * Tailwind's scanner reads source as raw text, so a `chat-${role}` compiles to nothing with no
 * build error. `ui/categoryColour.ts` is the pattern. (The daisyUI Blueprint MCP's quality
 * inspector reports this convention as "dynamic classes"; it is the opposite of one, and
 * `docs/agents/claude-tooling.md` records the false positive.)
 */
const ROW_CLASS: Record<AssistantMessage['role'], string> = {
  user: 'chat chat-end',
  assistant: 'chat chat-start',
};

// **Adjudicated and rejected: the Blueprint quality inspector reports `chat-header` here as an
// "orphan part" whose root `chat` class is missing.** It is not - the row above it carries
// `ROW_CLASS[message.role]`, which is `'chat chat-end'` or `'chat chat-start'`, both whole
// literals. The inspector cannot follow a `Record` lookup, which is the same blind spot that makes
// it call this repo's mandated whole-class-strings convention "dynamic classes". Because it is a
// finding a reader cannot dismiss by eye either, `AssistantChatScreen.test.tsx` pins that the
// rendered row really carries `chat` - the daisyUI-state exception to this repo's
// assert-behaviour-not-classes rule, since here the class *is* the structure.

const BUBBLE_CLASS: Record<AssistantMessage['role'], string> = {
  // `chat-bubble-primary` marks the user's own turn, which is identity rather than decoration -
  // the one case the component's own rules sanction a colour modifier for.
  //
  // **It keeps `whitespace-pre-wrap` where the assistant's drops it.** A typed message stays
  // literal: somebody who types `**hi**` should see `**hi**` back rather than watch their own
  // asterisks be interpreted, and their newlines are theirs.
  user: 'chat-bubble chat-bubble-primary whitespace-pre-wrap',
  // The assistant's stays the default surface, and **drops `whitespace-pre-wrap`** as of PET-76:
  // that class preserved the model's paragraph breaks while nothing rendered its markup, and it
  // fights block-level markup once something does - every `<p>`'s own newline becomes a blank line
  // on top of the margin between them. `AssistantMarkdown` owns the rhythm now.
  assistant: 'chat-bubble',
};

export function AssistantMessageList({ messages }: { messages: readonly AssistantMessage[] }) {
  return (
    <div role="log" aria-live="polite" aria-label="Conversation" className="flex flex-col">
      {messages.map((message) => (
        <div key={message.id} className={ROW_CLASS[message.role]}>
          {/* `text-sm` rather than the `text-xs` this shipped at, with the glyph moved from
              `size-3` to `size-4` so it scales with the label instead of shrinking beside it -
              PET-76, where a walk found the row labels too small to read as the names of the two
              speakers. The tone stays `base-content/60`, which is a **composited** alpha: whether
              14px at 60% clears 4.5:1 over the canvas is a measurement rather than a deduction, so
              it is read off a painted pixel in the walk.

              **`mb-1` because `.chat` declares no row gap at all**, which is what made the larger
              label read as crowding rather than as a heading. That class is a grid with
              `column-gap: .75rem` and `grid-auto-rows: min-content` and nothing between its rows -
              the header is row 1 and the bubble row 2 - so at `text-xs` the label merely sat close
              to the bubble and at `text-sm` it sat on it. The margin goes on the header rather than
              a `row-gap` on the row, because the row's other gap belongs to `chat-footer`, which
              this list does not draw and should not be spaced for in advance.

              **4px is chosen against the 8px between turns rather than as a bare minimum.** `.chat`
              carries `padding-block: .25rem`, so consecutive rows sit 8px apart; half of that binds
              a label to its own bubble more tightly than the turns are bound to each other, which
              is the grouping that makes it read as the name of the message under it. */}
          <div className="chat-header text-base-content/60 mb-1 flex items-center gap-1 text-sm">
            {message.role === 'assistant' ? (
              <Sparkle className="size-4" aria-hidden="true" />
            ) : null}
            {ROLE_LABEL[message.role]}

            {/* **The timestamp, PET-76, and the separator is `aria-hidden` while the time is not.**
                A screen reader reading "You bullet Today 2:32 PM" gets a word that is not in the
                sentence; the bullet is decoration between two facts, exactly like the step
                indicator's dots and `ui/Input`'s `$` prefix. The time itself is content and is
                announced, because when a message was sent is the whole point of adding it.

                **The time is its own client component and that is a correctness requirement, not a
                boundary preference.** `MessageTime.tsx` carries the account in full: a
                locale-formatted time server-rendered in the host's zone and hydrated in the
                reader's is two different strings for one instant, and a walk measured
                `suppressHydrationWarning` keeping the **server's** - so a Vercel deployment would
                have shown every reader a time off by their own UTC offset, silently. It renders the
                text only after hydration.

                `formatMessageTimestamp` gives "Today, 2:32 PM" and its own docblock carries why the
                day half goes through `calendarDateOfInstant` first: `createdAt` is an **instant**,
                and taking a calendar date out of one with `slice(0, 10)` reads it in UTC while
                "today" is the host's zone - the defect a review of PET-73 found in the History
                caption, which would have been reintroduced here verbatim. */}
            <span aria-hidden="true">•</span>
            <MessageTime instant={message.createdAt} />
          </div>
          <div className={BUBBLE_CLASS[message.role]}>
            {message.role === 'assistant' ? (
              <AssistantMarkdown content={message.content} />
            ) : (
              message.content
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
