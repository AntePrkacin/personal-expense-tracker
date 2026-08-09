# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository. Everything here is
verified against the code, not aspirational.

**This file is an index, not a summary.** It carries the rules that hold in every directory, and
nothing else. Where the table below names a file, that file is the authority: read it before you
act, and do not answer from this file alone.

**Two contracts govern all of this documentation.** `README.md` and everything under `docs/`
answer **how** to run and change this project; this file, `backend/CLAUDE.md`,
`frontend/CLAUDE.md` and `docs/agents/` answer **why it is built this way**. If a sentence would
have to change because a script, a filename or a default changed, it belongs in `docs/`; if it
would only change because somebody decided differently, it belongs in a CLAUDE file. And every
actionable fact - a version, a variable name, a command, a count - is written in exactly one
file, listed in the fact-ownership table in `docs/agents/conventions.md`. Restating them is how
three facts in this repo silently went wrong.

## What this is

**Spendifico**, a personal expense tracker: you log what you spend, and it shows where the money
went against a monthly budget. Access is passwordless, by emailed single-use login link, with no
password field anywhere. A **NestJS 11** API serves `/api` on port **3000**; a **Next.js 16**
App Router frontend runs on **4200** and is the only thing that calls it. One HTTP contract is
generated from the backend and committed, Drizzle ORM over Turso's SQLite engine gives **every
user their own database**, and the interface is built on a stock daisyUI design system you can
browse in Storybook on **6006**. As of PET-64 the central database also holds **template** data -
which starter categories onboarding offers, and which colours and icons a category may carry -
as the first step toward a super-admin panel; `backend/src/database/CLAUDE.md` is the authority
for why that is not a breach of "central holds only an email and a pointer". The repo is also a Decode Academy final project, which is why
the team tooling is real rather than illustrative.

The two halves are each substantially built and **the access flow now runs end to end between
them**. The backend has the whole access flow, the transaction endpoints in full, the profile read
and update, the category endpoints with their month stats, and the dashboard summary; the frontend
has the design system, the app shell with its four routed views, all six access screens, and
PET-52's verify handler at `/auth/verify` with the httpOnly `spendifico.session` cookie behind it.
So a person can register, click the emailed link, and land signed in on a Dashboard that knows who
they are - the sidebar footer reads a real `GET /api/profile`. Thirteen things beyond access work
now: `/transactions` reads and renders its own list state, the table under it draws the rows with
their filters live in the URL, every "Add transaction" button opens a modal that really
writes, and as of PET-33 each row's kebab opens a menu whose "Delete" really removes the
transaction behind a confirmation dialog. The fifth is PET-32's: that menu's "Edit" opens the same
form prefilled from the row and saves the fields the user actually changed, so a logged expense can
now be corrected as well as removed. PET-34 adds a sixth and the app's first dynamic route: a
row's merchant links to `/transactions/[id]`, which shows one expense in full beside how its
category is doing against that month's cap, and carries the list's filters there and back. The
seventh is PET-21's: `/dashboard` reads the dashboard summary and renders its first card, the
monthly budget, joined by PET-22's second, the weekly spending trend chart, PET-23's third, the
spending-by-category donut, PET-24's fourth, the recent transactions list, and PET-25's fifth and
last, the AI insight teaser card - so the Dashboard is a complete screen. The eighth is
PET-42-43-44's: `/insights` reads `GET /api/insights` and renders all three designed states, and
the same branch moves generation onto the write path, so every transaction create, edit and
delete regenerates the set and the screen is a pure read plus a Regenerate button rather than the
thing that has to decide when a first run happens. PET-59 adds a ninth: the Add transaction modal
can scan a photo or PDF of a receipt and fill Merchant, Amount, Category, Date and Note from it,
on `gemini-3.6-flash` via `POST /api/transactions/scan`, with nothing about the image ever
stored. The tenth is PET-36's:
`/transactions/categories` is a real route behind a tab bar that finally navigates, drawing a card
per category with its cap, its month's spend and its status, over a summary of the period's
spending against the monthly budget. The eleventh is PET-37's, and it is the first write anywhere
outside transactions: that tab's "Add category" opens a modal that really creates one, with its
colour and icon offered from the admin-managed template tables rather than from a list the frontend
keeps, and a monthly budget that may be left blank because an uncapped category is a first-class
choice. The twelfth is PET-39's, and it makes that tab's card kebab real: each one opens a menu
whose "Delete" removes the category behind a confirmation, and the transactions filed under it move
to the `Uncategorized` fallback rather than disappearing - which is why the dialog names that row
rather than the "Other" the ticket asked for. The thirteenth is PET-70's, and it is the one that
finally clears the tab: the summary card's "Allocate" opens a modal that sets every category's cap
in one atomic write, so the Categories tab is the first screen in the app with no inert control on
it. That write is the app's first **bulk** one and the contract's first array body - `PATCH
/api/categories`, all-or-nothing, refusing the whole payload rather than half-applying it. The
sentence this replaces said that menu's "Edit", every uncapped card's "Set limit" and that
"Allocate" were all still unavailable and all three were PET-38's; PET-38 made two of them live and
left this one, so the claim was stale by two before it was stale by three. What is still missing is
what the one remaining unbuilt screen *shows*: the Settings `<main>` below the page header is empty.

