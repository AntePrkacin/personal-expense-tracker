# PET-44: Build the AI Insights empty state, and trigger the first generation

## Context

This is the middle branch of the three-branch stack finishing the AI Insights epic:

- **PET-42** - the ready state, `lib/insights.ts`, and the generator cut. See
  `docs/plans/2026-08-08_PET-42_insights-page.md`.
- **PET-44 (this branch)** - the empty state and the first-generation trigger.
- **PET-43** - the regenerate flow and the generating skeletons. See
  `docs/plans/2026-08-08_PET-43_insights-regenerate-flow.md`.

It sits above PET-42 because it imports `lib/insights.ts`, and below PET-43 because the
trigger it adds is what makes a set exist for PET-43 to regenerate.

### The dead end this fixes

As written, the ticket shipped a screen a user could never get past. **Nothing in either app
has ever triggered a generation.** The only caller of `InsightsService.generate` is
`POST /api/insights/generate`, and no write path invokes it - `rg -in 'insight'
backend/src/transactions/` returns nothing. Combined with the ticket's own AC2, which hides
the Regenerate button whenever the state is `empty`, the loop closed: log expenses, come
back, still read `state: 'empty'`, still no Regenerate, no way to generate anything ever.

This is already on the record at `frontend/src/app/CLAUDE.md:1449`, which puts it plainly -
"nothing in either app generates a set" - because PET-25 hit the same wall building the
dashboard teaser and worked around it there rather than fixing the cause. PET-40's plan had
deferred it explicitly, leaving *who calls the trigger* to "the frontend and a later
decision". This branch is that decision, and it closes assumption **A27**.

### How the page knows it is time, without a new read

The chosen shape is: **when the read returns `state: 'empty'`, fire the generate once and
keep rendering the empty state while it resolves.** Not the skeletons - the empty state.

That ordering is what makes the trade-off acceptable in both directions:

- **A genuinely empty account** sees the designed frame 16 copy, and it stays. The POST is a
  harmless no-op: the generator returns `null` for an account with no transactions, and
  `runGeneration` hard-deletes the placeholder row, so the read falls straight back to
  `empty`. Nothing flashes.
- **An account with transactions but no set** sees the frame 16 copy for the sub-second the
  rule-based generation takes, then the page swaps to the ready state.

The cost is that second case showing "Insights unlock after your first expense" to someone
who has logged expenses, briefly, once per account for the lifetime of that account. That is
a real wart and it is chosen deliberately over the two alternatives, both worse:

- **Gating on a transaction count first.** `GET /api/transactions?period=all` would answer
  it, but there is no `limit` and no pagination by design (A11, TRN-6), so it downloads the
  account's entire history to compute a boolean, on every visit to the page.
- **Reusing the dashboard's `transactionCount`.** Wrong signal. It is the **period's** count,
  not the account's - `InsightTeaserCard.tsx:43` says so - while the generator's empty check
  is account-wide (`period: 'all'`). Someone who logged nothing this month but has history
  would be skipped, and would never get a set.

Showing the skeletons instead of the empty state during the attempt was also rejected: it
puts a loading state in front of the one screen whose whole job is to explain an absence,
and A19 records that the generating skeleton is the only loading state the design has.

## Checklist

- [ ] Render the empty state with `frontend/src/components/EmptyState.tsx`, which was built
      for this frame as its second consumer and names it in its own header comment. Pass the
      `Sparkle` glyph, not `Sparkles`: `ui/Sidebar.tsx:53` records that the design's AI mark
      is the single four-pointed star.
- [ ] Use the designed copy exactly, including the US spelling "analyze" against the file's
      UK spelling elsewhere, which A30 leaves to a later copy pass.
- [ ] Wire the "Add your first transaction" button to the existing `AddTransactionButton`.
      `frontend/src/app/CLAUDE.md:1038` states this is two lines and needs no prop threading
      through `<main>`, because PET-25 already paid for that seam.
- [ ] Fire `POST /api/insights/generate` once when the read returns `state: 'empty'`, using
      the trigger added to `lib/insights.ts` in PET-42. Once per mount, not per render.
- [ ] Keep the empty state on screen while that attempt resolves; do not show skeletons.
- [ ] Swallow a 409 from that POST rather than surfacing it: it means a run is already in
      flight, which is a race with another tab and not an error. PET-43 defines the same
      handling for the Regenerate button.
- [ ] Assert the Regenerate button is absent in this state. PET-42 owns making the button
      conditional; this branch only asserts the behaviour.
- [ ] Add tests: the empty state renders its copy and glyph, the Add transaction modal opens
      from it, the generate is fired exactly once for an empty read, it is not fired for a
      `ready` or `generating` read, and a 409 leaves the page intact.
- [ ] Add a Storybook story for the empty state.
- [ ] Update `frontend/src/app/CLAUDE.md`: the paragraph at 1449-1462 says nothing in either
      app generates a set, which stops being true on this branch. Correct it in place rather
      than appending a contradiction, and note that the teaser's `isEmpty` workaround is now
      the fallback rather than the only behaviour.
- [ ] Update `docs/TODO.md` if it records A27 as open; it is closed by this branch.
- [ ] Run frontend lint, build and tests; `npm run docs:check` from the repo root.

## Out of scope

- The ready state, the banner and the cards. PET-42 owns them.
- Polling, the skeletons, and the Regenerate button's own behaviour. PET-43 owns those.
- Generating on the transaction write path. Considered and rejected at the review: it couples
  the write path and slows `POST /api/transactions` for a read-side concern.
- Any backend change. This branch is frontend-only; the contract it needs already exists.
- The brief wrong-copy window described above. Fixing it properly needs either a cheap
  account-level count on the insights read or a designed third state, and neither is in this
  ticket's scope. It is recorded here so the next reader knows it was chosen, not missed.
