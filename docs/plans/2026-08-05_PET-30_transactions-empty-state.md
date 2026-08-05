# PET-30: the transactions empty state and no-results handling

Figma **07 Transactions — Empty** (node `45:752`), diffed against **06 Transactions — List** (node
`26:90`). Route `/transactions`. Branch `feat/PET-30-transactions-empty-state`, cut from `main`:
nothing to stack on, because PET-29 and PET-31 have no branch, PR or plan and the repo contains zero
references to either.

## Context

`/transactions` renders its designed header and an empty `<main>`. This is the ticket that puts
something below that header for the first time, and it is the frontend's third read of real backend
data after `GET /api/auth/session` and `GET /api/profile`.

**The ticket as filed cannot be delivered as literally scoped.** Its acceptance criteria 2 to 5
describe chrome that other, unstarted tickets own: the tab bar and its count badge and the filter bar
are PET-29's, the Add transaction modal is PET-31's. Rather than park PET-30 behind both, this plan
takes the page's **data path and state machine** - the list read, the tab bar with its real badge, and
the three-way branch between populated, no-results and empty - and leaves the table body and the
filter bar's contents as slots PET-29 fills.

That inverts the ticket order for one reason worth stating plainly. AC2, "the filter bar is not
rendered in this state", is a statement about a conditional. Built here, with a test, the conditional
exists and PET-29 fills a slot that already knows when to disappear. Built in PET-29, nothing would
fail if the filter bar rendered unconditionally, and AC2 would be satisfied by an accident that the
next commit could undo silently.

Two gaps in the specification get settled here rather than discovered during implementation:

- **`total` is post-filter and `period` defaults to `current`**, and PET-28 deliberately ships no
  account-wide count. So a single read cannot tell an empty account from a filter that matched
  nothing - nor from an account whose transactions all sit in a previous month, which is the case
  that actually bites, because frame 07 hides the period select and leaves no control on screen that
  could reach the user's data.
- **A15 pre-decided that the no-results state reuses frame 07's copy verbatim**, and that copy - "Log
  your first expense and it'll show up here" - is wrong for somebody with 128 transactions whose
  search matched nothing.

## Decisions

**The empty-versus-no-results question is answered by a second probe, taken only when the first read
returns zero.** The page reads the list with whatever filters are active; a non-zero `total` is the
populated state and nothing further happens. On zero, and only on zero, it reads once more with
`period=all` and no filters. Zero again means the account is genuinely empty, so frame 07 renders and
the filter-bar slot stays closed; anything else means this is a no-results state and every control
stays on screen.

Both alternatives were considered and are worth recording. Inferring the state from whether any
filter is active costs no extra request and gets the all-in-September account wrong in exactly the
way described above. Adding an unfiltered count to the list response would answer both questions in
one read, and it would reopen a Done backend ticket to reverse a decision PET-28's plan made
explicitly: "Returning a second, unfiltered count beside it was considered and dropped. No frame
draws two numbers."

**The no-results state gets its own heading and body, which amends A15 and AC5.** The card, the icon
and the button are identical; only the two strings change. A15's instruction to reuse frame 07's
message was a placeholder for a state nobody designed, and the placeholder is actively misleading
rather than merely thin - it tells a user with a full history to log their first expense. Two new
undesigned strings join the list A29 already owes a designer sign-off for, and `docs/TODO.md` records
the amendment alongside the request for a designed variant.

**The empty card becomes `components/EmptyState.tsx` immediately, rather than a local component
hoisted later.** `frontend/CLAUDE.md`'s rule for that folder is "belongs to more screens than one
route segment holds", and frame **16 AI Insights — Empty** (node `39:665`) draws the identical box:
same 72px accent-soft circle, same `Display/S` heading, same 440px `Body/L` body, same primary button,
differing only in glyph and copy. PET-44 and PET-26 then import it with no move commit. This is the
`AccessCard` situation recognised one ticket early instead of one ticket late.

**The card carries no shadow, and its radius is 16px rather than 20px.** Node `45:1044` binds
`Surface/Card` and a 1px `Border/Default` with `rounded-[16px]` and no fill shadow, so it is
`rounded-lg` and **not** `shadow-card` - the class every access frame and every dashboard card draws.
Copying `AccessCard`'s box string would have been wrong twice over, which is the trap worth recording
for whoever builds the next card.

