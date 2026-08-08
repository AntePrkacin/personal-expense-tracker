# PET-43: Build the Regenerate flow and the generating skeletons

## Context

This is the top branch of the three-branch stack finishing the AI Insights epic:

- **PET-42** - the ready state, `lib/insights.ts`, and the generator cut. See
  `docs/plans/2026-08-08_PET-42_insights-page.md`.
- **PET-44** - the empty state and the first-generation trigger. See
  `docs/plans/2026-08-08_PET-44_insights-empty-state.md`.
- **PET-43 (this branch)** - the regenerate flow and the generating skeletons.

It sits on top because it needs both: the ready state to return to, and a set to exist in
the first place. With this branch merged the AI Insights `<main>` is complete, leaving
Settings as the only empty one in the shell.

### What the original ticket got wrong

The seven acceptance criteria never named **polling**, which is the mechanism the backend
contract actually specifies. `POST /api/insights/generate` returns **202** and generates in
the background; the route's own description says to poll `GET /api/insights` and render
skeletons while `state` is `generating`. Without that, AC4 and AC5 - "the run finishes",
"the run fails" - describe events the page has no way to observe.

AC5 was worse than incomplete. **A failed run is invisible on purpose.** The row is marked
`failed` and the read falls back to the previous ready set, so no error ever reaches the
frontend. AC5 as written implied the page detects failure and restores the previous set;
there is nothing to detect and nothing to restore.

The fix is `generatedAt`. It is written at exactly one place,
`backend/src/insights/insights.service.ts:166`, inside the transition to `ready`, so it
advances only when a run actually completes. That makes it a reliable change signal: when
`state` leaves `generating`, a changed `generatedAt` means a new set arrived, and an
unchanged one means the run failed or produced nothing. Either way the page shows the
current content and re-enables the button, which is the behaviour A26 asks for.

### Verified before committing to this design

- **PET-41 AC3** already specifies the read reports the generating state "so the page can
  show skeletons", so polling is the intended consumption rather than an invention here.
- **PRs #33 and #34** (PET-41 and PET-40) carry no inline review comments, so nothing in
  review contradicts it.
- **409 is real**: `ConflictException` is thrown twice in `InsightsService.generate` and
  declared on the route as `@ApiErrorResponse(HttpStatus.UNAUTHORIZED, HttpStatus.CONFLICT)`.
- **Polling will not be rate limited.** This was the one thing that could have sunk a 2s
  interval. `ThrottlerModule` is configured inside `AuthModule` (`auth.module.ts:77`) and
  `ThrottlerGuard` is applied to `AuthController` alone (`auth.controller.ts:85`), so
  `GET /api/insights` carries no throttler at all.
- **`GENERATING_STALE_AFTER_MS` is 5 minutes**, the backend's self-heal cutoff for an
  abandoned run. That is a recovery budget, not a UX one, which is why the poll needs its own
  shorter ceiling.

## Checklist

- [ ] Poll `GET /api/insights` every 2s while `state === 'generating'`, with the first tick
      after roughly 500ms. Rule-based generation settles in well under a second, so most runs
      resolve on the first tick.
- [ ] Derive the button's label and disabled state from `state === 'generating'`, never from
      a local click flag. This is what makes a reload mid-run, or a run started in another
      tab, render correctly.
- [ ] Fire `POST /api/insights/generate` on click via `lib/insights.ts`, and treat a 409 as
      success rather than an error: it means a run is already in flight, so enter polling.
      Same handling PET-44 uses for its automatic trigger.
- [ ] Compare `generatedAt` across the poll to distinguish a new set from nothing new, and
      show the returned content either way without an error state.
- [ ] Cap the polling at roughly 2 minutes, then stop and re-enable the button rather than
      leaving the page in skeletons for the full 5-minute backend cutoff.
- [ ] Stop polling on unmount, so navigating away does not leave a timer running.
- [ ] Build the generating banner: the `✦ ANALYZING YOUR SPENDING...` overline with three
      skeleton bars replacing the headline and body.
- [ ] Build the skeleton card, a circle plus bars, and render **as many as the last-good set
      had** rather than four. PET-42 cuts the maximum card count to two, so the ticket's
      "the four cards become skeleton cards" no longer describes anything reachable. Render
      no skeleton cards when the last-good set had none.
- [ ] Add no cancel control, matching the design; there is no backend affordance for one
      either.
- [ ] Add tests: clicking Regenerate fires the POST and switches to skeletons, the button is
      disabled while generating, a mounted page already in the generating state shows
      skeletons without a click, an unchanged `generatedAt` leaves the previous set on screen
      and re-enables the button, a changed one swaps in the new set, a 409 enters polling
      instead of erroring, and the poll stops at the cap and on unmount.
- [ ] Add Storybook stories for the generating state at two skeleton cards and at none.
- [ ] Confirm the dashboard teaser reflects a newer set after a regenerate. It reads
      `DashboardResponseDto.insight`, which composes `InsightsService.latestReadySummary`, so
      this needs asserting rather than implementing.
- [ ] Run frontend lint, build and tests; `npm run docs:check` from the repo root.

## Out of scope

- The ready state, the banner content, the cards and the tone map. PET-42 owns them.
- The empty state and the automatic first generation. PET-44 owns them.
- Any backend change: the 202, the 409, the state derivation and the stale-run self-heal all
  already exist and are correct for this.
- A designed failure state. A26 records that failure is not designed, and the contract makes
  it invisible; inventing an error banner here would contradict both.
- **Correcting the two places that attribute the generating skeleton to PET-44**
  (`frontend/src/app/CLAUDE.md:1458` and `InsightTeaserCard.tsx:32`), when INS-5 belongs to
  this ticket. Raised at the 2026-08-08 review and deliberately left alone, so do not
  "helpfully" fix it in passing here.
- The overlapping-reclaimed-run hazard in `docs/TODO.md`, where a run past the stale cutoff
  can collide with its replacement on the one cached connection. Unchanged by this branch.
