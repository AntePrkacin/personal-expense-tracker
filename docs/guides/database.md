# Database

Everything about the data on disk: what runs locally with no setup, how to try the access flow
end to end, how to change the schema, and how to point the backend at Turso Cloud.

Why it is built this way - the two driver modes, why the CLI cannot see a per-user database, why
there is no `db:migrate` script - is in `backend/src/database/CLAUDE.md`.

## Database

The backend persists to SQLite through [Drizzle ORM](https://orm.drizzle.team) on
[Turso](https://turso.tech)'s engine, and each user gets a database of their own. A small
central database holds the user directory (email plus a pointer to that person's
database); everything else about a person lives in their database.

**For local development there is nothing to set up.** With no `TURSO_*` variables the
backend writes plain files under `backend/databases/`, creates them on first run and
applies the committed migrations itself. That directory is gitignored, so deleting it is
always safe: the next start rebuilds it.

```bash
cd backend && npm run start:dev

# `categories` takes category template ids, not names. Ask the public endpoint for
# them - it needs no session, because onboarding step 2 runs before an account exists.
curl -s http://localhost:3000/api/templates/categories | jq -r '.categories[] | "\(.id)  \(.name)"'

curl -i -X POST http://localhost:3000/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"firstName":"Marko","lastName":"Kovac","email":"marko@email.com","monthlyBudget":2000,"categories":["<a-template-id>"]}'
# 202 with an empty body, backend/databases/app.db now holds the row and the
# issued link, and the terminal running the backend prints the login link.
# An id that is not a live template is a 400, so a stale copy-paste fails loudly.
# `"categories": []` is also valid - A4 enforces no minimum.
```

Note what is _not_ created: no file for this user yet. Registration writes only the central
row and stashes the onboarding values on it; the user's own database is created when the
emailed link is verified, so an unauthenticated endpoint can never provision one.

Verifying is what completes the account. Copy the `token=` value out of the printed link:

```bash
curl -i -X POST http://localhost:3000/api/auth/verify \
  -H 'content-type: application/json' \
  -d '{"token":"<the token from the link>"}'
# 200 {"token":"<session>","expiresAt":"..."}, and backend/databases/users/ now holds
# this person's own database, with their profile and picked categories in it

curl -i http://localhost:3000/api/auth/session \
  -H 'authorization: Bearer <session>'
# 200 {"userId":"...","email":"...","expiresAt":"..."}
```

Spending the same link twice answers `401`, and a link that a newer one replaced answers
`409` - request two links and verify the older one to see it. Inspect either database with
`npm run db:studio:central` or `npm run db:studio:user`; the profile stores money in cents,
so a budget of 2000.50 reads as `200050`.

### Changing the schema

Edit `backend/src/database/central/schema.ts` (the user directory) or
`backend/src/database/user/schema.ts` (one person's data), then:

```bash
cd backend && npm run db:generate
```

That writes a new migration under `backend/drizzle/`. **Commit it.** There is no
`db:migrate` command on purpose: the app applies migrations itself, the central database
at startup and each user's database the first time it is opened, which is the only thing
that works when there are N of them.

### Connecting it to Turso Cloud (optional)

Only needed if you want real cloud databases. One-time setup with the
[Turso CLI](https://docs.turso.tech/cli/introduction):

```bash
turso auth login
turso group create decode-pet                       # holds every database

# --tursodb is required, not optional. See the note below.
turso db create spendifico-app --group decode-pet --tursodb

turso db show spendifico-app --url                     # -> TURSO_CENTRAL_DB_URL
turso db tokens create spendifico-app                  # -> TURSO_CENTRAL_DB_TOKEN

# -> TURSO_ORG_TOKEN. Scoped to the group and to the three things the backend
# actually does, rather than a token that can do anything in your org.
# --org is mandatory whenever --group is given; without it the CLI (v1.0.31)
# refuses with "Error: --group requires --org" rather than assuming the current
# org. Your slug is the one `turso org list` marks as current.
turso auth api-tokens mint spendifico-backend --org <your-org-slug> --group decode-pet \
  --scope db:create --scope db:delete --scope db:mint-token
```

Fill those into `backend/.env` along with `TURSO_ORG` (your org slug, from
`turso org list`), and uncomment them. It is all four or none: half-filled fails at boot
rather than silently falling back. From then on the backend creates a database per
registered user in the same group, keeps a synced local copy under `DATABASE_DIR`, and
tests still run against plain local files.

**Why `--tursodb` matters.** It selects the Turso engine, a Rust rewrite of SQLite, instead
of the older libSQL engine that Turso Cloud still creates by default. The local half of
`@tursodatabase/sync` is a real Turso database, so the remote it replicates against has to
be one too. Getting this wrong is quiet rather than loud: the app still starts and appears
to work, and you find out later. **The engine is fixed when the database is created**, so
the fix is always "delete it and make a new one", which stops being cheap the moment real
data exists. Check an existing one with `turso db list`, whose `TYPE` column reads `Turso`
rather than `SQLite`. The backend passes the equivalent flag itself for every per-user
database it creates, so this only applies to the central one you make by hand.

**If your `.env` predates the Spendifico rename (PET-51), clear your local state first:**

```bash
rm -rf backend/databases
```

The rename replaced the central database and the per-user name prefix, so those files are
synced replicas of a remote that no longer exists, pointed at by a URL that no longer
resolves. Leaving them is the bad kind of wrong: nothing errors on startup, you simply have
a local copy that can never reconcile with its remote. The directory is gitignored and
rebuilt from the migrations, so deleting it costs nothing but your local dev account, which
you re-create by registering again.