## Repository map

- `backend/` - the NestJS API. Its own `package.json`, its own `node_modules`, and
  `backend/CLAUDE.md`
- `frontend/` - the Next.js app and Storybook. Same, plus `frontend/CLAUDE.md`
- `docs/` - the human guides (`docs/guides/`), `docs/CONTRIBUTING.md`, one plan per file in
  `docs/plans/`, the deferred-work register `docs/TODO.md`, and the cross-cutting agent guides in
  `docs/agents/`
- `.claude/` - skills, subagent definitions and permissions. See `docs/agents/claude-tooling.md`
- `.github/workflows/ci.yml`, `.husky/`, `mise.toml`, `.nvmrc` - the repo's own machinery

This is a **multi-app repo, not a workspace-managed monorepo**: no npm workspaces, no turbo, no
nx. There are **three** `package.json` files and each is installed separately.

## Rules that hold everywhere

Break one of these and the failure is usually silent, which is why they are here rather than
behind a pointer.

**Branching and committing**

- **Never commit or push directly to `main`.** Branch first, as `{type}/PET-{number}-{slug}`.
- **Read `git branch --show-current` immediately before `git commit`**, and read the
  `[branch sha]` line the commit prints back. HEAD has silently moved to `main` mid-session
  before.
- **Use the fewest commits that make sense, not one per task.** A plan's checklist is a list of
  tasks, not a list of commits.
- **The first push of a branch is `git push -u origin <branch>`.**
- **Plans go in `docs/plans/`, never only into the conversation**, named
  `YYYY-MM-DD_PET-{number}_{slug}.md`. Every plan enumerates the tasks it will carry out as a
  checklist, that checklist is copied into the PR body, and the plan is committed **alone** as
  the branch's first commit with a draft PR opened on it.

**Changes and approvals**

- **Show the work, then ask, before committing.** `Edit` and `Write` are deliberately not
  pre-approved so every change is seen as a diff first. An approved plan authorizes a commit's
  content, not the moment of committing, and pushing needs its own approval.
- **Explain a state-changing command in plain text before running it**, so the permission prompt
  arrives after the explanation rather than instead of it.
- **Anything past a one-step change runs as a visible todo list.** When the work came from a
  plan, that plan's checklist *is* the list.

**Generated files**

- **Never hand-edit a generated-but-committed artifact.** That is `backend/openapi.json`,
  `frontend/src/types/api.d.ts`, `backend/drizzle/**`, `.agents/skills/**`, the
  `.claude/skills/drizzle*` symlinks and `backend/src/scripts/showcase/fixture.data.json`.
  Regenerate and commit the diff - `mise run seed:fixture` for the last of these.
- **After changing anything a request or response body is made of, run `npm run api:sync` from
  the repo root** and commit both artifacts. Drift is a CI failure in two halves.

**Running things**

- **Run app commands from inside that app's directory.** ESLint especially resolves its config
  and plugins from the app's own `node_modules`.
- **The root `npm install` is mandatory, not a convenience**: its `prepare` script is what sets
  `core.hooksPath` to `.husky/_`. Skip it and both hooks are simply absent, silently, until the
  `conventions` job fails on the PR. Verify with `git config core.hooksPath`.
- **`npm run build` is the typecheck.** Neither app has a standalone `typecheck` script.

**Safety and honesty**

- **Keep personal data out of the repo.** No real names or personal email addresses in source,
  tests, fixtures, docs, commit messages or example payloads: this is a public-facing teaching
  repo, so anything committed is effectively published. Fixtures use the spec's own persona,
  Marko Kovač / `marko@email.com`; anything needing a deliverable address uses
  `spendifico@gmail.com`.
- **Never give a server-only secret a `NEXT_PUBLIC_` prefix.** Such a variable is inlined into
  the browser bundle and is public forever.
- **A search that is evidence of an absence has to reach dotfiles.** Use whatever tool you like,
  but a sweep that under-reports is indistinguishable from a clean one, and say which flags it
  used: `rg -in --hidden PAT -g '!node_modules' -g '!.git/**' -g '!.env'`.
- **A ticket's acceptance criteria are amendable.** When an AC conflicts with a sounder design,
  weigh the engineering trade-off and recommend the better option, saying plainly that the ticket
  can be changed.
- **`backend/**` and `frontend/**` markdown is Prettier-formatted on commit; root `CLAUDE.md`,
  `README.md` and `docs/**` are formatted by nobody.** Keep code samples in the unformatted files
  as inline spans.