**The tab bar is presentational chrome and both tabs are inert.** The badge is real data; the tabs are
not controls yet. "Categories" must not become a link, because `lib/routes.test.ts` asserts with `fs`
that every declared route has a `page.tsx` behind it and its `PENDING` list is empty and stays -
PET-36 builds that route. Making "All transactions" a real tab is PET-29's AC2. So the bar is a `div`
carrying two labels, matching the documented precedent of the month and search pills, and
`(app)/pages.test.tsx`'s "no operable controls" assertions stay green untouched.

**The badge is built inline rather than out of `ui/Tag`.** Tag's `indigo` tone happens to be the same
colour pair (`bg-brand-accent-soft` over `text-brand-accent-pressed`), but its padding and type are
its own, it renders a dot by default, and its required `label` means "a status" where this is a count.
Reusing it would mean overriding three of its decisions to inherit one.

**The screen splits into an async `page.tsx` and a synchronous `TransactionsScreen.tsx`.** Storybook
cannot render an async Server Component that fetches, which is precisely why `WelcomeScreen` and
`CheckEmailScreen` are separate files from their routes. `page.tsx` reads and resolves the view;
the screen renders whatever it is handed.

**The third copy of the cookie-to-Bearer read is lifted into a helper.** `lib/profile.ts` and
`lib/session.ts` each inline the same six lines, and `components/ui/utilities.test.ts` records this
repo's own rule for the situation: "duplicated ... rather than shared. If a third consumer appears,
lift it into a helper then." `authorizedGet` returns a classified result and lets each caller keep
its own policy, so `hasSession()` still never throws and `requireProfile()` still redirects on a 401
alone and throws on everything else. This step is **separable** from the rest of the ticket:
dropped, `lib/transactions.ts` inlines the six lines a third time.

**It lives in `lib/session.ts` rather than beside `postAccepted` in `lib/backend.ts`**, which is a
correction to this plan's first draft. The helper needs `SESSION_COOKIE`, which `lib/session.ts`
owns, so putting it in `backend.ts` would have pointed that module back at this one and made an
import cycle. The split that does work is by credential rather than by HTTP verb: `backend.ts`
serves the two pre-session writes and sends no credential at all, while `session.ts` already
documents the cookie and the rule that it "is lifted into an `Authorization: Bearer <token>` header
server-side on every read" - which is this helper's job description. `profile.ts` already imported
from `session.ts`, so no dependency direction changes and `backend.ts` is untouched.

## Copy

| State     | Heading                  | Body                                                                                | Source                     |
| --------- | ------------------------ | ----------------------------------------------------------------------------------- | -------------------------- |
| empty     | No transactions yet      | Log your first expense and it'll show up here, sorted and categorised automatically. | Figma 07 verbatim, A30     |
| noResults | No matching transactions | Try a different search term, category or period.                                    | Ours; amends A15, owes A29 |

The UK "categorised" ships as designed, pending A30's copy pass.

## Measurements

Read off node `45:1044`. The card is `bg-surface-card border-border-default flex flex-1 flex-col
items-center justify-center gap-4 rounded-lg border px-10`, its children at 16px gaps: a `size-18`
(72px) `bg-brand-accent-soft rounded-full` circle holding a 30px glyph in `text-brand-accent`; a
`text-display-s text-text-primary` heading; a `text-body-l text-text-secondary max-w-110` body.

Two details are not literal transcriptions. The body is `max-w-110` rather than the frame's fixed
440px `w-110`, so a narrow window wraps instead of overflowing the `px-10`. And Figma puts a 4px
spacer frame inside the 16px column before the button, which measures 36px from copy to button -
reproduced as `mt-5` on the action wrapper (16 + 20), checked against the frame rather than derived.

