# Commands

Every script in the repo and what it is for. This is the single home for the command tables: the
CLAUDE files name a command when a rule depends on it, but they do not repeat this inventory.

Run app commands from inside that app's directory. There are three `package.json` files, each
installed separately, and ESLint in particular resolves its config and plugins from the app's own
`node_modules`.

## Backend, from `backend/`

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
| `npm run api:spec`                             | Build, then write `openapi.json`; commit what it writes     |
| `npm run api:emit`                             | The write half alone, reusing `dist/`. What CI runs         |

## Frontend, from `frontend/`

| Command                   | Purpose                                                   |
| ------------------------- | --------------------------------------------------------- |
| `npm run dev`             | Next dev server on :4200                                  |
| `npm run build`           | Production build. Doubles as the typecheck gate           |
| `npm start`               | Serve the production build on :4200                       |
| `npm run lint`            | ESLint (`eslint-config-next` + `eslint-plugin-storybook`) |
| `npm test`                | Jest + React Testing Library (jsdom)                      |
| `npm run test:watch`      | Same, in watch mode                                       |
| `npm run api:types`       | Regenerate `src/types/api.d.ts` from the spec             |
| `npm run storybook`       | Storybook on :6006, the design system reference           |
| `npm run build-storybook` | Static Storybook build into `storybook-static/`           |

## Long-running commands, and what they cost

Several commands above never exit: both apps' `test:watch`, the backend's `start:dev`,
`start:debug` and either `db:studio:*`, and the frontend's `dev`, `start` and `storybook`. Kill
each one when the task that needed it is finished, rather than leaving it up for the length of a
session. A Nest watch and a Next dev server together hold well over a gigabyte, they outlive the
work that started them by default, and nothing afterwards reports them as the reason the machine
ran out of memory.

That matters most beside `npm test`, because Jest's own appetite is the other half of the same
budget. Both apps cap the worker count and the per-worker heap in their own Jest config -
`frontend/jest.config.ts`, the `jest` block in `backend/package.json`, and
`backend/test/jest-e2e.json` - since the default is one worker per core, and two suites started at
once in two checkouts ask for twice the machine. Those three files are the single home for the
values: do not restate them here, and do not pass a competing `--maxWorkers` on the command line
without a reason to.

## Root, from the repo root

| Command              | Purpose                                                               |
| -------------------- | --------------------------------------------------------------------- |
| `npm install`        | Repo-wide dev tooling. Its `prepare` script is what installs the hooks |
| `npm run api:sync`   | The OpenAPI spec, then the frontend types from it, in that order       |
| `npm run docs:check` | Single-source assertions over this repo's Markdown. What CI runs       |
| `npm run skills`     | Re-extract Drizzle's committed agent skills after a drizzle-kit bump   |

`api:sync` is the command to use after touching anything a response or request body is made
of; the two per-app scripts exist for CI, which has already built one side or the other.

Single test in either app: `npm test -- page` filters by path, `npm test -- -t "<name>"`
filters by test name.

Neither app has a standalone `typecheck` script. `npm run build` is the typecheck.

To run the whole thing locally, start both in separate terminals: backend on 3000,
frontend on 4200. The frontend calls the backend, never the reverse.

## Repo-wide tasks with mise

Unlike the npm commands above, these run **from the repo root**, and most cover all
three packages in order. The exception is `deploy-backend`, which dispatches the backend's
Fly deploy (see [Deployment](deployment.md)).

| Task                         | What it does                                                         |
| ---------------------------- | -------------------------------------------------------------------- |
| `mise run install`           | `npm install` in root, backend, frontend, plus both `.env` templates |
| `mise run dev`               | Both dev servers together in one terminal                            |
| `mise run audit`             | `npm audit` in all three packages                                    |
| `mise run check-for-updates` | `ncu` in all three, showing what is outdated                         |
| `mise run update`            | `ncu -u --target minor`, then install and update, in all three       |
| `mise run db:generate`       | Generate Drizzle migrations for both database scopes                 |
| `mise run api:sync`          | Regenerate the OpenAPI spec, then the frontend types from it         |
| `mise run skills`            | Refresh Drizzle's committed agent skills after a drizzle-kit bump    |
| `mise run deploy-backend`    | Dispatch the Fly deploy workflow on `main`, stream it, open the run  |
| `mise run seed`               | Fill the showcase user with 36 months of data, in local SQLite files |
| `mise run seed:cloud`         | The same, against Turso Cloud - needs `backend/.env`                 |
| `mise run seed:fixture`       | Regenerate the committed showcase fixture from the spending model    |
| `mise run seed:check`         | Measure the showcase spending model without seeding anything         |
| `mise run reset`              | Delete the local database files under `backend/databases/`           |
| `mise run reset:cloud`        | Destroy every Turso database and the Fly volume, then redeploy       |

`reset:cloud` is destructive and has no undo: it deletes every account in Turso, replaces
the deployed app's volume and redeploys. It asks for the project name before doing anything,
and needs a `TURSO_API_TOKEN` the app itself does not have. Read
[Database](database.md#resetting-everything-to-a-clean-state) before running it.

Every task also has per-package variants when you want just one: `install:repo`,
`install:backend`, `install:frontend`, `dev:backend`, `dev:frontend`, `update:repo`,
`update:backend`, `update:frontend`.

## Auditing and updating dependencies

```bash
mise run audit               # what is vulnerable
mise run check-for-updates   # what is outdated
mise run update              # bump minors and patches only, never majors
```

`update` is capped at `--target minor` on purpose: minor and patch bumps are safe to take
in bulk, majors need reading a changelog and are yours to do deliberately.

Two things about `audit` that will otherwise confuse you:

- **It always exits 0.** `npm audit` exits 1 on any finding, so a gating version would
  stop at the first package with findings and never reach the rest. This is a report, not
  a gate.
- **The headline totals are inflated.** npm counts every intermediate package in a
  dependency chain separately, so a single advisory can be billed 25 times. The task
  prints a production-only summary at the end, which is the number that matters.
  [`docs/2026-07-30-audit.md`](../2026-07-30-audit.md) has the full triage.

## Regenerating the committed agent skills

`drizzle-kit` ships agent skills of its own, and they are **already committed** here, so a
fresh clone has them with no extra step. You only need this command when refreshing them:

```bash
npm run skills     # re-extract from the installed drizzle-kit, then commit the diff
```

Refresh after bumping `drizzle-kit`, and treat it like regenerating a migration: run it,
review the diff, commit it. You will be prompted when it matters, because one of the skills
checks its own revision against the installed `drizzle-kit` and says so when it has fallen
behind.

The repo's own `backend-drizzle` skill covers only this project's wiring (two migration
scopes, a database per user, the Turso drivers) and leaves the generic CLI to Drizzle's. The
full inventory, including the MCP server `drizzle-kit` also ships, is in
`docs/agents/claude-tooling.md`; setting that server up is a step in the
[installation guide](installation.md#optional-the-drizzle-kit-mcp-server).

## GitHub CLI

```bash
gh pr create --fill                # open a PR from the current branch
gh pr list                         # open PRs in this repo
gh pr view 12                      # read PR #12
gh pr diff 12                      # its diff
gh pr checks                       # CI status for the current branch
gh repo view --web                 # open the repo in a browser
```

`gh pr create` reads the branch you are on, so commit and push first. Since this repo
forbids committing to `main`, the normal flow is: branch, commit, push, `gh pr create`.

