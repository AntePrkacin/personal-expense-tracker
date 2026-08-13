# Showcase

Everything the showcase needs that is not a slide. PET-75 owns the running order and what the
audience sees; this directory holds the artifacts it points at.

| File | What it is |
| --- | --- |
| `statistics.html` | The charts. Open it from disk - no server, no network |
| `diagrams.md` | The data model, the deployment map and the login flow, rendered by GitHub |
| `diagrams/*.mmd` | The same four diagrams as separate sources, one per slide |
| `ai-vs-sql.md` | The assistant's three questions, the SQL that answers them, and what it said |
| `data/*.json` | Generated. Refreshed on the day; no figure is written by hand |
| `.participants` | The invite list. Gitignored, never committed, real personal data |

## The one rule

**After the invite links are minted, nobody enters the demo account's address into the login
form. Not once.**

`LoginTokenService.issue()` supersedes **every** unused link for an account in a single
statement, so one login-form submission silently kills the link of every participant who has not
clicked yet. They find out by clicking and being told to open a newer email that does not exist.

This is not a theoretical hazard: it was reproduced deliberately while building the watcher. Two
minted links, one login-form submission, both links dead.

So:

- The invitation email asks people to **reply** rather than request a new link.
- If the login flow is demonstrated live, it is demonstrated on a **plus-address** such as
  `spendifico+demo@gmail.com`, which lands in the same inbox. Never on the demo account.
- `mise run showcase:watch:cloud` is left running. It notices a superseded link within 30 seconds
  and re-sends a fresh one without anybody touching it.

## On the day, in order

**1. Reset and reseed.** PET-75's step, not this ticket's, but everything below consumes its
result. The seeder drops current-month rows dated after today, so the account is a function of the
day it was seeded - which is why the recorded answers in `ai-vs-sql.md` are taken *after* this and
never before.

**2. Record the assistant's answers.** Run the three SQL statements in `ai-vs-sql.md` against the
demo account's own database through the Turso MCP (the Turso CLI cannot address a per-user
database), then ask each question three times, each in a **new chat session**. Three asks in one
thread measure the model's consistency with itself rather than the reproducibility of the answer.

**3. Refresh the statistics.**

```
mise run showcase:stats
```

Six generators and a build, a few seconds, no database and no network beyond `gh` - which degrades
to nulls rather than failing, so this works with the wifi off. Open `statistics.html` afterwards
and check the "Generated" stamp under the title says today.

Test counts are **not** part of that command, because they run all three suites and take minutes:

```
mise run showcase:stats:tests
```

The page renders whatever that last wrote, so run it once when the code has settled.

**4. Mint and mail the invites.** Put one address per line in `.participants`, then read the plan
before sending anything:

```
mise run showcase:invite:cloud
```

That is a dry run: it does the full preflight, renders the exact mail each person will get, and
writes nothing anywhere. When it looks right:

```
mise run showcase:invite:cloud -- --send
```

It prints the plan and pauses. **Check the two lines that say which database and which base URL**
before answering: they are independent settings, and a run that mints rows in Turso Cloud while
building `http://localhost:4200` links is a complete success that delivers nothing usable. Nothing
downstream can detect it.

**5. Watch.** The invite run ends by printing this command with the ledger path filled in:

```
mise run showcase:watch:cloud
```

It reports every participant as waiting, logged in or broken, re-mints and re-sends anything
broken (at most twice per address), and when the last person is in it prints
`ALL PARTICIPANTS LOGGED IN SUCCESSFULLY` and exits.

## What you need in place

- **`backend/.env`** with the four `TURSO_*` values, `MAILPACE_API_TOKEN`, `MAIL_FROM` and a
  `FRONTEND_URL` pointing at production. The operator secrets live in `backend/.env.local`, which
  is gitignored; `docs/guides/configuration.md` is the variable table.
- **The account seeded in cloud mode.** The invite script refuses to mint against an account with
  no database rather than letting ten people race its provisioning.
- **`gh` authenticated**, for the pull-request figures only.

## Where the secrets go

`.participants` holds real addresses and is ignored by `docs/.gitignore`, which ignores every
hidden file under `docs/` at any depth - a standing rule rather than a named exception, so the
next local input file needs no edit.

The **minted links go outside the working tree**, to `~/.spendifico/showcase-invites-<stamp>.json`
at mode 0600. A gitignored secret is still a secret sitting in a directory people screen-share
from, and every line of that file is a working credential for a live account.

## Refreshing the statistics safely

`statistics.html` contains no figure of its own, so a refresh cannot break it: at worst a
generator fails and that file keeps yesterday's numbers, with its own `generatedAt` saying so.
Every data file carries the instant it was written for exactly that reason.

One exception worth knowing: **`data/tickets.json` is written by an agent, not a script.** There
is no Jira CLI here and the MCP is not reachable from a shell, so `mise run showcase:stats` cannot
update it. Check its `generatedAt` before quoting the ticket counts.
