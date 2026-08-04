---
name: repo-stack
description: This skill should be used when the user asks to "stack a branch", "create a stacked branch", "add a branch to the stack", "submit the stack", "sync the stack", "restack", "view the stack", "what is this branch stacked on", or mentions stacked PRs, stacked branches, or gh-stack. Inspects and manages GitHub stacked branches and PRs in this repo with the gh stack extension - never with manual rebases.
argument-hint: "[view | init | add | submit | sync | merge]"
allowed-tools: Bash(gh:*), Bash(git:*), Read
---

> **Tools used:** `Bash(gh:*)` for the extension and PR queries, `Bash(git:*)` for
> branch state, `Read` for repo context.

## Why this exists

This repo ships every feature as a stack: a branch is cut from an unmerged parent
branch, its PR targets that parent, and GitHub retargets the child when the parent
merges. Manual `git rebase` against `main` is never part of the workflow - it rewrites
history the stack tooling manages. The rules live in `docs/CONTRIBUTING.md`;
this skill is the operating manual.

## Prerequisite

The `gh stack` extension is installed per developer, not carried by the clone:

    gh extension list                        # look for github/gh-stack
    gh extension install github/gh-stack     # if absent

## Three layers of truth

1. **The GitHub stack object is the ground truth.** A stacked PR's REST payload carries
   a `stack` field with the stack number, base, size and the PR's position:
   `gh api "repos/{owner}/{repo}/pulls/<n>" --jq .stack`. An empty result means GitHub
   holds no stack object for that PR.
2. **PR bases can stack without a stack object.** `gh pr list --json
   number,headRefName,baseRefName` shows the topology; a base other than `main` means a
   stacked PR even when layer 1 is empty, and GitHub still retargets it when the parent
   merges. Promote such PRs into a real stack with `gh stack link`, which needs no
   local tracking.
3. **The extension's local tracking is optional and often absent.** `gh stack view`
   only knows stacks tracked in this clone, so it can report "not part of a stack" for
   a branch that is in one on GitHub. Adopt an existing GitHub stack with
   `gh stack checkout <stack-number|pr-number|pr-url>`, which discovers it, fetches the
   branches and sets up tracking. Reserve `gh stack init` for branches not stacked
   anywhere yet: running init over branches whose PRs already form a GitHub stack
   invites the local/remote divergence prompt in `sync`.

When the layers disagree, believe the higher one and say so, rather than "fixing" any
of them silently.

## The official skill owns the CLI

The committed `gh-stack` skill (`.claude/skills/gh-stack/`, installed from
`github/gh-stack`) is the full CLI manual: every command, the JSON output shapes, the
exit codes, and the agent rules - always `view --json`, always `submit --auto`, always
positional branch names, `merge --yes` instead of `gh pr merge` (which does not work on
stacked PRs), and `unstack --local` before a conflicting checkout. Consult it for any
command mechanics; this skill covers only what is specific to this repo. Refreshing it
is a deliberate act: re-run
`gh skill install github/gh-stack gh-stack --agent claude-code --scope project` and
commit the diff.

## The worktree trap

This repo routinely holds several branches of one stack checked out at once: the main
checkout plus `.claude/worktrees/*`. Read operations (`view`, PR queries, `checkout` of
other stacks) do not care, but `sync` and `rebase` rewrite every branch in the stack,
and git refuses to move a branch that is checked out in another worktree. Before a
cascade rebase, make sure every branch it would move is checked out only where the
command runs: detach the others (`git -C <path> switch --detach`) or park them off the
stack, and re-attach afterwards.

## Repo conventions that still apply

- Branch format `{type}/PET-{number}-{slug}`, one ticket per branch.
- HARD RULE: never commit or push directly to `main`. `gh stack merge` lands PRs;
  pushing `main` yourself is still forbidden.
- New dependent work is cut from the parent branch's tip, then `gh stack add` (tracked)
  or `gh pr create --base <parent>` (untracked).
- When pushing outside the tool, the first push of a branch is
  `git push -u origin <branch>`.
