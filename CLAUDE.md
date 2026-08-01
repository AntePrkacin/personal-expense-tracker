# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository. Everything
below is verified against the code, not aspirational.

`README.md` is the human-facing entry point: setup steps, commands, and troubleshooting.
This file is the reasoning behind them, so the two overlap deliberately but do not
duplicate. When something structural changes, check whether both need updating.

## What this is

**Decode Academy Demo**, a teaching boilerplate for academy final projects. A minimal
Next.js frontend talks to a NestJS backend over HTTP. Exactly one feature works
end to end: the frontend fetches a greeting from the backend's `GET /api/hello` and
renders it. Everything else is scaffolding for you to build on.

Because this is a starting point rather than a finished app, the "Not yet built"
section at the bottom is load-bearing. Read it before assuming a feature exists.

## Repository layout

This is a **multi-app repo, not a workspace-managed monorepo**. There is no npm
workspaces, turbo, or nx setup. The root `package.json` owns only repo-wide dev tooling
(Husky, commitlint, lint-staged, Prettier) and does **not** manage the two apps.

```text
backend/          NestJS 11 API, port 3000, its own package.json + node_modules
  drizzle/        Generated migrations, committed: central/ and user/
  databases/      Local database files. Gitignored, recreated from the migrations
frontend/         Next.js 16 + React 19, port 4200, its own package.json + node_modules
docs/plans/       Implementation plans, one file per plan (see below)
.claude/          Skills, agents and permissions for Claude Code (see below)
.github/workflows/ci.yml
.husky/           pre-commit and commit-msg hooks
```

Two consequences that trip people up:

- There are **three** `package.json` files and each is installed separately. Run
  `npm install` inside each app, and run it at the root too. The root install is
  **mandatory, not a convenience**: its `prepare` script is what sets `core.hooksPath` to
  `.husky/_`. Skip it and both hooks are simply absent, so any commit message shape is
  accepted and staged files are never linted. The failure is silent locally and only
  surfaces when the `conventions` job fails on the PR. Verify with
  `git config core.hooksPath`.
- Run app commands from inside that app's directory (`cd backend`, `cd frontend`). This
  matters for ESLint especially, whose config and plugins resolve from the app's own
  `node_modules`.

Node version comes from `.nvmrc` (currently **26**). CI reads that same file, so bump it
there and CI follows. Use `nvm use`, which reads `.nvmrc` and needs no version argument;
avoid `nvm install --lts`, which installs whatever LTS happens to be current. The hard
floor is **v20.9.0**, declared by `next` in its `engines` field, and all three
`package.json` files now carry that same `engines` constraint so npm warns on a mismatch.

`mise.toml` pins the same major a **second** time, as `node = "26"` under `[tools]`. mise
does not read `.nvmrc`, so bumping the Node major means editing both files. It is pinned
rather than `latest` precisely so a drift from CI cannot happen silently.

**Implementation plans live in `docs/plans/`**, one Markdown file per plan, named
`YYYY-MM-DD_PET-{number}_{slug}.md` (date the plan was written, the Jira ticket it
serves, then a short slug), for example `2026-08-02_PET-13_login-links.md`. Save any
plan worth keeping there under that pattern rather than leaving it in the conversation.

## Common commands

Backend, from `backend/`:

| Command                                        | Purpose                                                     |
| ---------------------------------------------- | ----------------------------------------------------------- |
| `npm run start:dev`                            | Nest in watch mode on :3000                                 |
| `npm run build`                                | Compile to `dist/`. Doubles as the typecheck gate (`tsc`)   |
| `npm run lint`                                 | ESLint with `--fix`                                         |
| `npm test`                                     | Jest unit tests (`*.spec.ts` under `src/`)                  |
| `npm run test:watch`                           | Same, in watch mode                                         |
| `npm run test:e2e`                             | Supertest e2e (`test/`, uses `test/jest-e2e.json`)          |
| `npm run test:cov`                             | Coverage                                                    |
| `npm run db:generate`                          | drizzle-kit generate for both scopes; commit what it writes |
| `npm run db:studio:central` / `db:studio:user` | Drizzle Studio over the local file                          |

Frontend, from `frontend/`:

