# PET-26 — Dashboard empty state across all cards

[PET-26](https://decode.atlassian.net/browse/PET-26) — `[FE] Build dashboard empty state across all
cards`. Figma: [05 Dashboard -
Empty](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=44-706).

Base branch **was** `feat/PET-25-insight-teaser-card`, position 6 of 6 in the Dashboard stack and
the last ticket in the epic. PET-21 to PET-25 all merged on 2026-08-07, so GitHub retargeted PR #55
onto `main` and this stopped being a stacked branch: it is an ordinary branch off `main` now, and
the five cards it decorates are all in the trunk. Nothing else in this plan depended on the stack.

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

**Amended after PET-25's code review: that card has three states, not two, and it already resolves
this ticket's condition for itself.** The review found `insight === null` covers two different
accounts, and that the unlock copy was the only state a running app could reach - nothing anywhere
calls `POST /api/insights/generate`, so an account with two hundred expenses was being told insights
unlock after its first. The card now takes `transactionCount` beside `insight`: at zero it draws
frame 44:706's unlock copy, above zero it says nothing has been analysed yet, and `docs/TODO.md`
records the missing trigger as PET-44's. Two consequences for this ticket. The teaser is no longer
merely "verified" - it is the one card that had already computed this screen's condition, under a
different name, before this branch started. And frame 05's own teaser treatment is still exactly what
PET-25 shipped, because a genuinely new account has `transactionCount: 0` and therefore draws the
unlock copy the frame draws. What changes here is the prop, not the pixels.

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
produce a screen that is half empty and half zeroed. The state is resolved once and each card takes a
boolean, so the frame is either drawn or not.

**That decision now has to reach a card that shipped before it, and the answer is to align the card.**
PET-25's teaser derives the same condition from `transactionCount` itself. It cannot disagree with
`isEmpty` today, because both read the identical field - but it is two spellings of one decision, and
the drift is one edit away: whoever changes what `isEmpty` means in `page.tsx` leaves the teaser on
the old definition with every gate green, which is precisely the failure the paragraph above exists
to prevent. So this ticket switches the teaser to the shared boolean and drops its `transactionCount`
prop. A boolean carries everything it needs, since its third state is exactly
`insight === null && !isEmpty`. The alternative, leaving it as the one card computing its own, was
rejected for that drift; the cost is a prop rename plus its stories and specs, on a card this
checklist already had a task for. This is the one respect in which the "the teaser is untouched"
claim below is amended.

**It is resolved in `page.tsx`, not in `DashboardScreen`, and that is forced rather than chosen.**
PET-21's plan records why and this plan originally had it wrong. The cards are **slots** typed
`React.ReactNode`, the same as `TransactionsScreen`'s two, so `page.tsx` constructs each card and
hands the finished node to the screen. A screen holding a built node cannot pass a prop into it;
`cloneElement` over a typed slot would be the only way and it is not a seam worth inheriting. Since
`page.tsx` is where the read lands and therefore where `transactionCount` already is, the condition
is resolved there and travels as a prop on each card as that card is constructed. `DashboardScreen`
never sees it, which is also the right division on its own terms: the screen does not know what a
card's empty state looks like, and nothing on frame 05 is the screen's decision to make.

So the test that pins "this is one condition, not five" belongs in `(app)/pages.test.tsx`, beside
the other assertions about what this page hands its screen, rather than in the screen's own suite.

**The donut is the one card whose empty input is not the screen's empty state, so its guard is
`categories.length === 0`.** PET-23's plan sets this out in full and it is carried out here. The
trend card's `[]` and the recent card's `[]` both occur exactly when `transactionCount === 0`,
because both are derived straight from the period's transaction list. `categories` is not: it comes
from `CategoriesService.list()` filtered on `spent > 0`, so an account with transactions whose
categories are all gone - the dangling-category race `dashboard.service.ts` documents - yields an
empty `categories` on a populated screen, and the donut would render blank with nothing explaining
it. Guarding that card on its own input closes the gap, and it does not reopen the disagreement this
section's first decision exists to prevent: an empty screen *always* has empty `categories`, so the
guard is a strict superset of the screen condition rather than a competing opinion about whether the
account is new. Every other card keeps the screen's flag, the teaser included once this ticket
aligns it - so after this branch there are exactly two conditions on the screen, the shared one and
the donut's deliberate superset, rather than three spellings of two decisions.

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

`(app)/dashboard/page.tsx` - resolves `isEmpty` once off the summary it already holds, and passes it
to each card as that card is constructed. `DashboardScreen.tsx` is **untouched**: the cards stay
slots, so the flag cannot travel through the screen, and a screen that swapped whole nodes would put
frame 05's design decisions in the wrong file.

`(app)/dashboard/BudgetCard.tsx` - the zero readout, the empty bar, `$2,000 left`, "Full month
ahead", the Top category dash. Most of this is already correct from real zero values; the caption
is the one real branch.

`(app)/dashboard/TrendCard.tsx`, `CategoryDonut.tsx`, `RecentTransactionsCard.tsx` - each gains its
designed treatment where it currently renders nothing.

`(app)/dashboard/InsightTeaserCard.tsx` - PET-25 built all **three** of its states and this ticket
writes none of them. The one change is the prop: `transactionCount` becomes the shared `isEmpty`, so
the screen carries one spelling of one condition. Its rendered output on frame 05 is unchanged.

## Tasks

- [x] Commit this plan alone and open the draft PR against `feat/PET-25-insight-teaser-card`.
      Done; PR #55 was retargeted onto `main` when that branch merged
- [ ] `page.tsx`: resolve `isEmpty` once, thread it to **all five** cards as they are constructed,
      and pin in `(app)/pages.test.tsx` that it is one condition and not five
- [ ] `BudgetCard.tsx`: the "Full month ahead" caption and the Top category dash, with cases
- [ ] `TrendCard.tsx`: the bar glyph and "No spending to chart yet", with cases
- [ ] `RecentTransactionsCard.tsx`: the icon, "No transactions yet" and its body line, with cases
- [ ] `CategoryDonut.tsx`: the gray ring, the `$0 spent` centre and its caption, guarded on
      `categories.length === 0` rather than on the screen's flag, with cases for both routes into it
- [ ] `InsightTeaserCard.tsx`: swap `transactionCount` for the shared `isEmpty`, changing no copy and
      no markup, and update `Shell/AI insight teaser`'s three stories and its suite with it. Verify
      the unlock state still renders on a zero-transaction account, which is what frame 05 draws
- [ ] Stories: `Screens/05 Dashboard — Empty` against node `44:706`, plus an empty variant on each
      of the four card stories. The teaser needs no new story - PET-25's `Unlock` **is** its frame 05
      state, and `Pending` is the third state no frame draws
- [ ] Docs: `frontend/src/app/CLAUDE.md` (the one-condition decision, where it is resolved and why,
      the donut's wider guard, and why `EmptyState` is not used), root `CLAUDE.md` - **this is the
      ticket that empties the Dashboard entry in `frontend/CLAUDE.md`'s `## Not built here`**, so
      delete that bullet's dashboard clause rather than editing around it. The bullet itself stays:
      it is "The shell's content", and AI Insights and Settings are still empty below the header
- [ ] `docs/TODO.md`: the five designed strings, and PET-21's chip threshold if still open
- [ ] Comment on PET-26 recording that the teaser clause was satisfied in PET-25, and that its prop
      was aligned onto the shared condition here

No `npm run api:sync`: nothing here changes a request or response body. PET-25's regenerated
artifacts are in `main` now rather than inherited through the stack, so there is nothing to
regenerate and a diff on either would mean something else went wrong.

## Verification

From `frontend/`: `npm run lint`, `npm test`, `npm run build` and `npx tsc --noEmit`. From the repo
root: `npm run docs:check`, which is the gate on the `## Not built here` edit above. Note it is not
in danger of firing here, an earlier draft of this plan implied otherwise: that check fails when a
scoped file has no such section at all, and this branch deletes a **clause** from a bullet whose
subject is "The shell's content" - a bullet that survives, because AI Insights and Settings are still
empty below their headers. Nothing in this stack empties that section.

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
