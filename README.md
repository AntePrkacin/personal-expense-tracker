# Decode Academy Demo

A starter repo for Decode Academy final projects: a **Next.js** frontend talking to a
**NestJS** backend, with the tooling you are expected to use on a real team already wired
up (git hooks, Conventional Commits, CI, per-app linting and tests).

Take a copy, build your project in it. It is deliberately small: one feature works end to
end, and the rest is yours.

## Getting your own copy

**Do not fork and do not clone this repo directly.** Use the template, so you get a
repository that is genuinely yours: your own history, no `forked from` label, and it
stays with you after the academy ends.

```bash
# 1. Create your own repo from this template, and clone it.
#    Replace <your-project-name>. The owner is YOUR personal account, not the org.
gh repo create <your-project-name> \
  --template DECODE-Agentic-Academy/decode-academy-demo \
  --private --clone

# 2. Give your mentor read access, so they can review your work.
gh api -X PUT repos/<your-username>/<your-project-name>/collaborators/mselendic \
  -f permission=pull
```

Prefer the browser? Hit **`Use this template`** at the top of this page, then
`Create a new repository`. In the **Owner** dropdown pick **your own account**, not
`DECODE-Agentic-Academy`. Then add the mentor under `Settings` → `Collaborators`.

Step 2 is not optional. Without it nobody can see your work or help you when you are
stuck.

Your repo starts private. You are free to switch it to public whenever you want it in
your portfolio: `Settings` → `General` → `Danger Zone` → `Change visibility`. Before you
do, check that no real secret ever got committed; `.env` files are gitignored precisely
so this stays safe.

## What works today

One end-to-end path from browser to API, on purpose, so you can see the whole thing
without reading a lot of code:

```text
browser  ->  Next.js page (:4200)  ->  fetch on the server  ->  NestJS (:3000)
                                                                GET /api/hello
                                                                { "message": "..." }
```

Open the home page and you see a greeting that came from the backend. The relevant files
are [`frontend/src/app/page.tsx`](frontend/src/app/page.tsx) and
[`backend/src/app.controller.ts`](backend/src/app.controller.ts). Both are short. Read
them first.

If the backend is not running, the page says so instead of crashing, which is a useful
thing to notice: the frontend handles the failure rather than pretending it cannot happen.