| Command              | Purpose                                         |
| -------------------- | ----------------------------------------------- |
| `npm run dev`        | Next dev server on :4200                        |
| `npm run build`      | Production build. Doubles as the typecheck gate |
| `npm start`          | Serve the production build on :4200             |
| `npm run lint`       | ESLint (`eslint-config-next`)                   |
| `npm test`           | Jest + React Testing Library (jsdom)            |
| `npm run test:watch` | Same, in watch mode                             |

Single test in either app: `npm test -- page` filters by path,
`npm test -- -t "greeting"` filters by test name.

Neither app has a standalone `typecheck` script. `npm run build` is the typecheck.

To run the whole thing locally, start both in separate terminals: backend on 3000,
frontend on 4200. The frontend calls the backend, never the reverse.

## Architecture

**Ports are fixed and asymmetric.** Backend API on **3000**, frontend on **4200**. Both
are wired into code and config, so do not swap them.

**The `/api` prefix lives in one place.** `backend/src/main.ts` sets a global `api`
prefix, so a controller mapped to `hello` is served at `GET /api/hello`. Note the
consequence: `GET http://localhost:3000/` returns 404, which is normal, not a broken
server. The e2e test re-applies the same prefix manually to match production, so if you
change the prefix you must change it in both places.

**Frontend to backend data flow.** The home page (`frontend/src/app/page.tsx`) is an
**async Server Component**. It fetches the backend at request time on the server with
`cache: 'no-store'`, which means no CORS is involved and there is no client-side loading
state for that call. CORS is enabled on the backend anyway (`main.ts`), for the case of
genuinely client-side fetches, allowing origin `FRONTEND_URL`.

**Configuration goes through ConfigService.** `ConfigModule.forRoot({ isGlobal: true })`
is registered in `backend/src/app.module.ts`, so it reads `backend/.env` at startup and
`ConfigService` is injectable everywhere without re-importing the module. Read values
through `ConfigService`, as `main.ts` does, rather than scattering `process.env` through
the code.

**API response contract is hand-mirrored, and that is a known wart.** `HelloResponse`
is declared in `backend/src/app.service.ts` (the source of truth) and copied by hand
into `frontend/src/app/page.tsx`. Change a response shape and you must edit both. The
intended fix is generating frontend types from an OpenAPI spec, but the backend does not
expose one yet.

**Global pipe and filter are DI providers, not `app.useGlobalPipes`.** `AppModule`
registers `APP_PIPE` (a `ValidationPipe` with `whitelist`, `transform` and
`forbidNonWhitelisted`) and `APP_FILTER` (`AllExceptionsFilter`). Doing it this way
rather than in `main.ts` means the e2e suite, which boots `AppModule` directly, gets the
same validation and the same error shape as production. Every failed request returns
`{ statusCode, message, error, timestamp, path }`; unknown errors are logged in full
server-side and reduced to a generic 500 outward.

## Persistence

**Drizzle ORM (v1 RC) over Turso's new engine, in two modes behind one seam.**

- **Cloud mode**, when all four of `TURSO_ORG`, `TURSO_ORG_TOKEN`,
  `TURSO_CENTRAL_DB_URL` and `TURSO_CENTRAL_DB_TOKEN` are set: `@tursodatabase/sync` with
  the `drizzle-orm/tursodatabase-sync` driver. A local file kept in step with a Turso
  Cloud database. The client has no timer of its own, so
  `backend/src/database/turso-client.factory.ts` schedules `push()` then `pull()` every
  `TURSO_SYNC_INTERVAL_S`.
- **Local mode**, otherwise: `@tursodatabase/database` with
  `drizzle-orm/tursodatabase/database`. A plain local file, nothing remote. CI, the e2e
  suite and offline development all run here, which is why the backend still works with
  no `.env` at all.

Both are the same engine and the same SQLite dialect, so one schema and one migrations
folder per scope serve both. `turso-client.factory.ts` and `UserDatabaseService` are the
only two files that know which mode is active.

