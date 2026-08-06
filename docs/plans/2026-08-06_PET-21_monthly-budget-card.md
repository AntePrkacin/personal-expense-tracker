# PET-21 — Monthly budget card with stats row

[PET-21](https://decode.atlassian.net/browse/PET-21) — `[FE] Build monthly budget card with
stats row`. Figma: [04
Dashboard](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=21-4).

Base branch is `main`, so this is the **bottom of the Dashboard stack**. PET-22 to PET-26 are cut
from it in that order and their PRs target their predecessor.

## Why

`GET /api/dashboard` has existed since PET-20 and **nothing calls it**. The Dashboard `<main>` is
an empty `div` under a header, which is the state root `CLAUDE.md` and both scoped frontend files
all describe as the app's largest remaining gap: three of the four signed-in screens render their
designed header over nothing.

This ticket is first in the epic because it is the only one that can be. The other five draw
cards, and there is nowhere to draw them: no read, no screen component, no grid. So its scope is
wider than its title - the budget card is what it ships, and the dashboard's data path is what it
builds.

## Order in the epic, and what this branch owes the five above it

The stack is PET-21 → PET-22 → PET-23 → PET-24 → PET-25 → PET-26, and each ticket's Jira comment
records its position. Three things land here that every later card consumes, and they are called
out because getting them wrong is expensive five branches up:

| Landed here | Consumed by |
| --- | --- |
| `lib/dashboard.ts` and its `DashboardSummary` type | all five |
| `DashboardScreen` and its card slots | all five |
| The card grid | all five |
| A whole-dollar money formatter | PET-22, PET-23, PET-26 |

## Decisions

**The read is `lib/transactions.ts`'s shape, minus its one complication.** `readDashboard()` calls
`authorizedGet` and applies the same failure policy `lib/profile.ts` and `lib/transactions.ts`
both apply, deliberately identically: only a 401 or a missing cookie redirects to the access flow,
and everything else throws so Next's error boundary renders something a reload retries. That
policy is not a style choice - `frontend/src/app/CLAUDE.md` records the `/dashboard` to `/login`
redirect loop that came from a second read forming its own opinion about whether the session was
alive, and this read sits inside the same shell that read the profile a moment earlier.

What it does **not** copy is the two-read probe. That exists because
`GET /api/transactions` cannot distinguish an empty account from an empty filter, and this
endpoint has no filters at all: one request, always, and every figure on the screen comes out of
it. PET-26's empty state reads `transactionCount === 0` off the same response.

**The response type is read out of the contract, not declared.** `paths['/api/dashboard']['get']`,
per the rule `docs/agents/api-contract.md` sets for every caller. Nothing here changes a request
or response body, so **no `npm run api:sync`** - PET-25 is the one branch in this stack that needs
it.

**`page.tsx` becomes async and hands a resolved summary to a synchronous `DashboardScreen`.** This
is `/transactions`' split and it is a requirement rather than a convention: Storybook cannot
render an async Server Component that reads cookies, so without the split frames 04 and 05 cannot
be diffed against the design at all, and PET-26 in particular would have no way to show its own
screen. `(app)/pages.test.tsx` already renders every page through `await Page()`, so it needs a
mock for this module and nothing else.

**The cards are slots on `DashboardScreen`, not imports inside it.** Same reasoning
`TransactionsScreen` records: a screen that imports its cards cannot be handed stand-ins, and
Storybook is the only place frames 04 and 05 get reviewed. The difference from that file is that
**every dashboard card is unconditional** - all five render in both states, with different content
- so they are required props rather than optional ones. An optional slot expresses a choice about
whether something renders, and there is no such choice here; a default would let a call site
quietly test a dashboard with cards missing, which is the mistake `frontend/CLAUDE.md` describes
for `filters` on the transactions screen.

**This ticket ships four of the five slots empty**, as `<div />` placeholders with the ticket
number in a comment, so the grid's geometry is reviewable now and each later branch is a one-line
change at the call site. That is the seam PET-30 built for PET-29 and it worked; the difference
worth stating is that those slots were about a *conditional*, and these are about *sequencing*.

**Money gets a second formatter, and this is the resolution of a `docs/TODO.md` item.** That file
records that `formatCurrency(1240)` returns `"$1,240.00"` while frame 01's sample card and frame
04's real budget card both draw `"$1,240"`, and it names this ticket as the one that must answer
it, because Welcome sidesteps the problem with literal strings and this card's numbers are real.
It also asks for a designer answer on whether the app shows cents at all, and says the answer
probably differs by context.

**The epic's own mocks answer it, so no designer is blocked.** Read across all six tickets, the
split is consistent and it is exactly the contextual one that item predicted:

- **Aggregates are whole dollars.** `$1,240 of $2,000`, `$760 left`, `$54` avg / day (PET-21);
  `$280` and `$410` on the trend bars (PET-22); `$397`, `$298`, `$223` in the donut legend
  (PET-23); `$0 of $2,000` and `$2,000 left` in the empty state (PET-26).
- **Per-transaction amounts keep their cents.** `−$24.00`, `−$18.50`, `−$15.99` in DSH-7
  (PET-24), which is also what the transactions table already draws through `formatNegative`.

So `formatWhole()` lands beside `formatCurrency()` rather than replacing it, with its own `Intl`
instance at zero fraction digits. It **rounds**, which is `Intl`'s own behaviour there and is the
right one: it keeps the whole-dollar figures as close to the real total as one dollar allows, where
truncating would bias every aggregate on the screen downwards. That does mean a summary figure can
sit a dollar off the sum of the cents a user adds up by hand, which is inherent in drawing whole
dollars at all and is the design's call rather than ours. `formatCurrency` stays the formatter for
anything a user could reconcile against a receipt, which is why PET-24's rows keep their cents. `docs/TODO.md`'s item is updated to record
the answer rather than deleted, because the *currency* half of it - that all of `format.ts`
hard-codes `en-US` until onboarding's chosen currency is stored - is untouched and still owed.

**The status chip ships two tones, not three, and the third is a real designer question.** The
frame draws only "On track", and the ticket says other tones follow the Status palette used
elsewhere - which authorizes inventing them, so the question is how many to invent. Two are
forced by the contract: `remaining` is documented as able to go negative, with the note that
"overspending is a state the frontend needs the magnitude to draw". So under budget is "On track"
in a `badge-success`, over budget is "Over budget" in a `badge-error`, and that is the whole set.
A middle "getting close" tone would need a threshold - 80%? 90%? pace-relative? - that nobody has
chosen, and picking one here means shipping a number the design never states as if it were
designed. `docs/TODO.md` records it with the A29 undesigned-state group.

**The progress bar is daisyUI's `progress` written in place, and it clamps.** `ui/ProgressBar` was
deleted in PET-57 and must not come back for one consumer. Two details that are not obvious: the
value is clamped to the maximum, because an overspent month is `spent > monthlyBudget` and a
`<progress>` handed a value above its max renders full but reports the raw number to assistive
technology; and unlike Welcome's decorative bar this one is **not** `aria-hidden`, because it
reports the reader's own budget - it gets a real accessible name instead. `app/DecorativePanel.tsx`
records the opposite call and why, and the two are halves of one decision.

**The stats row is daisyUI `stat` classes in place, for the same reason.** `ui/Stat` was one of
the six wrappers PET-57 deleted, and `frontend/src/components/CLAUDE.md` names this exact case:
"when a view finally needs a stat row, write the daisyUI classes in place rather than resurrecting
a wrapper". Three tiles: `transactionCount`, `averagePerDay` through `formatWhole`, and
`topCategory?.name`.

**`topCategory` is nullable and this ticket renders the null.** The contract says it is null when
nothing has been spent, and PET-26 specifies a dash for it in the empty state. Rendering the dash
here rather than deferring it means this card is complete for an empty account on its own, which
is what makes PET-26 a sweep over four cards rather than five.

**Days left comes off the response, not off a calendar.** AC3 wants the caption counting to the
end of the configured period, and `daysLeft` is exactly that - computed backend-side against the
profile's `monthStartDay`, documented as counting today and never 0. Computing it here would mean
reading `monthStartDay` in the frontend, which no frontend module does and which
`frontend/CLAUDE.md` explicitly notes `monthOverline`/`monthLabel` do **not** do. The month *name*
in the caption still comes from `monthLabel(new Date())`, which is the calendar month and
therefore correct only while `monthStartDay` is 1 - the deviation that file already records, not a
new one, and worth nobody re-fixing here.

## Shape

`lib/dashboard.ts` - `DashboardSummary` off the contract, `readDashboard()` over `authorizedGet`,
the two-branch failure policy, and its suite.

`lib/format.ts` - `formatWhole()`, with its cases pinned in `format.test.ts` beside
`formatCurrency`'s.

`(app)/dashboard/page.tsx` - async, awaits `readDashboard()`, renders `DashboardScreen` with the
budget card built and four placeholder slots.

`(app)/dashboard/DashboardScreen.tsx` - the header (moved from `page.tsx` unchanged, month pill
and `AddTransactionButton` included) plus the grid under it, taking five card nodes.

`(app)/dashboard/BudgetCard.tsx` - the chip, the readout, the clamped bar, the two captions and
the three stat tiles. A Server Component; nothing on it is interactive.

The grid's exact column split is read off node `21:4` during implementation. Per
`frontend/CLAUDE.md`'s division of authority, Figma governs the structure and the layout and
daisyUI governs the rest, and the standing carve-out applies: the frame's fixed 1440px becomes a
`max-w-*` ceiling and the columns collapse below `lg` rather than being reproduced as fixed
widths.

## Tasks

- [ ] Commit this plan alone and open the draft PR against `main`
- [ ] `lib/dashboard.ts` and `lib/dashboard.test.ts`: the read and its failure policy
- [ ] `lib/format.ts`: `formatWhole()`, with cases in `format.test.ts`
- [ ] `(app)/dashboard/DashboardScreen.tsx` and its suite: the header, the grid, the five slots
- [ ] `(app)/dashboard/BudgetCard.tsx` and its suite: chip, readout, clamped bar, captions, stats
- [ ] `(app)/dashboard/page.tsx`: async, the read, the four placeholder slots
- [ ] `(app)/pages.test.tsx`: mock `lib/dashboard`, re-verify the month pill stays inert
- [ ] Stories: `Screens/04 Dashboard` against node `21:4`, plus a `Shell/Budget card` pair for the
      two chip tones
- [ ] Docs: `frontend/CLAUDE.md` (the formatter, and its `## Not built here` entry for the reads),
      `frontend/src/app/CLAUDE.md` (the screen split and the slots), root `CLAUDE.md`,
      `docs/TODO.md` (the cents item answered, the chip threshold added)
- [ ] Comment on PET-21 with the whole-dollar resolution and the two-tone chip decision

No `npm run api:sync`: nothing here changes a request or response body.

## Verification

From `frontend/`: `npm run lint`, `npm test`, `npm run build` (the typecheck) and
`npx tsc --noEmit`, which is the only one that reaches `*.test.tsx`. From the repo root:
`npm run docs:check`.

Then the app itself, signed in, in **Chrome**, against an account with transactions this month:

1. The readout, the bar and both captions agree with the transactions list's own total (AC1)
2. The three stat tiles show the period's count, the per-day average and the top category (AC2)
3. Days left matches the configured period rather than the calendar month (AC3) - check by
   reading `monthStartDay` off the profile row and counting
4. Every amount reads `$1,240`, not `$1,240.00` and not `1240` (AC4)
5. Add a transaction from the header button, return, and every figure has moved; delete it from
   the transactions list, return, and every figure has moved back (AC5)

AC5 needs no new code - `AddTransactionModal.tsx` and `DeleteTransactionDialog.tsx` both already
call `router.refresh()`, which re-runs this route's Server Components. It has been unverifiable
until now because there was nothing on the screen to change, which is what PET-33's own AC6 says.
This is the first ticket that can actually confirm it, so confirm it rather than assuming it.

Then the overspent state, which the frame does not draw: log enough to pass the budget and check
the chip flips to "Over budget", the bar reads full rather than overflowing its track, and the
"left" caption shows the magnitude rather than a minus sign colliding with the `$`.

Then `Screens/04 Dashboard` in Storybook, which is where the frame gets diffed. Two traps that file
records apply to this story specifically. The screen renders `AddTransactionButton`, and
`useAddTransaction()` **throws** outside `AddTransactionProvider` rather than returning a no-op - so
the provider has to be inside `render`, not in a `decorators` entry, because the story smoke test
builds each story from `render` and never applies decorators. And that provider mounts the modal,
which reaches `useRouter`, so the story needs
`parameters: { nextjs: { appDirectory: true } }` or it throws in the browser with both gates green.
**Open the story after adding it** - that is the only check there is.
