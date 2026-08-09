# PET-42-43-44: Build the AI Insights page, regenerate on write, and cut two content rules

## Context

`/insights` is one of the two remaining empty `<main>` elements in the app shell. The backend
behind it has been complete since PET-41, PET-40 and PET-56: `GET /api/insights` serves the
whole screen in one read, reporting `state` as `empty`, `generating` or `ready` with the latest
ready set's content attached independently of that state.

**This branch was a three-branch stack until the 2026-08-09 review, and is now one branch.**
PET-42 (#70), PET-44 (#71) and PET-43 (#72) were opened as a stack and are closed unmerged.
Their three plans never reached `main` - each was its own branch's first commit - so they leave
with the branches rather than being deleted here, and their content is folded into this file.
PET-42 absorbs the scope of all three in Jira, and PET-43 and PET-44 are closed as absorbed.
The branch, this plan and the commits carry the concatenated key `PET-42-43-44`, a first for
this repo:
Jira keys cannot be merged, so the concatenation is a naming convention here and nothing more.

The stack was collapsed because the review found the split was not merely inconvenient but
unbuildable in the order it was stacked. PET-44's AC1 requires the empty state to follow
"PET-43's polling path", and PET-44 was stacked *below* PET-43, so the mechanism its own
acceptance criterion depends on would not have existed on the branch that had to use it.
Splitting a screen by visual state rather than by seam put the trigger, the thing it triggers
and the thing that observes the result on three different branches.

### Why the page no longer triggers anything

The largest design change here is not on the page at all. **A transaction write regenerates the
insight set**, so the Insights page is a pure read plus a Regenerate button, and the whole
question of "who fires the first generation" stops being a frontend concern.

This closes assumption **A27**, which PET-40's plan deferred to "the frontend and a later
decision", and it is the decision.

It also reverses a recorded one, which is why it is argued at length rather than asserted.
`docs/TODO.md:1780-1796` names generate-on-write as "the tempting shortcut" and "the wrong
shape", on the grounds that "a write path firing it would 409 against itself on any burst of
saves". That objection is real and this design answers it three ways:

- **The 409 is swallowed and logged on the write path, never surfaced.** A transaction must not
  fail to save because an insight run is in flight. A 409 means fresh-enough content is already
  being generated, which is a benign outcome rather than an error.
- **The collision window is sub-second, and saves are human-paced.** Rule-based generation
  settles in well under a second, while transactions are entered one modal submit at a time. A
  burst tight enough to collide means two saves inside the same second, which the Add
  transaction modal's own round-trip makes hard to reach.
- **When it does collide, the loser's data is missing from that set until the next write, and
  Regenerate is still there.** The staleness is bounded by one run and self-heals on the next
  save. This is the accepted cost, recorded rather than mitigated.

**The caveat that matters for later**: all three arguments rest on generation being sub-second.
If the `INSIGHT_GENERATOR` seam is ever used to bind a real `LlmInsightGenerator`, runs become
multi-second, the collision window widens to something normal typing pace reaches, and this
trigger needs a debounce or a dirty flag before that swap. That is recorded in `docs/TODO.md`
by this branch, next to the entry it supersedes.

### Why an event emitter and not a direct call

`InsightsModule` already imports `TransactionsModule`, because `RuleBasedInsightGenerator`
injects `TransactionsService` (`rule-based-insight.generator.ts:72`). Having `TransactionsService`
call `InsightsService` closes that loop into a circular module dependency, which NestJS resolves
only with `forwardRef()` on both modules and on the constructor injection.

`@nestjs/event-emitter` is used instead. `TransactionsService` emits; a listener inside
`InsightsModule` calls `generate`. No cycle, no `forwardRef`, and the write path never learns
that insights exist - which answers the coupling half of the `docs/TODO.md` objection rather
than overriding it. It is a first-party NestJS package and the documented solution for exactly
this shape. It is a new dependency, and that is the cost.

**`emitAsync`, not `emit`, and that is load-bearing.** `InsightsService.generate` writes and
commits the `generating` row before it returns - its docblock states this explicitly, so "the
202 the controller sends is truthful and a concurrent read can observe the generating state".
Awaiting the listener carries that guarantee to the transaction write: by the time
`POST /api/transactions` responds, `GET /api/insights` already reports `generating`. A user who
saves an expense and navigates straight to `/insights` gets frame 15 with the skeletons, with
no race and no flash of the wrong state. `emit` alone would not await the listener and would
lose that.

The cost paid on the write path is three quick queries against a database the request already
has open: the stale-reclaim `UPDATE`, the in-flight `SELECT`, and the `INSERT` of the placeholder
row. The generation itself is floated with `void this.runGeneration(...)`
(`insights.service.ts:116`) and is not waited on.

### What this makes true, and what it retires

`state: 'empty'` now genuinely means **this account has never logged a transaction**, because
any write generates. That is what makes the designed frame 16 copy honest, and it satisfies
PET-44's AC6 and A3 as written rather than amending them.

Three things the stacked plans carried are therefore deleted rather than merged:

- **The page's mount trigger.** PET-44's "fire `POST /api/insights/generate` when the read
  returns `empty`" is gone. Nothing fires on mount, so the read-only screen no longer writes to
  the database on every visit, and React Strict Mode's dev double-mount stops causing a second
  POST that 409s.
- **The brief wrong-copy window.** PET-44 accepted showing "Insights unlock after your first
  expense" to an account with expenses, for the sub-second a generation takes. There is no such
  window now: an account with transactions has a set or is generating.
- **A `hasTransactions` field on the read**, considered at the review as the way to distinguish
  the two empty cases. Unnecessary once the write path triggers, so the read keeps its shape.

Accounts that logged transactions *before* this ships keep reading `empty` until their next
write or a Regenerate click. No backfill: test accounts get purged and there are no real users.

### The two rules being removed

The generator assembles four independent rules at
`backend/src/insights/rule-based-insight.generator.ts:113-121`, each returning one card or
`null`. Two go:

- **`projectionCard`** (line 244, tone `info`). Removed as duplicated content: the summary
  banner's headline already says the same thing, and the banner is the hero element.
- **`recurringMerchantCard`** (line 285, tone `neutral`). Removed as unreliable by nature. It
  carries no merchant list and needs none - it groups whatever merchant strings the user's own
  transactions contain (line 294) and buckets them by `YYYY-MM` (line 297), then demands three
  or more distinct months, exactly one charge per month (line 313), and every monthly total
  within `RECURRING_TOLERANCE` of the mean. That test cannot separate a subscription from a
  habit: a monthly travel pass at a steady price is mathematically identical to Netflix,
  irregular manual logging disqualifies a genuine subscription, and usage-based billing that
  varies beyond 15% disqualifies it too.

This amends two criteria that already shipped and were accepted: tech spec **INS-4 / AC5**, and
**PET-40 AC5**. PET-40 and PET-62 both stay Done as the record of what shipped; this is a later
decision, not a regression. PET-62 in particular exists only to fix the rule being deleted here,
which is worth knowing before someone reads the deletion as lost work.

### Six traps this plan exists to avoid

**Deleting `projectionCard` must not delete the projection maths.** `summaryOf` (line 357) uses
`projected` to pick between three headlines - "You're over budget this month", "You're trending
over budget" and "You're on track this month" (lines 366-369). Remove the pace calculation with
the card and the banner silently collapses to two states.

**The tone names invert against daisyUI's, twice.** `frontend/CLAUDE.md:64-66` lists the only
theme-aware colours and there is no `indigo` among them. Backend `warning` must render as
`error`, and backend `neutral` must render as `warning`. A name-to-name map is wrong in two
places and compiles cleanly. Worse, per `frontend/CLAUDE.md:81` an interpolated `bg-${tone}`
compiles to nothing with no build error, so the map has to hold complete class strings - the
shape `transactions/[id]/categoryStatus.ts` already uses for `CHIP_CLASSES`.

**`info` lives in two unrelated namespaces, and only one of them is being narrowed.** Besides
`InsightTone`, `info` is one of the seventeen **category colour tokens** - it appears in
`backend/src/database/central/template-tokens.ts:57`, `template-seed.ts:58` and `:233`,
`legacy-colour-backfill.ts:52`, and the `COLOUR_TOKENS` list in
`backend/test/openapi.e2e-spec.ts:711`, none of which have anything to do with insights. A sweep
for `'info'` while narrowing the tone union would break the palette PET-64 and PET-65 built, and
it would compile. Touch only the insights DTO and the insights specs.

**Narrowing the union does not stop the API serving `info`.** `insights.tone` is a plain `text`
column with no CHECK constraint (`backend/src/database/user/schema.ts:286`) and `cardsFor` does
an unchecked `row.tone as InsightCardDto['tone']` (`insights.service.ts:347`). `projectionCard`
fires for anyone with spend this period, so nearly every set already stored contains an `info`
card, and those accounts read `state: 'ready'`. Without a deliberate step they keep being served
a tone the regenerated OpenAPI enum forbids, and PET-42's AC7 would be true only of newly
generated sets. Two halves are needed: the frontend tone map's fallback so an unknown stored
tone still renders, and the write-path trigger above, which means the first transaction any such
account saves replaces the offending set. Neither alone is enough, and an e2e has to assert the
contract rather than only the rendering.

**A zero-card ready set is the steady state, not an edge case.** `overCapCard` returns null when
nothing is over its cap (line 175) and can only ever fire for a category that *has* a cap, which
is optional and absent on the default `Uncategorized`. `monthOverMonthCard` returns null with no
previous month (line 223) and skips any category with no previous spend (line 209). So a user
who sets no category caps sees the banner alone indefinitely, and every user sees it alone in
month one unless they have already overspent a cap.

**A server-only read cannot be polled by a browser, and one `'use server'` module cannot hold
both halves.** Both traps are the transport, and both are recorded elsewhere in this repo
already. `authorizedGet` reads the httpOnly `spendifico.session` cookie through `next/headers`'
`cookies()` and uses the server-only `BACKEND_URL` (`lib/session.ts:107-120`), so a `useEffect`
poll cannot call it and `lib/dashboard.ts`'s `redirect()`-on-401 shape cannot run in a polling
loop either. Separately, `lib/createTransaction.ts:20-24` states that `'use server'` makes
*every* export a Server Action and an action must be an async function, "so `lib/transactions.ts`
could not have hosted this beside its reads". The three-module split below is what those two
facts require; a single `lib/insights.ts` holding the read and the trigger is not buildable.

### The three frontend modules

- **`frontend/src/lib/insights.ts`** - the server-only read, returning
  `AuthorizedResult<InsightSet>` the way `lib/categories.ts` does rather than redirecting
  internally, so the same function serves both the Server Component and the route handler. The
  page-level wrapper redirects on `unauthenticated`, matching `lib/dashboard.ts`.
- **`frontend/src/app/api/insights/route.ts`** - a GET route handler on the frontend's own
  origin, serving the browser's poll. This is the second of the two read kinds
  `docs/agents/api-contract.md` fixes, and `app/api/categories/route.ts` is the precedent for
  all of it: no-store at both hops, 401 travelling through unchanged rather than becoming a
  redirect, 503 when the backend is unreachable, and `BACKEND_URL` and the bearer token staying
  server-side.
- **`frontend/src/lib/generateInsights.ts`** - a `'use server'` Server Action for the Regenerate
  button's POST. Named after the operation rather than the entity, which
  `lib/createTransaction.ts` and `lib/deleteTransaction.ts` set as the rule for exactly this
  reason.

### Polling, and why there is no two-minute cap

The stacked PET-43 plan capped polling at roughly two minutes, then stopped and re-enabled the
button. That is wrong, and the review caught it: `hasRunInFlight` treats a `generating` row as
live until `GENERATING_STALE_AFTER_MS`, five minutes (`insights.service.ts:29,322`). A click
after the cap can only 409, which this design treats as success and re-enters polling, putting
the page back into skeletons for another two minutes until the backend's self-heal. The cap
added a click to the same wait rather than shortening it.

The read self-heals without any help. `hasRunInFlight` is bounded by `gt(createdAt,
staleBefore())`, and the state is derived as `running ? 'generating' : content ? 'ready' :
'empty'`, so five minutes after an abandoned run the read stops reporting `generating` on its
own, with no POST needed. So: **no cap.** Poll with a backoff, keep the button disabled off
`state === 'generating'` for as long as that holds, and let the backend's own cutoff end it.
Because the button is disabled the whole time, the 409-after-cap path is unreachable. A single
hard ceiling a little past five minutes stays, purely so a wedged timer cannot outlive the
guarantee.

## Checklist

**Backend: the generator cut**

- [ ] Delete `projectionCard` and `recurringMerchantCard` from
      `backend/src/insights/rule-based-insight.generator.ts`, along with the constants
      `RECURRING_MONTHS`, `RECURRING_TOLERANCE` and `RECURRING_NAMED`, and the `joinNames`
      helper if nothing else uses it.
- [ ] Keep `projectedCents` and its elapsed-days pace calculation, and keep passing `projected`
      to `summaryOf`, so the banner keeps all three headline states.
- [ ] Keep the `period: 'all'` transaction read: after the deletion it serves only the
      empty-account check that AC7 depends on. Leaving it as-is is deliberate; turning it into a
      count would touch `TransactionsService` and is out of scope.
- [ ] Narrow `InsightTone` in `backend/src/insights/dto/insight-set-response.dto.ts` to
      `warning | positive | neutral`, and update the `@ApiProperty` enum on `InsightCardDto` and
      the tone docblock that names all four.
- [ ] Update the generator's own class docblock at `rule-based-insight.generator.ts:52-66`,
      which says "the four designed content rules" and "fewer than four cards" in two places.
- [ ] Update the comment at `backend/src/database/user/schema.ts:284`, which enumerates
      `` `warning` | `positive` | `info` | `neutral` `` beside the `tone` column.

**Backend: regenerate on write**

- [ ] Install `@nestjs/event-emitter` in `backend/` and register `EventEmitterModule.forRoot()`
      in `AppModule`.
- [ ] Emit a transaction-changed event from `TransactionsService.create` (line 181),
      `update` (line 214) and `remove` (line 259). All three, because editing or deleting an
      expense moves the numbers exactly as much as adding one.
- [ ] Add the listener inside `InsightsModule`, calling `InsightsService.generate`. Do **not**
      import `InsightsModule` from `TransactionsModule`: `InsightsModule` already imports
      `TransactionsModule` for the generator, and the direct call is the circular dependency the
      emitter exists to avoid.
- [ ] Await the listener with `emitAsync`, so the `generating` row is committed before the
      transaction write responds and a user who navigates straight to `/insights` sees frame 15.
- [ ] Swallow and log a `ConflictException` from that call. A 409 means a run is already in
      flight, which is benign; a transaction must never fail to save because of it. Swallow
      every other error from the trigger too, for the same reason.
- [ ] Add a `generate` call at the end of `backend/src/scripts/seed-showcase.ts`, which writes
      rows straight to the table (`:539-542`) rather than through `TransactionsService` and so
      fires no event. Without this the showcase account lands with no insights at all.
- [ ] Run `npm run api:sync` from the repo root; commit the regenerated `backend/openapi.json`
      and `frontend/src/types/api.d.ts`.

**Backend: tests**

- [ ] Remove the specs for both deleted rules from
      `backend/src/insights/rule-based-insight.generator.spec.ts`, including the two PET-62
      added, and add one asserting neither card can ever appear in a generated set.
- [ ] Fix `backend/src/insights/insights.service.spec.ts:56` and `:81`, whose fixtures use
      `tone: 'info' as const` and stop compiling the moment the union narrows.
- [ ] Fix `backend/test/insights.e2e-spec.ts`: the `tone: 'info'` fixture at line 163, and - the
      important one - the two assertions at lines 405-406. Its own comment states the invariant
      this branch destroys: "Spend in the current period always yields at least the projection
      card." After the cut, spend guarantees no card at all. Decide explicitly between seeding
      that account so a surviving rule fires (a category over its cap is the only one reachable
      without a previous month) and relaxing the assertion to tolerate zero cards. Do not simply
      delete the line: it is the only e2e coverage that a ready set carries cards.
- [ ] Add an e2e asserting the write-path trigger: creating a transaction leaves
      `GET /api/insights` reporting `generating` or `ready` rather than `empty`, and a second
      create while a run is in flight still returns 201.
- [ ] Add an e2e asserting no served card ever carries a tone outside the narrowed enum, so the
      stale-`info` hazard is covered by the contract and not only by the frontend's fallback.
- [ ] Check `backend/test/dashboard.e2e-spec.ts`, which also references insights, for any
      assertion on tones or card counts.

**Frontend: the data layer**

- [ ] Add `frontend/src/lib/insights.ts`: the server-only `GET /api/insights` read returning
      `AuthorizedResult`, per the three-modules section above.
- [ ] Add `frontend/src/app/api/insights/route.ts`, the browser-facing GET the poll calls,
      following `app/api/categories/route.ts` for the no-store headers and the 401/503 split.
- [ ] Add `frontend/src/lib/generateInsights.ts`, the `'use server'` action behind Regenerate.

**Frontend: the three states**

- [ ] Build the summary banner: dark surface with on-dark text tokens, the `✦ SUMMARY` overline,
      and the headline and body read from the set rather than hardcoded.
- [ ] Build the insight card, with a `Record<InsightTone, string>` of complete daisyUI class
      strings: `warning` to `error`, `positive` to `success`, `neutral` to `warning`. Give it a
      fallback so an unknown stored tone - `info` from a set generated before this branch -
      renders neutral styling rather than none.
- [ ] Lay the cards out for one or two, and render no grid element at all when the set has none,
      letting the banner stand alone. No empty container, no placeholder.
- [ ] Render the empty state with `frontend/src/components/EmptyState.tsx`, which was built for
      this frame as its second consumer and names it in its own header comment. Pass the
      `Sparkle` glyph, not `Sparkles`: `ui/Sidebar.tsx:53` records that the design's AI mark is
      the single four-pointed star.
- [ ] Use the designed empty-state copy exactly, including the US spelling "analyze" against the
      file's UK spelling elsewhere, which A30 leaves to a later copy pass.
- [ ] Wire the "Add your first transaction" button to the existing `AddTransactionButton`.
      `frontend/src/app/CLAUDE.md:1038` states this is two lines and needs no prop threading
      through `<main>`, because PET-25 already paid for that seam.
- [ ] Build the generating banner: the `✦ ANALYZING YOUR SPENDING...` overline with three
      skeleton bars replacing the headline and body.
- [ ] Build the skeleton card, a circle plus bars, and render **as many as the last-good set
      had** rather than four. The cut takes the maximum card count to two, so the ticket's "the
      four cards become skeleton cards" no longer describes anything reachable. Render no
      skeleton cards when the last-good set had none.

**Frontend: the regenerate flow**

- [ ] Poll `GET /api/insights` through the route handler while `state === 'generating'`, first
      tick after roughly 500ms, then backing off. Rule-based generation settles in well under a
      second, so most runs resolve on the first tick.
- [ ] Do not cap the poll at two minutes. Keep polling while the state holds and let the
      backend's own five-minute self-heal end it, per the polling section above. Keep one hard
      ceiling a little past five minutes as a timer-leak guard only.
- [ ] Derive the button's label and disabled state from `state === 'generating'`, never from a
      local click flag. This is what makes a reload mid-run, a run started in another tab, and a
      run started by saving a transaction all render correctly.
- [ ] Show the Regenerate button only when `state !== 'empty'`.
- [ ] Fire the generate action on click, and treat a 409 as success rather than an error: it
      means a run is already in flight, so enter polling.
- [ ] Compare `generatedAt` across the poll to distinguish a new set from nothing new, and show
      the returned content either way without an error state. It is written at exactly one
      place, `insights.service.ts:166`, inside the transition to `ready`, so it advances only
      when a run actually completes - which is what makes a failed run's invisibility (AC6)
      survivable without a designed error state.
- [ ] Stop polling on unmount, so navigating away does not leave a timer running.
- [ ] Add no cancel control, matching the design; there is no backend affordance for one either.
- [ ] Change the page header overline from "Your money assistant" to `monthOverline(now)`,
      matching `DashboardScreen.tsx:60` and `TransactionsScreen.tsx:65`. A deliberate deviation
      from Figma frame 14, decided at the 2026-08-08 review.

**Frontend: tests and stories**

- [ ] Add tests: the banner and cards render from the set, the tone mapping is asserted by
      semantics rather than class strings (`frontend/CLAUDE.md:225`), a one-card set renders, a
      zero-card ready set renders the banner with no grid, and a stored `info` tone falls back
      rather than rendering unstyled.
- [ ] Add tests: the empty state renders its copy and glyph, the Add transaction modal opens
      from it, the Regenerate button is absent, and **nothing is POSTed on mount in any state** -
      the regression test for the trigger this branch deliberately removed.
- [ ] Add tests: clicking Regenerate fires the action and switches to skeletons, the button is
      disabled while generating, a mounted page already in the generating state shows skeletons
      without a click, an unchanged `generatedAt` leaves the previous set on screen and
      re-enables the button, a changed one swaps in the new set, a 409 enters polling instead of
      erroring, and the poll stops on unmount.
- [ ] Add Storybook stories for the ready state at two cards, one card and zero cards; the empty
      state; and the generating state at two skeleton cards and at none.

**Documentation**

- [ ] Reword the two comments in `backend/src/scripts/seed-showcase.ts` that justify themselves
      by the deleted rule: the `SUBSCRIPTIONS` docblock at lines 80-89 ("exactly the property
      the insight rule looks for") and `SUBSCRIPTION_CATEGORY` at 146-156 (the
      "recurring-merchant story"). **The seed data itself stays** - a realistic account has
      subscriptions in it, and the fixed-day, fixed-amount shape still keeps the transaction
      list from stacking five identical rows on one date. Only the stated reason changes.
- [ ] Update `backend/CLAUDE.md`'s Insights section (lines 521-527), which states four content
      rules and defines what "recurring" means, and add the write-path trigger and its
      `emitAsync` guarantee.
- [ ] Update `docs/TODO.md`'s "Insights are generated by rules, not an LLM" entry (lines
      167-177), which names all four detectors and the three-month recurrence threshold. Note
      that the recurring-merchant rule was removed as unreliable rather than broken, with the
      caveat that recurrence may not be knowable from transaction data alone and that any
      reimplementation needs better evidence than month counting.
