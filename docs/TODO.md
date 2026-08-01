# TODO

Running list of work that is known, deliberately deferred, or unverified. Not a backlog of
ideas: everything here has a concrete reason to exist and enough detail to act on without
rediscovering the context.

Add an item when you defer something, and delete it when it lands. Items that grow past a
paragraph or two probably deserve their own plan in this directory.

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

### The Turso CLI has a stale name cache, and it bites this project constantly

With CLI v1.0.31, `turso db shell expensa-user-<uuid>` reports "database not found" and
`turso db destroy expensa-user-<uuid> --yes` exits 0 having done nothing, while `turso db
show` and `turso db list` handle the identical name perfectly.

**Cause, confirmed on 2026-08-01.** The CLI caches the organization's database names in
`~/.config/turso/settings.json` under `cache.database_names`, with a short TTL. `db shell`
and `db destroy` resolve the name against that cache instead of the API. Any database
created by something other than this CLI is therefore invisible to them until the cache
expires. That is _every_ per-user database, since the backend creates them through the
Platform API, which is why `expensa-app` and `jura` work (both created via the CLI) and
`expensa-user-*` never does. Nothing to do with the name being long, which was the first
guess.

Note that `turso db list` does **not** refresh the cache, so the error message's advice to
"List known databases using turso db list" does not help.

Three ways around it, best first:

1. **Use the Turso MCP server.** It goes straight to the API and has no cache.
   `read_database`, `evolve_schema` and `delete_database` all worked on a
   freshly-created `expensa-user-<uuid>` in the same session where the CLI refused.
2. **Expire the cache**, after which the CLI falls back to the API and works:
   ```bash
   python3 -c "import json;p='$HOME/.config/turso/settings.json';d=json.load(open(p));d['cache']['database_names']['expiration']=0;json.dump(d,open(p,'w'))"
   ```
3. **Use the Platform REST API directly**, which is what the backend does:
   ```bash
   TOKEN=$(grep '^TURSO_ORG_TOKEN=' backend/.env | cut -d= -f2-)
   curl -X DELETE "https://api.turso.tech/v1/organizations/<org>/databases/<name>" \
     -H "Authorization: Bearer $TOKEN"
   ```

Worth retesting after a CLI upgrade; this looks like a plain bug rather than a design
decision. Inspecting the central directory is unaffected either way:
`turso db shell expensa-app "select id, email from users;"`.

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
  `{type}/DEMO-{number}-{slug}` format. Now pushed with PR #3 open against it, so renaming
  would orphan the PR. Left alone deliberately; worth getting right on the next branch.
- **Repo-wide `prettier --check` is commented out in CI.** 55 files predate the Prettier
  config and the step would fail on a fresh clone. To enable: run `npx prettier --write .`
  once, commit that, then uncomment the step in `.github/workflows/ci.yml`. Note that
  `.lintstagedrc.js` only formats files under `backend/` and `frontend/`, so root-level
  Markdown such as this file is not covered by the pre-commit hook and has to be formatted
  by hand.
