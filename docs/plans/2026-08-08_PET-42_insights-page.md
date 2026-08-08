# PET-42: Build the AI Insights page, and cut two content rules

## Context

`/insights` is one of the two remaining empty `<main>` elements in the app shell. The
backend behind it has been complete since PET-41, PET-40 and PET-56: `GET /api/insights`
serves the whole screen in one read, reporting `state` as `empty`, `generating` or `ready`
with the latest ready set's content attached independently of that state.

This is the bottom of a three-branch stack that finishes the AI Insights epic:

- **PET-42 (this branch)** - the ready state, the data layer, and the generator cut.
- **PET-44** - the empty state and the first-generation trigger. See
  `docs/plans/2026-08-08_PET-44_insights-empty-state.md`.
- **PET-43** - the regenerate flow and the generating skeletons. See
  `docs/plans/2026-08-08_PET-43_insights-regenerate-flow.md`.

It is bottom of the stack because it creates `frontend/src/lib/insights.ts`, which both
branches above import, and because it changes the API contract, which both inherit.

**The ticket was relabelled from `Frontend` to `FULL` at the 2026-08-08 design review**, and
this plan is why. The review cut two of the generator's four content rules, so the backend
has to lose them in the same change: a frontend-only branch would build a grid for cards the
generator still emits. No new ticket was created for the backend half, by decision.

### The two rules being removed

The generator assembles four independent rules at
`backend/src/insights/rule-based-insight.generator.ts:113-121`, each returning one card or
`null`. Two go:

- **`projectionCard`** (line 244, tone `info`). Removed as duplicated content: the summary
  banner's headline already says the same thing, and the banner is the hero element.
- **`recurringMerchantCard`** (line 285, tone `neutral`). Removed as unreliable by nature.
  It carries no merchant list and needs none - it groups whatever merchant strings the
  user's own transactions contain (line 294) and buckets them by `YYYY-MM` (line 297), then
  demands three or more distinct months, exactly one charge per month (line 313), and every
  monthly total within `RECURRING_TOLERANCE` of the mean. That test cannot separate a
  subscription from a habit: a monthly travel pass at a steady price is mathematically
  identical to Netflix, irregular manual logging disqualifies a genuine subscription, and
  usage-based billing that varies beyond 15% disqualifies it too.

This amends two criteria that already shipped and were accepted: tech spec **INS-4 / AC5**,
and **PET-40 AC5**. PET-40 and PET-62 both stay Done as the record of what shipped; this is
a later decision, not a regression. PET-62 in particular exists only to fix the rule being
deleted here, which is worth knowing before someone reads the deletion as lost work.

### Three traps this plan exists to avoid

**Deleting `projectionCard` must not delete the projection maths.** `summaryOf` (line 357)
uses `projected` to pick between three headlines - "You're over budget this month",
"You're trending over budget" and "You're on track this month" (lines 366-369). Remove the
pace calculation with the card and the banner silently collapses to two states.

**The tone names invert against daisyUI's, twice.** `frontend/CLAUDE.md:64-66` lists the only
theme-aware colours and there is no `indigo` among them. Backend `warning` must render as
`error`, and backend `neutral` must render as `warning`. A name-to-name map is wrong in two
places and compiles cleanly. Worse, per `frontend/CLAUDE.md:81` an interpolated
`bg-${tone}` compiles to nothing with no build error, so the map has to hold complete class
strings - the shape `transactions/[id]/categoryStatus.ts` already uses for `CHIP_CLASSES`.

**A zero-card ready set is the steady state, not an edge case.** `overCapCard` returns null
when nothing is over its cap (line 175) and can only ever fire for a category that *has* a
cap, which is optional and absent on the default `Uncategorized`. `monthOverMonthCard`
returns null with no previous month (line 223) and skips any category with no previous
spend (line 209). So a user who sets no category caps sees the banner alone indefinitely,
and every user sees it alone in month one unless they have already overspent a cap.

## Checklist

- [ ] Add `frontend/src/lib/insights.ts`: the `GET /api/insights` read and the
      `POST /api/insights/generate` trigger, following `lib/dashboard.ts`'s shape and going
      through `lib/session.ts`'s `authorizedGet` like every other authenticated read.
- [ ] Delete `projectionCard` and `recurringMerchantCard` from
      `backend/src/insights/rule-based-insight.generator.ts`, along with the constants
      `RECURRING_MONTHS`, `RECURRING_TOLERANCE` and `RECURRING_NAMED`, and the `joinNames`
      helper if nothing else uses it.
- [ ] Keep `projectedCents` and its elapsed-days pace calculation, and keep passing
      `projected` to `summaryOf`, so the banner keeps all three headline states.
- [ ] Keep the `period: 'all'` transaction read: after the deletion it serves only the
      empty-account check that AC7 depends on. Leaving it as-is is deliberate; turning it
      into a count would touch `TransactionsService` and is out of scope.
- [ ] Narrow `InsightTone` in `backend/src/insights/dto/insight-set-response.dto.ts` to
      `warning | positive | neutral`, and update the `@ApiProperty` enum on `InsightCardDto`
      and the tone docblock that names all four.
- [ ] Run `npm run api:sync` from the repo root; commit the regenerated
      `backend/openapi.json` and `frontend/src/types/api.d.ts`.
- [ ] Remove the specs for both deleted rules from
      `backend/src/insights/rule-based-insight.generator.spec.ts`, including the two PET-62
      added, and add one asserting neither card can ever appear in a generated set.
- [ ] Build the summary banner: dark surface with on-dark text tokens, the `✦ SUMMARY`
      overline, and the headline and body read from the set rather than hardcoded.
- [ ] Build the insight card, with a `Record<InsightTone, string>` of complete daisyUI class
      strings: `warning` to `error`, `positive` to `success`, `neutral` to `warning`. Give it
      a fallback so an unknown stored tone renders neutral styling rather than none.
- [ ] Lay the cards out for one or two, and render no grid element at all when the set has
      none, letting the banner stand alone. No empty container, no placeholder.
- [ ] Change the page header overline from "Your money assistant" to `monthOverline(now)`,
      matching `DashboardScreen.tsx:60` and `TransactionsScreen.tsx:65`. This is a
      deliberate deviation from Figma frame 14, decided at the review.
- [ ] Make the existing hardcoded Regenerate button conditional on `state !== 'empty'`. It
      stays non-functional here; PET-43 wires it up.
- [ ] Add tests: the banner and cards render from the set, the tone mapping is asserted by
      semantics rather than class strings (`frontend/CLAUDE.md:225`), a one-card set renders,
      and a zero-card ready set renders the banner with no grid.
- [ ] Add Storybook stories for the ready state at two cards, one card and zero cards.
- [ ] Update `backend/CLAUDE.md`'s Insights section (lines 521-527), which states four
      content rules and defines what "recurring" means.
- [ ] Update `docs/TODO.md`, whose Insights entry (lines 167-177) names all four detectors,
      and add a note that the recurring-merchant rule was removed as unreliable rather than
      broken, with the caveat that recurrence may not be knowable from transaction data
      alone and that any reimplementation needs better evidence than month counting.
- [ ] Run lint, build and tests in both apps; `npm run docs:check` from the repo root.

## Out of scope

- The `generating` state and any polling. PET-43 owns both.
- The empty state and the first-generation trigger. PET-44 owns both.
- Any change to the insights storage, the read's state derivation, or the single-run guard.
- Turning the empty-account check into a count, per the checklist note above.
- The `info` tone is retired rather than repurposed: nothing is redesigned to use it.