**Database per user.** A small **central** database (`users`: id, email, and a pointer to
that person's database) exists because identity must resolve by email before the per-user
database is known. Everything else about a person lives in **their own Turso database**,
starting with a single-row `profile` table. Categories, transactions and insights arrive
there later as ordinary migrations. In cloud mode the central database sits in the
`decode-pet-admin` group and the user databases in `decode-pet-users`, created by the
backend at registration.

**Tokens.** Creating databases and minting their tokens are control-plane operations that
accept only the organization API token, so `TURSO_ORG_TOKEN` is used in exactly one place
(`TursoPlatformService`) at provisioning time. Each user database is then reached with its
own minted data-plane token, stored in the central row and never serialized into an API
response. By MVP decision every Turso token is created with **Expires: NEVER**: no refresh
logic anywhere, rotation is a manual ops action.

**Migrations are committed and applied programmatically**, in
`backend/drizzle/central/` and `backend/drizzle/user/`. Note the v1 RC layout: one
directory per migration containing `migration.sql`, named `<YYYYMMDDHHMMSS>_<slug>`, with
no `meta/_journal.json`. The central database is migrated by the `APP_DB` async factory
before Nest finishes booting; a user database is migrated on first open, so adding a
migration upgrades every existing user the next time they are touched. There is no
`db:migrate` script, because N user databases cannot be migrated from a CLI. Consequence
for deployment: `drizzle/` is resolved from `process.cwd()`, so a future Dockerfile must
`COPY` it next to `dist/`.

**Conventions worth knowing before writing a table.** Primary keys are UUIDv7 text
(`src/common/ids.ts`). Money is integer minor units in `*_cents` columns; the API speaks
major units and the service converts. Instants are `integer` epoch-ms
(`{ mode: 'timestamp_ms' }`) set app-side with `$defaultFn`/`$onUpdateFn`; calendar dates
will be `text` `YYYY-MM-DD`. Every table carries a nullable `deleted_at` for future sync
and reads filter it with `isNull(deletedAt)` - the tombstone is invisible through the API,
which still deletes permanently as far as a client can tell.

**Two things the test setup exists to work around.** `@tursodatabase/database`,
`@tursodatabase/sync` and `uuid` are ESM-only. Node loads them fine, but Jest's CommonJS
runtime cannot, and they cannot be transformed either (their napi loader uses
`import.meta.url`). `backend/test/esm-environment.cjs` therefore injects a real Node
`require`, and `test/esm-shims/` plus a `moduleNameMapper` entry in both jest configs
route those three specifiers through it. Separately, `test/setup-e2e.ts` points
`DATABASE_DIR` at a temp directory and deletes every `TURSO_*` variable, so e2e always
runs local mode even on a machine with cloud credentials.

## Environment variables

Copy the templates, then fill in values. Both real files are gitignored.

| App      | Template                | Real file             | Variables                                       |
| -------- | ----------------------- | --------------------- | ----------------------------------------------- |
| Backend  | `backend/.env.example`  | `backend/.env`        | see the table below                             |
| Frontend | `frontend/.env.example` | `frontend/.env.local` | `BACKEND_URL` (default `http://localhost:3000`) |

Backend variables:

| Variable                                              | Default                 | Purpose                                                 |
| ----------------------------------------------------- | ----------------------- | ------------------------------------------------------- |
| `PORT`                                                | `3000`                  | API port                                                |
| `FRONTEND_URL`                                        | `http://localhost:4200` | CORS origin                                             |
| `DATABASE_DIR`                                        | `./databases`           | Local database files (gitignored)                       |
| `TURSO_ORG`                                           | -                       | Organization slug. Cloud mode: set all four or none     |
| `TURSO_ORG_TOKEN`                                     | -                       | Organization API token; control plane only              |
| `TURSO_CENTRAL_DB_URL`                                | -                       | Central database URL                                    |
| `TURSO_CENTRAL_DB_TOKEN`                              | -                       | Central database data-plane token                       |
| `TURSO_ADMIN_GROUP_TOKEN` / `TURSO_USERS_GROUP_TOKEN` | -                       | Break-glass CLI/Studio access; the app never reads them |
| `TURSO_USERS_GROUP`                                   | `decode-pet-users`      | Group the per-user databases are created in             |
| `TURSO_SYNC_INTERVAL_S`                               | `60`                    | Cloud-mode push/pull interval                           |

Both apps run on their defaults with no `.env` at all, so a missing file is not an error.

Note the filename difference: Nest reads `.env`, Next.js reads `.env.local`.

The backend **does** validate its environment: `ConfigModule.forRoot` takes a
`validationSchema` (Joi, `src/config/env.validation.ts`), so a typo fails at boot rather
than at first use. The four cloud variables are tied together with `.and()`, making a
half-filled `.env` an error instead of a silent fallback to local mode. drizzle-kit is the
exception: it reads raw `process.env` and never passes through Joi, which is why the two
`drizzle.*.config.ts` files repeat the `DATABASE_DIR` default themselves.

**Never give a server-only secret a `NEXT_PUBLIC_` prefix.** `BACKEND_URL` deliberately
has no prefix because it is read server-side only; a `NEXT_PUBLIC_` variable is inlined
into the browser bundle and is therefore public forever.

The four cloud variables are optional but paired: set all of them or none. Anything else
fails at boot with a Joi message naming the missing one.

## What is in `.claude/`

This repo ships Claude Code configuration. Knowing what is there prevents both
reinventing it and being surprised by it.

**Skills.** A skill is invoked by its own name, so the slash command is the full name in
the left column (`/repo-dev-setup`). You do not have to remember them: each skill's
description also matches plain requests, so "set me up locally" reaches `repo-dev-setup`
on its own. The short forms quoted inside the descriptions (`/dev-setup`, `/commit`) are
matching phrases, not registered commands.

| Skill             | What it does                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `repo-dev-setup`  | First-time local setup, both apps. Start here on a fresh clone                                                                                                     |
| `repo-commit`     | Analyses changes, runs per-app lint/test, writes Conventional Commit messages, guards against committing to `main`                                                 |
| `repo-secrets`    | Manages `.env` files from templates, explains where real secrets live                                                                                              |
| `repo-jira`       | Creates/estimates/transitions Jira issues over MCP. Needs a Jira MCP server; see `.claude/skills/repo-jira/references/jira-access.md` for the two supported setups |
| `repo-review-prs` | Fetches open PRs via `gh` and reviews unreviewed ones                                                                                                              |
| `repo-stack`      | This repo's stacked-branch wiring: the layers of truth, the worktree trap, the conventions. CLI mechanics live in the committed official `gh-stack` skill          |
| `backend-nestjs`  | Passive reference library, 12 NestJS rules across 7 categories. Consulted when writing backend code                                                                |
| `frontend-nextjs` | Passive reference library, 16 Next.js/React rules. Consulted when writing frontend code                                                                            |

**Agents** (delegated subtasks with their own context): `code-reviewer`, `debugger`,
`test-automator`, `nestjs-specialist` and `nextjs-specialist` (these two fetch and
synthesise the live official docs, which is different from the passive rule libraries
above), and `linus-reviewer` (a deliberately blunt review persona; it has no tools, so
paste the diff into the prompt).

**Permissions.** `.claude/settings.json` is committed and applies to everyone. Notably,
`Edit` and `Write` are **not** pre-approved, so Claude asks before every file change and
you see the diff before it lands. Every decision in that file is explained in
`.claude/SETTINGS.md`, because JSON cannot hold comments. Personal preferences belong in
`.claude/settings.local.json`, which is gitignored.

**The `gh stack` CLI ships an official agent skill, and it is committed.**
`.claude/skills/gh-stack/` comes from
`gh skill install github/gh-stack gh-stack --agent claude-code --scope project`
(`gh skill` is a preview feature of the GitHub CLI; the command needs both the repo and
the skill name, or it only lists what is available). It is committed so everyone has a
byte-identical copy and a fresh clone works with no extra step; refreshing it is a
deliberate act - re-run the install and commit the diff. The repo's own `repo-stack`
skill covers only this repo's stacked-branch wiring and defers the CLI to it.

`.claude/commit-checks.md` is a generated cache read by `repo-commit`. Regenerate it
with `/repo-commit refresh-checks` when it goes stale.

## Git workflow

**HARD RULE: never commit or push directly to `main`.** Branch first. `settings.json`
puts `git push` behind a confirmation prompt to give this rule a real barrier rather
than just an instruction.

Branch format: `{type}/PET-{number}-{slug}`, for example
`feat/PET-160-user-profile-card`.

**Branches are stacked, and never manually rebased.** This repo uses GitHub's stacked
branches feature routinely: a feature branch is often cut from an unmerged parent branch
rather than from `main` (`feat/PET-14-link-verification-and-sessions` on top of
`feat/PET-50-api-openapi-typegen`, for example), so the parent's PR merges first and
GitHub retargets and restacks the child itself. Before proposing any rebase, retarget or
merge, check what the branch actually sits on: `gh pr view <branch> --json baseRefName`
names the PR's base, and a base other than `main` means a stacked branch. Do not suggest
`git rebase --onto main` for one; open its PR against the parent and let GitHub do the
restack. New work that depends on an unmerged branch is cut from that branch's tip, not
from `main`.

The tooling for it is the `gh stack` extension (`github/gh-stack`), installed per
developer with `gh extension install github/gh-stack` - like the root `npm install`, a
fresh clone does not carry it. Note the layers of truth. On GitHub a stack is a
first-class object: a stacked PR's REST payload carries a `stack` field with the stack
number, size and the PR's position (`gh api "repos/{owner}/{repo}/pulls/<n>" --jq
.stack`; an empty result means that PR is stacked only through its base branch, which
GitHub still retargets on merge). The extension's local tracking is a separate, optional
layer, so `gh stack view` can say a branch "is not part of a stack" that very much is in
one on GitHub; adopt an existing GitHub stack with `gh stack checkout <stack-number>`,
and reserve `gh stack init` for branches not yet stacked anywhere. Finally, the worktree
trap: `sync` and `rebase` rewrite every branch in the stack, git refuses to move a
branch checked out in another worktree, and this repo routinely parks stack branches in
`.claude/worktrees/*` - detach the other checkouts before a cascade rebase. The
official `gh-stack` skill (committed at `.claude/skills/gh-stack/`) is the CLI manual;
the repo's own `repo-stack` skill covers the wiring above.

**Conventional Commits are enforced** by a `commit-msg` hook running commitlint. The
allowed types are restricted (see `commitlint.config.js`): `build`, `chore`, `ci`,
`docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`. Anything else is
rejected, including a bare description with no type.

**pre-commit** runs `lint-staged` (`.lintstagedrc.js`): per-app `eslint --fix`, then
Prettier. ESLint is invoked from each app's own directory so its config and plugins
resolve correctly, which is why you should not try to lint one app from the other's cwd.

**Backend tests are not run on commit.** The hook prints a reminder only, because they
are slow. CI runs them on every PR, but run them locally before pushing backend changes.

Prettier config is split: root and frontend use `printWidth: 100` with `singleQuote`;
the backend has its own `backend/.prettierrc`.

## CI

`.github/workflows/ci.yml` runs three jobs in parallel on every PR and on pushes to
`main`:

- **backend**: lint, build, unit tests, e2e
- **frontend**: lint, unit tests, build
- **conventions**: commitlint over the PR's commit range

A repo-wide `prettier --check` step exists but is **intentionally commented out**: 55
files predate the Prettier config and the step would fail immediately on a fresh clone.
To enable it, run `npx prettier --write .` once, commit the result, then uncomment.

## Not yet built

Treat these as planned, not available. This section exists so you do not build on
something that is not there.

- **The frontend `/api/chat` route handler.** No route handler exists, and the env
  template deliberately declares no model-provider key. Add whichever variable your
  provider needs when you build the route, server-side only and never behind
  `NEXT_PUBLIC_`. Related: `@google/genai` was once present in `frontend/node_modules`
  while absent from `package.json`, so a clean install removes it. Declare any SDK
  properly rather than relying on a leftover install.
- **Generated API types.** No OpenAPI spec, so `HelloResponse` is hand-mirrored between
  the two apps as described under Architecture. Swagger is deliberately deferred to this
  same work rather than added on its own.
- **`frontend/src/components/`.** Does not exist. Create it with your first shared
  component.
- **Auth.** `POST /api/users` and `GET /api/users/:id` are unauthenticated proof-of-stack
  endpoints that exercise the two-database write and read path. They appear nowhere in the
  tech spec's API surface and are expected to be reshaped or replaced by the magic-link
  flow when it lands.
- **The rest of the data model.** Only `users` (central) and `profile` (per user) exist.
  Categories, transactions and insights arrive with their features, and starter-category
  seeding belongs to onboarding.

`backend/README.md` is the stock NestJS starter README. Ignore it as a source of truth
for this project.