The backend also has a working persistence layer and the whole passwordless entry flow, with
no setup needed: `POST /api/auth/register` and `POST /api/auth/login-link` answer an empty
`202` and, with no mail credentials configured, print the login link to the backend's console
for you to open, and `POST /api/auth/verify` turns that link into a session that
`GET /api/auth/session` will answer for. See [Database](#database) and
[Sending real email](#sending-real-email-optional).

## Prerequisites

| Tool    | Version                                   | Note                                                                                    |
| ------- | ----------------------------------------- | --------------------------------------------------------------------------------------- |
| Node.js | see [`.nvmrc`](.nvmrc) (currently **26**) | `nvm use` picks it up automatically. CI uses this same file                             |
| npm     | 12+                                       | Ships with Node 26                                                                      |
| git     | any recent                                |                                                                                         |
| mise    | optional                                  | Runs the repo-wide tasks below. Every task wraps plain npm commands, so you can skip it |

The hard floor is **v22.12.0**, set by the backend. It loads three ESM-only packages
(`@tursodatabase/database`, `@tursodatabase/sync`, `uuid`) from CommonJS, which needs
Node's `require()` of ESM, and that shipped unflagged in 22.12. Below it the backend does
not start, it throws `Cannot use import statement outside a module`. All three
`package.json` files carry that constraint, so npm warns with `EBADENGINE` if you are
below it.

**Check in a terminal you opened yourself**, not through an editor extension or an AI
assistant:

```bash
node --version
npm --version
```

If that says `command not found`, you have no Node and nothing below will work. Note that
Claude Code can be installed without a system Node and carries its own bundled runtime, so
a version check that succeeds _inside_ the assistant can still mean your own terminal has
nothing. The terminal you type in is the one that counts.

### Installing Node on macOS or Linux

Use [nvm](https://github.com/nvm-sh/nvm), which reads `.nvmrc`:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# reopen the terminal, then from the repo root:
nvm install    # reads .nvmrc
nvm use        # reads .nvmrc
```

### Installing Node on Windows

`nvm` is macOS/Linux only. Use [fnm](https://github.com/Schniz/fnm), which also reads
`.nvmrc`:

```powershell
winget install Schniz.fnm
# reopen the terminal, then from the repo root:
fnm install
fnm use
```

Add fnm's [shell hook](https://github.com/Schniz/fnm#shell-setup) so the version switches
per directory. Alternatives: [nvm-windows](https://github.com/coreybutler/nvm-windows)
(does not read `.nvmrc`, so pass `26` explicitly), `winget install OpenJS.NodeJS.LTS` for a
plain install with no switching, or WSL2 plus the macOS/Linux steps inside it.

### Installing mise (optional)

[mise](https://mise.jdx.dev) is a task runner. This repo uses it for one reason: three
`package.json` files mean most chores are the same command typed three times, and mise
collapses each into one. It is **entirely optional**, and every task wraps plain npm
commands you can always run by hand.

```bash
# macOS / Linux
curl https://mise.run | sh

# macOS (Homebrew)
brew install mise

# Windows
winget install jdx.mise
```

Then activate it in your shell, which is the step people miss:

```bash
echo 'eval "$(mise activate bash)"' >> ~/.bashrc    # bash
echo 'eval "$(mise activate zsh)"'  >> ~/.zshrc     # zsh
```

Reopen the terminal, then check it and see what is available:

```bash
mise --version
mise tasks ls        # every task, with its description
```

No `mise trust` needed: `mise.toml` only declares plain tool versions and tasks, so
nothing executes at load time.

## Quick start

This is a **multi-app repo**, not an npm-workspaces monorepo. There are three
`package.json` files and each one is installed separately.

```bash
# 1. Repo tooling. Do not skip this: it activates the git hooks.
npm install

# 2. Backend
cd backend && npm install && cp .env.example .env && cd ..

# 3. Frontend
cd frontend && npm install && cp .env.example .env.local && cd ..
```

> **Why step 1 matters.** The root `package.json` holds only Husky, commitlint,
> lint-staged and Prettier, and its `prepare` script is what installs the hooks. Skip it
> and your commits silently bypass every check the project relies on.

Both `.env` copies are optional: each app falls back to sensible localhost defaults. Copy
them anyway so you can see which variables exist.

Now run both apps, each in its **own terminal**:

```bash
# Terminal 1
cd backend && npm run start:dev     # http://localhost:3000
```

```bash
# Terminal 2
cd frontend && npm run dev          # http://localhost:4200
```

Open <http://localhost:4200>. You should see "Frontend + Backend connected" with the
message fetched from the API.

### Shortcut with mise

With [mise](#installing-mise-optional) installed, all three installs are one command from
the repo root:

```bash
mise run install
```

It runs the root install first, which is what activates the git hooks, then backend, then
frontend, and copies both `.env` templates. It halts if a step fails, so you never end up
with dependencies installed but hooks missing.

Both dev servers together, still from the repo root:

```bash
mise run dev
```

That replaces the two terminals above, with one trade-off: both servers share a terminal,
so their output interleaves and Ctrl+C stops both. Prefer the two-terminal version when
you are actually debugging one of them.

### Verify the backend directly

```bash
curl http://localhost:3000/api/hello
# {"message":"Welcome friend, hello from the NestJS API 👋"}
```

Note the `/api` part. `http://localhost:3000/` on its own returns **404**, and that is
correct, not a broken server. See "Gotchas" below.

Or browse the whole API at **http://localhost:3000/api/docs**, which is Swagger UI over
the same contract the frontend types are generated from. You can send requests from
there: with no `MAILPACE_API_TOKEN` set, a registration logs its login link to the
backend terminal instead of mailing it.

## Project structure

```text
backend/                  NestJS 11 API on :3000
  src/
    main.ts               Bootstrap: global 'api' prefix, CORS, Swagger UI, port, shutdown hooks
    app.module.ts         Root module: ConfigModule, DatabaseModule, AuthModule, pipe + filter
    app.controller.ts     GET /api/hello
    app.service.ts        Business logic
    app.controller.spec.ts
    openapi.ts            Writes openapi.json. Run it via `npm run api:spec`, never ts-node
    dto/                  Response shapes. Classes, not interfaces - see CLAUDE.md
    auth/                 The passwordless flow: register, login-link, verify, session
    common/               ids, email normalization, the global exception filter, the error DTO
    config/               Joi schema validating the environment at boot
    database/             Drizzle + Turso: schemas, client factory, per-user databases
    mail/                 Mailer seam: logs by default, MailPace over HTTP when configured
    users/                Central directory reads and writes (no controller)
  drizzle/                Generated migrations, committed: central/ and user/
  databases/              Local database files. Gitignored; migrations recreate them
  openapi.json            The API contract. Generated and committed; never edit by hand
  test/                   Supertest e2e specs
  .env.example

frontend/                 Next.js 16 (App Router) + React 19 on :4200
  src/app/
    layout.tsx            Root layout
    page.tsx              Home route, async Server Component, fetches the API
    page.test.tsx         React Testing Library example
    globals.css           Tailwind v4 entry
  src/types/api.d.ts      Generated from backend/openapi.json. Committed; never edit
  .env.example

.claude/                  Claude Code skills, agents and permissions
.github/workflows/ci.yml  Backend, frontend and commit-convention jobs
.husky/                   pre-commit and commit-msg hooks
mise.toml                 Optional task runner: repo-wide install, dev, audit, update
CLAUDE.md                 Deeper architecture notes (also read by Claude Code)
```

New backend features go in their own module folder under `backend/src/`. New frontend
routes are folders under `frontend/src/app/` containing a `page.tsx`. Shared components
go in `frontend/src/components/`, with the design-system primitives under
`frontend/src/components/ui/` and each one's tests and Storybook stories colocated beside
it. See `frontend/README.md` for the conventions there.

## Commands

Run these from inside the app directory, never from the repo root.

|                     | Backend (`cd backend`)      | Frontend (`cd frontend`) |
| ------------------- | --------------------------- | ------------------------ |
| Dev server          | `npm run start:dev`         | `npm run dev`            |
| Production build    | `npm run build`             | `npm run build`          |
| Lint                | `npm run lint`              | `npm run lint`           |
| Unit tests          | `npm test`                  | `npm test`               |
| Tests in watch mode | `npm run test:watch`        | `npm run test:watch`     |
| E2E tests           | `npm run test:e2e`          | not set up               |
| Coverage            | `npm run test:cov`          | not set up               |
| Generate migrations | `npm run db:generate`       | n/a                      |
| Browse the database | `npm run db:studio:central` | n/a                      |
| Regenerate the API  | `npm run api:spec`          | `npm run api:types`      |

That last row is the one exception to "never from the repo root". Run
**`npm run api:sync`** there instead and it does both halves, in the order that works.
Do that after changing any request or response shape. It writes two files,
`backend/openapi.json` and `frontend/src/types/api.d.ts`, both of which are committed and
neither of which is editable by hand - CI regenerates them and fails if your commit did
not.

Both apps use Jest, so `npm test` runs once and exits. To filter:
`npm test -- page` by path, `npm test -- -t "greeting"` by test name.

Neither app has a `typecheck` script. `npm run build` is the typecheck, because it runs
`tsc` (backend) or `next build` (frontend). Run it before you push.

### Repo-wide tasks with mise

Unlike the npm commands above, these run **from the repo root**, and each one covers all
three packages in order.

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

Every task also has per-package variants when you want just one: `install:repo`,
`install:backend`, `install:frontend`, `dev:backend`, `dev:frontend`, `update:repo`,
`update:backend`, `update:frontend`.

### Auditing and updating dependencies

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
  [`docs/2026-07-30-audit.md`](docs/2026-07-30-audit.md) has the full triage.

## Environment variables

| App      | Template                | Your local file       | Variables                                                                               |
| -------- | ----------------------- | --------------------- | --------------------------------------------------------------------------------------- |
| Backend  | `backend/.env.example`  | `backend/.env`        | `PORT` (3000), `FRONTEND_URL` (`http://localhost:4200`), `DATABASE_DIR` (`./databases`) |
| Frontend | `frontend/.env.example` | `frontend/.env.local` | `BACKEND_URL` (`http://localhost:3000`)                                                 |

The backend template also lists two blocks of commented-out variables, and you need
neither. Leave the `TURSO_*` block commented and the backend stores everything in local
files under `DATABASE_DIR` (see [Database](#database)). Leave `MAILPACE_API_TOKEN` and
`MAIL_FROM` commented and login links are printed to the console instead of emailed (see
[Sending real email](#sending-real-email-optional)). The remaining five -
`LOGIN_LINK_TTL_M`, `SESSION_TTL_D` and the three `AUTH_RATE_*` variables - are tuning knobs
with sensible defaults.

Note the filename difference: Nest reads `.env`, Next.js reads `.env.local`. Both are
gitignored and must never be committed. Only the `.env.example` templates are.

**One rule worth memorising:** in Next.js, a variable prefixed `NEXT_PUBLIC_` is inlined
into the JavaScript sent to the browser, so it is public forever. `BACKEND_URL` has no
such prefix because it is read on the server. Never put a secret behind
`NEXT_PUBLIC_`.

The backend validates its environment at startup with a Joi schema
(`backend/src/config/env.validation.ts`), so a typo fails immediately with a message
naming the variable, rather than surfacing as an odd error later.

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

curl -i -X POST http://localhost:3000/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"firstName":"Marko","lastName":"Kovac","email":"marko@email.com","monthlyBudget":2000,"categories":["Groceries"]}'
# 202 with an empty body, backend/databases/app.db now holds the row and the
# issued link, and the terminal running the backend prints the login link
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

## Sending real email (optional)

Access to the app is passwordless: you submit an email address and the backend sends a
single-use login link. **For local development there is nothing to set up.** With
`MAILPACE_API_TOKEN` unset, the backend logs the email instead of sending it, so a
registration prints something like this in the backend terminal and you open the link
yourself:

```text
[LogMailer] Email not sent (no MAILPACE_API_TOKEN): to=marko@email.com subject="Your Spendifico login link"
[LogMailer] Link: http://localhost:4200/auth/verify?token=...
```

That is also what CI and the e2e suite use, so no test can send mail to a real person.

To send for real, use [MailPace](https://mailpace.com):

1. Add your domain and complete the DKIM authorization it walks you through. Until that
   is done every send is rejected.
2. Create a server and copy its API token.
3. Uncomment both variables in `backend/.env`:

   ```text
   MAILPACE_API_TOKEN=your-server-token
   MAIL_FROM=login@spendifico.eu
   MAIL_FROM_NAME=Spendifico
   ```

`MAIL_FROM_NAME` is optional and gives the sender a display name, so the email arrives from
`Spendifico <login@spendifico.eu>` rather than a bare address. It is a separate variable so
`MAIL_FROM` stays a plain address: the `Name <addr>` form fails the schema's `.email()`
check, and keeping it bare is what makes "must be on the DKIM-authorized domain" something
you can verify at a glance.

`MAIL_FROM` has to be an address on the domain you authorized. Set both or neither: a
half-filled pair fails at boot, on purpose, because the alternative is a login email that
silently never leaves. That is also why both lines stay commented in `.env.example`, which
`cp .env.example .env` copies verbatim - uncommenting only `MAIL_FROM` would leave a fresh
clone unable to start.

It is called over plain HTTPS rather than SMTP, and with `fetch` rather than their SDK.
Outbound SMTP is blocked or throttled by most hosts (port 25 permanently on GCP, and
587/465 are not guaranteed either), while HTTPS on 443 always works. See
`backend/src/mail/mailpace.mailer.ts`, which is short.

### Smoke-testing a real send

**Send to `spendifico@gmail.com`.** That is the project's official inbox and the address
every MailPace smoke has been run against. Do not use a personal address: the messages are
the point of the test, so they have to land somewhere anyone on the project can check.

It is also the other end of the sender. This project's `MAIL_FROM` is
`login@spendifico.eu`, and everything delivered to that address is forwarded to
`spendifico@gmail.com`, so the same inbox holds both what the app sends and anything
replied to it. The sender is recorded (commented out) in `backend/.env.example`.

Run the backend against a throwaway database rather than your normal one, so a test
registration never lands in the real user directory. `NODE_ENV=test` makes `AppModule`
ignore `backend/.env` entirely, which is why the credentials are passed in explicitly
here:

```bash
cd backend && npm run build

NODE_ENV=test DATABASE_DIR=$(mktemp -d) PORT=3111 \
  FRONTEND_URL=http://localhost:4200 \
  MAILPACE_API_TOKEN=... MAIL_FROM=... \
  node dist/main
```

Then, in another terminal:

```bash
curl -i -X POST http://localhost:3111/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"firstName":"Marko","lastName":"Kovac","email":"spendifico@gmail.com","monthlyBudget":2000,"categories":["Groceries"]}'
```

Expect `202` with an empty body, and one email within a few seconds. Send the same request
again and a second link arrives while the first stops working: that is "Resend link"
(VER-2), and only the newest link is ever valid - clicking the older one's token now answers
`409` rather than a flat rejection, which is what lets a frontend say "open the most recent
email". Finish the round trip by verifying the newest token against port 3111 as under
[Database](#database); the throwaway `DATABASE_DIR` gets the user's database, so the real one
stays untouched.

Worth doing at least once whenever this path changes, because it catches what a mocked
spec cannot. The `Accept: application/json` header is the standing example - Node's `fetch`
defaults to `*/*` and MailPace answers that with a `406` blaming the body and the
Content-Type, both of which are fine.

## Git workflow

**Never commit or push directly to `main`.** Branch first:

```bash
git switch -c feat/PET-123-short-description
```

Branch format is `{type}/PET-{number}-{slug}`.

**Commit messages must follow Conventional Commits**, enforced by a `commit-msg` hook. If
the message does not match, the commit is rejected.

```text
feat(backend): add orders module
fix(frontend): handle empty product list
docs: explain the env setup
```

Allowed types: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`,
`revert`, `style`, `test`. Scope is usually `backend` or `frontend`, and can be omitted
for repo-level changes.

Two hooks run automatically:

- **pre-commit** runs `lint-staged`: ESLint `--fix` then Prettier, on staged files only,
  invoked from each app's own directory so the right config loads.
- **commit-msg** runs commitlint on your message.

**Backend tests are not run on commit** because they are slow; the hook only prints a
reminder. CI runs them on every PR, so run them locally before pushing backend changes.

## GitHub CLI (`gh`)

`gh` is GitHub's official command-line tool. It is **optional** for building the project
and **required** for anything involving pull requests from the terminal, including the
`repo-review-prs` Claude Code skill.

Why bother instead of using the website: opening a PR becomes one command, and you never
paste a personal access token anywhere, because `gh` stores an OAuth token in your OS
keychain and can act as git's credential helper.

### 1. Install

```bash
# macOS
brew install gh

# Windows
winget install --id GitHub.cli

# Linux (Debian/Ubuntu)
sudo apt install gh
```

Other distributions and installers: <https://github.com/cli/cli#installation>

Check it landed:

```bash
gh --version
```

### 2. Log in

```bash
gh auth login
```

It asks a short series of questions. The answers you want, matched on meaning rather than
position, since the wording and order shift between `gh` versions:

| Prompt                                         | Answer                       |
| ---------------------------------------------- | ---------------------------- |
| Which account or host                          | **GitHub.com**               |
| Preferred protocol for Git operations          | **HTTPS**                    |
| Authenticate Git with your GitHub credentials? | **Yes**                      |
| How would you like to authenticate?            | **Login with a web browser** |

It then shows a one-time code, opens your browser, and you paste the code there.

**HTTPS** plus **Yes** to the credential question is the combination that matters: it
makes `gh` act as git's credential helper, which is why git stops asking for a password
on every push. SSH works too, but then you manage keys yourself.

### 3. Verify

```bash
gh auth status
```

You want a green check, your username, and a scopes line. The default scopes
(`repo`, `read:org`, `gist`) are enough for everything in this repo: `repo` covers
reading and writing pull requests and review comments, `read:org` matters only if the
repository lives in an organisation rather than your personal account.

If you ever need to add a scope later, you do not start over:

```bash
gh auth refresh -s read:project
```

### 4. Commands you will actually use

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

### Troubleshooting

| Symptom                               | Fix                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `gh: command not found`               | Install step above. On macOS restart the terminal after `brew install`                     |
| `gh auth status` says not logged in   | Run `gh auth login`. In a container or over SSH, add `--web` or use a token via `GH_TOKEN` |
| `HTTP 403` when posting a review      | Your token lacks `repo`, or you lack write access to that repository                       |
| git still asks for a password on push | You answered "No" to the credential-helper prompt. Re-run `gh auth login` and answer Yes   |
| Two accounts, wrong one is used       | `gh auth switch`                                                                           |

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs three jobs in parallel on
every pull request and on pushes to `main`:

| Job           | Steps                                       |
| ------------- | ------------------------------------------- |
| `backend`     | lint, build, spec is fresh, unit tests, e2e |
| `frontend`    | types are fresh, lint, unit tests, build    |
| `conventions` | commitlint over every commit in the PR      |

The Node version comes from `.nvmrc`, so bump it there and CI follows.

The two "is fresh" steps regenerate a committed generated file and fail on any diff:
`backend/openapi.json` in one job, `frontend/src/types/api.d.ts` in the other. Together
they prove the spec still matches the backend and the types still match the spec. If
either fails, `npm run api:sync` from the repo root is the fix.

A repo-wide `prettier --check` step exists but is commented out: 55 files predate the
Prettier config and it would fail on a fresh clone. To turn it on, run
`npx prettier --write .` once, commit that, then uncomment the step.

## Working with Claude Code

This repo ships [Claude Code](https://claude.com/claude-code) configuration in
`.claude/`. It is optional, but if you use Claude Code these are already set up for you:

| Skill                                | What it does                                                             |
| ------------------------------------ | ------------------------------------------------------------------------ |
| `repo-dev-setup`                     | Walks the setup above and tells you what is missing                      |
| `repo-commit`                        | Runs the right lint and tests, then writes a Conventional Commit message |
| `repo-secrets`                       | Manages `.env` files from the templates                                  |
| `repo-jira`                          | Creates, estimates and transitions Jira issues over MCP                  |
| `repo-review-prs`                    | Reviews open pull requests                                               |
| `backend-nestjs` / `frontend-nextjs` | Rule libraries consulted automatically while writing code                |
| `backend-drizzle`                    | How Drizzle and Turso are wired in this repo specifically                |
| `drizzle-*` (8 skills)               | Drizzle's own drizzle-kit skills, committed. Refreshed, see below        |

Invoke a skill by its full name (`/repo-dev-setup`), or just describe what you want:
descriptions are matched automatically.

### Drizzle's own skills and MCP server

`drizzle-kit` ships eight agent skills of its own, and they are **already committed** here,
so a fresh clone has them with no extra step. You only need this command when refreshing
them:

```bash
npm run skills     # re-extract from the installed drizzle-kit, then commit the diff
```

Refresh after bumping `drizzle-kit`, and treat it like regenerating a migration: run it,
review the diff, commit it. You will be prompted when it matters, because one of the skills
checks its own revision against the installed `drizzle-kit` and says so when it has fallen
behind.

The repo's own `backend-drizzle` skill covers only this project's wiring (two migration
scopes, a database per user, the Turso drivers) and leaves the generic CLI to Drizzle's.

`drizzle-kit` also ships an MCP server exposing `generate`, `push`, `pull`, `check`,
`export` and `up` as tools. It is in the MCP template, so copy that and keep the `drizzle`
entry:

```bash
cp .mcp.json.example .mcp.json
```

`.mcp.json` is gitignored, so this part is per-developer and optional. One caution: `push`
applies schema changes straight to a database without writing a migration file, which is
the opposite of how this repo works. Prefer `npm run db:generate`.

Two things to know about the setup:

- **Claude asks before editing files.** `Edit` and `Write` are deliberately not
  pre-approved, so you see every diff before it lands. Reading diffs is a large part of
  what you are here to learn. Turn it off with Shift+Tab once it slows you down, not
  before.
- **`.claude/settings.json` is committed and shared**, so personal preferences go in
  `.claude/settings.local.json`, which is gitignored. Every choice in the shared file is
  explained in [`.claude/SETTINGS.md`](.claude/SETTINGS.md).

Using Jira needs an MCP server; see
[`.claude/skills/repo-jira/references/jira-access.md`](.claude/skills/repo-jira/references/jira-access.md)
for the two supported setups and their trade-offs.

## Gotchas

| Symptom                                                   | Cause                                                                                                                                                |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `http://localhost:3000/` returns 404                      | Correct. A global `api` prefix means the route is `/api/hello`. The prefix is set once in `backend/src/main.ts`                                      |
| Page says "Could not reach the API"                       | The backend is not running, or not on 3000                                                                                                           |
| `node: command not found`, but it worked via the AI agent | Claude Code can ship its own bundled Node, which your terminal does not see. Install Node yourself, see [Prerequisites](#prerequisites)              |
| Servers die as soon as the AI assistant finishes          | Expected. Processes an assistant starts belong to its session. Start `npm run start:dev` and `npm run dev` in your own terminals and leave them open |
| Commits go through with no lint or message check          | You skipped the root `npm install`, so the hooks were never installed. Check with `git config core.hooksPath`, which should print `.husky/_`         |
| ESLint cannot find its config                             | You ran it from the repo root. Each app's ESLint runs from that app's directory                                                                      |
| Ports look backwards                                      | They are asymmetric on purpose: backend **3000**, frontend **4200**. Both are wired into code and config, so do not swap them                        |
| Port already in use                                       | A dev server from an earlier session. `lsof -nP -iTCP:3000 -sTCP:LISTEN` on macOS/Linux, `netstat -ano \| findstr :3000` on Windows                  |
| `mise: command not found` after installing it             | You skipped the shell activation line. See [Installing mise](#installing-mise-optional)                                                              |
| `mise run audit` lists vulnerabilities but still succeeds | Deliberate: it is a report, not a gate. See [Auditing and updating dependencies](#auditing-and-updating-dependencies)                                |
| mise gives you a different Node major than CI             | `mise.toml` and `.nvmrc` both pin the major and must be bumped together. mise does not read `.nvmrc`, so the two are independent                     |
| CI fails on "OpenAPI spec is up to date"                  | You changed a request or response shape without regenerating. Run `npm run api:sync` from the repo root and commit both files it writes              |
| The spec has a response of `{}`                           | The shape is an `interface`, or its class is not in a `*.dto.ts` file. Both make the generator's plugin skip it, and neither is an error             |

## Where to go from here

Things this boilerplate deliberately does not decide for you:

- **Sessions on the frontend.** The backend half is done: verifying a link returns an opaque
  30-day bearer token, and `GET /api/auth/session` answers who it belongs to behind
  `SessionGuard`. Nothing on the frontend uses it yet - no verify page, and no cookie. The
  session token belongs in an httpOnly first-party cookie the Next.js server sets and
  forwards; it must never reach client-side JavaScript.
- **A generated HTTP client.** Types are shared, and that part is decided: response shapes
  come out of `backend/openapi.json` (see Commands above), so `page.tsx` derives its type
  rather than restating it. What is left open is whether the calls themselves get wrapped.
  A generated client would fight Next.js caching, since `page.tsx` passes `cache` and
  `next` options straight to `fetch`; `openapi-fetch` is the upgrade worth considering,
  because it delegates to global `fetch` and passes `RequestInit` through untouched.
- **A chat feature.** There is no `/api/chat` route yet, and the env template ships no
  model-provider key. Add the variable your provider needs when you build the route,
  server-side only.

[`CLAUDE.md`](CLAUDE.md) has the deeper architectural notes: why the ports are what they
are, how the request flows through the Server Component, and what else is not built yet.
Read it when you want the reasoning rather than the steps.