- [ ] Replace `docs/TODO.md`'s "Nothing in the running app generates an insight set" entry
      (lines 1780-1796), which this branch closes and whose closing paragraph argues against the
      very trigger being added. Record the reversal and its reasoning, not just the outcome.
- [ ] Add a `docs/TODO.md` entry for the LLM caveat: the write-path trigger's safety rests on
      sub-second generation, so binding an `LlmInsightGenerator` to `INSIGHT_GENERATOR` needs a
      debounce or a dirty flag first.
- [ ] Add a `docs/TODO.md` forward note: if the cards later move to the Dashboard and `/insights`
      becomes an interactive AI chat, `InsightsService` and both tables stay as they are and the
      Dashboard already composes the service for the teaser, so the move is a DTO field plus UI
      work. The chat should take its own module and segment name rather than overloading
      `insights`, and `INSIGHT_GENERATOR` is a seam for generating a persisted set, not for
      conversation.
- [ ] Update `frontend/src/app/CLAUDE.md`: the paragraph at 1449-1462 says nothing in either app
      generates a set, which stops being true here. Correct it in place rather than appending a
      contradiction, and note that the teaser's `isEmpty` workaround is now a fallback.
- [ ] Correct the two places attributing the generating skeleton to PET-44
      (`frontend/src/app/CLAUDE.md:1458` and `InsightTeaserCard.tsx:32`) when INS-5 belongs to
      PET-43. Deliberately deferred while these were three branches, because it was nobody's;
      on one branch owning all three tickets it is in scope and cheap.
