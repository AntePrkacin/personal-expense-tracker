# PET-76 — AI Assistant UI/UX fixups

Branch `fix/PET-76-ai-assistant-ui-ux-fixups`, cut from `main` at `f787c82`. Jira: [PET-76](https://decode.atlassian.net/browse/PET-76), parented to PET-2 (App shell, navigation and design system).

## Context

Every screen in this app is built, and PET-73 shipped the last of them a day ago. What this ticket
collects is the class of defect that only appears once somebody uses the finished screens with real
data: a disabled field that vanishes into the page, a button with no visible box, an animation too
slow to read as activity, a model answering in markup nothing renders. None of it is a missing
feature and none of it is caught by a gate — every item below passes `build`, `lint` and every Jest
suite today.

**The scope is the AI Assistant and nothing else** — `/insights`, `/insights/history`, the composer,
the chat rows and the sidebar entry that reaches them. Defects found on other screens are their own
tickets rather than later rounds on this one, so this plan is complete rather than a first
instalment.

Two facts worth having up front, because five of the eight items below descend from them:

- **The page canvas is `bg-base-200`** (`frontend/src/app/layout.tsx:50`), and `base-200` is also
  what daisyUI paints its two neutral surfaces: a disabled `textarea` (fill _and_ border) and a
  plain `.btn`. daisyUI assumes both sit on a `base-100` card. The assistant composer does not — it
  floats directly on the canvas, unlike every other form in this app.
- **`loading-*` animations are not CSS.** They are SMIL `<animate>` elements inside a
  `mask-image` data-URI SVG, so no class, theme variable or `animation-duration` reaches them.

Neither is written down anywhere yet, and both belong in `frontend/CLAUDE.md`'s "Where daisyUI and
Tailwind fight" list, which is the home for exactly this shape of defect: a class that is present in
the markup and paints the wrong thing, with every gate green.

## The eight fixups

All on `/insights`, `/insights/history` and the sidebar. Frontend throughout, with one backend
prompt change.

### 1. The composer's send control moves inside the box

`frontend/src/app/(app)/insights/AssistantComposer.tsx:88-123` is a `flex items-end` row: an `h-24`
textarea beside a labelled `btn btn-primary` "Send" that swaps for a labelled `btn btn-error` "Stop"
while a turn is in flight. Both become glyph-only circular buttons positioned in the box's
bottom-right corner, the messaging-app arrangement.

- The row becomes a `relative` wrapper; the textarea takes trailing padding so text cannot run under
  the button, and `resize-none`, because the user-agent resize handle otherwise sits underneath it.
- Send: `btn btn-circle btn-primary`, `type="submit"` kept — that is what makes Enter work. Stop:
  `btn btn-circle btn-error`, `type="button"`. Exactly one renders, as today.
- Glyph is lucide's `SendHorizontal` rather than the `Send` currently imported, being the closer
  mark. It is an **outline** plane, not the solid one in the reference: `frontend/CLAUDE.md` makes
  lucide the only glyph source and it is stroke-based throughout, so a filled mark would mean a
  hand-traced SVG, which the same file forbids. `Square` stays for Stop.
- Each carries `aria-label="Send"` / `"Stop"`, so the accessible names are unchanged and every
  existing assertion in `AssistantChatScreen.test.tsx` keeps passing.

The visible `<label>` and the disclosure line stay.

### 2. Assistant replies render their markdown

Gemini answers in markdown and the bubble prints it literally — `**July 2026**` reaches the screen
as asterisks. `frontend/src/app/(app)/insights/AssistantMessageList.tsx:72` renders
`{message.content}` as text under `whitespace-pre-wrap`.

Rendered with **`react-markdown` + `remark-gfm`**, the app's seventh and eighth runtime
dependencies. To React elements, never through `dangerouslySetInnerHTML` and with no `rehype-raw`:
the reply contains the user's own merchant names and is not trusted input, so raw HTML stays
escaped.

- New route-local `AssistantMarkdown.tsx` beside the list, holding react-markdown's `components`
  map with **whole Tailwind class literals per tag** — the `ui/categoryColour.ts` convention, since
  the scanner reads source as raw text. Route-local rather than in `components/`, per that folder's
  rule of three: one consumer.
- **Not `@tailwindcss/typography`.** That is a further dependency, and `globals.css` is closed to
  anything but the theme blocks, the font tokens, the field-focus rules and the `-orange` modifiers,
  so it could not hold the rules either.
- **Tables get an `overflow-x-auto` wrapper.** Permitting tables puts wide content inside a
  `chat-bubble`, and it must scroll inside the bubble rather than push the chat column sideways.
- `BUBBLE_CLASS.assistant` drops `whitespace-pre-wrap`, which fights block-level markup.
  `BUBBLE_CLASS.user` **keeps** it: a typed message stays literal, or someone typing `**hi**` sees
  it bolded back at them.

And the prompt stops forbidding it. `backend/src/assistant/assistant-context.builder.ts:210`
currently reads _"Answer in plain prose. Do not use markdown tables or headings; short paragraphs
and, at most, simple dashed lists."_ The whole sentence is replaced by one permitting markdown and
saying it will be rendered. `assistant-context.builder.spec.ts` pins the prompt with literals and
changes with it. No DTO moves, so **no `api:sync`**.

Two risks to handle rather than discover: react-markdown ships ESM-only, so
`frontend/jest.config.ts` may need its `transformIgnorePatterns` widened; and the dependency chain
is real, so the built-chunk delta gets measured and recorded in the PR the way PET-22 recorded
Recharts' +343KB.

### 3. The composer sits in a card, so its disabled state is visible

The disabled textarea is `base-200` fill on a `base-200` canvas with a `base-200` border — the box
disappears, which is the defect. Fixed at the cause: the composer's `<form>` content moves into a
`card bg-base-100` (`card-body`), where every other form in this app lives. Enabled then reads as a
bordered field on white and disabled reads as a grey plate, both for free, and the label and
disclosure stop floating on the canvas.

Deliberately **not** a `disabled:bg-base-100` override: that lands at equal specificity against
daisyUI's own rule and is resolved by emission order rather than by the attribute, which is the
fight `frontend/CLAUDE.md` documents losing three separate times.

### 4. The typing dots become tunable

`TypingIndicator.tsx:28`'s `loading loading-dots` runs `<animate dur='3s'>` with only the first 57%
of its timeline in motion, so each dot hops once and then rests for roughly 1.3 seconds. It cannot
be sped up from CSS at all.

Replaced with three `<span>`s on Tailwind's own `animate-bounce`, staggered by negative
`[animation-delay]` and with the duration set to a literal — real CSS animations, tunable. Plus
`motion-reduce:animate-none`, which costs nothing here because the dots are already `aria-hidden`
and the state is carried by the sentence beside them. Everything that makes the component correct
stays: the region is mounted from the first render and only its text changes, and its suite asserts
the region's **text**.

### 5. "New chat" gets a visible button

`NewChat.tsx:101` passes `variant="secondary"`, which `ui/Button.tsx:29` maps to bare `btn` — a
`base-200` button on the `base-200` canvas. It becomes `variant="primary"`, matching
`AddTransactionButton`'s default, which is what the product owner asked it to look like.

Worth a note in the plan's own record: the same defect silently applies to any other `secondary`
button placed directly on the canvas. The retired "Regenerate" was one. Nothing else on a canvas
today, so this is a note rather than a sweep.

### 6. Both assistant headers lose the date

`insights/page.tsx:69-70` and `insights/history/page.tsx:34` both draw the period as the overline
over a title of "Assistant". They become overline **"Your very own personal"** over title
**"AI Assistant"**, as fixed literals.

That deletes `readPeriods()` from both routes — one fewer request per view on each — and leaves
`currentPeriod` in `frontend/src/lib/periods.ts` with zero callers, so that function and its tests
go with it. `readPeriods` itself stays; the dashboard and the categories tab use it.

**The one hazard here is static rendering.** `insights/page.tsx`'s own comment says the cookie read
behind `readPeriods()` is what opts the route out of prerendering. `(app)/layout.tsx`'s
`requireProfile()` covers it, which is why that layout's `force-dynamic` was deleted — but this is
precisely the class of bug that froze a month name at build time once before, so `npm run build`
output is checked for both routes still reporting dynamic rather than static.

### 7. The sidebar swaps its heading and its label

`ui/Sidebar.tsx:97-98`: heading `'ASSISTANT'` → `'INSIGHTS'`, item label `'Insights'` →
`'AI Assistant'`. The item's `key` stays `'insights'`, so `SIDEBAR_ITEMS`, `SIDEBAR_HREFS` and the
route directory are untouched and the URL keeps being `/insights`.

This makes the sidebar item and the page title finally agree. Flagged and accepted by the product
owner: since PET-73 moved the insight cards to the Dashboard, a section called INSIGHTS now holds a
chat while the screen that shows insights sits under MENU.

### 8. The chat row labels get bigger and renamed

`AssistantMessageList.tsx`: `ROLE_LABEL.assistant` → `'AI Assistant'` (line 27, "You" unchanged);
the `chat-header` row (line 66) from `text-xs` to `text-sm`; the `Sparkle` glyph from `size-3` to
`size-4` so it scales with the label rather than shrinking beside it.

The header keeps `text-base-content/60`, which is a **composited** alpha — whether 14px at 60%
clears 4.5:1 on the card is a measurement, not a deduction, so it is read off a painted pixel in
the walk and the opacity raised if it fails. That is the method PET-22 and PET-23 both used for
their muted tones, and the same file records `getComputedStyle` being insufficient for it.

One consequence: **"AI Assistant" now names two things on one screen**, the page `h1` and every
assistant row. Nothing breaks today, because no tree holds both — `pages.test.tsx` renders the page
with an empty chat and `AssistantChatScreen.test.tsx` renders the screen with no header. But it
makes `getByText('AI Assistant')` a trap, so both existing assertions are re-queried by role.

## Out of scope

- **Every screen that is not the assistant.** A fixup found elsewhere gets its own ticket, not an
  appendix here.
- Streaming the reply, and cancelling a receipt scan. Both are `docs/TODO.md` entries and neither
  is a defect in what shipped.
- The `secondary`-on-canvas sweep. One call site is fixed; no other exists today.

## Task checklist

- [ ] Commit this plan alone, push the branch, open a draft PR with this checklist in its body
- [ ] Add `react-markdown` and `remark-gfm` to `frontend/package.json`; widen Jest's
      `transformIgnorePatterns` if the ESM build needs it
- [ ] Add `AssistantMarkdown.tsx` with its per-tag class map and the table overflow wrapper
- [ ] Render assistant bubbles through it; drop `whitespace-pre-wrap` from the assistant bubble only
- [ ] Replace the no-markdown sentence in `assistant-context.builder.ts` and update its spec
- [ ] Move the composer's send/stop control inside the box as glyph-only circular buttons
- [ ] Wrap the composer in a `card bg-base-100`
- [ ] Replace `loading-dots` in `TypingIndicator` with staggered `animate-bounce` spans
- [ ] `NewChatButton` → `variant="primary"`
- [ ] Both assistant headers to "Your very own personal" / "AI Assistant"; delete `readPeriods()`
      from both routes and `currentPeriod` from `lib/periods.ts` with its tests
- [ ] Sidebar heading `INSIGHTS`, item label `AI Assistant`
- [ ] Chat row labels: `text-sm`, `size-4` glyph, `AI Assistant`; re-query the two brittle assertions
      by role
- [ ] Update the suites this moves: `AssistantChatScreen.test.tsx`, `AssistantMessageList`'s
      stories, `pages.test.tsx:241`, `Sidebar.test.tsx`, `insights/page.test.tsx`
- [ ] Document both root causes in `frontend/CLAUDE.md`'s "Where daisyUI and Tailwind fight"
- [ ] Update the prose this dates: `insights/page.tsx`'s title/overline comments,
      `Sidebar.tsx`'s MENU/ASSISTANT/ACCOUNT comment, `frontend/src/app/CLAUDE.md`'s
      "the overline stays the period" and "the title is Assistant" paragraphs,
      `backend/src/assistant/CLAUDE.md`'s prompt note
- [ ] Rewrite PET-76's description with these as real acceptance criteria and re-point it
- [ ] Verify (below), then take the PR out of draft

## Verification

Gates, from each app's own directory:

- `npm test` in `frontend/` and `backend/`
- `npm run build` in both — the typecheck. Confirm the build output still marks `/insights` and
  `/insights/history` **dynamic**, not static.
- `npx tsc --noEmit` in `frontend/`, because `npm run build` never reads `*.test.tsx`
- `npm run lint` in both, `npm run build-storybook` in `frontend/`
- `npm run docs:check` at the root
- Record the built-chunk byte delta from the two new dependencies

Then the browser walk, headless Chromium over the DevTools protocol, since every root cause here was
found by measuring rather than by reasoning and two of them cannot fail a gate:

- The composer's **disabled** state is visibly distinct from the card behind it, and from the page
  canvas. Probe the old arrangement in the same run so the check is seen to fail.
- The `chat-header` label at `text-sm` — composite the 60% alpha over the card and read the painted
  pixel against 4.5:1. `getComputedStyle` alone is not the check.
- The typing dots visibly cycle, and `prefers-reduced-motion` stills them.
- A markdown reply renders bold, both list kinds and a table; the table scrolls **inside** its
  bubble with no horizontal scroll on the page body. Both themes.
- The glyph send button: Enter submits, Shift+Enter inserts a newline, the button is a real tab stop
  and announces "Send", and mid-turn it announces "Stop" and really aborts. The abort chain is the
  thing `backend/src/assistant/CLAUDE.md` says to verify in a browser rather than trust.
- "New chat" and the sidebar's new strings render, and "New chat" mid-turn still abandons the turn.
- Both assistant screens in **light and dark**, since a theme change voids every measured figure.

Storybook covers the composer and the message list with no session, which is the cheapest surface
for the markdown map; the gated screens themselves need the walk.
