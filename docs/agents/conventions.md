# Conventions: how work is carried out, and how these docs stay true

Root `CLAUDE.md` carries the rules themselves. This file carries the reasoning behind them, the
incident each one came from, and the conventions that keep the documentation from rotting.

## Single-source every fact; restate only reasoning

A value that also exists in code or config - version numbers, environment variable names and
defaults, port numbers, command tables, and counts of any of those - is written out in exactly
one Markdown file, the one named in the table below. Every other file refers to it by name
instead of repeating it. The *reasoning* around a fact may be restated freely in a different
voice for a different audience, provided it names no number or identifier a reader could act on.

The test is whether a reader can act on the token without understanding it. `v22.12.0` is
actionable in isolation: you compare it and move on, and if it is wrong you are wrong with full
confidence. "The floor is the backend's, not `next`'s, because the backend `require()`s ESM-only
packages" is not actionable in isolation; it is a claim you would verify before using. That is
exactly the shape of the three drifts this convention exists to prevent: `.nvmrc` documented as
24 when it was 26, the Node floor as v20.9.0 when it was v22.12.0, and the backend described as
reading "exactly two" environment variables when it reads seventeen. All three were actionable
tokens, consumed without checking. None of the reasoning around them drifted.

**A count nobody can verify gets deleted, not corrected.** The repo-wide Prettier gate was
documented as failing on "55 files"; it was 69 one day later and 71 the next, and every commit
that adds Markdown changes it again. Say "run `npx prettier --list-different .` for the current
set" instead.

| Fact | Single home | How everything else refers to it |
| --- | --- | --- |
| Node major | `.nvmrc`, and `mise.toml` must agree because mise cannot read it | "read `.nvmrc`" |
| Node floor, and why it is the backend's | `engines.node` in the three `package.json` files; the reasoning is below | "read `engines.node` in `backend/package.json`" |
| npm floor | nowhere: there is no `engines.npm` | do not assert one |
| Every command in either app | `docs/guides/commands.md` | pointer, or a marked copy inside a procedure |
| Backend environment variables, defaults, pairings | `docs/guides/configuration.md`; enforced by `backend/src/config/env.validation.ts`; reasoning in `backend/CLAUDE.md` | pointer; procedures may name a variable without restating its default |
| Ports 3000, 4200 and 6006 | root `CLAUDE.md` | quote a port only where a command literally contains it |
| Branch format, commit types, the hooks, the CI job list | `docs/CONTRIBUTING.md`; types enforced by `commitlint.config.js` | pointer |
| Stacked-branch mechanics | `.claude/skills/repo-stack/SKILL.md` and the committed `gh-stack` skill | pointer, including from `docs/CONTRIBUTING.md` |
| Migration scopes, schema conventions, drivers | `backend/CLAUDE.md` | pointer |
| Design tokens and component conventions | `frontend/CLAUDE.md` | pointer |
| The HTTP contract and its generated artifacts | `docs/agents/api-contract.md` | pointer |
| Skills, subagents, MCP | `docs/agents/claude-tooling.md`; permissions stay in `.claude/SETTINGS.md` | pointer |
| Why something is deferred | `docs/TODO.md` | pointer; each area guide's `## Not built here` carries only the warning |

Note two rows where the single home is a skill rather than a doc. Single-sourcing does not mean
docs win; it means one file wins.

**The one exception is a procedure someone executes top to bottom**, where a pointer is not
executable. There a copy is allowed if the line above it names its source:
`<!-- sync: docs/guides/configuration.md -->`. `npm run docs:check` verifies that the named file
exists, and a reviewer knows what to re-read before touching the copy. It does **not** compare
content: the marker is a breadcrumb, not drift detection.

## Editing these files

1. **One topic, one file.** A fact about one app goes in that app's guide, never in root and
   never in both. Root grows only when a rule becomes true for every directory.
2. **Add, do not reflow.** Prettier's `proseWrap` is `preserve`, so it never rewraps prose for
   you, and hand-rewrapping a paragraph you did not change turns a three-word fix into a
   whole-paragraph diff and manufactures a merge conflict. Change words in place and leave the
   line breaks alone; let a line run slightly long rather than rewrapping the block.
3. **New material goes at the end of its section**, unless it corrects the sentence it replaces.
4. **`## Not built here` is a flat list**, one bullet per capability, ordered alphabetically by
   its bold lead-in so two authors compute the same insertion point. Delete whole bullets. Never
   merge two bullets. A bullet keeps the trap that makes it actionable, not just its ticket.
