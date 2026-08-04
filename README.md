# Spendifico

Spendifico is a personal expense tracker. You log what you spend, and it shows where the money
went, how much of the month's budget is left, and what that looks like over time. There are no
passwords: you enter your email address and the app sends a single-use login link.

It is a two-app repo. A **NestJS** API serves `/api` on port **3000**; a **Next.js** App
Router frontend runs on **4200** and is the only thing that talks to it. They share one HTTP
contract, generated from the backend and committed, so neither side restates the other's types.
Data is persisted with Drizzle ORM over Turso's SQLite engine, and **every user gets a database
of their own** behind a small central directory. The interface is built from a Figma-derived
design system you can browse in Storybook.

The repo is also a Decode Academy final project, which is why the team tooling is real rather
than illustrative: git hooks, Conventional Commits, CI on every pull request, per-app linting and
tests, and Claude Code skills committed alongside the code.

## What works today

Each half is substantially built. **They do not yet talk to each other**: the missing piece
between them is the session cookie, and until it lands the frontend renders real screens with
placeholder data.

- **Passwordless access, backend complete.** `POST /api/auth/register` and
  `POST /api/auth/login-link` both answer an empty `202`, deliberately identical so neither
  reveals whether an account exists. `POST /api/auth/verify` spends the link, provisions that
  user's database and returns a 30-day bearer session, and `GET /api/auth/session` says who a
  session belongs to. With no mail credentials configured the login link is printed to the
  backend's console, so the whole flow is testable with nothing to set up.
- **Transaction writes.** `POST /api/transactions`, `PATCH /api/transactions/:id` and
  `DELETE /api/transactions/:id`. Reads, month windows and every aggregate the designs show are
  computed on read and are not built yet.
- **A database per user.** The central database holds only the user directory; everything else
  about a person lives in their own database, created the first time they verify a login link.
  Local development uses plain files under `backend/databases/` and needs no cloud account.
- **The design system and the app shell.** Every tile of the Figma Components page has a
  component in `frontend/src/components/ui/`, with its tests and Storybook stories beside it, and
  the four routed views `/dashboard`, `/transactions`, `/insights` and `/settings` render inside
  the shell with the sidebar mounted. `npm run storybook` renders the whole system, Foundations
  included.
- **Nothing below the page headers, yet.** All four `<main>` elements are empty, the session gate
  lets every request through, and the sidebar footer shows a placeholder profile.

Browse the live contract at <http://localhost:3000/api/docs>. What is deliberately deferred, and
why, is in [`docs/TODO.md`](docs/TODO.md).

## Quick start

Node comes from [`.nvmrc`](.nvmrc); `nvm use` picks it up. Full prerequisites, including the
bundled-Node trap that catches people whose terminal cannot see `node`, are in the
[installation guide](docs/guides/installation.md).

<!-- sync: docs/guides/installation.md -->

```bash
npm install                                              # root: this is what installs the git hooks
cd backend  && npm install && cp .env.example .env       && cd ..
cd frontend && npm install && cp .env.example .env.local && cd ..
```

Both `.env` copies are optional: every variable has a working local default. Then one server per
terminal, in terminals you opened yourself:

```bash
cd backend  && npm run start:dev     # http://localhost:3000
cd frontend && npm run dev           # http://localhost:4200
```

With [mise](docs/guides/installation.md#optional-mise) installed, `mise run install` and
`mise run dev` do both of the above from the repo root.

```bash
curl http://localhost:3000/api/hello
# {"message":"Welcome friend, hello from the NestJS API 👋"}
```

`http://localhost:3000/` returning 404 is correct: a global `api` prefix means the route is
`/api/hello`.

## Documentation

| Guide | For |
| --- | --- |
| [Installation](docs/guides/installation.md) | Node, mise, the three installs, `gh`, running both apps |
| [Commands](docs/guides/commands.md) | Every script in either app, plus the mise tasks |
| [Configuration](docs/guides/configuration.md) | Every environment variable and what a missing one does |
| [Database](docs/guides/database.md) | Local files, trying the access flow, schema changes, Turso Cloud |
| [Sending real email](docs/guides/email.md) | MailPace setup and the smoke test |
| [Troubleshooting](docs/guides/troubleshooting.md) | Symptom to cause, for the whole repo |
| [Contributing](docs/CONTRIBUTING.md) | Branches, commits, the hooks, what CI checks |

[`docs/README.md`](docs/README.md) indexes everything else under `docs/`: the implementation
plans, the deferred-work register, and the brief, spec and handout the project is built from.

**These docs answer how; the CLAUDE files answer why.** [`CLAUDE.md`](CLAUDE.md) and its
per-app companions ([`backend/CLAUDE.md`](backend/CLAUDE.md),
[`frontend/CLAUDE.md`](frontend/CLAUDE.md)) hold the reasoning: why the ports are asymmetric, why
registration provisions no database, why Tailwind's own palette is cleared. They are written for
Claude Code and are just as readable by people. No fact is written in both places.

## Repository layout

```text
backend/     NestJS API on :3000. Its own package.json, and its own CLAUDE.md
frontend/    Next.js on :4200, Storybook on :6006. Same
docs/        These guides, plans, the TODO register, and the agent-facing notes
.claude/     Claude Code skills, subagents and permissions
mise.toml    Optional task runner. Pins the Node major a second time
```

Three `package.json` files, each installed separately, and the root one is not optional: its
`prepare` script is what installs the git hooks. Run app commands from inside that app's
directory.

## Contributing

Never commit or push directly to `main`; branch as `{type}/PET-{number}-{slug}`. Commit messages
are Conventional Commits, enforced by a hook. The details, including how this repo uses stacked
branches, are in [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md).

---

Built for the Decode Academy as a final project, with the tooling a real team would use.
