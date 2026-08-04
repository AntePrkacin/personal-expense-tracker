---
name: backend-drizzle
description: This skill should be used when the user asks to "add a table", "change the database schema", "add a column", "query the database", or works on anything under backend/src/database. Covers how Drizzle and Turso are wired in THIS repo - two migration scopes, a database per user, and the Turso drivers. The generic drizzle-kit CLI is covered by the official drizzle-* skills instead.
---

> **Tools used:** `Read` (schemas and drizzle configs), `Bash(npm run db:*)` (generate migrations).

# Drizzle and Turso in this repo

**Drizzle ships its own agent skills** (`drizzle`, `drizzle-generate`, `drizzle-migrations`,
`drizzle-push`, `drizzle-pull`, `drizzle-hints`, `drizzle-output-modes`,
`drizzle-responses-and-errors`), installed by `npm run skills` from the drizzle-kit in
`backend/node_modules` and version-matched to it. **They own the drizzle-kit CLI**: command
mechanics, config shape, output parsing, error codes. Prefer them for anything generic.

This skill covers only what they cannot know: how this particular repo is wired.

Versions are `drizzle-orm@1.0.0-rc.4` and `drizzle-kit@1.0.0-rc.4`. Published Drizzle
tutorials and third-party AI skills target v0.x and get the ORM API wrong here, so check
the version before trusting anything external. Two v1 changes bite most often: the config
has **no `schema` option** (v1 uses `relations`), so there is no `db.query.users.findMany()`
and queries go through `db.select().from(users)`; and a table's third argument returns an
**array**, not an object.

## Two migration scopes, because there is a database per user

```text
backend/
  drizzle.central.config.ts   src/database/central/schema.ts  ->  drizzle/central
  drizzle.user.config.ts      src/database/user/schema.ts     ->  drizzle/user
```

`central` is the user directory, one database. `user` is one person's own database,
instantiated once per registered user. One schema file and one migrations folder each,
both committed. `backend/src/database/CLAUDE.md` has the reasoning.

Consequences that do not apply to a normal single-database Drizzle project:

- **`npm run db:generate` covers both scopes.** Adding a table means deciding which scope it
  belongs to first: identity-critical and needed before login goes central, everything about
  a person goes in the user scope.
- **A new migration under `drizzle/user/` upgrades every existing user database** the next
  time each one is opened. Write them so they are safe to apply to live data.
- **There is no `db:migrate` script, deliberately.** Migrations apply programmatically: the
  central database by the `APP_DB` factory before Nest finishes booting, a user database on
  first open. A CLI cannot migrate N user databases.
- **Never rename a migration folder once it has been applied anywhere.**
  `__drizzle_migrations` tracks applied migrations by folder name, so a rename re-runs it.

## Schema conventions

Follow the existing tables in `src/database/{central,user}/schema.ts`:

- **Primary keys** are UUIDv7 text via `newId()` from `src/common/ids.ts`. Never
  autoincrement: ids must be client-generatable once offline sync lands.
- **Money** is integer minor units in `*_cents` columns. The API speaks major units and the
  service converts with `Math.round(v * 100)`. Never a float column.
- **Instants** are `integer('x', { mode: 'timestamp_ms' })`, defaulted app-side with
  `$defaultFn` and, for `updated_at`, `$onUpdateFn`. Calendar dates are `text` `YYYY-MM-DD`.
- **Every table gets a nullable `deleted_at`**, and every read filters it with
  `isNull(table.deletedAt)`. Tombstones exist for future sync; the API still behaves as if
  deletion is permanent.

## Drivers

Two modes, one seam in `src/database/turso-client.factory.ts`. The import paths are exact:

| Mode                  | Client                    | Driver                               | Migrator                                  |
| --------------------- | ------------------------- | ------------------------------------ | ----------------------------------------- |
| Cloud (`TURSO_*` set) | `@tursodatabase/sync`     | `drizzle-orm/tursodatabase-sync`     | `drizzle-orm/tursodatabase-sync/migrator` |
| Local (default)       | `@tursodatabase/database` | `drizzle-orm/tursodatabase/database` | `drizzle-orm/tursodatabase/migrator`      |

Both are async: every query returns a promise, raw SQL included.

Three constraints that are easy to break and unpleasant to debug:

1. **Foreign keys are OFF by default** and the setting is per connection, so it is applied
   on every open. Do not assume a foreign key is enforced because you declared it.
2. **Cloud databases must be created with `use_tursodb: true`.** `@tursodatabase/sync`
   replicates against a Turso-engine database, not a libSQL one, and Turso Cloud still
   defaults to libSQL. Getting it wrong is silent and unfixable after creation.
3. **The Turso packages are ESM-only**, which Jest's CommonJS runtime cannot load. The
   shims in `backend/test/esm-shims/` and the custom environment in
   `test/esm-environment.cjs` exist for that. Do not remove them.

## Studio

`npm run db:studio:central` inspects the local file, which in cloud mode is a full synced
copy, so it is a real view of the data. `npm run db:studio:user` needs `USER_DB_URL`
pointed at one specific user's file, since there is no single "the" user database.
