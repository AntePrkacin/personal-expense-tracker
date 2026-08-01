# TODO

Running list of work that is known, deliberately deferred, or unverified. Not a backlog of
ideas: everything here has a concrete reason to exist and enough detail to act on without
rediscovering the context.

Add an item when you defer something, and delete it when it lands. Items that grow past a
paragraph or two probably deserve their own plan in this directory.

---

## Correctness

### Raise the declared Node floor

All three `package.json` files declare `"node": ">=20.9.0"`, inherited from what `next`
declares. That number is now **wrong for the backend**, which loads three ESM-only
packages (`@tursodatabase/database`, `@tursodatabase/sync`, `uuid`) from CommonJS. That
relies on `require()` of ESM, which Node shipped unflagged in **22.12.0** and backported to
**20.19.0**. On 20.9 through 20.18, or 22.0 through 22.11, the backend fails at startup
with `Cannot use import statement outside a module`.

Nothing is broken today: `.nvmrc` pins 26, and CI reads the same file. The damage is a
newcomer trusting the documented floor, installing 20.9, and hitting a confusing runtime
error that the `engines` check said nothing about.

Change `engines.node` to `>=22.12.0` in all three `package.json` files. The simple form is
worth preferring over an exact `>=20.19.0 <21 || >=22.12.0`, which is accurate but reads
like a puzzle for no practical gain, since `.nvmrc` says 26.

Then correct the prose in both places that state the old number:

- `README.md`, under Prerequisites: "The hard floor is **v20.9.0**, which is what `next`
  declares in `engines`."
- `CLAUDE.md`, under Repository layout: "The hard floor is **v20.9.0**, declared by `next`
  in its `engines` field."

Both currently attribute the floor to `next`. After this change the binding constraint is
the backend's, not the frontend's, so the explanation has to change too, not just the
digits.

Only Node 26 has actually been exercised here. If you want the lower bound confirmed rather
than derived from the Node changelog, run the backend's tests under 22.12 and 22.11 and
check that the second one fails.

### Verify the native bindings install in CI

`@tursodatabase/database` and `@tursodatabase/sync` ship platform-specific napi binaries
through `optionalDependencies`. They install cleanly on this machine (linux-x64-gnu), but
CI has never run any of the persistence work. If `ubuntu-latest` cannot resolve a binding,
the backend job fails at `npm install`, well before any test.

Verified by pushing the branch and opening the PR. Nothing to do beforehand; this is a note
so the failure is recognised rather than debugged from scratch.

---

## Deferred by design

These were decided against deliberately. Reasons are recorded so the decision is not
relitigated by accident.

### OpenAPI spec, generated frontend types, and Swagger

`HelloResponse` is declared in `backend/src/app.service.ts` and copied by hand into
`frontend/src/app/page.tsx`. `UserResponse` will have the same problem the moment the
frontend consumes it. Swagger was deliberately not added on its own, because installing it
without generating frontend types from the resulting spec solves the smaller half of the
problem and makes the duplication look addressed. Do both together.

### Auth, and the users endpoints it replaces

`POST /api/users` and `GET /api/users/:id` are unauthenticated proof-of-stack scaffolding.
They appear nowhere in the tech spec's API surface, which specifies `register(...)` carrying
the onboarding category selection, a magic-link flow, and a session-scoped `getProfile()`.
Expect to reshape or delete both endpoints rather than protect them as they stand.

`TursoPlatformService` documents but does not implement `mintUserDbToken(dbName, expiry)`,
the short-expiry variant needed to hand a browser a token it can sync with directly. It
belongs with auth, which is what makes "which user is asking" answerable.

### The rest of the data model

Only `users` (central) and `profile` (per user) exist. `categories`, `transactions` and
`insights` arrive with their own features as ordinary migrations under
`backend/drizzle/user/`, and starter-category seeding belongs to onboarding, not to
registration.

### `frontend/src/components/`

Does not exist. Create it with the first shared component.

---

## Operational

### Token rotation is manual

By MVP decision every Turso token is created with **Expires: NEVER**: the control-plane
token, the central database token, and every per-user token minted at registration. There
is no refresh logic anywhere, which is the point. The cost is that a leaked token never
dies on its own.

Rotation is a deliberate ops action:

```bash
turso db tokens invalidate expensa-app        # central database
turso auth api-tokens revoke expensa-backend  # control plane
```

Per-user tokens live in the central `users.db_auth_token` column, so rotating those means
re-minting and updating the rows. No tooling exists for that yet; write it before it is
needed urgently rather than during an incident.

### The Turso CLI cannot address the per-user databases

With CLI v1.0.31, `turso db destroy expensa-user-<uuid> --yes` exits 0 and does nothing,
and `turso db shell` on the same name reports "database not found". `turso db show` and
`turso db list` handle it fine, so it is not straightforward name resolution. Cause unknown
as of 2026-08-01.

The Platform REST API works correctly, and is what the backend itself uses:

```bash
TOKEN=$(grep '^TURSO_ORG_TOKEN=' backend/.env | cut -d= -f2-)
curl -X DELETE "https://api.turso.tech/v1/organizations/<org>/databases/<name>" \
  -H "Authorization: Bearer $TOKEN"
```

The central database has a short name, so `turso db shell expensa-app "select ..."` works
normally for inspecting the user directory. Worth retrying after a CLI upgrade.

### Deployment must ship `backend/drizzle/`

Migration folders are resolved from `process.cwd()`, because `nest build` emits only
JavaScript into `dist/` and leaves the SQL behind. Any future Dockerfile has to `COPY` the
`drizzle/` directory next to `dist/`, or the app boots and fails to migrate.

---

## Scaling, when it is actually needed

None of these matter at current scale. They are recorded so the limits are known rather
than discovered.

- **Connection cache is unbounded.** `UserDatabaseService` keeps every opened user database
  in a `Map` with no eviction. An LRU with an idle timeout is the obvious next step.
- **No cross-process migration lock.** A single backend instance is assumed. Two instances
  opening the same user database for the first time could both run its migrations.
- **Soft deletes are never purged.** Every table carries `deleted_at` for future sync, and
  reads filter it, but nothing removes tombstones. A purge policy is deferred until the
  sync design needs one.
- **`Math.round(v * 100)`** assumes two-decimal currencies. Fine for USD and EUR, wrong for
  JPY (zero decimals) and KWD (three).
- **Offline conflict policy is undecided.** The schema is shaped for last-write-wins
  (UUIDv7 keys, epoch-ms timestamps, tombstones), but no client syncs yet and clock skew is
  unaddressed.

---

## Housekeeping

- **Branch name.** `feat/backend-db-bootstrap` does not follow the documented
  `{type}/DEMO-{number}-{slug}` format. Flagged rather than renamed unprompted.
- **Repo-wide `prettier --check` is commented out in CI.** 55 files predate the Prettier
  config and the step would fail on a fresh clone. To enable: run `npx prettier --write .`
  once, commit that, then uncomment the step in `.github/workflows/ci.yml`. Note that
  `.lintstagedrc.js` only formats files under `backend/` and `frontend/`, so root-level
  Markdown such as this file is not covered by the pre-commit hook and has to be formatted
  by hand.
