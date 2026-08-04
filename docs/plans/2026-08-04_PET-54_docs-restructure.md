# Documentation restructure: thin CLAUDE.md, real README, guides under docs/

**Ticket:** PET-54 · **Branch:** `docs/PET-54-docs-restructure` · **Written:** 2026-08-04

## Context

Root `CLAUDE.md` is 1,102 lines and `README.md` is 831, and they duplicate each other: the
command tables, the environment variables, the git workflow, CI, the project structure and
the Claude Code skill inventory are all stated twice. Two developers work this repo and
nearly every PR edits `CLAUDE.md`: 29 commits, 19 by izkreny and 10 by Ante.

That has already cost a real merge conflict. `ebb8a1d` collided inside `## Not yet built`,
where PET-18 and PET-27 had both rewritten the same bullet. That section is the worst
possible shape for a shared file: 37 lines, touched by more commits than any other section,
edited by both authors, appended to at the end of the file.

The duplication has also gone silently **wrong** in three places, which is the sharper
problem: `.claude/skills/repo-dev-setup/SKILL.md` says `.nvmrc` is 24 with a v20.9.0 floor
(it is 26 with a v22.12.0 floor) and that the backend reads "exactly two" environment
variables (the Joi schema declares 19, of which 17 are read), and
`.claude/skills/repo-secrets/SKILL.md` says environment validation does not exist, when Joi
has been wired through `ConfigModule.forRoot` for days. Agents act on those sentences.

README is worse than duplicated, it is now wrong at its premise: PET-19 deleted the scaffold
greeting page and redirected `/`, so "open the home page and you see a greeting that came
from the backend" describes a page that no longer exists, and the ASCII diagram of the only
end-to-end path documents a wire that PET-19 cut. README also never mentions transactions,
the app shell or the four routed views, and its skill table lists 16 of 18 skills.

Wanted outcome: every fact has exactly one home, a backend PR and a frontend PR can no
longer touch the same documentation file, and a newcomer reads a two-minute README about
Spendifico rather than a template README about a teaching demo.

## Decisions made

Settled with the user before design, and not to be revisited during implementation:

1. **On-demand pointers, not `@import`.** Root `CLAUDE.md` keeps the rules that must never
   be missed inline and points at deeper files with imperative triggers. Auto-loading
   everything would preserve today's behaviour and today's context cost both, and the point
   is that a backend session should not carry frontend docs.
2. **Scoped app files plus `docs/agents/`.** Claude Code reads a subdirectory `CLAUDE.md`
   when it reads files in that directory. Stated precisely, because the mechanism is easy to
   overclaim: it reduces the context a session carries and it gives an existing reference a
   target (`.claude/skills/repo-review-prs/SKILL.md:65` already names
   `backend/CLAUDE.md` and `frontend/CLAUDE.md`, and today they do not exist). It does
   **not** guarantee the rules arrive before the agent picks an approach, which is why the
   inline rules and the imperative pointers carry that load.
3. **`docs/agents/` keeps its name**, one word from `.claude/agents/`. `docs/README.md`
   states the difference: `.claude/agents/` holds subagent definitions the harness loads,
   `docs/agents/` holds prose agents read.
4. **"Not built yet" is per area.** Each area file ends with its own list, so the bullet that
   caused `ebb8a1d` cannot exist in a shared file again.
5. **`backend/README.md` is replaced.** It is still the untouched NestJS starter: a logo
   block, ten badges, a placeholder CircleCI token at `:5` (`token=abc123def456`) that reads
   as a leaked secret to a scanner, a Mau deployment pitch, and an MIT license claim at `:98`
   that is false for this repo.
6. **The README's template instructions are deleted.** "Getting your own copy" tells the
   reader to `gh repo create --template` and grant a mentor access, but this repo already
   *is* that copy, so following it creates a different repo.
7. **All Windows instructions are removed**, per the user.

## Base and section map

