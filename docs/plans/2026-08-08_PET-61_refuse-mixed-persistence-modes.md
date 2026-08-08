# Plan: PET-61 Refuse to open a plain local database file as a sync replica

## Objective

Make one `DATABASE_DIR` serving both persistence modes fail loudly at open time, instead of
silently destroying rows. The guard goes in `backend/src/database/turso-client.factory.ts`, the
one seam that knows how a connection is opened, so it covers the central database and every
per-user database at once.

## What the failure actually is

The ticket describes the loss as "rows written while the file was a plain local file are not in
the sync engine's change log, so `push()` never sends them". That is the symptom PET-60 saw. A
probe against a throwaway Turso-native database (`pet61-scratch`, created and destroyed on
2026-08-08) against the installed `@tursodatabase/sync` 0.7.2 and `@tursodatabase/database` found
it is worse than that, and that it runs in **both** directions.

| Case | Observed |
| --- | --- |
| Plain local file, after a clean close | `app.db` and `app.db-wal`, nothing else |
| Fresh sync replica, at `connect()` and before any push | `app.db`, `app.db-changes`, `app.db-info`, `app.db-log`, `app.db-wal` |
| Plain file with a live WAL, opened by `connectSync` | throws `Corrupt database: WAL has committed frames but logical log header is missing` |
| Plain file whose WAL was checkpointed, opened by `connectSync` | **adopted silently** |
| Sync replica opened by `connectLocal` | opens, reads and **writes with no complaint** |

Two findings change the shape of the work.

**The adopted rows are not merely unpushed, they are gone.** After the checkpointed plain file was
adopted, a row written while it was plain was not readable *locally* either: the bootstrap
overwrote the file with the cloud's contents. So there is no "compare the replica against Turso
row by row" recovery of the kind PET-60 did, in this variant. Whether a run lands in the throwing
variant or the silent one turns on nothing more than whether the plain engine happened to
checkpoint its WAL, which is not a property anybody can see or control.

**AC4 resolves to "rejected", not "documented as safe".** The plain engine wrote a row into a real
replica file without complaint; the next `connectSync` open discarded it locally and never pushed
it. Local mode adopting a replica is exactly as destructive as the reverse, so the guard is
symmetric rather than one-sided.

## Mechanism

Option 1 from the ticket, confirmed by the probe: `<path>-info` is written by
`@tursodatabase/sync` and never by `@tursodatabase/database`, and it exists from the moment
`connect()` returns rather than from the first push. So one `existsSync` decides which engine owns
a path, before either client is constructed and therefore before any write can be accepted.

- `openCloudDatabase` refuses when `<path>` exists and `<path>-info` does not: a plain file about
  to be adopted.
- `openLocalDatabase` refuses when `<path>-info` exists: a replica about to be written behind the
  sync engine's back.

`-wal` is deliberately not the discriminator - both engines write one. `-changes` and `-log` are
also sync-only and would serve, but one sibling is enough and `-info` was the one present in every
observed replica including a freshly bootstrapped one with an empty `-changes`.

Option 2 (different filenames per mode) stays rejected for the reasons the ticket gives: it is a
migration, and it strands the files already on the Fly volume.

A fresh directory has neither file and is allowed, which is what keeps first boot, CI, the e2e
suite and the OpenAPI emitter working untouched. An existing deployment has real replicas with
`-info` beside them, so the guard is a no-op there - no migration, nothing to backfill.

The failure is a plain `Error`, not an `HttpException`: for the central database it fails the Nest
boot, and for a user database it fails that one request as a 500 through `AllExceptionsFilter`.
Both are loud, which is the whole point - the ticket is explicit that a logged warning would be
missed exactly as reliably as the original bug was.

## Tasks

- [x] Add the guard to `backend/src/database/turso-client.factory.ts`
  - A module-level constant for the `-info` suffix, commented with what was observed and when, so
    the next reader knows it is an empirical fact about the engine rather than a documented API.
  - One helper per direction, called at the top of `openCloudDatabase` and `openLocalDatabase`
    before the client is constructed.
  - Each message names the offending path and both remedies: delete the file and let it
    re-bootstrap, or point `DATABASE_DIR` somewhere else.

- [x] Cover both directions in a new `backend/src/database/turso-client.factory.spec.ts`
  - Cloud rejection uses a genuinely plain file created by `@tursodatabase/database`, per the AC.
    It needs no network: the guard throws before `connectSync` is reached.
  - Local rejection creates the `-info` sibling directly, since minting a real replica would need
    Turso Cloud and the suites are required to stay offline.
  - Both allowed cases are asserted too - a fresh directory in cloud mode, and a plain file in
    local mode - or the guard could pass by rejecting everything.

- [x] Update `backend/src/database/CLAUDE.md` from hazard to guard
  - Rewrite the "One `DATABASE_DIR` must not serve both modes" paragraph: it currently says the
    failure is silent "in one direction", which the probe disproves.

- [x] Update `docs/guides/seeding-dummy-data.md` from hazard to guard
  - Keep the repair procedure, since a directory already mixed before this ticket still needs it.

- [x] Rewrite the `docs/TODO.md` entry
  - It is the register of *deferred* work and this is no longer deferred, so the entry is deleted
    rather than edited. What survives of it - that the two modes share filenames by design and why
    option 2 was not taken - belongs in `backend/src/database/CLAUDE.md` with the guard.

- [x] Verify a deliberately mixed directory now fails loudly, per the Definition of Done
  - Both directions, against real files, not only the spec's fixtures.

- [x] Run the gates: `npm run lint` and `npm run build` in `backend/`, `npm run test`,
      `npm run test:e2e`, and `npm run docs:check` from the root

## Amendments made during implementation

- **The `docs/TODO.md` entry was rewritten in place, not deleted.** The file already has a
  precedent for a resolved hazard: "No operation documents a 500" stays as an entry marked
  "Resolved with PET-14" rather than disappearing, so a reader scanning the register can still
  find what used to be true and when it stopped. This entry follows the same shape, marked
  "Resolved with PET-61", rather than the plan's original call to delete it outright.

## Not in scope

- `npm run api:sync` is not needed: no request or response body changes.
- The e2e suite and the OpenAPI emitter are untouched. Both force local mode against a fresh temp
  directory per run, so neither ever sees a mixed one.
- Nothing repairs a directory that is already mixed. The guard refuses to make it worse and names
  the repair; performing it would mean deleting a database file on the user's behalf.
