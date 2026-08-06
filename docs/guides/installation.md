# Installation

From a fresh clone to two running servers, plus the optional per-developer extras. macOS and
Linux; there are no Windows instructions in this repo.

## Prerequisites

| Tool    | Version                                   | Note                                                                                    |
| ------- | ----------------------------------------- | --------------------------------------------------------------------------------------- |
| Node.js | see [`.nvmrc`](../../.nvmrc) (currently **26**) | `nvm use` picks it up automatically. CI uses this same file                             |
| npm     | whatever ships with that Node             | Nothing here pins npm, so there is no version to match                                  |
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

### Installing Node

Use [nvm](https://github.com/nvm-sh/nvm), which reads `.nvmrc`:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# reopen the terminal, then from the repo root:
nvm install    # reads .nvmrc
nvm use        # reads .nvmrc
```

## Optional: mise

[mise](https://mise.jdx.dev) is a task runner. This repo uses it for one reason: three
`package.json` files mean most chores are the same command typed three times, and mise
collapses each into one. It is **entirely optional**, and every task wraps plain npm
commands you can always run by hand.

```bash
# macOS / Linux
curl https://mise.run | sh

# macOS (Homebrew)
brew install mise
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

## The three installs

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

Open <http://localhost:4200>. You should see the Welcome screen. Nothing on it fetches the
backend yet, so it renders whether or not the API is running.

## Shortcut with mise

With [mise](#optional-mise) installed, all three installs are one command from
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

## Verify it works

```bash
curl http://localhost:3000/api/health

# {"status":"ok"}
```

Note the `/api` part. `http://localhost:3000/` on its own returns **404**, and that is
correct, not a broken server. See [Troubleshooting](troubleshooting.md).

Or browse the whole API at **http://localhost:3000/api/docs**, which is Swagger UI over
the same contract the frontend types are generated from. You can send requests from
there: with no `MAILPACE_API_TOKEN` set, a registration logs its login link to the
backend terminal instead of mailing it.

## Optional: the GitHub CLI

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

## Optional: the drizzle-kit MCP server

`drizzle-kit` ships an MCP server exposing `generate`, `push`, `pull`, `check`, `export` and
`up` as tools. It is already in the MCP template, so copy that and keep the `drizzle` entry:

```bash
cp .mcp.json.example .mcp.json
```

`.mcp.json` is gitignored, so this part is per-developer and optional. One caution: `push`
applies schema changes straight to a database without writing a migration file, which is
the opposite of how this repo works. Prefer `npm run db:generate`.

## Optional: the TypeScript language server

`.claude/settings.json` enables the `typescript-lsp` Claude Code plugin for everyone, but that
plugin is only a declaration. It launches `typescript-language-server`, and nothing installs
that binary for you: not the plugin, not `npm install`, not this repo. Until it is on your
`PATH`, the plugin's Errors tab in `/plugin` reads `Executable not found in $PATH` and you get
no code intelligence.

If you use mise it is declared in `mise.toml`, so it arrives with everything else. mise scopes
it to this project, so the shim resolves inside the repo and nowhere else, which is the only
place it is used:

```bash
mise install
```

Otherwise install the server globally:

```bash
npm install -g typescript-language-server
```

Only the server. The TypeScript it needs comes from the root `npm install` you have already
run, and the reason it has to come from the root rather than from `backend/` or `frontend/` is
in `docs/agents/conventions.md`. If you skipped that install, the server starts and then
refuses the connection with "Could not find a valid TypeScript installation".

Verify both halves, then reopen Claude Code:

```bash
which typescript-language-server
node -p "require('typescript/package.json').version"
```
