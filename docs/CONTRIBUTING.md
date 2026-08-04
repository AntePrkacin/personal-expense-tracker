# Contributing

How work ships in this repo: what to name a branch, what a commit message has to look like, what
the two git hooks do to your commit, and what CI checks. The rules here are the ones a human
follows; the reasoning an agent needs is in `docs/agents/conventions.md`.

Before you make this repo public, check that no real secret was ever committed. `.env` files are
gitignored precisely so that stays safe, and no real name or personal address belongs in the
repo either: it is a public-facing teaching project, so anything committed is effectively
published.

## Branching and committing

**HARD RULE: never commit or push directly to `main`.** Branch first. `settings.json`
puts `git push` behind a confirmation prompt to give this rule a real barrier rather
than just an instruction.

Branch format: `{type}/PET-{number}-{slug}`, for example
`feat/PET-160-user-profile-card`.

**Verify the branch in the same breath as the commit.** The branch checked out earlier in
a session is a snapshot, not a guarantee: on 2026-08-04 a commit meant for
`feat/PET-45-profile-read` landed on local `main` because HEAD had moved during a
plan-mode session, straight through the hard rule above. Read `git branch --show-current`
immediately before `git commit`, and read the `[branch sha]` line the commit prints back.
Recovery, if it happens anyway, is `git branch -f <feature> <sha>` and then
`git reset --hard origin/main` with main checked out.

**The first push of a branch is `git push -u origin <branch>`.** A bare
`git push origin <branch>` leaves the local branch with no upstream, which costs
`git status`, `git pull` and every later bare `git push` their reference point. Repair an
already-pushed branch with `git branch --set-upstream-to=origin/<branch>`.

**Stacked branches are not manually rebased. Ordinary branches are nobody's business but
yours.** This repo uses GitHub's stacked branches feature routinely: a feature branch is
often cut from an unmerged parent branch rather than from `main`
(`feat/PET-14-link-verification-and-sessions` on top of
`feat/PET-50-api-openapi-typegen`, for example), so the parent's PR merges first and
GitHub retargets and restacks the child itself. A manual `git rebase` there is redundant
and rewrites history the stack tooling is tracking, so open the PR against the parent, let
GitHub do the restack, and use `gh stack rebase`/`sync` when a restack really is needed.
New work that depends on an unmerged branch is cut from that branch's tip, not from
`main`.

**That restriction is about stacks only**, and it is the reason to check before assuming:
`gh pr view <branch> --json baseRefName` names the PR's base, and a base other than `main`
means a stacked branch. A plain branch off `main` is normal git - rebase it, squash it,
force-push it as you like.

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

**Use the fewest commits that make sense, not one per task.** A plan's checklist is a list
of tasks, not a list of commits: implementing six planned steps is free to land as one
commit. Split only when a genuine reason exists - unrelated concerns in one working tree,
or both apps changed for different reasons - which is the same test the `repo-commit`
skill applies. The plan doc itself is the one standing exception, committed alone as the
branch's first commit so the draft PR can exist before any code does.

## What the hooks do

**Conventional Commits are enforced** by a `commit-msg` hook running commitlint. The
allowed types are restricted (see `commitlint.config.js`): `build`, `chore`, `ci`,
`docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`. Anything else is
rejected, including a bare description with no type.

**pre-commit** runs `lint-staged` (`.lintstagedrc.js`): per-app `eslint --fix`, then
Prettier. ESLint is invoked from each app's own directory so its config and plugins
resolve correctly, which is why you should not try to lint one app from the other's cwd.

That indirection is via `bash -c "cd <app> && npx eslint ..."`, so **every staged path is
single-quoted through a `shellQuote` helper**. Not defensive: a Next.js route group folder
is literally named `(app)`, and bash reads an unquoted `(` as a subshell. PET-19 hit this
the first time it tried to commit `frontend/src/app/(app)/layout.tsx`, and the error bash
prints (`syntax error near unexpected token '('`) names no file, so it reads as a broken
hook rather than a quoting bug. Prettier needs no quoting, because lint-staged spawns it
with no shell.

**Backend tests are not run on commit.** The hook prints a reminder only, because they
are slow. CI runs them on every PR, but run them locally before pushing backend changes.

Prettier config is per app and there is **no root config at all**: the frontend sets
`printWidth: 100` with `singleQuote` in its `package.json`, the backend has its own
`backend/.prettierrc`. Anything outside those two directories - `CLAUDE.md`, `README.md`,
`docs/`, `.claude/` - therefore gets Prettier's defaults, which means `printWidth: 80` and
**double** quotes. Prose is unaffected because `proseWrap` defaults to `preserve`, but a
fenced `ts` block in one of those files will be reformatted away from repo style. Keep
short code samples in those files as inline spans, which Prettier leaves alone.

## What CI checks

`.github/workflows/ci.yml` runs three jobs in parallel on every PR and on pushes to
`main`:

- **backend**: lint, build, OpenAPI spec is fresh, unit tests, e2e
- **frontend**: generated API types are fresh, lint, unit tests, build, build-storybook
- **conventions**: commitlint over the PR's commit range

The two freshness steps are the drift gate described in `docs/agents/api-contract.md`. Both regenerate
a committed artifact and fail on a non-empty `git diff`. Note where each one lives: the
frontend half runs in the frontend job because `openapi-typescript` only reads the
committed JSON and needs no `backend/node_modules`.
