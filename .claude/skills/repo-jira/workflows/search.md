> **Tools used:** `Read` (load config), plus a Jira JQL-search tool: `searchJiraIssuesUsingJql` (connector) or `jira_search` (self-hosted).

Search Jira issues using natural language or JQL filters.

## Step 0 - Preflight check

Two Jira setups are supported (see `references/jira-access.md`). Establish which is active before anything else:

1. If `getAccessibleAtlassianResources` is available → **connector**. Call it once and keep the returned `cloudId`; every later Jira call needs it.
2. Else if `jira_search` is available → **self-hosted**. No `cloudId` is needed.
3. If neither is present, stop and tell the user: "No Jira MCP server is available. See `.claude/skills/repo-jira/references/jira-access.md` to set up either the Atlassian connector or `.mcp.json`, then restart Claude Code."

Below, tools are written as `connector-name` / `self-hosted-name` - use the one matching your active setup.

## Step 1 - Load config

Read `.claude/jira-config.md` for the project key (default `PET`).

## Step 2 - Parse the search query

The argument passed was: **`$ARGUMENTS`**

Translate the argument into a JQL query. Examples:

| User says | JQL |
|---|---|
| `search label=BE status=todo` | `project = PET AND labels = BE AND status = "To Do"` |
| `search my open tasks` | `project = PET AND assignee = currentUser() AND status != Done` |
| `search epic PET-6 tasks` | `parent = PET-6 AND issuetype = Task` |
| `search blocked tasks` | `project = PET AND labels = blocked` |
| `search unestimated BE tasks` | `project = PET AND labels = BE AND "Story point estimate" is EMPTY AND issuetype = Task` |
| `search sprint` | `project = PET AND sprint in openSprints()` |

If the argument already looks like raw JQL, pass it through directly.

`PET` is team-managed, which changes two field names: children of an epic are found with
`parent = PET-x` (**not** `"Epic Link"`), and the points field is `"Story point estimate"`
(**not** `"Story Points"`). Both spellings fail with an "unknown field" JQL error on this
project, so do not fall back to them.

## Step 3 - Execute search

Run via `searchJiraIssuesUsingJql` / `jira_search` with the constructed JQL. Limit to 25 results by default.

## Step 4 - Output results

```
## Search Results
Query: [JQL used]
Found: X issues

| Key | Summary | Status | Assignee | Points |
|---|---|---|---|---|
| PET-123 | [summary] | In Progress | [name] | 5 |
| PET-124 | [summary] | To Do | - | 3 |
```

If no results, suggest refining the query.
If >25 results, show the first 25 and tell the user to narrow the search.
