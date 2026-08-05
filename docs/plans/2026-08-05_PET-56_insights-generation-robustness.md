# PET-56: Insights generation robustness (review follow-ups for PET-40/PET-41)

## Context

The combined review of #33 (`feat/PET-41-insight-storage-and-read`) and #34
(`feat/PET-40-insight-generation`), reviewed as one stack, produced five findings: two
robustness items the review said should be tracked rather than silently deferred, and three
quick documentation/defensiveness cleanups. None blocks the stack.

This branch carries all five. It is **stacked on #34** (`feat/PET-40-insight-generation`) and
**does not touch #33 or #34** themselves, so both in-review PRs stay mergeable on their own and
this hardening lands as one follow-up PR on top. When #33 then #34 merge, GitHub retargets this
branch onto `main` (see `docs/CONTRIBUTING.md`, stacked branches).

All work is in `backend/src/insights/` and one additive user-scope migration; there is no
request or response body change (the `empty`/`generating`/`ready` contract is unchanged), so
`npm run api:sync` is expected to be a zero-diff verification, not a real regeneration.

## Findings and approach

1. **Stuck `generating` row has no recovery path (medium).** A process death between the insert
   and completion, or a throw inside the `failed`-marking catch, leaves a row `generating`
   forever: `hasRunInFlight` stays true, so `GET /api/insights` reports `generating` (skeletons
   forever) and every `POST` returns 409, with no API path to clear it. Sub-millisecond window
   today, but load-bearing the moment a slow `LlmInsightGenerator` lands.

   **Approach:** a staleness cutoff, the way the codebase already reasons about token/session
   expiry. A `generating` row older than `GENERATING_STALE_AFTER_MS` (5 minutes) is treated as
   abandoned. `hasRunInFlight` counts only *fresh* `generating` rows (`created_at` within the
   cutoff), so a stale one no longer wins the read state and no longer blocks a new run. The
   read stays a pure read (no write); `generate()` is the write path that reclaims a stale row by
   flipping it to `failed` before starting a new run, which is also what frees finding 2's index.

2. **Single-run guard is check-then-insert, not atomic (low-medium).** `generate()` does
   `if (await hasRunInFlight(db)) throw 409` then `insert(... 'generating')`; two concurrent
   POSTs can both pass the check and both insert. A26 disables the regenerate button, but an API
   client can still race it.

   **Approach:** the repo's own idiom, a **partial unique index** on `status = 'generating'`,
   exactly the shape of `categories_fallback_idx`. The second concurrent insert then fails at the
   database; catch that specific unique-constraint error and translate it to the same 409, mirroring
   `isUniqueEmailViolation` in `auth.service.ts`. This is why finding 1's reclaim-before-insert is
   mandatory rather than optional once the index exists: a lingering stale `generating` row would
   otherwise brick every future run with a unique-constraint failure.

3. **Non-null assertions on nullable columns in `getSet` (low).** `getSet` builds
   `summary: { headline: ready.summaryHeadline!, body: ready.summaryBody! }`. The invariant holds
   in this code but is convention-only.

   **Approach:** a defensive guard, treat a `ready` row missing its content as not-ready (fall
   back to the derived `empty`/previous behaviour) rather than asserting through `null`, so a
   future writer that sets `ready` without content cannot serve a DTO claiming `string` over `null`.

4. **Empty-account placeholder is hard-deleted, not tombstoned (low).** `runGeneration` does a
   real `db.delete(...)` for the empty case, the one departure from the schema's stated
   tombstone convention.

   **Approach:** keep the hard delete (a never-`ready` placeholder has no content to audit) and
   add a one-line comment saying why this row is exempt, so the convention stays honest.

5. **Stale class doc comment (docs).** `insights.service.ts:21` still opens with "Generation
   itself is PET-40", but #34 put generation orchestration (`generate`, `runGeneration`) in this
   exact class.

   **Approach:** rewrite the class-level JSDoc to describe the class as it now is (store, read,
   and orchestrate generation), matching the already-correct `## Insights` in `backend/CLAUDE.md`.

## Design notes

- `GENERATING_STALE_AFTER_MS = 5 * 60 * 1000`, a module constant in `insights.service.ts` with a
  comment tying it to the abandoned-run reasoning. The cutoff is compared against `created_at`
  (set at insert via `$defaultFn`), not `generated_at` (null until `ready`).
- The reclaim in `generate()` is a single `UPDATE ... SET status = 'failed' WHERE status =
  'generating' AND created_at < cutoff AND deleted_at IS NULL`, run before the in-flight check
  and the insert. A reclaimed row carries null content, so the read skips it exactly like any
  other `failed` row (AC6 unchanged).
- The partial unique index is added to the `insightSets` table definition in
  `backend/src/database/user/schema.ts` and a new user-scope migration is generated with
  `drizzle-kit` (never hand-written). It is additive and safe: no live user database carries
  insights yet, so there is no existing pair of `generating` rows for the unique index to reject
  (same "no code repairs a database that predates the migration" stance as the fallback index).

## Tasks

- [ ] Write this plan, commit it alone as the branch's first commit, open a draft PR stacked on #34
- [ ] Fix 5: rewrite the stale class-level JSDoc on `InsightsService`
- [ ] Fix 4: comment justifying the empty-case hard delete in `runGeneration`
- [ ] Fix 3: defensive `ready`-without-content guard in `getSet`, dropping the non-null assertions
- [ ] Fix 1: add `GENERATING_STALE_AFTER_MS`; make `hasRunInFlight` count only fresh rows; reclaim stale rows to `failed` in `generate()`
- [ ] Fix 2: add the partial unique index to `insightSets`, generate the user-scope migration, translate the unique-constraint failure to a 409
- [ ] Unit tests (`insights.service.spec.ts`): reclaim UPDATE issued before insert; `hasRunInFlight` query filters on `created_at`; unique-violation to 409 translation (add `update` to the db mock)
- [ ] e2e tests (`insights.e2e-spec.ts`): a stale `generating` row settles the read off `generating` and a new `POST` succeeds and marks the stale row `failed` (extend `seedSet` to accept `createdAt`)
- [ ] Run gates from `backend/`: `npm run build`, `npm run lint`, `npm run test`, `npm run test:e2e`; then `npm run api:sync` from repo root and confirm zero diff
- [ ] Push, tick the PR checklist, mark the PR ready for review

## Out of scope

- The frontend insights screens (PET-42/43/44) and the dashboard teaser wiring (already in #33).
- Any change to the `empty`/`generating`/`ready` contract or the four content rules.
- Retuning `RECURRING_MONTHS` or the projection/subscription copy nits from the review (deferred
  behind the `INSIGHT_GENERATOR` seam, noted in the review as not worth a code change here).