- [ ] Update `docs/TODO.md` if it records A27 as open; it is closed by this branch.

**Gates**

- [ ] Run lint, build and tests in both apps; `npm run docs:check` from the repo root.
- [ ] Walk the three states in a browser, per `docs/agents/claude-tooling.md`. Include the one
      thing no test asserts: regenerate, navigate to `/dashboard`, and confirm the teaser shows
      the newer set rather than a client-router-cached older one.

## Out of scope

- Any change to the insights storage, the read's state derivation, or the single-run guard.
- Turning the empty-account check into a count, per the checklist note above.
- The `info` tone is retired rather than repurposed: nothing is redesigned to use it.
- A backfill for accounts holding pre-cut sets with `info` cards. Test accounts get purged and
  there are no real users; the first write or Regenerate replaces the set.
- A designed failure state. A26 records that failure is not designed and the contract makes it
  invisible, so inventing an error banner would contradict both.
- A debounce or dirty flag on the write-path trigger. Argued above: unnecessary at sub-second
  generation, and recorded in `docs/TODO.md` as a prerequisite for an LLM generator.
- Regenerating on a category-cap or monthly-budget change. Both move what the cards say - the
  over-cap rule reads caps and the banner reads the budget - so both are genuinely stale until
  the next transaction write. Left out because this ticket is about transactions, and recorded
  here so a later reader knows it was seen.
- The overlapping-reclaimed-run hazard in `docs/TODO.md`, where a run past the stale cutoff can
  collide with its replacement on the one cached connection. Unchanged by this branch.
- **PET-60's acceptance criterion that all four insight rules fire believably on a freshly
  seeded showcase account.** It becomes unsatisfiable here, because only two rules will exist.
  PET-60 stays Done as the record of what shipped, and no ticket is raised for it; this line
  exists so a later reader does not diagnose the seed as broken. The showcase account will still
  exercise both surviving rules, since it has capped categories and more than one month of
  history.