5. **No growing tables in `backend/CLAUDE.md` or `frontend/CLAUDE.md`.** Those two are
   Prettier-formatted on every commit, and Prettier pads every cell to the widest cell in its
   column, so one added row with a long cell rewrites every row of the table. Anything that
   grows by rows belongs in a guide; keep tables here for closed sets.
6. **A blank line between items in any long list**, so each insertion has unique merge context.
   Bullets separated by a single newline share their neighbours as context, and two insertions
   two bullets apart can still conflict.
7. **Paths are scoped by audience.** Agent files (`CLAUDE.md`, the two scoped files, this
   directory) use backticked repo-root-relative paths and no markdown links, so a path resolves
   identically read from anywhere. Human files under `docs/` use real relative links, because
   they are read on GitHub where a link has to work.
8. **Cross-file references name the file.** "The section above" is allowed only within one file.
9. **Merge `main` into a feature branch as its own bare commit.** The one CLAUDE.md conflict this
   repo has had arrived inside a 31-file merge carrying 2,987 insertions, so the doc conflict had
   to be resolved amid a wall of generated migration and OpenAPI diff.

**Sizing trigger.** If `backend/CLAUDE.md` or `frontend/CLAUDE.md` passes 400 lines, or produces
its first merge conflict, promote its hottest topic one directory deeper
(`backend/src/database/CLAUDE.md`, `frontend/src/components/CLAUDE.md`), which Claude Code
auto-loads by the same mechanism with better trigger locality. Do it on that evidence, not on
taste.

## Working conventions

How work is carried out here, as distinct from what the code does. Each of these was
learned by getting it wrong once.

**Larger tasks run as a visible todo list.** Anything past a one-step change is laid out
as steps before it starts, and the list is updated as each one lands, so where the work
currently stands is readable without asking. When the task came from a plan in
`docs/plans/`, the todo list is that plan's checklist rather than a fresh invention.
Working silently and presenting everything at the end hides the one window where a wrong
assumption is still cheap to correct.

**Show the work, then ask, before committing.** `.claude/settings.json` deliberately
leaves `Edit` and `Write` un-approved so every file change is seen as a diff before it
lands, and committing holds to the same bargain: summarize what changed, run the gates,
then wait for approval. An approved plan authorizes a commit's _content_, not the moment
of committing, and pushing needs its own approval on top of that. Where a commit split is
not obvious, offer the options rather than picking silently - and see `docs/CONTRIBUTING.md`
for which way to lean.

**Explain a state-changing command before running it.** Anything touching system state or
starting a long-lived background process gets described in plain text first - what it
does, why, what it affects - so the permission prompt arrives after the explanation
rather than instead of it. Ordinary repo-local reads, builds and tests need no ceremony.

**A search that is evidence of an absence has to reach dotfiles.** Use whatever search
tool you like - this is about one trap in the answer, not about the tool. When the point
of a sweep is that something is gone (a rename, a secret audit, "is this string anywhere"),
the result is only as trustworthy as its coverage, and an under-reporting sweep is
indistinguishable from a clean one. During the Expensa to Spendifico rename a plain
`rg -in expensa` reported nothing under `backend/` while `backend/.env.example` carried
four hits, in the one file a fresh clone copies verbatim - ripgrep skips dotfiles and
dot-directories unless told otherwise, so the sweep form is
`rg -in --hidden PAT -g '!node_modules' -g '!.git/**' -g '!.env'`: exclude `.git/**` or it
walks every packed object, and `.env` so real secrets are not read back into the
transcript. `grep -r` traverses dotfiles by default and needs the exclusions instead.
Either way, say which flags a sweep used when reporting that something is absent.

**Keep personal data out of the repo.** No real names or personal email addresses in
source, tests, fixtures, docs, commit messages or example payloads. This is a
public-facing teaching boilerplate, so anything committed is effectively published.
Fixture data uses the tech spec's own persona, Marko Kovač / `marko@email.com`, which is
already the convention everywhere; anything needing a genuinely deliverable address uses
`spendifico@gmail.com` (see Environment variables). Note that git commit author metadata
carries a real name and address on every commit by default - a separate, pre-existing
exposure worth raising rather than quietly rewriting history over.

