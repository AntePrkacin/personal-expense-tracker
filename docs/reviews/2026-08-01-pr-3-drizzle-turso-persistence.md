# Review: PR #3 - feat(backend): add Drizzle + Turso persistence with a database per user

| | |
| --- | --- |
| PR | #3, `feat/backend-db-bootstrap` into `main` |
| Author | izkreny |
| Scope | 69 files, +5,549 / -123 |
| Reviewed | 2026-08-01, by Claude Code against the branch checkout |

**Verdict: approve with minor changes.** The architecture is sound, the tests are
unusually good, and the documentation matches the code. Two medium findings in the
registration failure paths (findings 1 and 2) are worth fixing in-branch because they
undermine the compensation guarantee the code itself promises; everything else can land
as TODO items or follow-ups.

## Overview

The PR replaces the stock NestJS starter's empty persistence story with Drizzle ORM
(v1 RC) over Turso's engine, behind a single cloud/local seam
(`src/database/turso-client.factory.ts`). A central database resolves identity by email
and points at a per-user database; registration provisions that database, and reads
merge both. Migrations are committed and applied programmatically: central at boot,
per-user on first open. Supporting changes: Joi env validation with all-or-none cloud
variables, a global validation pipe and exception filter registered as DI providers, a
Jest ESM workaround for three ESM-only packages, the Node floor raised to 22.12, CI
actions bumped to v7, and Drizzle's own agent skills committed.

## What stands out

- **The seam holds.** Exactly two files know which mode is active, and every consumer
  types against one `AppDatabase`. Queries genuinely read identically in both modes.
- **The test isolation fix is done right.** Both halves of keeping e2e off the cloud
  (`setup-e2e.ts` stripping the shell, `ignoreEnvFile` under `NODE_ENV=test`) are
  implemented, cross-referenced in comments, and explained as load-bearing. The bug it
  fixes (e2e silently creating real cloud databases) was found and documented honestly.
- **`use_tursodb` is pinned by a dedicated test** with a comment explaining why a silent,
  irreversible misconfiguration deserves its own case. This is exactly what tests for
  undocumented API behavior should look like.
- **User ids are validated before touching paths or database names**
  (`assertValidUserId` backed by `isUuid`), with a unit test that literally tries
  `../../etc/passwd`. Path traversal through the id is closed.
- **`dbAuthToken` never leaves the server.** The response mapping is explicit, and a
  test asserts the absence of all three pointer fields.
- **Tests assert behavior, not wiring.** Rendering Drizzle conditions to SQL to check
  `deleted_at is null`, exercising the concurrent-open dedup with `Promise.all`, and
  covering the lost unique-index race are all substance, not coverage padding.
- The PR description matches the code, including where it deviates from the plan.

## Findings

### 1. A provisioning failure after database creation runs no compensation (medium)

`backend/src/users/users.service.ts:63` calls `provisionUserDb(id)` *outside* the
`try` block whose `catch` performs the rollback. `provisionUserDb` is two cloud calls:
`createUserDatabase` then `mintDbToken`. If creation succeeds and minting fails (or
times out, see finding 5), the error propagates as a 500 and no compensation runs. The
result is an orphaned cloud database named `expensa-user-<id>` that nothing references,
and since a client retry generates a fresh UUID, nothing ever reclaims it. That
contradicts the method's own doc comment ("leaves a client retry able to converge with
no orphans").

**Fix:** move the `provisionUserDb` call inside the `try`. `rollback` already survives
this case by construction: `deleteUserDatabase` ignores 404, the local `rm` uses
`force`, and deleting a central row that was never inserted is a no-op. The name being
derivable from the id alone (the design decision documented in `deleteUserDb`) is
precisely what makes this safe.

### 2. Rollback order can permanently block an email (medium)

`backend/src/users/users.service.ts:144` deletes the user's database first and the
central row second, inside one `try`. If `deleteUserDb` throws (a Turso control-plane
failure, plausibly the same outage that caused the original error), the central-row
delete never runs. That leaves a live `users` row whose profile write never landed: the
duplicate check in `create` now returns 409 for that email forever, while `findById`
404s on the missing profile. A human has to notice and clean the row by hand.

**Fix:** reverse the order. Delete the central row first, then the database. The two
steps are independent (`deleteUserDb` derives the name from the id, not from the row),
and the failure asymmetry favors this order: a leaked database is invisible to users
and costs only storage, a leaked row blocks an email address indefinitely. Deleting
each step in its own try/catch so one failure does not skip the other would be even
more robust.

### 3. Soft delete and the unique email index will conflict (low, latent)

`backend/src/database/central/schema.ts:58` declares `users_email_unique` over all
rows, tombstoned or not. Once anything sets `deletedAt` on a user, that email can never
register again: the duplicate check filters tombstones and passes, the insert trips the
index, and the user gets 409 "Email already registered" for an account that appears
not to exist. Nothing soft-deletes users yet, so this is latent, but the schema
comment says tombstones exist for future sync, so the collision is designed in.

