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

## Second round: review of the first round

Reviewing the five fixes above as a diff turned up four more, one of them a real bug the first
round introduced and one a pre-existing bug in merged code that the same root cause explains.
Carried on this branch rather than deferred, because every one of them is in the code this
ticket already touches.

6. **The 409 translation never fired (bug, shipped in the first round).** `isGeneratingConflict`
   read `error.message`, but Drizzle wraps driver errors: the top-level message is the failed SQL
   and the constraint text is on `cause`. So the racing POST the partial unique index exists to
   catch answered **500**, not 409, and no test noticed because the unit test asserted a
   hand-written message string. Found by writing the test that forces a real collision.

   Worth being precise about why reading the wrapper alone fails so quietly: the wrapper's message
   *is* the SQL, so it contains both the table and the column the predicate looks for, and only the
   word "unique" is missing. The check therefore looks like it nearly matched rather than like it
   was reading the wrong object.

   **Approach:** one shared `src/common/unique-violation.ts` that walks the `cause` chain and
   matches `table.column`. `isUniqueEmailViolation` in `auth.service.ts` had the identical bug
   against the same driver, so registration's converge-on-the-winner path was equally dead; both
   call sites now go through the helper. Out of this ticket's nominal scope, in scope for the root
   cause, and leaving a known-broken twin behind would have been worse.

   The walk is **duck-typed on `message` and `cause`, never `instanceof Error`**, which the same
   test forced a second time: the driver builds its error inside its own ESM module, so under
   Jest's module registry `cause instanceof Error` is `false` for an object that prints as an Error
   and carries the constraint text. An instanceof-based walk passes every hand-written unit test
   and then fails against the real driver, which is precisely the failure mode this whole finding
   is about.

7. **A run reclaimed as abandoned could resurrect its own row (bug, from fix 1).** All three of
   `runGeneration`'s writes keyed on the row id alone. Past the cutoff a second run starts, and
   the first, if still alive, would then flip its own `failed` row to `ready` with a fresh
   `generated_at`, winning AC5's newest-set ordering with minutes-old content, or leave cards on a
   set the read will never serve.

   **Approach:** `status = 'generating'` in the `WHERE` of all three, so a run that lost its claim
   is inert; the completion path detects the lost claim through `.returning()` and logs a warning.
   The residual - two runs' transactions genuinely overlapping on the one cached connection - is
   recorded in `docs/TODO.md` with the `issueQueue` fix shape, not solved here.

8. **`getSet`'s content guard discarded a recoverable answer (fix 3, refined).** Degrading a
   content-less newest `ready` row to `empty` blanks the screen even when an older complete set
   exists, which is the opposite of what AC6 does for a `failed` run.

   **Approach:** filter `summary_headline`/`summary_body IS NOT NULL` in `latestReadySet` instead,
   so the previous good set still serves and `latestReadyTeaser` inherits the same rule rather
   than guarding it a second, different way. The `getSet` condition stays as type narrowing.

9. **Two low-value couplings.** `isGeneratingConflict` matched the bare table, so a `newId()`
   primary-key clash would have read as "a run is already in progress"; and the e2e restated the
   five-minute cutoff as a hardcoded six minutes.

   **Approach:** match `insight_sets.status`, and export `GENERATING_STALE_AFTER_MS` so the test
   ages its row against the real constant.

### Tasks

- [ ] Fix 7: guard all three `runGeneration` writes on `status = 'generating'`, detect the lost claim, correct the doc comment that claimed the single-run guard made it the only transaction
- [ ] Fix 6: extract `src/common/unique-violation.ts` walking the `cause` chain duck-typed rather than by `instanceof Error`, route both `isGeneratingConflict` and `isUniqueEmailViolation` through it, spec it against the real wrapped shape and against a foreign-realm cause
- [ ] Fix 8: filter content-less `ready` rows in `latestReadySet`; reduce the `getSet` guard to narrowing
- [ ] Fix 9: match `insight_sets.status` not the table; export `GENERATING_STALE_AFTER_MS` and derive the e2e offset
- [ ] Tests: e2e races two runs and asserts exactly one `ConflictException` (this is what caught fix 6); unit cover for the completion path claiming and losing its row, and for a PK clash not becoming a 409
- [ ] Record in `docs/TODO.md`: the reclaimed-run overlap residual, the index's tombstone asymmetry, and unbounded insight-set growth; correct the stale "categories has no CRUD" and "transactions has no reads" claims in the same file
- [ ] Document in `backend/CLAUDE.md` `## Insights`: the reclaimed-run inertness rule, the SQL-level content filter, and why unique-violation checks must read `cause`
- [ ] Re-run all gates and confirm `api:sync` is still zero-diff

## Out of scope

- The frontend insights screens (PET-42/43/44) and the dashboard teaser wiring (already in #33).
- Any change to the `empty`/`generating`/`ready` contract or the four content rules.
- Retuning `RECURRING_MONTHS` or the projection/subscription copy nits from the review (deferred
  behind the `INSIGHT_GENERATOR` seam, noted in the review as not worth a code change here).
