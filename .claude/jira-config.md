# Jira Project Configuration - Personal Expense Tracker

## Project

| Field | Value |
|---|---|
| **Jira Project Key** | `PET` |
| **Project Name** | `[ACADEMY] Personal expanse tracker` |
| **Jira URL** | `https://decode.atlassian.net` |
| **Cloud ID** | `ca345cf6-281a-4912-83f4-2ae1566e6e34` |
| **Project ID** | `12848` |
| **Project type** | Software, **team-managed** (next-gen) |
| **Board** | `2329` - [backlog](https://decode.atlassian.net/jira/software/projects/PET/boards/2329/backlog) |

### Issue type IDs

Discovered from `getVisibleJiraProjects`. Team-managed projects have their own IDs, so these
are specific to `PET`.

| Issue type | ID |
|---|---|
| Epic | `13080` |
| Task | `13082` |
| Story | `13083` |
| Bug | `13084` |
| Subtask | `13081` |

## Story Points Field

| Field ID | Name | Confirmed From |
|---|---|---|
| `customfield_10432` | Story point estimate | PET-44, set to 1 and read back via JQL `cf[10432] = 1` |

Set it by ID. The human-readable name is **rejected** on this project: passing
`{"Story point estimate": 1}` fails with "not on the appropriate screen, or unknown", while
`{"customfield_10432": 1}` succeeds. In JQL, reference it as `cf[10432]`.

## Linking tasks to epics

`PET` is **team-managed**, so an epic is the issue's **parent**: pass `parent: "PET-1"` on
`createJiraIssue`, or set it afterwards with `editJiraIssue`. Do **not** use the Epic Link
custom field - that is the company-managed mechanism and will be rejected here.

## Git Convention

| Field | Value |
|---|---|
| **Branch format** | `{type}/PET-{number}-{slug}` - e.g. `feat/PET-12-add-transaction-modal` |
| **Commit format** | `{type}({scope}): {description} (PET-{number})` - scope is `backend` \| `frontend` |
| **Main branch** | `main` |

## Priority values

Four levels, all four in use: `1` Critical (top of the scale, blocker icon), `2` High, `3`
Medium, `4` Low. That matches the scheme in `references/standards.md` section 8, whose
**Blocker** is this project's Critical.

**Write priority with the id object form only:** `{"priority": {"id": "2"}}`. Both
`{"priority": "High"}` and `{"priority": {"name": "High"}}` fail on this site with
`Specify the Priority (id or name) in the string format`, whatever the value - so a failed
call proves nothing about whether that priority exists. This file previously claimed the
project rejects `Highest` and `Lowest` and that only High and Medium are valid; that was a
format error misread as a rejected value. Corrected 2026-08-04 (Critical was accepted on
PET-50, and Low is in use on six issues).

**Never infer "unset" from a missing key.** An explicit `fields` list on
`searchJiraIssuesUsingJql` replaces the tool's default set rather than adding to it, so
omitting `priority` there makes every issue read as null. Either omit `fields` entirely or
include every field you intend to reason about.

## Notes

- **Jira is the source of truth** for tasks, statuses, and acceptance criteria.
- **Component values are carried as labels, not the Components field.** Field discovery timed
  out, so whether this team-managed project exposes Components is unverified. The seven epics
  use labels instead (`onboarding`, `shell`, `dashboard`, `transactions`, `categories`,
  `insights`, `settings`), each alongside the `mvp` phase label. Keep tasks consistent with
  that until the Components field is confirmed to exist.
- **Requirement traceability:** every task cites at least one requirement ID from
  `docs/project-management/02-tech-spec-personal-expense-tracker.md` section 2 (101 IDs in
  total, `WEL` through `SET`). Tasks that rely on an assumption (`A1` to `A44`) also carry the
  `design-review` label, because a designer still owes an answer.
- **Access is over MCP, and two setups are supported:** the official Atlassian connector on
  claude.ai (OAuth, no file to edit) or a self-hosted `mcp-atlassian` server configured in
  `.mcp.json` (copy from `.mcp.json.example`). Setup steps, trade-offs and troubleshooting for
  both: `.claude/skills/repo-jira/references/jira-access.md`.
- Either setup only reaches Jira sites **your own account can already see**. Neither grants
  new access.
