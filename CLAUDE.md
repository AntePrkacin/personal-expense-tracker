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
user their own database**, and the interface is built on a daisyUI design system carrying the
custom Expensa theme pair (PET-74), browsable in Storybook on **6006**. As of PET-64 the central database also holds **template** data -
which starter categories onboarding offers, and which colours and icons a category may carry -
as the first step toward a super-admin panel; `backend/src/database/CLAUDE.md` is the authority
for why that is not a breach of "central holds only an email and a pointer". The repo is also a Decode Academy final project, which is why
the team tooling is real rather than illustrative.

Current feature status is deliberately not summarized here. The code, `docs/plans/` and each
scoped file's `## Not built here` section carry what is and is not built, and git history carries
how it got there; a running ledger of it kept in this section went stale twice before it was
removed.

**"What is still missing is what the one remaining unbuilt screen *shows*" is stale, and has been
since PET-46.** All four routed views render content below their header and all four fetch. What
remains unbuilt is that one Settings card, and - as of PET-73 - nothing else on any of the four.

**PET-73 is the sixteenth thing that works, and it is the one that moves a screen's contents to
another screen.** `/insights` rendered three cards from two deterministic rule detectors - the "AI"
was branding, and rules-over-LLM is a recorded decision - while the Dashboard carried a teaser whose
whole job was rendering the same headline and body from a *different* endpoint and linking to the
page that repeated them. One fact, two DTOs, two components, three overlapping "nothing here yet"
copies. So the cards **move to the Dashboard**, where summarising the month is already the job, and
`/insights` becomes a **chat over the user's own transactions** on the Gemini key receipt scanning
already uses - the app's second AI feature and the first that is actually a model rather than a
label. `DashboardResponseDto.insight` is deleted with the teaser. The rule-based generator, both
tables and both insight endpoints survive untouched: the chat generates nothing, so "No LLM behind
the insights" stays literally true. Four things about it reach past those two screens. The send is
`app/api/assistant/messages/route.ts`, the app's **fourth route handler and the first the browser
POSTs to**, because a turn costs roughly 40k input tokens and tens of seconds and the user must be
able to **stop** one - a Server Action exposes no `AbortController`, so cancellation travels three
hops from the composer to Gemini and `docs/explainers/cancelling-an-ai-request.md` explains it in
plain language. A **fourth named throttler** joins the three that existed. A category write now
regenerates the insight set through a new `CATEGORY_CHANGED` event, so the same user action behaves
the same whichever modal performed it. And a burst of writes no longer leaves a stale set: a
**bounded** dirty flag makes N writes produce at most two runs. The Dashboard's period navigation
forced one decision worth knowing - insights are generated for the current period only, so the
banner and both cards **render nothing on a period navigated back to** rather than putting October's
analysis over September's figures.

**PET-72 is the fifteenth thing that works, and it is the one that changes what the other fourteen
*mean*.** Budget, category caps and the day a period starts on were single settings, so changing any
of them silently rewrote every period the account had ever had: raising the budget in 2026 re-priced
every month of 2025. All three are **append-only, effective-dated histories resolved on read** now,
so a change applies from a date and never backwards. Periods are anchored to **paychecks** rather
than to a day of the month: a schedule change is anchored to the first paycheck under the new
schedule, arrears removes the boundary immediately before it, and one stretched **transition period**
runs from the last kept boundary up to it keeping the **old** budget. That date may be retroactive or
in the future. `GET /api/periods` publishes the account's whole history with a **label** per period,
because a period is no longer one calendar month and no arithmetic over a start day can name one that
spans three month names - so the Dashboard's month select, inert since PET-19 because A8 wanted a
designed control first, is a real one and the app has no inert control anywhere. Four things were
bundled into it because it lands with the pre-launch database reset and they were each a migration on
their own: `fullName` replaces two name fields, EUR becomes the default of a real two-decimal
currency allowlist, `categories.note` becomes `description`, and onboarding asks the pay day. The
Settings save is unchanged in shape and different in effect - one "Save changes", intercepted by a
dialog asking which paycheck a budget or pay-day change applies from.

**PET-48 is the seventeenth thing that works, and it closes the one gap the first paragraph above
still names.** The **Categories** summary is frame 17's third and last card: one read-only line
reading "{n} categories · {allocated} allocated of {budget}", every figure real, over a secondary
"Manage" - so "what remains unbuilt is that one Settings card" is closed, Settings is a complete
screen, and no card on any of the four routed views is missing. Two things about it are decisions
rather than shape, and both were the product owner's. The count **excludes the `Uncategorized`
fallback**, so this card reads one lower than the Transactions tab badge on the same account -
deliberate, because the card is about the categories a user manages and the fallback is the one they
cannot. The second was that **"Manage" shipped inert**, with no `disabled` and no `aria-disabled`,
which made it the app's only silently inert control and narrowed PET-72's "the app has no inert
control anywhere" to everything except one button.