**Suggestion:** a partial unique index (`.where(isNull(table.deletedAt))` on the index
builder) scopes uniqueness to live rows. Verify drizzle-kit generates it correctly for
this dialect before committing to it; if it cannot, record the constraint in
`docs/TODO.md` next to the purge-policy item so the auth/deletion feature does not
rediscover it. The same reasoning applies to `users_db_name_unique`, though UUID-derived
names make that one theoretical.

### 4. Background sync ticks can overlap (low)

`backend/src/database/turso-client.factory.ts:74` drives sync with `setInterval`,
which fires on schedule regardless of whether the previous tick finished. A slow
network plus a short `TURSO_SYNC_INTERVAL_S` allows concurrent `push()`/`pull()` pairs
on the same client, whose behavior under concurrency is undocumented for this RC-stage
driver. An in-flight guard (skip the tick if the previous one has not settled) or a
self-rescheduling `setTimeout` loop removes the possibility cheaply.

### 5. Platform API calls have no timeout (low)

`backend/src/database/turso-platform.service.ts:130` calls `fetch` with no signal. A
hung control-plane request stalls registration indefinitely with the client connection
held open. `AbortSignal.timeout(...)` on the request is a one-line mitigation, and it
also bounds the window in which finding 1 can occur.

### 6. `deleteUserDb` ignores in-flight opens (low, latent)

`backend/src/database/user-database.service.ts:138` checks `connections` but not
`opening`. Deleting a user while their first open is in flight lets the open complete
afterwards, re-creating the local file and caching a handle to a database that was
just deleted. Unreachable from today's only caller (rollback runs strictly after
`getUserDb` settled), but this is a public method on the service that the account
deletion feature will call. Awaiting any in-flight open before tearing down, or at
least documenting the precondition on the method, would keep the trap from being
armed.

## Nitpicks

- `migration.sql` declares `id text PRIMARY KEY` without `NOT NULL`. SQLite's historic
  quirk allows NULL in non-INTEGER primary keys. The app always supplies ids, so this
  is theoretical; adding `.notNull()` to the `id` columns closes it in the next
  migration if it ever matters.
- `CreateUserDto`: `monthlyBudget` has no upper bound, so `1e300` validates and
  overflows SQLite's integer range after `toCents`. A `@Max` reflecting any plausible
  budget costs nothing. `currency` accepts any 3-character string (`"usd"`, `"???"`)
  and is stored verbatim; class-validator ships `@IsISO4217CurrencyCode()`, or at
  minimum an uppercase transform would match the `'USD'` default's casing.
- `test/setup-e2e.ts` says it runs "once per Jest worker"; `setupFiles` actually run
  once per test file. The effect (a fresh temp directory per file) is better isolation
  than the comment claims, so only the comment is wrong.
- `database.types.ts` imports from `drizzle-orm/sqlite-core/async/db`, an internal
  path. Reasonable pragmatism given no public export covers it, but expect it to move
  before v1 final; worth a comment or a TODO entry so the eventual break is diagnosed
  in seconds rather than hours.

## Test coverage

Strong overall: 48 unit tests plus 8 e2e, and the e2e suite exercises real database
files through the full HTTP stack. The compensation path, the unique-index race, the
concurrent-open dedup, the engine flag, secret non-exposure, and every documented error
shape all have explicit cases. Cloud mode is covered at the unit level with the factory
mocked, which is the right boundary; the PR documents manual verification against a
real Turso account including a delete-and-resync cycle.

Gaps worth closing alongside findings 1 and 2: a case where `mintDbToken` rejects
during `create` (pins finding 1's fix), and a case where `deleteUserDb` rejects during
rollback (pins finding 2's ordering). Both are cheap with the existing mocks.

## Security

- Input validation is thorough at both edges: DTO validation with `whitelist` and
  `forbidNonWhitelisted` globally, plus UUID gating before ids reach filesystem paths
  or remote database names.
- Error handling never leaks internals: Platform API response bodies are logged
  server-side and reduced to a generic 500, and the exception filter does the same for
  anything unexpected.
- Accepted risks, both already recorded in `docs/TODO.md`: per-user data-plane tokens
  are stored in plaintext in the central database, and every token is non-expiring
  with manual rotation. Fine for an MVP; the rotation tooling note in TODO is the
  right mitigation.
- One risk worth stating explicitly: in cloud mode, unauthenticated `POST /api/users`
  lets anyone with the URL create real Turso databases, so cost exposure is bounded
  only by Turso quotas. The endpoints are documented as pre-auth scaffolding, but if
  this backend is ever deployed cloud-mode before auth lands, it needs rate limiting
  or a shared secret first. A one-line addition to TODO's operational section would
  make that visible.

## Conclusion

This is careful work: the two-mode seam is clean, the failure modes that were thought
about are handled well and tested, and the documentation is honest about tradeoffs.
The two medium findings are both in the failure paths that were hardest to see, and
both have small, safe fixes (move one call inside the `try`, swap two lines). With
those addressed, this is ready to merge.
