# The Jira tickets, migrated into this repository

The `PET` Jira project that tracked this work is going away, so its 85 tickets were migrated into
this repository's issue tracker on 2026-08-13, comments and all. Nothing else about this repository
changed: the code, the history and the 85 pull requests were already here and are untouched.

This page records why the migration is shaped the way it is, since the result does not explain
itself. The scripts that did it are in `scripts/`.

## What arrived

| | |
| --- | --- |
| Issues | 85, titled `[PET-n] ...`, all labelled `jira` |
| Comments | 106, with their original author and timestamp in the text |
| Sub-issue links | 68, wiring each task to its epic |
| Labels | 30 |

Jira's own labels are preserved as-is. Four synthetic families were added: `type:*` (epic, task,
story, bug), `priority:*`, `status:in-progress` for the two tickets that were mid-flight, and
`sprint-1` / `sprint-2`, which is the only surviving trace of the sprint structure because GitHub has
no equivalent field.

**Status mapping.** GitHub has only open and closed, so Jira's three states collapse: **Done**
becomes closed with reason `completed`, while **To Do** and **In Progress** both stay open, the
latter carrying a label so the distinction is not lost. Seven issues are open, 78 closed.

**Epics.** GitHub has no epic, but it does have sub-issues, a real parent/child relationship. The 8
epics carry their children as native sub-issues *and* as a checklist in the body. `addSubIssue` was
measured to work on **closed** issues, which is why the migration closes issues before linking them.

**Dependencies.** Jira's 19 `Blocks` relations across 18 tickets have no GitHub equivalent, so they
are rendered as a `**Blocks** / **Blocked by**` line in the body. Those are same-repository
references, so they cross-link both ways.

## What did not arrive, and why

- **The 85 pull requests.** They are already here, natively, with their full review discussion.
  Copying them into issues would have duplicated the real thing with a worse version of it.
- **Jira's changelog**, 636 history entries. Final state is preserved; the audit trail is not.
- **Direct links to Jira tickets.** The keys stay as plain text, the URLs are gone: they need a
  Decode login to resolve, and that access is ending, so they would have become dead ends. Figma
  links are untouched.
- **Reactions**, 7 of them. Jira worklogs, of which there were none. Attachments, of which there were
  none either.

## Reading the migrated issues

**`#NN` references inside these issues mean what they always meant.** The ticket authors were
writing about pull requests in this repository, and those references were deliberately left bare so
they still resolve here. Every inherited reference points somewhere in `#3`-`#94`, and the migrated
issues occupy `#97` upward, so the two ranges cannot collide.

This is worth stating because the same migration into a *different* repository had to do the
opposite. There the numbers had to be rewritten into explicit cross-repository links, because a bare
`#93` would have resolved against a tracker where #93 was an unrelated ticket. Which behaviour
applies is a one-line switch, `LINK_CROSS_REFS` in `scripts/config.py`, and that file explains the
reasoning in full.

**Timestamps are normalised to UTC and labelled.** Jira served `+0200` and GitHub serves `Z`; left
alone that put a silent two-hour skew between a ticket's own dates and everything around it.

**Authorship is in the text, not in the metadata.** Every issue and comment was created by the
account whose token ran the migration, so the GitHub author is misleading. A quoted header on each
body and comment records who actually wrote it and when. Where a person is named they are rendered as
a markdown link to their GitHub profile rather than an `@mention`: a mention inside link text does not
fire GitHub's mention parser, so the archive attributes people without notifying them once per issue.
That was verified against GitHub's own renderer rather than assumed.

## Re-running

`scripts/` holds what ran. It needs the Jira export, which is **not committed** - it is several
megabytes and contains personal email addresses. It lives in `docs/.migration/`, which
`docs/.gitignore` keeps out of the repository by its standing rule that every hidden path under
`docs/` is local-only. Keep that export: with Jira access gone it is the only copy of this data.

| Script | Role |
| --- | --- |
| `config.py` | which scenario this checkout runs, and why each switch is set that way |
| `adf2md.py` | Atlassian Document Format to GitHub Flavored Markdown |
| `render.py` | the text pipeline: wiki markup, Jira links, cross-references, mentions |
| `build.py` | assembles issue payloads |
| `apply.py` | the runner: six phases, resumable |
| `assign.py` | a separate assignment pass |
| `dryrun.py` | renders every issue to disk for review without writing anything |

Three rules are load-bearing if anyone touches these.

**No target issue number is ever predicted.** `build(None)` produces bodies that reference nothing in
the target tracker, safe to create before any number exists; the real numbers come back from the API
and `build(real_map)` re-renders the bodies that need them, which the runner then PATCHes. An earlier
version computed the numbers in advance, which was correct only for as long as nothing else was ever
filed.

**Pacing is set by the hourly rate limit, not the per-minute one.** GitHub allows roughly 80
content-generating requests per minute but only about 500 per hour, and reports exist of blocks well
below that with no `Retry-After` header. 7.2s per mutation is slow on purpose.

**A `POST` is never retried on a 5xx.** GitHub can return 502 after a write has already committed, so
a blind retry creates a duplicate that the state file knows nothing about. On a restart the runner
adopts anything already present by matching issue titles instead.

The runner is resumable: every step is recorded before the next begins, and re-running after success
is a no-op. Its preflight refuses to start if it finds issues that look already-migrated without a
state file to explain them - note that GitHub's REST issues endpoint counts pull requests as issues,
which this repository has 85 of, so that check looks for `[PET-n]` titles rather than an empty
tracker.

## Review

The scripts and the plan were reviewed by two independent passes before anything was written. Four
blockers came out of it: a markdown bug that turned a paragraph into a heading on all 8 epics, four
`#NN` references hidden behind escaped brackets that defeated the rewrite, a `POST` retry that could
double-create on a 502, and the rate limit above. All four were fixed and verified first, and the
finished state was then checked against the API independently of the script's own reporting.