Tab bar, node `45:767`: `border-b border-border-default flex items-center gap-7`. Each tab is a column
with `gap-2.5` whose label row is `pb-3`. The active label is `text-strong-m text-text-primary`, the
inactive `text-strong-m text-text-tertiary`. The active underline is `h-0.5 w-full bg-brand-accent`;
the inactive tab's is hidden in Figma and simply absent here. The badge is `bg-brand-accent-soft
text-brand-accent-pressed rounded-full px-1.75 py-0.5 text-label-s`, `gap-1.75` from its label.

Layout: `<main className="flex flex-1 flex-col gap-5 px-10 pb-10">`, giving the 20px that both frames
put between the tabs, the filter-bar slot and the card.

## The glyph

Frame 07's icon is the three-bar list mark, and `ui/Sidebar.tsx`'s `TransactionsGlyph` is the same
mark at different proportions: a 20-box with bars flush to the edge (20, 20 and 13 wide, 3 tall, `rx`
1.5) against frame 07's 30-box with a 2px inset (26, 26 and 18 wide, 4 tall, `rx` 2). Close enough to
read as the same icon, not close enough to be the same path. So it is traced locally in
`TransactionsEmpty.tsx`, following this repo's dominant pattern of a local unexported glyph in the
file that uses it, with a comment pointing at the sidebar's copy and at the deliberately short third
bar that keeps it a list rather than a hamburger. No `overflow-visible` is needed: every rect is
fill-only and sits wholly inside the box.

## Files

New:

| File                                                                 | What it is                                                                     |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `frontend/src/components/EmptyState.tsx`                             | The shared centred card: `icon`, `heading`, `body`, `action?`, `headingLevel?`  |
| `frontend/src/components/EmptyState.test.tsx`                        | The parts render, the heading level is honoured, the icon is `aria-hidden`      |
| `frontend/src/lib/transactions.ts`                                   | The list read, the two-probe view resolution and `TransactionsView`             |
| `frontend/src/lib/transactions.test.ts`                              | The three states, the probe firing only on zero, the 401-versus-500 split       |
| `frontend/src/app/(app)/transactions/TransactionsScreen.tsx`         | Synchronous screen: header, tabs, filter-bar slot, state branch                 |
| `frontend/src/app/(app)/transactions/TransactionsScreen.test.tsx`    | Per-state assertions, including the filter-bar slot's absence when empty        |
| `frontend/src/app/(app)/transactions/TransactionTabs.tsx`            | The two inert tabs and the real count badge                                    |
| `frontend/src/app/(app)/transactions/TransactionsEmpty.tsx`          | The traced glyph plus the two copy variants, rendering `EmptyState`             |
| `frontend/src/app/(app)/transactions/TransactionsScreen.stories.tsx` | `Screens/07 Transactions — Empty` and `— No results`                           |

Modified: `frontend/src/app/(app)/transactions/page.tsx` becomes async, reads and renders the screen;
`frontend/src/lib/session.ts` gains `authorizedGet` and its suite gains a describe block for it;
`frontend/src/lib/profile.ts` moves onto the helper with no behaviour change, and both suites pass
**unchanged** apart from that addition, which is the proof the refactor preserved behaviour;
`frontend/src/app/(app)/pages.test.tsx` mocks the transactions read with a relative specifier, because
the `@/` alias is unresolvable inside `jest.mock`; `frontend/src/app/screens.stories.test.tsx`
registers the new module; `frontend/src/components/ui/utilities.test.ts` gains the new classes;
then `frontend/CLAUDE.md`, `frontend/src/app/CLAUDE.md` and `docs/TODO.md`.

The classes that are genuinely new are `rounded-lg`, `size-18`, `max-w-110`, `px-1.75`, `py-0.5`,
`h-0.5`, `gap-7`, `pb-3`, `mt-5` and `bg-brand-accent-soft`; `w-110`, `gap-1.75`, `gap-2.5`,
`text-label-s`, `text-body-l` and `text-display-s` are already registered. Without that file's entry a
class generating no CSS ships with every gate green.

## Steps

### 1. This plan

Written to `docs/plans/`, on a branch cut from `main`.

### 2. `authorizedGet` in `lib/session.ts`

Add the helper, move `readSession()` and `requireProfile()` onto it, and confirm both suites pass with
no change at all - they mock `next/headers` and `global.fetch` rather than the module boundary, so a
green run is the behaviour-preserving proof. Then add a describe block for the classification itself,
because `hasSession()` discards the failure reason and nothing else pins that `authorizedGet` returns
it. Separable, and reviewable as a commit that changes no behaviour on a shipped screen.

### 3. `lib/transactions.ts`

The read, typed off `paths['/api/transactions']['get']` rather than a restated shape.
`TransactionsView` is a discriminated union of `populated` (the rows plus `total`), `noResults` and
`empty`. The failure policy copies `profile.ts` exactly: a 401 or a missing cookie redirects to
`ACCESS_ROUTES.login`, anything else throws, so Next's error boundary renders something a reload
retries. Its suite pins that the `period=all` probe fires **only** when the filtered read returns
zero, and never otherwise.

### 4. `EmptyState`

The card. A Server Component with no `'use client'`, `headingLevel` defaulting to 2 because
`PageHeader` owns the page's `h1`.

### 5. The tabs, the glyph and the screen

`TransactionTabs`, then `TransactionsEmpty`, then `TransactionsScreen` composing them with the state
branch and the `filterBar` slot. `page.tsx` becomes async and hands the resolved view down.

### 6. Stories and the shared suites

Two `Screens/` stories, registered in `screens.stories.test.tsx`. Per the four existing `components/`
children, `EmptyState` gets no story of its own - both its variants are exercised through these.
`pages.test.tsx` gains the read mock.

### 7. Docs

`frontend/CLAUDE.md` keeps its `## Not built here` bullets, since three of the four `<main>` elements
are still empty and that list is per capability, and records `EmptyState`'s placement plus the
shadow-and-radius trap under Shared components. `frontend/src/app/CLAUDE.md` gets the transactions
screen, the two-probe decision, the inert tabs and why "Categories" is not a link. `docs/TODO.md` gets
the A15 amendment and the designed-variant request, the two new strings against A29, the note that
ASCII-only search makes the no-results state reachable by the project's own Croatian persona, and the
note that the header overline uses the calendar month while `period=current` follows `monthStartDay`.

