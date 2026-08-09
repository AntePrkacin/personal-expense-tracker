# Plan: PET-71 Reset every database and the Fly volume to a clean state

## Objective

Turn the manual "wipe everything back to clean" sequence into one command. Clearing test accounts
today means roughly a dozen order-dependent steps spread across the Turso Platform API, `flyctl`
and the local filesystem, and the order is not obvious from any file in the repo.

## Context

This was carried out by hand on 2026-08-09, against 8 user databases and a central database
holding 8 users, 29 login links and 21 sessions. Three things learned during that run are the
reason this is a script rather than a checklist in a guide.

**The ordering is load-bearing, and getting it wrong fails silently.** The Fly volume holds
embedded replicas, not caches, and they sync in both directions: `turso-client.factory.ts`
schedules `push()` then `pull()` on a `TURSO_SYNC_INTERVAL_S` timer, and
`DatabaseModule.onApplicationShutdown` does a final `push()` on every open replica. Deleting rows
in the cloud while the machine is running therefore lets the replica push them straight back. The
machine has to stop first, and the volume has to be **discarded** rather than reused - which is
sanctioned by `backend/fly.toml`'s own note that the volume "holds a replica that connectSync
re-pulls, never the system of record".

**The app's `TURSO_ORG_TOKEN` cannot enumerate databases.** It is scoped to `db:create`,
`db:delete` and `db:mint-token` as `backend/src/database/CLAUDE.md` describes, and `GET
/v1/organizations/{org}/databases` answers **403 forbidden** with it (verified). The script
therefore needs a separate operator token. Deriving the list from central's `users.db_name`
instead was considered and rejected: it cannot see a database orphaned by a failed provision, and
it makes enumeration depend on central being readable at the exact moment we are about to destroy
it.

**Recreating the central database rotates a secret in two places.** The engine is fixed at
creation and `use_tursodb` is undocumented, so the recreate must assert `engine: "tursodb"` came
back before continuing. The freshly minted data-plane token then has to reach both the Fly secret
and the local env file, or the next boot fails on a credential rather than on anything to do with
the reset.

Two smaller findings worth keeping. The recreated database kept the **same hostname**, so
`TURSO_CENTRAL_DB_URL` needs no change and only the token rotates - but the script must not
*assume* that, and should compare and update the URL if Turso ever assigns a different one. And a
reset must never redeploy from the working tree: the deploy has to pin the digest that was already
running, captured before the machine is destroyed.

## Design decisions

- **One script, two mise tasks**, exactly the `seed` / `seed:cloud` precedent: `scripts/reset-databases.sh`
  takes a required `--local` or `--cloud` flag and refuses to run without one. A mistaken local run
  deletes a gitignored SQLite file; a mistaken cloud run destroys real databases and a production
  volume, so reaching the cloud has to be typed out.
- **`scripts/` at the repo root, not `backend/src/scripts/`.** The existing seed scripts boot a Nest
  application context because they need the app's services. This one orchestrates `flyctl` and the
  Platform API and must work when the app cannot boot at all, which is precisely the state a reset
  is for. `scripts/deploy-backend.sh` is the precedent.
- **Configuration is read from the files that already own it**, never duplicated into the script:
  the app name, volume name and region come from `backend/fly.toml`, and `TURSO_ORG` / `TURSO_GROUP`
  from the backend env file. Hardcoding them would put a second home under a fact that already has
  one.
- **The operator token is `TURSO_API_TOKEN`, read from the environment**, falling back to the
  gitignored `backend/.env.local`. It is deliberately **not** added to `backend/.env.example` or to
  the Joi schema: the app must never hold a credential that can delete databases, and a variable in
  the Joi schema is one the app is expected to have.
- **Documentation placement.** The two commands go in `docs/guides/commands.md`, which owns every
  command. The procedure, the ordering constraint and the operator token go in
  `docs/guides/database.md`. No fact-ownership row covers an operator-only credential, and
  `docs/guides/configuration.md` is explicitly the home of *backend environment variables* that the
  Joi schema enforces, which this is not.

## Tasks

- [ ] Add `scripts/reset-databases.sh` with a required `--local` / `--cloud` flag and `set -euo pipefail`
- [ ] Implement `--local`: remove `backend/databases/` and nothing else, needing no credentials (AC1)
- [ ] Implement the `--cloud` preflight: check `flyctl` auth, `TURSO_API_TOKEN`, `TURSO_ORG` and
      `TURSO_GROUP`; read app, volume and region out of `backend/fly.toml`; require a typed
      confirmation naming the app before anything is touched (AC2)
- [ ] Capture the deployed image digest, then stop the Fly machine before any Turso call (AC3, AC8)
- [ ] Enumerate `spendifico-user-*` from the Platform API and delete each, tolerating 404 (AC4)
- [ ] Delete and recreate the central database with `use_tursodb: true`, asserting the response
      reports `engine: "tursodb"` and aborting if it does not (AC5)
- [ ] Mint a full-access non-expiring token, verify it with a real query against the new database,
      and write it to the Fly secret (`--stage`) and every backend env file that carries the key;
      update `TURSO_CENTRAL_DB_URL` too if the hostname changed (AC6)
- [ ] Destroy the machine, destroy the volume, create a fresh volume, and redeploy the pinned
      digest with `--ha=false` (AC7, AC8)
- [ ] Verify the result: `/api/health` returns 200, the central template tables are re-seeded, and
      `users` is empty; exit non-zero if any check fails (AC9)
- [ ] Make each step announce itself and re-runnable after a mid-way failure, so a partial run can
      be resumed rather than restarted blind (AC10)
- [ ] Register `reset` and `reset:cloud` in `mise.toml`, with the comment explaining why they are
      two tasks rather than one flag
- [ ] Document the commands in `docs/guides/commands.md`, and the procedure, ordering constraint and
      `TURSO_API_TOKEN` in `docs/guides/database.md` (AC11)
- [ ] Record in `docs/TODO.md` that the reset is destructive and has no dry-run

## Testing strategy

The cloud path destroys production infrastructure, so it cannot be exercised casually. Coverage is
therefore split by what each half can prove.

- Run `mise run reset` and confirm `backend/databases/` is gone, nothing remote was contacted, and
  it succeeds with no `TURSO_API_TOKEN` set at all.
- Run `mise run reset` twice, confirming the second run is a no-op rather than an error.
- Run `reset:cloud` with the confirmation answered wrongly and confirm it aborts having changed
  nothing.
- Run `reset:cloud` with `TURSO_API_TOKEN` unset and confirm the preflight fails before the machine
  is stopped, not halfway through.
- Verify the enumeration step against the live API in isolation first (a read), confirming it
  returns the same set the Turso MCP reports.
- Full `reset:cloud` run end to end, then confirm by hand: one database in the org, `engine`
  `tursodb`, `users` / `login_links` / `sessions` all zero, template tables re-seeded, health 200,
  and a fresh registration completing through the emailed link.
- Confirm the redeployed image digest equals the one that was running before the reset.