**That second decision is superseded, and PET-72's clause holds again without an exception.**
"Manage" opens the **Manage categories modal**, which the Spendifico Design System drew
(`ui_kits/spendifico-app/ManageCategoriesModal.jsx`) and which frame 17 does not: the account's
categories in a scrolling list, each with Edit and Delete, over a summary island and an "Add
category". So AC3 is superseded rather than amended - the button opens a dialog and never navigates
to the Categories tab - and **this app once again ships no control that looks operable and is not.**
Three things about it are worth knowing before touching either screen. The modal **performs no write
of its own**: `AddCategoryModal`, `EditCategoryModal` and `DeleteCategoryDialog` already owned every
one and all three open over it, so this was assembly rather than new behaviour and needed no
`api:sync`. It **excludes `Uncategorized`** where the design draws its "Other" like any other row,
which is `allocatableCategories`' existing call from PET-70 rather than a new rule. And the Settings
route grew two reads for it - the palette and the periods - both of which **degrade rather than
throw**, because `requireProfile()` stays the only read on that page with an opinion about whether
the session is alive.

**PET-77 is the eighteenth thing that works, and it is the one that changes how every other one
*reports itself*.** Seventeen features had, between them, four unrelated ways of saying "that
worked": a modal that just closed for every transaction and category write, a `role="status"` badge on
Settings, a `role="status"` line in the Allocate modal, and nothing whatsoever for anything without a
form - so a save whose row landed outside the current period or filter was confirmed by nothing at
all. One **toast region** now replaces all four, mounted once on `(app)/layout.tsx` outermost of the
five providers, with twelve call sites posting into it and none owning a region. `docs/TODO.md` had
carried this as its single HIGH IMPORTANCE entry since the product owner marked it, and this ticket
deletes it. Four things about it are decisions rather than shape. It is a **platform popover**,
because `Modal` uses the top layer and a `position: fixed` region cannot paint over one at any
z-index - and `showPopover()` therefore fires on **every post**, since top-layer order is by when an
element entered it. Its **announcement is two `sr-only` regions** rather than the visible stack,
because a hidden popover is `display: none` and a live region whose content changed while hidden is
not announced. **Where a failure is reported is a property of its *reason***, which the app's existing
per-write failure taxonomies already made expressible: `failed` and `unauthenticated` leave the form,
everything actionable stays inline, and `components/FormError.tsx` survives for exactly that. And
there are **two kinds, not three** - a background insight regeneration announces nothing, because it
fires behind every write and would double every save.

**PET-67 is the nineteenth thing that works, and it is the first that overrules the design file on
the arrangement of a screen rather than on a state the design never drew.** Two items off the
umbrella UI/UX backlog, both on `/transactions`. The **sort** grows an amount pair: `TRANSACTION_SORTS`
goes from two values to four, `orderFor` leads on `amount_cents` and keeps the existing three keys as
tiebreaks behind it, and the filter bar offers "Highest amount" and "Lowest amount". No migration and
no index - the column is already an INTEGER and the set is already narrowed to one period - and the
one thing worth copying from it is that the frontend's `EverySortIsOffered` proof was **watched
failing** between `api:sync` and the two new options, naming both missing values, which is what that
proof is for. The **layout** swaps two controls: the period control moves up into the header and the
search field moves down into the filter bar, so all three of the screens that scope by period now draw
the same control in the same place. Four things about it reach past those two files. It is the
**product owner overriding TRN-1 and node `26:137`**, which reinstates PET-19's AC3 after this repo
twice recorded the design as having won that argument. The header's control is the shared
`PeriodSelect` rather than the pill, so the screen reaches **every period the account has** where the
pill offered three named values and could only *display* a date one a link handed it - `?period=all`
survives as one appended option because it is the single filter whose response carries no period to
name, and `previous` becomes URL-only. That select needed an **exclusive-union navigation arm** rather
than an href builder, because `TransactionsScreen` is a Server Component and a function prop cannot
cross into a Client Component at all; `transactions/TransactionPeriodSelect.tsx` is the client
component in between, and it routes through `FilterNavigation` so a period change dims the table like
every other filter. And the search field **disappears in the designed empty state**, which is the one
behaviour change to check rather than skim: it is safe because `empty` is decided by an account-wide
probe rather than by the filter, so no keystroke can reach the state that removes the field.

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
| resolve a period, or touch a budget, cap or pay-schedule history    | `backend/CLAUDE.md`, Backend conventions |
| add or change the periods endpoint, or the schedule write           | `backend/CLAUDE.md`, Profile and preferences |
| name a period on a screen, or add a `?period=` to a read            | `frontend/src/app/CLAUDE.md`, The app shell |
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