## Task checklist

- [ ] Cut the branch and write this plan
- [ ] `authorizedGet` in `lib/session.ts`, with `readSession()` and `requireProfile()` moved onto it
- [ ] `lib/transactions.ts` and its suite, including the probe-fires-only-on-zero assertion
- [ ] `components/EmptyState.tsx` and its suite
- [ ] `TransactionTabs`, `TransactionsEmpty` with its traced glyph, `TransactionsScreen`, async `page.tsx`
- [ ] The new classes into `components/ui/utilities.test.ts`
- [ ] Two `Screens/` stories registered in `screens.stories.test.tsx`, and the read mocked in `pages.test.tsx`
- [ ] Docs, then `npm run docs:check` from the root
- [ ] Gates: `npm test`, `npm run lint`, `npm run build`, `npm run build-storybook`, `npx tsc --noEmit`
- [ ] Open both stories against node `45:752`, and the card against node `45:1044`
- [ ] Walk all three states against a running backend with a real session
- [ ] Comment on PET-30: the A15 and AC5 amendment, the two-probe decision, the scope taken from
      PET-29, and what ACs 4 and 5 still owe PET-31 and PET-29

## Verification

**Gates**, from `frontend/`: `npm test`, `npm run lint`, `npm run build` (this repo's typecheck) and
`npm run build-storybook`, plus `npx tsc --noEmit`, the last because `build` does not reach test files
- which is how PET-12 shipped four exclusive-union violations with every gate green. From the repo
root, `npm run docs:check`. **`npm run api:sync` is not run**, because nothing a request or response
body is made of changed.

**Storybook.** Open `Screens/07 Transactions — Empty` and `Screens/07 Transactions — No results` and
diff both against node `45:752`. Each story keeps everything it needs inside `render`, because the
smoke harness never applies `meta.decorators`. Neither reaches a router hook, so neither needs
`parameters: { nextjs: { appDirectory: true } }` - but check in the browser rather than trusting the
suite, since that is the one failure no CI gate catches.

**End to end**, against a running backend and a real session:

1. Register a fresh account, open the emailed link, go to `/transactions`. Expect frame 07: the
   centred card, the badge reading 0, the search pill and header button present, no filter bar.
2. `POST /api/transactions` one expense dated in the **current** period, reload. Expect the populated
   branch and the badge at 1, with PET-29's table slot still empty.
3. Leave only a transaction dated in the **previous** period, reload. This is the case the two-probe
   design exists for: expect the **no-results** copy with the controls visible, not "No transactions
   yet" with the filter bar gone.
4. Delete everything, reload, and confirm the empty state returns.

Confirm in devtools that the second request fires in steps 1 and 3 and **not** in step 2.

## Known risks and accepted trade-offs

- **The zero case costs two round trips.** Accepted: it is the one state with nothing to render, and
  the alternative gets the previous-month account visibly wrong.
- **ACs 4 and 5 are not fully closed by this ticket.** Both "Add transaction" buttons stay inert until
  PET-31 builds the modal, and the search input stays the inert `SearchPill` until PET-29 makes it
  real, so AC5's "usable" half is PET-29's. The rendering half is built and tested here. Both go in
  the Jira comment rather than being quietly left.
- **Scope is taken from PET-29** - the tab bar, the badge and the list read. PET-29's AC2 shrinks to
  making the tabs real controls and wiring the Categories route, which is worth saying on both
  tickets rather than leaving PET-29 to find its work already done.
- **The header overline and `period=current` can disagree** for any `monthStartDay` other than 1,
  because `monthOverline()` formats the calendar month. Pre-existing and already in `docs/TODO.md`,
  not introduced here, but it is a way to reach the empty state that the copy does not describe.
- **Search is case-insensitive for ASCII only**, so the project's own Croatian persona can produce a
  no-results state by typing the wrong case of a diacritic. Already recorded; this is the ticket that
  makes it user-visible.