**A ticket's acceptance criteria are amendable.** When an AC conflicts with a repo
convention or a sounder design, weigh the engineering trade-off and recommend the better
option, saying plainly that the ticket can be changed; "the ticket says so" settles
nothing by itself, because whoever owns the ticket can amend it. That is how
`transactions` came to tombstone: PET-27's AC said no soft-delete record, and the
offline-sync roadmap outranked it. Anything touching that roadmap deserves the same
treatment, since database-per-user exists for it.

## Plans

**Implementation plans live in `docs/plans/`**, one Markdown file per plan, named
`YYYY-MM-DD_PET-{number}_{slug}.md` (date the plan was written, the Jira ticket it
serves, then a short slug), for example `2026-08-02_PET-13_login-links.md`. **Plan into
that file, never only into the conversation.** Anything worth calling a plan is written
there before implementation starts, so it is reviewed as a diff and the reasoning
outlives the session that produced it.

**Every plan enumerates the tasks it will carry out**, as an explicit checklist of the
steps in the order they will be done, not just the design narrative that justifies them.
That list is the plan's contract: it is what the todo list during implementation tracks
(see Working conventions above) and what tells a reviewer up front how much is coming.

A finished plan then ships the same way every time, which is what makes the folder a
history rather than a scratchpad: commit it **alone** (`docs: ...`, no scope), as the
branch's first commit, push, and open a **draft** PR against its base with a real
description - what the ticket is, a design summary linking the plan doc, and **that same
task checklist copied into the PR body** so its state is readable on GitHub without
opening the plan - assigned to its author (`--assignee @me`). The draft PR is what makes
work in progress visible before there is any code to look at; tick the boxes there as
commits land.

## The repo as a repo

This is a **multi-app repo, not a workspace-managed monorepo**. There is no npm
workspaces, turbo, or nx setup. The root `package.json` owns only repo-wide dev tooling
(Husky, commitlint, lint-staged, Prettier) and does **not** manage the two apps.

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
floor is **v22.12.0**, and all three `package.json` files carry it so npm warns on a
mismatch.

That floor is the **backend's**, not `next`'s: `next` still declares `>=20.9.0`, but the
backend loads three ESM-only packages (`@tursodatabase/database`, `@tursodatabase/sync`,
`uuid`) from CommonJS, which requires Node's `require()` of ESM. That landed unflagged in
22.12 (and was backported to 20.19). The stated floor is the simple form rather than an
exact `>=20.19.0 <21 || >=22.12.0`, which is accurate but unreadable for no gain given
`.nvmrc` says 26. Below the floor the failure is a startup crash, `Cannot use import
statement outside a module`, not a warning.

`mise.toml` pins the same major a **second** time, as `node = "26"` under `[tools]`. mise
does not read `.nvmrc`, so bumping the Node major means editing both files. It is pinned
rather than `latest` precisely so a drift from CI cannot happen silently.

## What any formatter touches

Prettier config is per app and there is **no root config at all**. `frontend/package.json` sets
`printWidth: 100` with `singleQuote`; `backend/.prettierrc` sets `singleQuote` and
`trailingComma`, leaving `printWidth` at its default 80. `.lintstagedrc.js` runs Prettier over
`{backend,frontend}/**/*.{js,html,css,scss,json,md}`, so `backend/CLAUDE.md`,
`frontend/CLAUDE.md` and both app READMEs **are** rewritten on every commit, each with its own
app's config. Nothing formats root `CLAUDE.md`, `README.md`, `docs/**` (this file included),
`.claude/**` or `.github/**`: no config resolves for them and no glob matches them.

Two consequences. Adding a directory that should be formatted needs a `.lintstagedrc.js` glob,
not just a config file. And a fenced `ts` or `json` block in an unformatted file would be
reformatted away from repo style the day anyone runs `prettier --write .`, so keep code samples
in root `CLAUDE.md` and `docs/**` as inline spans, which Prettier leaves alone. A repo-wide
`prettier --check` step exists in CI but is intentionally commented out, because files that
predate the config would fail it immediately; `npx prettier --list-different .` reports the
current set, and 38 of them are vendored skill trees that must not be reformatted.

Actions are pinned to `actions/checkout@v7` and `actions/setup-node@v7`. Older majors run
on Node 20, which GitHub has deprecated: the runner forces them onto a newer runtime and
annotates every job until they are upgraded.
