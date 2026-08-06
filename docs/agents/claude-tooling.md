# What ships in `.claude/` and `.agents/`

This repo commits its own Claude Code configuration. Knowing what is there prevents both
reinventing it and being surprised by it.

Two boundaries first, because the names collide. **`.claude/agents/` holds subagent
definitions the harness loads; `docs/agents/` (this directory) holds prose agents read.** And
**`.claude/SETTINGS.md` owns every permission decision** in `.claude/settings.json`, decision by
decision, because JSON cannot hold comments; this file does not restate them.

**Skills.** A skill is invoked by its own name, so the slash command is the full name in
the left column (`/repo-dev-setup`). You do not have to remember them: each skill's
description also matches plain requests, so "set me up locally" reaches `repo-dev-setup`
on its own. The short forms quoted inside the descriptions (`/dev-setup`, `/commit`) are
matching phrases, not registered commands.

| Skill             | What it does                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `repo-dev-setup`  | First-time local setup, both apps. Start here on a fresh clone                                                                                                           |
| `repo-commit`     | Analyses changes, runs per-app lint/test, writes Conventional Commit messages, guards against committing to `main`                                                       |
| `repo-secrets`    | Manages `.env` files from templates, explains where real secrets live                                                                                                    |
| `repo-jira`       | Creates/estimates/transitions Jira issues over MCP. Needs a Jira MCP server; see `.claude/skills/repo-jira/references/jira-access.md` for the two supported setups       |
| `repo-review-prs` | Fetches open PRs via `gh` and reviews unreviewed ones                                                                                                                    |
| `repo-stack`      | This repo's stacked-branch wiring: the layers of truth, the worktree trap, the conventions. CLI mechanics live in the committed official `gh-stack` skill                |
| `repo-fly`        | Driving the Fly.io deploy through `flyctl` in Bash: when it loads and the traps that bit the initial deploy. The runbook and config themselves live in `docs/guides/deployment.md` and `backend/fly.toml` |
| `backend-nestjs`  | Passive reference library of NestJS rules, vendored from upstream. Consulted when writing backend code                                                                    |
| `frontend-nextjs` | Passive reference library of Next.js/React rules, vendored from upstream. Consulted when writing frontend code                                                            |
| `backend-drizzle` | How Drizzle and Turso are wired in **this** repo: the two migration scopes, the database-per-user consequences, the Turso drivers. Deliberately not a drizzle-kit manual |

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

**Drizzle ships its own skills, and they are committed.** `drizzle-kit` bundles agent skills
of its own (`drizzle`, `drizzle-generate`, `drizzle-migrations`, `drizzle-push`,
`drizzle-pull`, `drizzle-hints`, `drizzle-output-modes`, `drizzle-responses-and-errors`, at
the revision committed here). `npm run skills`
at the repo root extracts them from the drizzle-kit in `backend/node_modules` into
`.agents/skills/`, and symlinks `.claude/skills/drizzle*` at them.

Both the files and the symlinks are committed, for the same reason `backend/drizzle/`
migrations are: they are generated, but everyone must have byte-identical copies, and a
fresh clone should work with no extra step. Only `skills-lock.json` is gitignored, because
it records the absolute path of whoever ran the installer.

**Refreshing them is a deliberate act, like regenerating migrations.** Bumping `drizzle-kit`
does not update them; re-run `npm run skills` and commit the diff. You will be told when
that is needed: the `drizzle` skill compares its own `metadata.revision` against
`drizzle-kit skills version` from the _installed_ binary and prints a notice when the
bundle is newer. That check is why committing them is safe - drift is surfaced rather than
silent.

Because those cover the CLI thoroughly, the repo's own `backend-drizzle` skill covers only
this project's wiring and defers the rest to them.

`drizzle-kit` also ships an **MCP server**, `node backend/node_modules/drizzle-kit/bin.cjs
mcp`, exposing `generate`, `push`, `pull`, `check`, `export` and `up` as tools. It is in
`.mcp.json.example`; copy that to `.mcp.json`, which is gitignored and therefore
per-developer. Note that `push` applies schema changes directly to a database without
writing a migration, which is the opposite of this repo's committed-migrations workflow.

**The daisyUI Blueprint MCP drives frontend UI work, and its three stages earn three
different levels of trust.** It is a per-developer server rather than a committed one, and
PET-57's plan is what made it this repo's method: run `daisyui_setup_expert`,
`daisyui_rules_enforcer` and `daisyui_component_syntax_expert` before writing daisyUI markup,
and `daisyui_quality_inspector` with `auditIntent` `fix_changes` after. What PET-57's
incorporation of main established, verified finding by finding:

- **Follow the syntax stage verbatim.** Every canonical structure it returned matched the
  installed daisyUI's own CSS, and it is what keeps parallel work consistent. Double-checking
  it is wasted effort.
- **Adjudicate the inspector's automated findings; never auto-apply its fixes.** On this
  codebase it produces confident false positives: it cannot see a label association that goes
  through component composition (`frontend/src/components/ui/FieldShell.tsx`'s `htmlFor` names
  every field control it flags as unlabelled), it reports the repo's variant-map convention -
  whole literal class strings selected from a `Record`, the pattern `frontend/CLAUDE.md`
  mandates - as "dynamic classes", and it can anchor a finding on a comment line while the
  code it asks for sits lower in the same file. It repeated fifteen identical false findings
  across two runs of PET-57's incorporation, so a clean automated pass may simply be
  unreachable here; the suite's `getByLabelText` assertions pin the associations it cannot
  see. Check each finding against source, fix the real ones, and record the verdict on the
  rest.
- **Nothing it does replaces opening the app.** The one real defect of that incorporation -
  daisyUI animating `modal-box` through `scale`, which made the box the containing block for
  the date popover's `position: fixed` - was invisible to the inspector and to a fully green
  test suite, and only a Chrome walk of the changed flow caught it. The inspector's
  manual-check protocol demands that walk; treat the walk, not the findings list, as the
  stage's real value.

**That walk runs in headless Chromium over the DevTools protocol, not through the
claude-in-chrome extension.** Strongly prefer headless unless the request explicitly names the
extension or the browser. `/usr/bin/chromium --headless=new --remote-debugging-port=N
--user-data-dir=<throwaway>`, then attach a flat session with `Target.attachToTarget` and drive
it with `Runtime.evaluate`. Node's global `WebSocket` is enough, so this needs no Puppeteer, no
Playwright and no dependency of any kind. Do not ask which browser to use.

The reason is not convenience. Every defect this class of check exists to find is **a class that
is present in the markup and paints nothing** - `frontend/CLAUDE.md`'s Where daisyUI and Tailwind
fight is the catalogue - and three things follow from that:

- **Computed style and the accessibility tree are the evidence**, not a screenshot. Whether an
  outline paints is `getComputedStyle(el).outlineStyle`; whether a control contradicts itself is
  `Accessibility.getPartialAXTree`. Both are exact, and neither is a judgement call about a
  picture.
- **The pre-fix markup can be probed in the same run**, which is the part no manual walk gives
  you. Clone the element, put the old classes back, read what the browser computes, and assert
  the old value *fails* the check. PET-57's review fixes were verified with twelve such checks,
  two of them proving the harness discriminates - the old dot still computes an opaque shadow
  colour and the old drawer markup still reports `Open sidebar Close sidebar`. A check that has
  never been seen to fail is not evidence.
- **The script is the artifact.** It is reviewable, it reruns, and it does not depend on which
  tab anybody has open.

Four gotchas, all of them met in practice:

- **Chromium reports colour as `oklab(L a b / A)`**, not `rgba()`. Matching `rgba(` produces a
  false failure; match the alpha component generically instead.
- **Headless starts in the light theme.** This app ships `light` and `dark` selected by
  `prefers-color-scheme` with no controller, so anything theme-specific needs
  `Emulation.setEmulatedMedia` - and a check that silently only ever ran in light is half a
  check.
- **`next/font` fetches from Google at build time**, so with no network the fallback family
  renders. Any check whose subject is a glyph is untrustworthy offline; the ₵ CEDI SIGN in
  `ui/Sidebar.tsx`'s wordmark is the one this repo already flags for a human eye.
- **Storybook is the cheap surface and it does not cover everything.** `npm run storybook` plus
  `iframe.html?viewMode=story&id=<id>` reaches every component and screen with no backend and no
  session, and `index.json` lists the story ids. The four `(app)` screens are behind the session
  gate, so reaching them headlessly means driving register, the emailed link and `/auth/verify`
  first - possible, and much more setup than a component check needs.

**Reach for the extension only when the task genuinely needs a human's browser**: an
authenticated session on a third-party site, something the user wants to watch or take over
mid-flow, or their saved logins. Verifying this app's own CSS and semantics is none of those.

`.claude/commit-checks.md` is a generated cache read by `repo-commit`. Regenerate it
with `/repo-commit refresh-checks` when it goes stale.

