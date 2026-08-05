# docs/

**These docs answer how to run and change this project. The CLAUDE files answer why it is built
this way.** If a sentence would have to change because a script, a filename or a default changed,
it belongs here; if it would only change because somebody decided differently, it belongs in
`CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md` or `docs/agents/`. Add a fact to the file
whose question it answers, and only to that one: every actionable value has a single home, listed
in [`agents/conventions.md`](agents/conventions.md).

## Guides

| File | Owns |
| --- | --- |
| [`guides/installation.md`](guides/installation.md) | Fresh clone to two running servers: Node, mise, the three installs, `gh`, the optional MCP server |
| [`guides/commands.md`](guides/commands.md) | Every backend, frontend, root and mise script, and what each is for |
| [`guides/configuration.md`](guides/configuration.md) | Every environment variable, its default, and what a missing or half-filled value does |
| [`guides/database.md`](guides/database.md) | Local database files, trying the access flow with curl, changing the schema, Turso Cloud |
| [`guides/email.md`](guides/email.md) | Turning on real MailPace sends, and the smoke-test procedure |
| [`guides/deployment.md`](guides/deployment.md) | Deploying the backend to Fly.io, verifying a deploy, and the two Vercel settings |
| [`guides/troubleshooting.md`](guides/troubleshooting.md) | One symptom-to-cause table for the whole repo |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Branch naming, Conventional Commits, the two hooks, stacked branches, what CI checks |

`CONTRIBUTING.md` sits here rather than in `guides/` for a mechanical reason: GitHub only
auto-links a CONTRIBUTING file from the repo root, `docs/` or `.github/`. Please do not tidy it
into `guides/`, or the pull-request page quietly loses its link to it.

## Reference

| Path | Holds |
| --- | --- |
| [`TODO.md`](TODO.md) | The single home for deferred work: what is not built, and why that was a decision rather than a queue. Add an entry when you defer something; delete it when it lands |
| [`plans/`](plans) | One implementation plan per file, `YYYY-MM-DD_PET-{number}_{slug}.md`. Written before the work, committed as a branch's first commit, and **not** edited afterwards: they are a record of what was decided when |
| [`project-management/`](project-management) | The inputs the project is built from: the brief, the tech spec with its 101 requirement IDs and 44 assumptions, and the student handout describing the method |
| [`reviews/`](reviews) | Code reviews kept for the record |
| [`agents/`](agents) | Cross-cutting notes written for Claude Code: the HTTP contract, the working conventions, the Claude tooling inventory |
| [`2026-07-30-audit.md`](2026-07-30-audit.md) | A dated `npm audit` triage snapshot |

Note that `agents/` here is prose for agents to **read**. The subagent definitions the harness
loads are a different thing and live in `.claude/agents/`.

## Adding a doc

- A durable runbook goes in `guides/` and gets a row in the table above.
- A dated snapshot goes at this level with a `YYYY-MM-DD-` prefix, so its age is visible.
- A plan goes in `plans/` under the naming pattern, and is committed before the code it plans.
- A **why** does not go here at all. It goes in the CLAUDE file for the area it is about.

## Working with Claude Code

This repo commits its own Claude Code configuration, so a fresh clone gets the skills, subagents
and permissions with no setup. Two things worth knowing on day one: `Edit` and `Write` are
deliberately **not** pre-approved, so you see a diff before any file changes and can approve or
reject it, and every permission decision is explained in
[`../.claude/SETTINGS.md`](../.claude/SETTINGS.md) because JSON cannot hold comments. Personal
preferences belong in `.claude/settings.local.json`, which is gitignored. The full inventory of
what ships in `.claude/` is in [`agents/claude-tooling.md`](agents/claude-tooling.md).
