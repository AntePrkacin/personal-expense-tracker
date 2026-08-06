# PET-25 — AI insight teaser card on the dashboard

[PET-25](https://decode.atlassian.net/browse/PET-25) — `[FE] Build AI insight teaser card on
dashboard`. Figma: [04
Dashboard](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=21-4)
and [05 Dashboard -
Empty](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=44-706).

Base branch is `feat/PET-24-recent-transactions-card`, so this is a stacked branch and its PR
targets that branch rather than `main`. Position 5 of 6 in the Dashboard stack.

**This is the one branch in the stack that touches the backend**, and therefore the one that carries
a regenerated `backend/openapi.json` and `frontend/src/types/api.d.ts`. It sits second-to-last so
only PET-26 inherits those artifacts.

## Why

The fifth and last slot in PET-21's grid. DSH-9: a dark "AI INSIGHTS" card in the right column
carrying a headline, a body and an "Open insights →" button. In frame 05 the same card changes copy
entirely, to "Insights unlock after your first expense." over "Log a few expenses and I'll surface
patterns and ways to save." with an "Add transaction →" button.

The insights half of the app is built: PET-40 generates sets, PET-41 stores them and serves
`GET /api/insights`, PET-56 hardened the run lifecycle, and PET-20 wired a teaser field into the
dashboard response. Nothing in the frontend reads any of it.

## The contract is one field too narrow, and this ticket widens it

**AC1 is unbuildable as the contract stands.** It asks the card to show "that set's teaser headline
and body, not hardcoded copy", and the frame draws both. `DashboardResponseDto.insight` is
`string | null`, documented as "the headline of the most recently generated insight set". There is no
body in the response.

The width is not accidental in a way that argues against changing it. `InsightsService.latestReadySet()`
already selects the whole row and already filters on **both** `summaryHeadline` and `summaryBody`
being non-null - it treats a row missing either as a broken invariant to skip rather than an answer -
and `latestReadyTeaser()` then returns `summaryHeadline` and discards the body it was handed.
`InsightSummaryDto` already exists in the contract with exactly `headline` and `body`, and
`InsightSetResponseDto` already uses it.

Three options, weighed in the Jira comment and repeated here because the plan is what a reviewer
reads:

1. **Widen `insight` to `InsightSummaryDto | null`.** `latestReadyTeaser` becomes
   `latestReadySummary`, returning the two fields off the row it already has, and the DTO's
   `@ApiProperty` changes type. Then `npm run api:sync` from the root and both artifacts commit.
2. **Call `GET /api/insights` from the dashboard as a second read.** Rejected. PET-20's endpoint
   exists so that one call serves the whole screen, and this would add a second guarded round trip
   to the app's landing route for one card - on the screen a user hits immediately after following
   a login link, where `docs/TODO.md` already tracks the perceived-latency cost of the verify
   handler plus the redirected render.
3. **Render the headline alone.** Rejected. It drops a designed element with nothing recording it,
   and leaves the body copy - which the insight generator is already writing and storing - visible
   nowhere in the app until PET-44 builds frame 16.

**Option 1, and it does not contradict PET-20's amendment.** That amendment promised the response
shape would not change *when PET-41 landed*, and it did not: PET-41 filled the field that was
already there. This is a different discovery - that the field was cut one string too narrow for the
card it was cut for - made by the first ticket that actually renders it. Nothing else in either app
reads `insight`, so widening it breaks no caller, and CI's two freshness gates prove the change
propagated.

`backend/CLAUDE.md`'s Dashboard section and `docs/agents/api-contract.md` both get the note. The
backend change is small enough to belong in this ticket rather than a `[BE]` ticket of its own,
and splitting it would mean a backend PR whose only justification lives in a frontend ticket.

## Decisions

**AC3's condition is `insight === null`, and it needs no third state.** The contract documents that
null covers both "nothing has been generated yet" and "the first run is still in flight", which is
the distinction `InsightSetResponseDto.state` exists to draw for frame 16 and which this card
deliberately does not need: a teaser has nothing useful to say while a first run is in flight, and
the unlock copy is honest in both cases. So two branches, not three, and no skeleton here. Note this
is why the dashboard read stays a single field rather than borrowing `state` - the card that needs
`generating` is PET-44's, and it reads the insights endpoint directly.

**AC3 and AC4 mean this ticket owns its own empty state, and PET-26 does not build it.** Frame 05's
treatment for this card is fully specified in this ticket's own criteria - both strings and the
button - so building it here is the only way PET-25 ships a complete card. PET-26's description
mentions the teaser switching to unlock copy; its Jira comment now records that the clause resolves
here and that PET-26 verifies rather than builds it. This is the only overlap in the epic and it is
resolved in writing on both tickets.

**The card is `bg-neutral` with `text-neutral-content`.** daisyUI's always-dark slot, which is what
keeps a surface dark in both themes - the same mechanism `ui/Sidebar`'s panel uses, and
`frontend/src/components/CLAUDE.md` records why. Explicitly **not** a `dark:` variant, which the
repo forbids outright, and not a raw palette class, which would compile and quietly bypass the
theme. AC5 asks for exactly this and names it "the dark Ink surface tokens" - the Ink token is dead
with the rest of the Foundations page, and `bg-neutral` is its live equivalent.

**The two buttons are different kinds of control, which is the one structural decision here.**
"Open insights →" navigates, so it is `ui/Button` with an `href` reading `SIDEBAR_HREFS.insights` -
a real route with a real `page.tsx`, unlike the Categories tab that must not become a link.
"Add transaction →" acts, so it is `AddTransactionButton`. `ui/Button`'s props are an exclusive
union precisely so these cannot be confused, and `npm run build` is what rejects the combination.

**`AddTransactionButton` here is the fourth trigger and costs nothing to add**, which
`frontend/src/app/CLAUDE.md` predicted in as many words: the modal is mounted once on the shell so
"PET-20's DSH-9 teaser and PET-44's INS-7 card each add a trigger in two lines with no prop
threading". This is that ticket, and the prediction holds - but note the button's **variant** differs
from the header's primary one, so whatever `AddTransactionButton` hard-codes may need a prop. If it
does, that is a prop on the trigger rather than a second trigger component.

**The insight copy is never written here, and the test suite must not fix it.** AC1's "not hardcoded
copy" is the criterion, so the card renders whatever the response carries and its suite passes the
strings in as fixtures. The generator's own content rules are PET-40's. What this card **does** own
is that the headline is a heading rather than a paragraph, so the card has a real accessible
structure in both states.

## Shape

`backend/src/insights/insights.service.ts` - `latestReadySummary()` replacing `latestReadyTeaser()`,
returning `{ headline, body } | null` off the row `latestReadySet()` already fetches.

`backend/src/dashboard/dto/dashboard-response.dto.ts` - `insight` typed `InsightSummaryDto | null`.

`backend/src/dashboard/dashboard.service.ts` - the one call site.

Both `insights.service.spec.ts` and `dashboard.service.spec.ts` extend to the new shape, then
`npm run api:sync` from the root and both generated artifacts commit.

`(app)/dashboard/InsightTeaserCard.tsx` - the two states, the dark surface, and the two controls. A
Server Component; `AddTransactionButton` carries its own client boundary.

`(app)/dashboard/page.tsx` - one line, the fifth slot filled.

## Tasks

- [ ] Commit this plan alone and open the draft PR against
      `feat/PET-24-recent-transactions-card`
- [ ] `insights.service.ts`: `latestReadySummary`, and its spec
- [ ] `dashboard-response.dto.ts` and `dashboard.service.ts`: the widened field, and its spec
- [ ] `npm run api:sync` from the root; commit `backend/openapi.json` and
      `frontend/src/types/api.d.ts`
- [ ] `(app)/dashboard/InsightTeaserCard.tsx` and its suite: both states, both controls, the
      heading structure
- [ ] `(app)/dashboard/page.tsx`: fill the teaser slot
- [ ] Stories: `Shell/AI insight teaser` in both states; re-check `Screens/04 Dashboard` against
      node `21:4` and the teaser half of `05` against node `44:706`
- [ ] Docs: `backend/CLAUDE.md` (Dashboard, the widened field), `docs/agents/api-contract.md`,
      `frontend/src/app/CLAUDE.md` (the fourth Add transaction trigger, the two-state card), root
      `CLAUDE.md`
- [ ] Comment on PET-25 confirming the widen shipped, and note on PET-26 that AC3/AC4 are satisfied
      here

**`npm run api:sync` is required on this branch.** It is the one branch in the stack that changes a
response body, and drift is a CI failure in two halves - the backend job regenerates the spec and
the frontend job regenerates the types, each failing on a non-empty `git diff`.

## Verification

From `backend/`: `npm run lint`, `npm run build`, `npm test`, and the e2e suite - `openapi.e2e-spec.ts`
asserts against the committed JSON, so it is the one that notices a missed `api:sync`. From
`frontend/`: `npm run lint`, `npm test`, `npm run build` and `npx tsc --noEmit`. From the repo root:
`npm run docs:check`.

Then confirm the two artifacts are actually fresh, because this is the failure that is invisible
locally and red on the PR: re-run `npm run api:sync` and check `git status` reports nothing.

Then the app itself, signed in, in **Chrome**:

1. With a generated insight set, the card shows that set's headline and body and neither string
   appears in `frontend/src` (AC1) - grep for a fragment of the rendered headline to prove it
2. "Open insights" opens `/insights` (AC2)
3. On an account with no insight set, the card shows the unlock title and body with "Add
   transaction" instead (AC3)
4. That button opens the Add transaction modal over the dashboard (AC4)
5. The card is dark in **both** light and dark mode, and its text is legible in both (AC5) - read
   the computed `background-color` and confirm it resolves through `--color-neutral` rather than
   being a fixed hue

Reaching state 1 needs a set to exist. `POST /api/insights/generate` is the endpoint PET-40 and
PET-56 built; generating against an account with a few transactions is the cheapest route, and it
also confirms the widened field carries a real body rather than an empty string.

Then `Shell/AI insight teaser` in both states in Storybook. The unlock state renders
`AddTransactionButton`, so that story needs `AddTransactionProvider` inside `render` and the
`appDirectory` parameter, for the reasons PET-21's plan sets out - a decorator will work in the
browser and throw under Jest.
