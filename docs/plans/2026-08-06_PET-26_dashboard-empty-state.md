# PET-26 — Dashboard empty state across all cards

[PET-26](https://decode.atlassian.net/browse/PET-26) — `[FE] Build dashboard empty state across all
cards`. Figma: [05 Dashboard -
Empty](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=44-706).

Base branch is `feat/PET-25-insight-teaser-card`, so this is a stacked branch and its PR targets
that branch rather than `main`. Position 6 of 6 in the Dashboard stack, and the last ticket in the
epic.

## Why

Frame 05 is the same layout with zero data, and the designer drew a **distinct treatment for every
card** rather than letting empty data fall through. That is what makes this a designed state and not
an accident, and it is the reason it gets a ticket: a treatment that is nobody's ticket is the one
that ships as four blank cards.

A new account reaches this screen immediately, straight after opening its first login link (VER-4,
A33). So for every user, this frame is the first thing the app shows them - which is a stronger
argument for building it than its Medium priority suggests.

## Last by necessity

AC1 is "every card renders its designed empty treatment", which cannot be true before every card
exists. The alternative - each card ticket shipping its own empty branch as it lands - was
considered and rejected: it leaves this ticket empty, and it spreads one designed frame across five
PRs where no reviewer ever sees it whole.

The five card tickets each ship the **populated** state their own mock draws, which is what their
acceptance criteria describe. PET-25 is the single exception and it is deliberate.

## What this ticket does not build

**The teaser card's unlock state is PET-25's and is already done.** This ticket's description says
"the teaser card switches to its unlock copy", but PET-25's AC3 and AC4 specify that copy and its
"Add transaction" button in full, so building it here was never possible without PET-25 shipping a
half-finished card. Both tickets now carry a Jira comment recording the resolution. So the teaser is
**verified** here, not written, and this plan's checklist says so rather than quietly skipping it.

That leaves four treatments, and every one of them is genuinely absent after PET-21 to PET-24 -
because each of those cards renders nothing rather than something wrong for the empty case, which is
a division each of their plans states explicitly.

## The API already answers, which is worth knowing before building

PET-20's AC5 made the endpoint return a usable empty answer rather than failing, so nothing here
needs a defensive read:

| Frame 05 draws | Comes from |
| --- | --- |
| `$0 of $2,000`, `$2,000 left` | `spent: 0` and `monthlyBudget` from the profile |
| `0 Transactions`, `$0 Avg / day` | `transactionCount: 0`, `averagePerDay: 0` |
| a dash for Top category | `topCategory: null` |
| the trend card's glyph and message | `weeklyBuckets: []` |
| the donut's gray ring and `$0 spent` | `categories: []` |
| the recent card's icon and message | `recentTransactions: []` |

**`monthlyBudget` is the load-bearing one.** It is populated from the profile, set during
onboarding, and therefore exists before any transaction does - which is exactly what makes AC2's
`$0 of $2,000` possible and what would make a hardcoded `$2,000` in this branch a bug that looks
like the design.

## Decisions

**One condition drives the whole screen, and it is `transactionCount === 0`.** Not five independent
per-card emptiness checks, and not `spent === 0`: those two differ, because a period could in
principle hold transactions summing to zero, and more importantly five conditions can disagree and
produce a screen that is half empty and half zeroed. `DashboardScreen` resolves the state once and
each card takes a boolean, so the frame is either drawn or not.

**AC2's "Full month ahead" proves the point.** `daysLeft` is documented as never 0 and counting
today, so it carries no signal about emptiness at all - there is no value of it that means "empty".
The caption swaps on the screen's one condition, which is the only thing that can drive it.

**`components/EmptyState.tsx` is the wrong component here, and this needs stating because it looks
right.** That component is the full-card centred treatment frames 07 and 16 draw - a 72px
accent-soft circle, a heading, a 440px body and a primary button - and `frontend/src/components/CLAUDE.md`
notes that "DSH-7 describes the same shape a third time inside the dashboard's recent-list card".
That note is about **shape**, not size or placement: frame 05's four treatments are each a small
glyph and a line or two *inside a card that keeps its own header and its own footprint in the grid*,
not a card replaced by a centred column. Dropping `EmptyState` into these four would change the
design and break the grid's alignment. The right move is a small local piece of markup per card, or
one tiny shared one if three of the four turn out identical - which is the rule of three, applied
after looking rather than before.

**The donut's gray ring is `bg-base-300`'s stroke equivalent, not a disabled colour.** A ring with
no data has no status meaning to reach for, and `ui/categoryColour.ts` already makes exactly this
argument for `CATEGORY_TILE_NEUTRAL`: "a base shade is exactly what has no semantic weight to
spend". So the empty ring is a base shade for the same reason the unpalette tile is, and it stays
`role="img"` with a name that says there is nothing to show rather than being hidden.

**The empty treatments carry no interactive controls of their own.** Frame 05 puts the one call to
action on the teaser card - PET-25's "Add transaction →" - and the page header's own
`AddTransactionButton` is present in both states. Adding a second or third "Add transaction" to the
trend or donut cards would be inventing a design; the frame draws them as statements, not prompts.

**Five new strings, and they join what A29 owes.** The four card messages plus "Full month ahead"
are all read off frame 05, so they are the designer's rather than ours - unlike the undesigned-state
copy `docs/TODO.md` tracks. Worth noting the difference explicitly, because the A29 list has grown
by strings this repo invented and these are not those. They still go in the register, as designed
copy now shipped, so a copy review has one place to look. Figma's own spelling wins where it differs
from a repo habit, which is the call A30 records for "categorised".

**AC5's transition needs no new code and must still be verified.** `AddTransactionModal` already
calls `router.refresh()`, so logging the first expense re-runs this route's Server Components and
every card leaves its empty state at once. PET-21's plan verifies the same mechanism for the
populated screen; here the interesting half is that all five cards flip together rather than the
first one flipping and the rest going stale.

## Shape

`(app)/dashboard/DashboardScreen.tsx` - resolves `isEmpty` once and passes it down. The cards stay
slots, so the flag travels as a prop on each card rather than as a branch in the screen: the screen
does not know what a card's empty state looks like, and a screen that swapped whole nodes would put
frame 05's design decisions in the wrong file.

`(app)/dashboard/BudgetCard.tsx` - the zero readout, the empty bar, `$2,000 left`, "Full month
ahead", the Top category dash. Most of this is already correct from real zero values; the caption
is the one real branch.

`(app)/dashboard/TrendCard.tsx`, `CategoryDonut.tsx`, `RecentTransactionsCard.tsx` - each gains its
designed treatment where it currently renders nothing.

`(app)/dashboard/InsightTeaserCard.tsx` - untouched. PET-25 built both its states.

## Tasks

- [ ] Commit this plan alone and open the draft PR against `feat/PET-25-insight-teaser-card`
- [ ] `DashboardScreen.tsx`: resolve `isEmpty` once, thread it to the four cards, and pin in its
      suite that it is not five separate conditions
- [ ] `BudgetCard.tsx`: the "Full month ahead" caption and the Top category dash, with cases
- [ ] `TrendCard.tsx`: the bar glyph and "No spending to chart yet", with cases
- [ ] `RecentTransactionsCard.tsx`: the icon, "No transactions yet" and its body line, with cases
- [ ] `CategoryDonut.tsx`: the gray ring, the `$0 spent` centre and its caption, with cases
- [ ] Verify the teaser card already renders its unlock state from PET-25; change nothing if it does
- [ ] Stories: `Screens/05 Dashboard — Empty` against node `44:706`, plus an empty variant on each
      of the four card stories
- [ ] Docs: `frontend/src/app/CLAUDE.md` (the one-condition decision, and why `EmptyState` is not
      used), root `CLAUDE.md` - **this is the ticket that empties the Dashboard entry in
      `frontend/CLAUDE.md`'s `## Not built here`**, so delete that bullet's dashboard clause rather
      than editing around it
- [ ] `docs/TODO.md`: the five designed strings, and PET-21's chip threshold if still open
- [ ] Comment on PET-26 recording that the teaser clause was satisfied in PET-25

No `npm run api:sync`: nothing here changes a request or response body. Note this branch **inherits**
PET-25's regenerated artifacts through the stack and must not regenerate them again.

## Verification

From `frontend/`: `npm run lint`, `npm test`, `npm run build` and `npx tsc --noEmit`. From the repo
root: `npm run docs:check` - which matters more than usual on this branch, since it is the gate that
fails if a `## Not built here` section is emptied to nothing.

Then the app itself, in **Chrome**, and this one needs a genuinely fresh account rather than a
cleared one: register a new address, open the emailed link, and land on `/dashboard` for the first
time. That is the exact path A33 and VER-4 describe and it is the only way to see the state a real
user sees.

1. All five cards render their designed treatment, none blank and none broken (AC1)
2. The budget card reads `$0 of {the budget set during onboarding}`, "Full month ahead", and a dash
   for Top category (AC2)
3. The trend and recent-transactions cards each show their glyph and message (AC3)
4. The donut draws the gray ring with the `$0 spent` centre and its caption (AC4)
5. Log the first expense from the teaser's "Add transaction" button, and **every** card leaves its
   empty state on the same navigation (AC5)

Step 5 is the one worth doing carefully: check all five, not the first one. A card reading a
different condition would show up here and nowhere else.

Then the same screen in **dark** mode, since the gray ring and the four glyphs are all
theme-resolved and the frame draws one theme. Then `Screens/05 Dashboard — Empty` in Storybook,
which is the only place the whole frame gets diffed against node `44:706`.

**Epic closeout.** This is the last ticket in the Dashboard epic, so the PR should also confirm that
the two claims root `CLAUDE.md` has been making are no longer true: that the Dashboard `<main>` is
empty, and that the dashboard summary is called by nobody. Both sentences change in this branch.
