---
name: backend-drizzle
description: This skill should be used when the user asks to "add a table", "change the database schema", "write a migration", "generate migrations", "add a column", "query the database", "use drizzle", "run drizzle-kit", or asks about Drizzle ORM, drizzle-kit, migrations, or the Turso drivers in the backend. Passive reference library pinned to Drizzle v1.0.0-rc, whose API and migration layout differ from the v0.x guidance found almost everywhere online.
---

> **Tools used:** `Read` (schemas and drizzle configs), `Bash(npm run db:*)` (generate migrations).

# Drizzle v1 RC in this repo

The backend runs **`drizzle-orm@1.0.0-rc.4`** and **`drizzle-kit@1.0.0-rc.4`**, pinned by
`backend/package-lock.json`.

**This is the whole reason the skill exists.** Almost every Drizzle tutorial, blog post and
published AI skill targets v0.x, and v1 changed things that make that guidance not merely
dated but actively wrong here. Check the version before trusting anything external, and
prefer https://orm.drizzle.team/docs/v0-v1-changes over search results.

## What v1 changed that will bite you

| Topic              | v0.x, as written everywhere                 | v1 RC, what this repo actually has              |
| ------------------ | ------------------------------------------- | ----------------------------------------------- |
| Migration folder   | `drizzle/0000_x.sql` + `meta/_journal.json` | `drizzle/<YYYYMMDDHHMMSS>_<slug>/migration.sql` |
| Snapshots          | `drizzle/meta/0000_snapshot.json`           | `snapshot.json` inside each migration folder    |
| `drizzle()` config | `drizzle(client, { schema })`               | no `schema` option at all; v1 uses `relations`  |
| Table extra config | third arg returns an object                 | third arg returns an **array**                  |

The journal change is not a soft deprecation. `readMigrationFiles` **throws** on sight of
`meta/_journal.json`: _"We detected that you have old drizzle-kit migration folders."_ If
you see that error, something generated migrations with a v0 drizzle-kit.

Because `schema` is gone from the config, there is no `db.query.users.findMany()` here.
Import the table and use the core builder: `db.select().from(users).where(...)`.

## Layout

```text
backend/
  drizzle.central.config.ts   schema: src/database/central/schema.ts  -> out: drizzle/central
  drizzle.user.config.ts      schema: src/database/user/schema.ts     -> out: drizzle/user
  drizzle/central/  drizzle/user/    generated migrations, committed
```

Two scopes, because this app is **database-per-user**: `central` is the user directory,
`user` is one person's own database, instantiated N times. One schema file and one
migrations folder each. See CLAUDE.md's Persistence section for why.

## Changing the schema

```bash
cd backend
npm run db:generate          # both scopes; or db:generate:central / db:generate:user
```

Then **commit what it writes**. Points worth knowing:

- Generation is idempotent. No schema change prints "No schema changes, nothing to
  migrate" rather than emitting an empty migration.
- Generated folder names get a random slug (`20260801124259_huge_annihilus`). Renaming the
  folder before committing is safe and makes history readable; drizzle-kit finds the prior
  snapshot by scanning directories, not by name.
- Renaming **after** it has been applied anywhere is not safe: `__drizzle_migrations`
  tracks applied migrations by folder name, so a rename re-runs the migration.
- There is no `db:migrate` script, on purpose. Migrations are applied programmatically:
  the central database by the `APP_DB` factory before Nest finishes booting, a user
  database on first open. A CLI cannot migrate N user databases.

Adding a migration under `drizzle/user/` upgrades **every existing user database** the next
time each is opened. Write them accordingly.

## Schema conventions

Follow the existing tables in `src/database/{central,user}/schema.ts`:

- **Primary keys** are UUIDv7 text via `newId()` from `src/common/ids.ts`. Never
  autoincrement: ids must be client-generatable once offline sync lands.
- **Money** is integer minor units in `*_cents` columns. The API speaks major units and the
  service converts with `Math.round(v * 100)`. Never a float column.
- **Instants** are `integer('x', { mode: 'timestamp_ms' })`, defaulted app-side with
  `$defaultFn` and, for `updated_at`, `$onUpdateFn`. Calendar dates are `text`
  `YYYY-MM-DD`.
- **Every table gets a nullable `deleted_at`**, and every read filters it with
  `isNull(table.deletedAt)`. Tombstones exist for future sync; the API still behaves as if
  deletion is permanent.
- Table-level indexes go in the third argument **as an array**, not an object:
  `(table) => [uniqueIndex('users_email_unique').on(table.email)]`.

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
