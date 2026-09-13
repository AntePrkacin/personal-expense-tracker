# Spendifico API

NestJS REST API on port **3000** (the Next.js frontend owns 4200). Drizzle ORM over Turso's
SQLite engine with a database per user, passwordless login links, and an OpenAPI contract the
frontend's types are generated from.

```bash
cd backend
npm install
cp .env.example .env      # optional: every variable has a working local default
npm run start:dev         # http://localhost:3000/api/health
```

Swagger UI over the same document the frontend types come from:
<http://localhost:3000/api/docs>. Note the global `api` prefix, which is why
`http://localhost:3000/` returns 404 by design.

## Where things are

```text
src/
  main.ts             Bootstrap: global 'api' prefix, CORS, Swagger UI, port, shutdown hooks
  app.module.ts       Root module: config, database, auth, transactions, global pipe/filter/guard
  app.controller.ts   GET /api/health
  openapi.ts          Writes openapi.json. Run it via `npm run api:spec`, never ts-node
  auth/               Passwordless flow: register, login-link, verify, session, SessionGuard
  transactions/       POST /api/transactions, PATCH and DELETE /api/transactions/:id
  users/              Central directory reads and writes (no controller)
  database/           Drizzle + Turso: central and per-user schemas, the client factory
  mail/               Mailer seam: logs by default, MailPace over HTTP when configured
  common/             ids, money, email normalization, the exception filter, the error DTO
  config/             The Joi schema that validates the environment at boot
  dto/                Response shapes. Classes in *.dto.ts files, never interfaces
drizzle/              Generated migrations, committed: central/ and user/
databases/            Local database files. Gitignored; the migrations recreate them
openapi.json          The API contract. Generated and committed, never edited by hand
test/                 Supertest e2e specs
```

A new feature is a new folder under `src/` with its own module.

`Dockerfile` and `.dockerignore` also live here, because this directory is the build context.

## Deploy on Google Cloud Run

Deployed as the Cloud Run service `expenso` in project `expensa-app-26`, region `europe-west1`,
served at `https://expenso-pjmskjsr7q-ew.a.run.app`, capped at **one** instance.

**There is no deploy command.** A Cloud Build trigger builds this directory's `Dockerfile` and
deploys it on every push to `main`, so deploying is merging - which also means new configuration
has to be set on the service _before_ the code that reads it lands. The single-instance cap is not
a preference: three things in this app assume it and degrade silently without it.

The runbook, the rollback and the reset sketch are in [Deployment](../docs/guides/deployment.md);
why one instance is in [`CLAUDE.md`](CLAUDE.md).

## Guides

- [Commands](../docs/guides/commands.md) - every script here, and what it is for
- [Configuration](../docs/guides/configuration.md) - every environment variable
- [Database](../docs/guides/database.md) - local files, schema changes, Turso Cloud
- [Email](../docs/guides/email.md) - why no mail is sent in the current deployment, and how to re-enable a provider
- [Demo accounts](../docs/guides/demo-accounts.md) - the pool behind `/demo`, which is how anybody signs in now
- [Deployment](../docs/guides/deployment.md) - Cloud Run, and the Vercel side
- [Troubleshooting](../docs/guides/troubleshooting.md)

Why it is built the way it is - why registration provisions no database, why login tokens are
looked up by hash, why every aggregate is computed on read - is in [`CLAUDE.md`](CLAUDE.md).