The branch was rebased onto `origin/main` (`de5152e`, PR #18) before planning, because the
first draft was written against a base 12 commits stale and every line number in it was
wrong. All ranges below are against the rebased file, 1,102 lines:

| Section | Lines | Size | Destination |
| --- | --- | --- | --- |
| What this is | 10-25 | 16 | root, compressed |
| Repository layout | 26-96 | 71 | split: rules to root, reasoning to `docs/agents/conventions.md`, tree deleted |
| Common commands | 97-140 | 44 | `docs/guides/commands.md`, imperatives to the app files |
| Architecture | 141-379 | 239 | split three ways, below |
| Persistence | 380-482 | 103 | `backend/CLAUDE.md` |
| Design tokens | 483-524 | 42 | `frontend/CLAUDE.md` |
| Shared components | 525-655 | 131 | `frontend/CLAUDE.md` |
| **The app shell** | **656-751** | **96** | `frontend/CLAUDE.md` (new in PR #18) |
| Environment variables | 752-815 | 64 | tables to `docs/guides/configuration.md`, reasoning to `backend/CLAUDE.md` |
| What is in `.claude/` | 816-889 | 74 | `docs/agents/claude-tooling.md` |
| Working conventions | 890-944 | 55 | rules to root, incidents to `docs/agents/conventions.md` |
| Git workflow | 945-1033 | 89 | `docs/CONTRIBUTING.md`, four hard rules inline in root |
| CI | 1034-1065 | 32 | split four ways, below |
| Not yet built | 1066-1102 | 37 | per-area lists |

`Architecture` splits into: the contract cluster (146-206, plus CI's drift-gate paragraph
1043-1046) to `docs/agents/api-contract.md`; the access flow (216-276, 325-378), the
transaction write contract (278-323) and the Nest wiring (158-162, 208-214) to
`backend/CLAUDE.md`. The move also makes the auth flow contiguous for the first time; today
it reads 216-276, jumps over money and transactions, and resumes at 325.

`CI` splits four ways rather than two: the job list to `docs/CONTRIBUTING.md`, the drift gate
to `api-contract.md`, `build-storybook` to `frontend/CLAUDE.md`, the no-Turso-credentials
paragraph to `backend/CLAUDE.md`, and the pinned-actions paragraph to
`docs/agents/conventions.md`. The last two are reasoning that stops a well-meaning change
(adding CI secrets, downgrading an action major), so neither may be dropped as "CI detail".

The frontend cluster is now 269 lines (42 + 131 + 96), which is why `frontend/CLAUDE.md` is
budgeted at 300-340 rather than the 200-230 of the first draft. Ante's share of `CLAUDE.md`
churn is also rising (10 of 29 commits, and PR #18 wrote the whole app shell section), so
the frontend file, not the backend one, is the likelier first candidate for the promotion
trigger below.

## Design

### Two contracts

**Audience split.** `README.md` and everything under `docs/` answer **how** to run and change
this project; `CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md` and `docs/agents/`
answer **why it is built this way**. Tie-breaker: if a sentence would have to change because
a script, filename or default changed, it lives in `docs/`; if it would only change because
somebody decided differently, it lives in a CLAUDE file. Stated in `README.md` under
Documentation, in root `CLAUDE.md` replacing lines 6-8 (which today license the overlap:
"the two overlap deliberately but do not duplicate"), and in `docs/README.md`.

**Single-source every fact; restate only reasoning.** A value that also exists in code or
config (version numbers, env var names and defaults, ports, command tables, and counts of any
of those) is written in exactly one Markdown file, named in a fact-ownership table in
`docs/agents/conventions.md`; everywhere else refers to it by name. Reasoning may be restated
in a different voice for a different audience. The test is whether a reader can act on the
token without understanding it: `v22.12.0` is consumed with full confidence and is wrong with
full confidence, whereas "the floor is the backend's, not `next`'s" is a claim you would
verify before using. All three known drifts are actionable tokens; none of the reasoning
around them drifted.

Two consequences the first draft got wrong and this one states plainly:

- **A count nobody can verify gets deleted, not updated.** `ci.yml:161` says 55 files predate
  the Prettier config and `CLAUDE.md` repeats it; the real number was 69 yesterday and is 71
  today, and this branch adds Markdown that changes it again. Both copies lose the number and
  say "run `npx prettier --list-different .` for the current set".
- **`<!-- sync: -->` markers are reviewer breadcrumbs, not drift detection.** A procedure that
  must stay executable may carry a copy with a marker naming its source, and `docs:check`
  verifies only that the target exists. It does not compare content, and the plan must not
  pretend otherwise. Env var *names* will legitimately appear in `configuration.md` (the
  table), `database.md` and `email.md` (their setup procedures), `backend/CLAUDE.md` (the
  pairing reasoning) and `.env.example`; only the table is guarded, so the guides name
  variables inside procedures and never restate defaults.

### Target file set

Budgets are advisory, to size the work, not gates. The gate is the word accounting under
Verification.

Agent-facing, four files plus two scoped:

| File | Budget | Owns |
| --- | --- | --- |
| `CLAUDE.md` | 160-200 | Orientation, the rules that must never be missed, the pointer table, both contracts |
| `backend/CLAUDE.md` | 330-380 | Nest wiring, the access and session flow, the transaction write contract, persistence, backend env reasoning, its gaps |
| `frontend/CLAUDE.md` | 300-340 | Design tokens, `ui/` conventions, the app shell, `format.ts`, Storybook, its gaps |
| `docs/agents/api-contract.md` | 80 | The one HTTP contract: DTO rules, the generation pipeline, the drift gate |
| `docs/agents/conventions.md` | 130 | Working conventions and their incidents, the plans ritual, the single-source rule and fact-ownership table, doc-editing rules, the Prettier surface map, pinned CI actions |
| `docs/agents/claude-tooling.md` | 75 | Skills, subagents and the MCP server. **Not permissions**: `.claude/SETTINGS.md` owns those and keeps owning them, and this file points at it |

`api-contract.md` stays a separate file because it is the one genuinely two-app topic and
both scoped files must reach it, but the rule it exists to protect (`api:sync` after any shape
change, drift is a CI failure) is **also** inline in root, so a skipped pointer cannot lose it.

Human-facing, nine files plus two app READMEs:

| File | Budget | Owns |
| --- | --- | --- |
| `README.md` | ~120 | What Spendifico is, what works today, quick start, where the docs are |
| `docs/README.md` | 45 | The index of `docs/`, the contract, where a new doc goes |
| `docs/CONTRIBUTING.md` | 130 | Branch naming, Conventional Commits, the two hooks, stacked branches, the CI job list |
| `docs/guides/installation.md` | 190 | Fresh clone to two running servers: Node, mise, `gh` install and login, `.mcp.json` |
| `docs/guides/commands.md` | 130 | Every backend, frontend, root, mise and `gh` command. Single home for command tables |
| `docs/guides/configuration.md` | 110 | Every environment variable and what a missing or half-filled value does |
| `docs/guides/database.md` | 190 | Local files, the register/verify/session walkthrough, schema changes, Turso Cloud |
| `docs/guides/email.md` | 105 | MailPace setup and the smoke test to `spendifico@gmail.com` |
| `docs/guides/troubleshooting.md` | 80 | One symptom-to-cause table, with a `gh` subsection and the CI-failure rows |
| `backend/README.md` | ~50 | Replaces the stock Nest README: what the API is, how to run it, the `src/` tree, links |
| `frontend/README.md` | ~60 | Rewritten for Spendifico; keeps the Vercel runbook, drops the design-token deep dive |

There is no `docs/guides/github-cli.md`: of README's 94 lines on `gh`, the install and login
belong in `installation.md` (which already owns per-developer extras), the four commands in
`commands.md`, and the troubleshooting table in `troubleshooting.md`. Splitting `gh` across
two files was the first draft's own single-source violation, and one troubleshooting file
means one place to look, including for the two CI-failure symptoms.

`docs/CONTRIBUTING.md` sits at `docs/` level rather than in `guides/` because GitHub only
auto-links a CONTRIBUTING file from the repo root, `docs/` or `.github/`. `docs/README.md`
records that so nobody tidies it later.

### Content that would otherwise be lost, and where it goes

The first draft left five blocks unassigned. Each has a home now:

- **`README.md:274-278`**, where new code goes (a backend feature is a module folder under
  `src/`; a frontend route is a folder with a `page.tsx`; shared primitives under
  `components/ui/` with tests and stories colocated). An agent needs this *before* creating a
  file, so it splits into the two scoped files as imperatives.
- **`CLAUDE.md:28-30`** (multi-app repo, not a workspace: no npm workspaces, turbo or nx) to
  root orientation, and **`CLAUDE.md:47-53`** (three `package.json` files; the root install is
  mandatory because `prepare` sets `core.hooksPath`; the failure is **silent** and only
  surfaces when the conventions job fails; verify with `git config core.hooksPath`) to
  `docs/agents/conventions.md` and, in its human form, `installation.md`. The tree at 32-43 is
  deleted, because `README.md`'s annotated version is richer and it splits per app.
- **`README.md:271`**, one of only two places a human is told what `CLAUDE.md` is for. The
  other (`:829-831`) is being rewritten, so one line survives in the new README.
- **`README.md:729-791`**, "Working with Claude Code": `npm run skills` and its
  treat-it-like-a-migration rule to `commands.md`, `cp .mcp.json.example .mcp.json` to
  `installation.md`, the "Claude asks before editing, Shift+Tab" onboarding paragraph to
  `docs/README.md`, and the inventory itself to `docs/agents/claude-tooling.md`.
- **`README.md:45-49`**, the ASCII diagram of the one end-to-end path. It must go because
  PET-19 cut that wire, but "what works today" needs a replacement picture of the system.
  `docs/plans/2026-08-02_PET-14_link-verification-and-sessions.md:47` has a mermaid auth
  sequence to base it on.

Safe to delete, checked: `README.md:10-34` (actively wrong for this repo);
`README.md:814-818` (the httpOnly-cookie constraint is single-sourced in `CLAUDE.md` and in
`backend/src/auth/dto/verify-response.dto.ts:13`); `README.md:825-827` (chat, and CLAUDE's
version is richer); the two project trees. The one unique fact in "Where to go from here" is
the `openapi-fetch` recommendation, which migrates to `docs/TODO.md`.

### Per-area gap lists

Each scoped file ends with `## Not built here`: a flat list, ordered alphabetically by its
bold lead-in, one bullet per capability, bullets deleted whole rather than merged. A bullet
keeps the trap that makes it actionable rather than collapsing to a ticket reference: "nothing
mounts `ui/Sidebar.tsx`" was useful precisely because it also said the four nav links were
live links to routes that did not exist. Two to four lines, not one.

Stated honestly, because the first draft overclaimed: this removes the conflict class that
actually occurred (one shared bullet edited by two authors in two areas). It does not remove
every conflict, because two concurrent backend branches inserting alphabetically adjacent
bullets still collide, and PET-45 and PET-53 are both in flight. `docs/TODO.md` remains the
single home for *why* something is deferred; the per-area list is the "do not build on this"
warning only.

### The pointer mechanism

Root `CLAUDE.md` carries a two-column `## Read before you touch` table: trigger, then file.
Pointers beside a rule follow one shape, imperative plus exact backticked path plus one clause
naming a **silent** failure, because a silent failure is the only argument an agent cannot
dismiss as ceremony:

> Before adding a Tailwind class, read `frontend/CLAUDE.md` under Design tokens. Tailwind's
> own palette is cleared, so `text-red-600` generates no CSS, fails no build, and looks like
> a class that simply did nothing.

Banned openers, because they read as optional: "see also", "for more details", "further
reading", "you may want to read".

The two specialist subagent definitions (`.claude/agents/nestjs-specialist.md`,
`nextjs-specialist.md`) get one pointer line each, because nothing establishes that a
subagent's context picks up a scoped `CLAUDE.md` and those two are exactly the consumers that
need one.

### Conventions recorded in `docs/agents/conventions.md`

One topic per file. Add, never reflow: `proseWrap` is `preserve`, so rewrapping a neighbouring
paragraph is pure diff noise and a manufactured conflict. New material at the end of its
section. No growing tables in the two scoped files, because those two are Prettier-formatted
on commit and Prettier pads every cell to the widest, so one wide row rewrites every row. A
blank line between items in long lists, so each insertion has unique merge context. Merge
`main` into a feature branch as its own bare commit: `ebb8a1d` carried 31 files and 2,987
insertions, so the doc conflict had to be resolved inside a wall of generated diff.

Paths are scoped by audience, which the first draft conflated: **agent files** use backticked
repo-root-relative paths and no markdown links, so a path resolves identically from any file;
**human files** under `docs/` use real relative links with `../`, because they are read on
GitHub where a link must work, and `docs:check` verifies those resolve.

Sizing trigger, recorded so it fires on evidence rather than taste: if either scoped file
passes 400 lines or produces its first conflict, promote its hottest topic one directory
deeper (`backend/src/database/CLAUDE.md`, `frontend/src/components/CLAUDE.md`), which
auto-loads with better trigger locality.

### Rejected, with reasons

- **`merge=union` on any Markdown.** It concatenates both sides with no conflict marker. These
  files are mostly wrapped prose, so union-merging two edits to one paragraph interleaves
  sentences into text that is grammatical nowhere and lands silently. It also manufactures the
  duplication this work removes. A conflict that stops a merge beats a document that quietly
  says two things.
- **A root Prettier config, or widening the lint-staged globs.** 71 files predate the config,
  38 of them vendored skill trees where reformatting guarantees a conflict on the next
  `npm run skills` or `gh skill install`. Worth its own branch.
- **`markdownlint`, `lychee`, `remark`.** Dependencies bought to catch problems this repo does
  not have while catching none of the three it does.
- **A new test file for the env schema.** `backend/src/config/env.validation.spec.ts` already
  enumerates every non-`NODE_ENV` key in a `ValidatedEnv` interface; a new file would add a
  third copy of the key list to a repo whose problem is duplicated key lists. The assertion is
  added to that existing spec instead.

## Tasks

- [ ] Rebase onto `origin/main` and re-derive the section map (done before this plan landed)
- [ ] Create the Jira ticket, rename the branch to `docs/claude-md-optimization`
- [ ] Commit this plan alone, push with `-u`, open the draft PR with this checklist in the body
- [ ] Write root `CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`, the three
      `docs/agents/` files, `.gitattributes`
- [ ] Write `README.md`, `docs/README.md`, `docs/CONTRIBUTING.md`, the six `docs/guides/`
      files, `backend/README.md`, `frontend/README.md`
- [ ] Repoint every inbound reference, fix the three drifted skills, delete both Prettier
      counts, rename the root package, add the two subagent pointers
- [ ] Extend `env.validation.spec.ts` with the `.env.example` assertion
- [ ] Add `scripts/docs-check.sh`, the `docs:check` script and the CI step
- [ ] Run the verification sweeps and record their output in the PR

## Commits

Six. Commit `11271da` already on this branch stays, so this plan is not literally the branch's
first commit: a deliberate one-time deviation, noted in the PR body.

1. `docs: plan the documentation restructure (PET-NN)` - this file alone.
2. `docs: split CLAUDE.md into per-area agent guides (PET-NN)` - root rewrite, both scoped
   files, the three `docs/agents/` files, `.gitattributes` (`* text=auto eol=lf`, no merge
   driver). **Not to be divided**: `git diff --color-moved` only detects moves inside a single
   diff, so a split review sees 900 unattributable additions instead of moved prose, and a
   half-moved section reads as authoritative to an agent.
3. `docs: rewrite README.md for Spendifico and add the guides (PET-NN)` - root README,
   `docs/README.md`, `docs/CONTRIBUTING.md`, the six guides, both app READMEs.
4. `docs: point every reference at its single home (PET-NN)` - the cross-reference rewrites,
   the three drifted skill facts, the skill pointers and `<!-- sync: -->` markers, the
   `docs/TODO.md` edits, the root `package.json` rename, both Prettier counts deleted, the two
   subagent pointers.
5. `test(backend): assert .env.example matches the Joi schema (PET-NN)` - extends the existing
   spec. Separate because it is the only commit CI's backend job exercises.
6. `ci: check that documentation facts are single-sourced (PET-NN)` - `scripts/docs-check.sh`,
   the npm script, the step in the `conventions` job. Depends on **2, 3 and 4**: its path and
   link assertions cover files 2 and 3 create, and its marker assertion covers what 2 writes.
   Landing it before 4 would fail on the drifts it exists to catch, which is the proof it works.

The tree is link-consistent only after commit 3, not after each commit: commit 2's pointers
name guides that arrive in 3. They stay separate anyway, because one is a 900-line agent file
and the other is 831 lines of human prose, and a reviewer needs them apart. The PR body says
so rather than implying otherwise.

### References to rewrite

`README.md`:245,271,829-831 · `.claude/SETTINGS.md`:27,49 ·
`.claude/skills/repo-stack/SKILL.md`:16 · `.claude/skills/backend-drizzle/SKILL.md`:35 ·
`.claude/skills/repo-review-prs/SKILL.md`:29,31,65,80 ·
`.claude/skills/backend-nestjs/SKILL.md`:16 (its relative `README.md` resolves to the skill's
own directory) · `docs/TODO.md`:412-413 · `backend/src/config/env.validation.ts`:9 and
`env.validation.spec.ts`:5.

Plus, inside `README.md` itself, the 8 relative links (`page.tsx`, `app.controller.ts`,
`CLAUDE.md`, `.claude/SETTINGS.md`, `jira-access.md`, `docs/2026-07-30-audit.md`, `ci.yml`,
`.nvmrc`) and the 9 intra-page anchors (`#database` x3, `#sending-real-email-optional` x2,
`#installing-mise-optional` x2, `#prerequisites`, `#auditing-and-updating-dependencies`), all
of which become cross-file links once the content moves into `docs/guides/`.

Plus the intra-file "see <section>" references in `CLAUDE.md`, to be regenerated against the
rebased file with `rg -n '\(see |see the |described under |under (Architecture|Persistence|Git workflow|Working conventions|Environment variables)'`. The first draft listed 12 line
numbers and 4 of them were not section references at all.

The references in `docs/plans/**` and `docs/reviews/**` are **not** rewritten: they record
what a plan said at the time, and editing them falsifies the history the folder exists to
keep. They are permanent exclusions in every sweep.

### The docs:check assertions

POSIX `sh` with `git ls-files` and `grep` only, no dependencies, well under a second, one step
in the existing `conventions` job. `git ls-files` skips `node_modules` and gitignored paths for
free, which is why it is used rather than a tool the runner would have to install.

1. `.nvmrc` equals `mise.toml`'s pin and any documented "currently \*\*NN\*\*".
2. `engines.node` in the three `package.json` files agree with each other and with any
   documented floor, and no document asserts an npm floor, because no `engines.npm` exists.
3. The Joi schema, `.env.example` and the one documented table hold the same keys. The table is
   located by a `<!-- single-source: backend-env -->` marker, not a path, so reshuffling the
   docs cannot break the check. Two deliberate asymmetries, both from `env.validation.ts:32-34`:
   `NODE_ENV` is set by Nest and never written into `.env`, and `TURSO_GROUP_TOKEN` is validated
   but never read by the application.
4. Backticked paths rooted at a top-level directory resolve. `git check-ignore` suppresses the
   false positives from files the docs correctly discuss and that correctly do not exist
   (`backend/.env`, `frontend/.env.local`, `.claude/settings.local.json`).
5. Every `<!-- sync: -->` target exists. Existence only, by design; it is a breadcrumb for a
   reviewer, not drift detection.
6. Relative Markdown links in the human files resolve.

Measured against the tree: assertions 1 and 2 both fire on the `repo-dev-setup` version drift
and assertion 3 fires on its env-count drift, so two of the three known drifts are caught. The
third, `repo-secrets`' "there is no schema", is a negative prose claim and is **not** catchable;
it is fixed in place, and the structural fix is that the skill stops asserting a fact of its own.
Not a pre-commit hook: a hook that fails on a doc mid-edit is how `--no-verify` becomes a habit.

## Verification

- **No content lost, semantic index.** For every `**bold lead-in**` and every backticked token
  in the pre-split `CLAUDE.md` **and `README.md`**, assert it appears somewhere in the new set;
  expected output empty. The first draft ran this over `CLAUDE.md` only, which left the file the
  user actually asked to be rewritten unchecked.
- **Word accounting, both sides.** Agent side: 11,310 words today. Human side: 5,741 words
  today. Report both sums after the split and explain any decrease; the expected shape is a
  small increase on the agent side (file openers, the pointer table) and a decrease on the human
  side of roughly the size of the deleted template and roadmap sections, itemised.
- **No dangling path or dead link.** Every backticked `*.md|ts|tsx|json|yml` path resolves;
  every relative link in the human files resolves; every `](#anchor)` matches a heading in its
  own file.
- **No orphaned section reference.** `rg -n 'under (Architecture|Persistence|Git workflow|...)'`
  excluding `docs/plans/**` and `docs/reviews/**`; every hit must resolve inside its own file.
- **Repo-wide pointer sweep**, in the absence-proving form the conventions mandate:
  `rg -in --hidden 'CLAUDE\.md' -g '!node_modules' -g '!.git/**' -g '!.env' -g '!docs/plans/**'
  -g '!docs/reviews/**'`. Every hit must be a row above or a file literally named `CLAUDE.md`.
  Report the flags used.
- **No Windows instruction survived.**
  `rg -in --hidden 'windows|winget|powershell|\bfnm\b|netstat|findstr|\bWSL2?\b'` over the doc
  set. The only allowed hit is the forced-colors paragraph in `frontend/CLAUDE.md`, which
  explains a Windows High Contrast accessibility decision and is reasoning, not an instruction.
- **Nothing else is mid-flight in these files.** Not "count the open PRs", which misses a pushed
  branch with no PR (`origin/chore/PET-53-fly-io-backend-deploy` is exactly that today):
  `git for-each-ref refs/remotes/origin --format='%(refname:short)'` piped into
  `git diff --stat origin/main...<ref> -- CLAUDE.md README.md`, run against `origin/main`
  immediately before commit 2.
- **Formatter agreement**, which is correctness here rather than cosmetics:
  `npx prettier --check backend/CLAUDE.md frontend/CLAUDE.md backend/README.md
  frontend/README.md` must pass, because lint-staged rewrites those four on commit and what
  lands must equal what was reviewed. Root `CLAUDE.md`, `README.md` and `docs/**` are formatted
  by nobody; keep code samples there as inline spans and confirm with
  `rg -n '^```(ts|tsx|js|json|css)'` that no fenced block sits in an unformatted file.
- **Gates.** `npm run docs:check` green; `cd backend && npm run lint && npm test` for the
  commits touching `backend/**`; the backend suite before pushing.
- **Behavioural acceptance**, the only check that tests the actual goal. Three fresh sessions,
  each stopped before it edits anything: "add a `currency` column to `transactions`" must read
  `backend/CLAUDE.md` and reach the two-scopes decision; "restyle the page header" must read
  `frontend/CLAUDE.md` and surface the cleared-palette trap; "commit this and open a PR" must
  produce the branch check from root alone, with no pointer followed. If the third fails, a rule
  that should be inline is not.

## Known risks

- **Pointers can be skipped**, which `@import` would have prevented. Mitigated by keeping the
  must-never-miss rules inline, by the imperative pointer wording, and by the third behavioural
  check. If that check keeps failing, the fallback is to `@import` `docs/agents/conventions.md`
  alone rather than the whole set.
- **Two branches are in flight** (PET-45 profile read, PET-53 Fly.io deploy). Neither touches
  `CLAUDE.md` today, but PET-53 will add deployment environment variables that land in
  `docs/guides/configuration.md` and `backend/CLAUDE.md`, so it should merge before or well
  after this, not alongside it.
- **`frontend/CLAUDE.md` starts at 300-340 lines** because PR #18 added 96 lines of app shell,
  and Ante's churn share is rising. It is the likelier first candidate for the promotion
  trigger, not the backend file.
- **`docs/guides/database.md` will carry a dated section** (the pre-rename local wipe, still
  live for existing clones). Give the heading its date so its expiry is visible and add a
  Housekeeping line in `docs/TODO.md` so it is deleted rather than fossilised.
- **The audience contract is stated in three files**, which is the one place this plan
  deliberately restates something. It is reasoning rather than an actionable token, and the
  alternative (stating it once) is what let the overlap happen: today only `CLAUDE.md` mentions
  it, and it licenses the duplication instead of forbidding it.
- **The ticket was created late.** `createJiraIssue` hung for 300s on the first attempt, and a
  verifying JQL read hung too, which is this site's whole-connector outage signature. PET-54 was
  created once the connector recovered, after a duplicate check confirmed the timed-out call had
  not landed server-side. The plan file and the branch were named without a key in the meantime,
  which is why this plan is not literally the branch's first commit: `11271da` precedes it.