## Read before you touch

Each row names a trigger and the file that is the authority for it. When you hit the trigger,
read the file before you write the change, not after.

| Before you                                                          | Read                            |
| ------------------------------------------------------------------- | ------------------------------- |
| touch any file under `backend/`                                     | `backend/CLAUDE.md`             |
| write a Drizzle schema or migration, or open a database             | `backend/src/database/CLAUDE.md` |
| touch `backend/src/auth/`, a guard, or a rate limiter               | `backend/CLAUDE.md`, Access and sessions |
| add or change a transaction endpoint                                | `backend/CLAUDE.md`, Transaction endpoints |
| add or change a profile or preferences endpoint                     | `backend/CLAUDE.md`, Profile and preferences |
| add or change a category endpoint, or touch the fallback category   | `backend/CLAUDE.md`, Category endpoints |
| add or change the dashboard endpoint                                | `backend/CLAUDE.md`, Dashboard   |
| add or change the insights endpoint                                 | `backend/CLAUDE.md`, Insights    |
| touch a category template, a colour token or an icon name           | `backend/CLAUDE.md`, Templates   |
| compute anything per month, or read `monthStartDay`                 | `backend/CLAUDE.md`, Backend conventions |
| touch any file under `frontend/`                                    | `frontend/CLAUDE.md`            |
| write a Tailwind class or style anything                            | `frontend/CLAUDE.md`, Design tokens |
| add or change a daisyUI theme, or re-map a `--color-*`              | `frontend/CLAUDE.md`, Changing or adding a theme |
| open the Figma file, or implement a designed screen                 | `frontend/CLAUDE.md`, Figma against daisyUI |
| write a daisyUI class, or wonder why one paints nothing             | `frontend/CLAUDE.md`, Where daisyUI and Tailwind fight |
| add or change a chart, or reach for a charting library              | `frontend/CLAUDE.md`, The chart library |
| run the daisyUI Blueprint MCP                                       | `docs/agents/claude-tooling.md` |
| verify a UI change in a browser                                     | `docs/agents/claude-tooling.md` |
| add or change anything in `frontend/src/components/`                | `frontend/src/components/CLAUDE.md` |
| touch a route, a layout, or the session gate                        | `frontend/src/app/CLAUDE.md`    |
| build a modal, or add an "Add transaction" trigger                  | `frontend/src/app/CLAUDE.md`, The app shell |
| build one of the remaining access screens                            | `frontend/src/app/CLAUDE.md`, The access screens |
| change a DTO, a response shape, or how a page fetches               | `docs/agents/api-contract.md`   |
| branch, commit, push, or touch a stacked branch                     | `docs/CONTRIBUTING.md`          |
| write a plan, or carry out any multi-step task                      | `docs/agents/conventions.md`    |
| use or change a skill, a subagent, or the MCP server                | `docs/agents/claude-tooling.md` |
| change a permission                                                 | `.claude/SETTINGS.md`           |
| run a command, or need an environment value                         | `docs/guides/commands.md`, `docs/guides/configuration.md` |

Three worked examples of why these are not ceremony. Before adding a Tailwind class, read
`frontend/CLAUDE.md`: theme-aware colour is daisyUI semantic colour only, and the full Tailwind
palette compiles, so a `text-red-600` builds green and quietly bypasses the theme. Before
changing a DTO, read `docs/agents/api-contract.md`: four separate mistakes in that pipeline still
generate a spec, they just describe your response as `{}`. And before pairing two daisyUI
modifiers or restoring a focus ring over one, read the same file's Where daisyUI and Tailwind
fight: `btn-ghost btn-outline` draws no border and `focus-visible:outline-2` draws no outline,
both with every gate green, because the losing class is still in the attribute.

## Editing these files

One topic, one file. Add, never reflow: prose here is hand-wrapped and Prettier never rewraps it,
so rewrapping a paragraph you did not change manufactures a merge conflict out of nothing. New
material goes at the end of its section. Paths in agent files are backticked and
repo-root-relative, never markdown links. The full set, including why `## Not built here` is
ordered alphabetically and why the two scoped files must not grow tables, is in
`docs/agents/conventions.md`, and it is worth reading before adding to any of these files.

## What is not built yet

This is a starting point, not a finished app, and the gaps are load-bearing: a feature that was
never built looks exactly like a feature you have not found yet.

**Every scoped `CLAUDE.md` ends with a `## Not built here` section**, and `npm run docs:check`
fails if one does not. Read that section for the area you are about to touch before assuming a
capability exists. A scoped file deeper in the tree may point at its parent's list rather than
keep its own; follow the pointer, because both files load together. Why something is deferred,
where that was a decision rather than a queue, is in `docs/TODO.md`.

This file deliberately keeps no summary of either. A shared list of everybody's gaps is what two
people kept editing in the same place, and it is the one merge conflict this repo has actually
had.
