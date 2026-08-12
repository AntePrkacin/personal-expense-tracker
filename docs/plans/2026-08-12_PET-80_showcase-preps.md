# PET-80: Showcase preps

**Ticket:** [PET-80](https://decode.atlassian.net/browse/PET-80) - Showcase preps
**Serves:** [PET-75](https://decode.atlassian.net/browse/PET-75) - Prezentacija
**Branch:** `chore/PET-80-showcase-preps`, cut from `origin/main` at `de60f88`

Everything the showcase needs that is not a slide. PET-75 owns the running order and what the
audience sees; this plan builds the artifacts it points at, and every one of PET-75's 🚨-marked
items is a deliverable below.

## The constraint that shapes all of it

The showcase is **today**, and coding continues for hours after this plan lands. So every figure
the presentation shows has to be **cheap to recompute at the last minute**, which forces one rule:

**No number is ever typed into a document.** A script computes it into JSON, and a page renders
the JSON. Refreshing the whole statistics set is then one command run minutes before the talk,
and re-running it cannot break the pages, because the pages contain no figures of their own.

That rule is also what keeps the presentation honest. A hand-copied number is a number nobody can
re-derive on stage, and this is a presentation partly *about* how the repo was built.

## Where it all lives

A new top-level `docs/showcase/` directory, because none of this fits the two existing contracts:
`docs/` answers "how do I run and change this", the `CLAUDE.md` set answers "why is it built this
way", and this answers neither. It is presentation material with a shelf life of one afternoon,
and keeping it in one directory means it can be read, reviewed and later deleted as one thing.

    docs/showcase/
      README.md            how to refresh everything, and in what order
      statistics.html      the charts, rendered from data/*.json
      diagrams.html        the diagrams, embedding the rendered SVGs
      ai-vs-sql.md         the assistant questions, their SQL, and the recorded answers
      data/*.json          generated, committed, refreshed on the day
      diagrams/*.mmd       Mermaid sources, hand-authored, verified against the schema
      diagrams/*.svg|png   generated from the sources, committed
    scripts/showcase/      the generators and the diagram renderer, which open no database
    backend/src/scripts/   invite-showcase.ts and its watcher, which do

Two things are deliberately never **committed**: participant email addresses, which sit in a
gitignored `docs/showcase/.env.participants`, and the raw login tokens, which are written outside the
working tree altogether. The difference between the two is deliberate and vector 3 explains it.

## Vector 1: statistics

### What gets counted

PET-75 names the set, and every item is qualified **excluding the initial commit** (`a237207`,
"Initial commit"), so every range below is `a237207..HEAD`:

- commits, and their shape over time
- lines added and deleted, **comments excluded**
- installed node modules, frontend and backend
- pull requests
- Jira tickets
- documentation files and lines, split three ways: agent files, `docs/`, `docs/plans/`

### Three decisions inside "lines added and deleted"

**Comments are excluded by our own classifier, because no line counter is installed.** There is no
`cloc`, `scc` or `tokei` on this machine, and `git log --numstat` cannot tell a comment from code.
So the script walks `git log -p --no-merges a237207..HEAD` and classifies each `+`/`-` line by the
file's extension: `//`, `/*`, `*`, `#`, `<!--` lead-ins and blank lines are dropped.

Two blind spots, both of which **inflate the code count** rather than deflate it, so the figure is a
ceiling and not a coin flip: an interior block-comment line that does not begin with `*`, and a
string literal containing `//`. Neither is common in this tree, and the method is **stated on the
page** rather than the number being presented as exact. A presentation about how this repo was built
can afford one honest sentence about how a number was arrived at.

`npx cloc` is the cross-check if a figure looks wrong, and it is also the cheaper route to a
*different* and arguably better statistic: the **snapshot** split of the tree as it stands today into
code, comment and blank. That is one command over a working tree rather than a walk over 467 commits,
and comment density is a more interesting claim about this repo than churn is. It stays optional
because it needs one network fetch, which the rest of this vector does not.

**Generated and vendored files are counted in their own bucket, never as hand-written code.** That
is `package-lock.json` (three of them), `backend/openapi.json`, `frontend/src/types/api.d.ts`,
`backend/drizzle/**`, `.agents/skills/**` and `backend/src/scripts/showcase/fixture.data.json` -
the exact set root `CLAUDE.md` forbids hand-editing. Folded into one total, the lockfiles alone
dwarf every other number on the chart and the interesting figure disappears. Split out, the split
itself is a talking point.

**Documentation is its own bucket too, not a subtraction from code.** This repo has an unusual
ratio and the chart should show it directly, so `.md` is counted separately with the three-way
split PET-75 asks for.

### The sources, and the one that is not a script

| Data | Source | Refreshed by |
| --- | --- | --- |
| commits, lines, files, docs lines | `git log`, `git ls-files` | `scripts/showcase/stats-repo.sh` |
| pull requests | `gh pr list --json` | `scripts/showcase/stats-delivery.sh` |
| node modules, frontend and backend and root | `npm ls --all --parseable` plus a directory count | `scripts/showcase/stats-deps.sh` |
| Jira tickets | the Atlassian MCP | **an agent step, not a script** |

That last row is the one honest asymmetry. There is no Jira CLI here and the MCP is not reachable
from a shell script, so the ticket counts are written into `data/tickets.json` by an agent running
one JQL query. `README.md` says so, and the JSON carries the timestamp it was written at, so a
stale ticket count cannot masquerade as a fresh one.

### How the charts get drawn

**Recharts, the repo's own chart library, bundled locally with esbuild.** The reason this needs a
build step at all is worth recording, because the obvious approach fails silently: Recharts ships a
UMD bundle (`frontend/node_modules/recharts/umd/Recharts.js`) that expects `React` and `ReactDOM`
as globals, and **React 19 ships no UMD build at all** - so a plain page loading both from disk
gets a blank chart area. `esbuild` is already installed in both apps, so
`scripts/showcase/build-charts.mjs` bundles a small React entry into one IIFE file and the page
loads it with a plain `<script>`. No CDN, no network at the podium, and the library is the one
`frontend/CLAUDE.md` mandates.

The six existing `docs/explainers/*.html` pages set the opposite precedent - pinned jsdelivr and
unpkg tags, plus the Expensa theme values re-declared in a local `<style>` block. This plan keeps
the second half of that precedent and drops the first: theme values are inlined the same way so the
page looks like the product, and every script is local so a bad room wifi cannot blank a chart
mid-presentation.

**The data is loaded as a script, not fetched.** A page opened over `file://` cannot `fetch` a
sibling JSON file, and depending on a static server is one more thing to remember. So the build
writes `data/all.data.js`, a single `window.__SHOWCASE__ = {...}` assignment, from the JSON files.
Refreshing the statistics therefore means re-running the generators and that one-line rebuild -
never re-bundling the charts, which only changes when the chart code does.

**Load the `dataviz` skill before writing any chart code.** It is the repo-independent authority on
palette, chart-type choice and stat tiles, and this page is a chart-dense surface projected onto a
wall, which is exactly the case it exists for.

Planned surfaces, subject to what the data actually supports:

- commits per day as an area chart (the history is short and dense enough to read)
- lines added against lines deleted, cumulative
- code / documentation / generated as three buckets
- documentation lines split into agent files, `docs/`, `docs/plans/`
- installed modules, frontend against backend
- pull requests, tickets, and the active-day count as stat tiles rather than charts, because a
  single number is not a chart

## Vector 2: diagrams

Mermaid sources committed as text, so they render on GitHub inside a markdown page and can be
diffed like anything else. Three are required, two are stretch.

**Required.**

1. **ERD, both scopes.** The central database and the per-user one are separate schemas and the
   diagram has to show that, because "every user gets their own database" is the architectural
   claim of the whole backend. Authored by hand from `backend/src/database/central/schema.ts` and
   `backend/src/database/user/schema.ts`, and the ERD must show what those files actually say:
   **no foreign keys are declared anywhere**, deliberately, because the Turso engine has
   `PRAGMA foreign_keys` off per connection. A Mermaid `erDiagram` draws relationships as if they
   were constraints, so the page states in prose that the lines are logical, not enforced. That is
   a better talking point than a diagram that quietly lies.
2. **Deployment and infrastructure.** Vercel for the frontend, Fly.io for the API at
   `api.spendifico.eu`, Turso Cloud holding the central database plus one per user, MailPace
   sending from `login@spendifico.eu`, Porkbun for DNS, and Gemini behind both AI features. The
   GitHub Actions deploy workflow belongs on it too, since `main` does not auto-deploy the backend.
3. **The passwordless login flow**, as a sequence diagram: the email form, the API, the token row
   in the central database, MailPace, the inbox, `/auth/verify?token=`, the session cookie. Two
   details on it earn their place because they are the ones people ask about - the link is
   single-use, and issuing a new one **supersedes every unused link for that account**.

**Stretch, in this order.** One database per user, from registration to first open. And the
assistant's cancellation path, which already has an explainer in
`docs/explainers/cancelling-an-ai-request.md` to draw from.

**Rendering, and why PNG export needs nothing new.** Mermaid is not a dependency of this repo and
this plan does not add one. Instead `scripts/showcase/render-diagrams.mjs` drives the headless
Chromium already on this machine, loads each `.mmd` through a pinned Mermaid build **once**, and
writes both an `.svg` and a `.png` next to the source. Those files are committed, so
`diagrams.html` embeds static images, GitHub renders the sources in `README.md`, and neither needs
Mermaid or a network at presentation time. `@mermaid-js/mermaid-cli` would do the same job by
pulling its own Chromium download, which is the cost this avoids.

## Vector 3: emailed 24-hour login links

### The mechanism, and the trap under it

`login_links` rows are the only thing that can be emailed - a session is a cookie and cannot be.
Reading `backend/src/auth/login-token.service.ts` closely settles two questions that decide this
whole vector:

**One account can hold many simultaneously valid links.** `consume()` marks only the row whose
hash matched, and touches no sibling. So N rows inserted directly, each with its own token, each
unused and unsuperseded, all work, and each is independently single-use. One prepared link per
participant into one shared demo account is therefore possible without a per-person account.

**Clicking a link does not invalidate anybody else's, and this is worth stating as its own fact
because it is the thing everyone assumes backwards.** Twenty participants can open their links in the
same second and all twenty succeed. The evidence is narrow enough to check in one sweep:
`superseded_at` is written in exactly **one** place in the backend, `LoginTokenService.issue()`, and
`issue()` has exactly **one** caller, the login-link request in `AuthService`. The verify path calls
only `consume()`, whose `WHERE` is keyed on a single token hash.

The practical consequence is that **nothing about this needs to be serialized.** Sending one link,
waiting for that person to open it, then sending the next is a design for a failure mode that does
not exist, and it would make a room of twenty wait in sequence on each other's attention. All the
mail goes out at once.

**The 24-hour lifetime is a stored column, so it is simply written.** `expires_at` is an absolute
timestamp on the row and `consume()` does nothing but compare it against now - nothing is derived
from when the link was created, and no expiry logic runs at visit time beyond that comparison. So
"make it last 24 hours" really is one value written into one column, with no cleverness required.
It is worth stating because expiry and supersede are easy to hear as one problem, and they are not:
`expires_at` is ours to set, `superseded_at` is the app's to set, and only the second one can
surprise us.

**But the rows have to be inserted rather than minted and then patched.** `issue()` returns the raw
token only to the caller that sends the mail, and stores nothing but its hash - so a link created
through the app is a link whose token we can never learn, and patching its `expires_at` would leave
us with a 24-hour link nobody can open. Generating the token ourselves is not a shortcut around the
app; it is the only order that yields a link we can put in an email.

**But `issue()` supersedes every unused row for that user in one statement.** Anyone typing the
demo address into the login form after preparation - a participant guessing, or us demonstrating
the login screen - invalidates **every prepared link at once**, and the failure is silent until
somebody clicks. This is the single sharpest risk in this ticket.

Note precisely what does and does not survive it, because it decides the remedy. The supersede
matches `used_at IS NULL`, so **a participant who has already logged in is unaffected** - their row
is spent, and their session lasts 30 days regardless. Only the not-yet-clicked links die. And
clicking a link never disturbs a sibling, so the failure mode is not "the links interfere with each
other"; it is one specific form submission taking out everybody still holding an unopened envelope.

The likely path to it is worth naming, because it is not far-fetched: a participant loses the mail
or clicks after expiry, lands on the login screen, and types the demo address, which is the one
sensible thing to do from there.

### Throttling does not stand in the way, and here are the numbers

Ten participants in one room share one public IP, so this is worth settling rather than assuming.
`POST /api/auth/verify` is guarded by the **ip** throttler only - it carries
`@SkipThrottle({ email: true })`, so the fact that all ten links point at one shared address costs
nothing. Production sets `AUTH_RATE_IP_LIMIT = 150` per a 900-second window in `backend/fly.toml`, so
ten clicks, or twenty with double-submits and retries, sit far under it. `GET /api/auth/session`
skips both throttlers, so whatever polling follows a login is free.

**`TRUST_PROXY_HOPS = 2` is the value that makes this true rather than merely plausible.** Left at its
default of 0 behind a proxy, `req.ip` is the proxy for every caller, every request on earth shares one
bucket, and `AUTH_RATE_IP_LIMIT` quietly becomes a global cap - `env.validation.ts` spells that trap
out at the variable. It is set to 2 for Fly's two hops, so the per-IP bucket really is the room's.

These are `fly.toml` `[env]` values, which means they are applied by a deploy. They are not new, so no
action is implied - but it is the reason the outstanding backend deploy noted under vector 5 is worth
clearing rather than carrying into the event.

### Prevention first, and it is cheaper than any recovery

- The email says: click the link, and do not use the login form. If it fails, message us.
- Links are minted the **morning of** the event, so 24 hours covers it with margin.
- If the login flow itself is demonstrated live, it is demonstrated on a plus-address such as
  `spendifico+demo@gmail.com`, never the demo account. That inbox already uses plus-addressing for
  exactly this kind of test, so it is an established trick here rather than a new one.
- `README.md` carries this as a rule, not a note.

### The watcher, which is detect-and-heal rather than serialize

`backend/src/scripts/watch-showcase-invites.ts` reads the ledger to learn which rows are ours, then
polls those rows every 30 seconds and reports each
participant in one of three states: **waiting** (`used_at` and `superseded_at` both null),
**logged in** (`used_at` set), **broken** (`superseded_at` set). On any broken row it mints a
replacement 24-hour token for that participant and prints the new link.

What it deliberately is **not** is serialized. Sending one link, waiting for that login, then
sending the next would be a fix for a problem that does not exist, since concurrent links do not
interfere with each other at all. Every link goes out at once.

**Because the send is MailPace rather than Gmail, healing is genuinely automatic**: on a broken row
the watcher mints and re-sends without a human in the loop, and its `--send` flag is the same one the
initial run uses. Two guards on that, because an auto-sender that loops is worse than a dead link: it
re-sends to any one address at most twice, and it logs every send with its reason.

Its side benefit is the one that may matter most on the day: it is a live dashboard of who has
logged in and who has not, which is otherwise invisible.

**And it has an ending.** When the last ledger row flips to `used_at`, it prints
`ALL PARTICIPANTS LOGGED IN SUCCESSFULLY` and exits zero. That is a product-owner request and it is
kept verbatim rather than softened into a status line, because the point of it is that the room sees
it on the projector. It costs one comparison per poll: the watcher already reads every row it minted,
so "are they all spent" is a fact it holds anyway.

**The app's own expiry is not touched.** `LOGIN_LINK_TTL_M` stays at its 15-minute default; the
24-hour lifetime is a value written into the `expires_at` column of these hand-made rows only.
Changing the environment variable would change it for every real login, which is a production
behaviour change for a presentation convenience.

### Where the script lives, which is not where this plan first put it

**`backend/src/scripts/invite-showcase.ts`**, beside `seed-showcase.ts`, not in `scripts/showcase/`.
It needs three things that live in the backend and nowhere else: the Drizzle central-database client
and its two Turso drivers, `newId()` for the UUIDv7 primary key the schema expects, and the env
loading that decides local against cloud. Reaching all of that from a root-level script means
reimplementing it, and a reimplemented id generator or connection string is exactly the kind of
second answer this repo keeps refusing.

So the split is by dependency, not by topic: **anything that opens a database lives in
`backend/src/scripts/`, everything else in `scripts/showcase/`.** The statistics generators and the
diagram renderer touch no database and stay at the root.

**Two mise tasks rather than one flag**, copying the convention `seed` and `seed:cloud` already set
for exactly this reason: a mistaken local run writes a throwaway SQLite file, a mistaken cloud run
mails real people. Reaching production has to be typed out.

### What happens when you run it, step by step

`mise run showcase:invite:cloud -- --send`

**Phase 1, preflight. Reads everything, writes nothing, and stops on the first thing that is wrong.**
This phase exists because every failure it catches is one that would otherwise be caught by a
participant.

1. Read `docs/showcase/.env.participants`, one address per line, ignoring blanks and `#` comments.
   Trim, lowercase, de-duplicate, and reject anything that is not shaped like an address.
2. Resolve the demo account: look up `users` by its email in the central database and take the
   `user_id`. **If it is not there, stop** - the account has not been seeded, and inserting login
   links for a user that does not exist produces links that authenticate nothing.
3. If `--send`, require `MAILPACE_API_TOKEN` and `MAIL_FROM` now rather than after the rows exist.
4. Print the whole plan and pause on it: how many addresses and which, the demo account and its
   resolved id, **which database** it is about to write to, **which base URL** the links will carry,
   the exact expiry instant in local time, and the from address.

   Step 4 is the trap this design is built around. The database target and the link base URL are two
   independent settings, and **a run that mints rows in Turso Cloud while building
   `http://localhost:4200` links is a complete success that delivers nothing usable** - as is the
   reverse. Nothing downstream can detect it, so the two values are printed side by side and confirmed
   before any write.

**Phase 2, mint. One transaction, all participants, or nothing.**

5. Per address: 32 random bytes as base64url for the raw token, its hex SHA-256 as `token_hash`,
   `newId()` for the id, `expires_at` at now plus 24 hours, `used_at` and `superseded_at` null,
   `created_at` and `updated_at` now.
6. Insert them **directly into `login_links`**, in a single transaction. Never through
   `AuthService` or `LoginTokenService.issue()`, whose whole job includes the supersede that would
   invalidate every sibling it just created.

   All-at-once and atomic is deliberate: a half-finished mint is worse than a half-finished send,
   because a link nobody received simply expires unused, while a missing row is a person with no way
   in and no error anywhere to explain it.

**Phase 3, the ledger. Written before the first email, not after the last.**

7. Write one JSON file **outside the working tree**, `showcase-invites-<timestamp>.json`, holding per
   participant: the address, the `login_links.id`, the expiry, the raw link, and a `sent` field still
   false.

   This is the file that makes the rest recoverable. It is what the watcher reads to know which rows
   are ours, and it is why a crash during sending is a resumable state rather than a mystery. It also
   holds live credentials, which is why it is outside the tree rather than merely gitignored.

**Phase 4, send. Sequentially, and one failure does not stop the rest.**

8. Per participant, `POST https://app.mailpace.com/api/v1/send` with the token, from `MAIL_FROM`, to
   that one address, carrying that one link. Mark `sent` in the ledger on success.
9. A rejected address is recorded with its error and the run continues. Aborting the batch because
   one address bounced would leave the room half-invited with no record of which half.

**Phase 5, report.**

10. A table of address against minted against sent, the expiry instant once more, the reminder that
    nobody may type the demo address into the login form, and **the exact command to start the
    watcher**, so the next step is copy-paste rather than recall.

**Without `--send`, phases 2, 3 and 4 do not happen at all.** The dry run does the full preflight,
renders one complete email with a clearly fake token, lists every recipient, and writes nothing to
either the database or anybody's inbox. That is what replaces the review a Gmail draft would have
given us, and it is the default.

### The script documents this itself

The walkthrough above goes into `invite-showcase.ts` as its **header comment**, in the same voice as
`seed-showcase.ts` and `mise.toml`: the five phases, why the mint is one transaction, why the ledger
is written before the first send, why it inserts rather than calling `issue()`, and why the database
target and the link base URL are printed together. A plan is read once, before the work; a script
header is read by whoever runs it at 20:00 with a room waiting.

Two comments in it are non-negotiable, because both encode a failure that is invisible at the call
site: the `issue()` supersede, and the database-and-base-URL pairing.

### Where the addresses and tokens go

**Neither is ever committed.** Participant addresses are real personal data, which root `CLAUDE.md`
keeps out of this repo absolutely, and raw tokens are live credentials that authenticate anybody
holding them.

The input is `docs/showcase/.env.participants`, one address per line, no names - so the email copy
is greeted generically. **That path is not currently ignored**, and assuming it was is how it would
have been committed: the root `.gitignore` carries `.env` and `.env.local` only, neither of which
matches `.env.participants`, and `git check-ignore -v` on it exits 1.

The fix is a **`docs/.gitignore` that ignores every hidden file under `docs/` and below**:

    .*
    !.gitignore

Two reasons this beats naming the file in the root ignore list. It is a **standing** rule rather than
one exception, so the next showcase or explainer that needs a local input file is covered without
anybody remembering to extend a list. And it is scoped to `docs/`, so it cannot silently swallow a
dotfile somewhere it would matter. The `!.gitignore` line is load-bearing: without it the pattern
ignores the file itself, which cannot then be added.

It costs nothing today because **`docs/` contains no hidden files at all**, tracked or untracked, so
the rule starts life ignoring exactly one thing: the participants file we are about to write.

The minted links are written outside the working tree entirely, since a gitignored secret is still a
secret sitting in a directory people screen-share from. `docs/showcase/` keeps the procedure and the
template copy, carrying a placeholder address only.

### The send: MailPace from our own script, not Gmail drafts

**Decided against Gmail.** The connector is authenticated as `spendifico@gmail.com` - confirmed by
reading its own inbox, which carries mail to that address alongside the forwarded
`login@spendifico.eu` login mail - so drafts *would* have landed in the right account. It is out
anyway, because it exposes `create_draft` and `update_draft` and **no send tool**, which puts a human
keystroke between every mint and every delivery. That is tolerable for the first batch and not
tolerable for the watcher's re-sends, which is the case that matters.

**MailPace instead, called directly.** `backend/src/mail/mailpace.mailer.ts` shows the whole
interface: one `POST https://app.mailpace.com/api/v1/send` carrying the server token, from an address
MailPace has authorized. `login@spendifico.eu` is that address, its DKIM is real, and replies to it
forward into `spendifico@gmail.com` - so a participant who replies reaches a human. The script posts
the same way rather than booting Nest to borrow the mailer, since it needs neither the module graph
nor the app's own login-link copy.

Three things this needs, and the first is the one that can block:

- **`MAILPACE_API_TOKEN` has to be readable locally.** Fly secrets are write-only, so if the token
  exists only as a Fly secret it cannot be read back out and has to come from the MailPace dashboard
  or an existing local `backend/.env`. Establish this before writing the sender, not after.
- **Its own template**, in `scripts/showcase/`, carrying the showcase copy. Not
  `backend/src/mail/login-link.template.ts`, which is the app's transactional login mail and has a
  different job.
- **`--send` off by default.** Every run prints each rendered email and the address it would go to,
  and sends only when asked. The dry run is what replaces the draft-review step Gmail would have given
  us for free.

The plus-addressing trick the prevention list uses came out of the same inbox read: it has already
received login mail at `spendifico+category@gmail.com`, so any number of distinct, deliverable test
addresses exist without touching a participant's.

Copy carries: what Spendifico is, that the link is personal and single-use, that it expires in 24
hours, that it opens a shared demo account with three years of invented data, and a request to
bring receipts, since PET-75's showcase step wants receipt scanning demonstrated on real paper.

### The demo account becomes Slavko

PET-75 asks for a fresh dummy user "as Slavko" at `slavko@spendifico.eu`, and the product owner has
confirmed it: `fullName` becomes `Slavko` and the address becomes `slavko@spendifico.eu`. The cost was
measured before agreeing to it, and it is two lines, one regenerated artifact and one guide.

**The two code edits.** `SHOWCASE_EMAIL` in `backend/src/scripts/seed-showcase.ts` - which this plan
already turns into an optional argument, so the rename is that same edit with a different default -
and `fullName` at `backend/src/scripts/showcase/generate.ts:386`.

**The artifact is regenerated, never hand-edited.** `generate.ts` is what produces
`backend/src/scripts/showcase/fixture.data.json`, which root `CLAUDE.md` lists among the
generated-but-committed files. So: `mise run seed:fixture`, **its own commit**, then `mise run
seed:check` against the result, exactly as `mise.toml` instructs. The diff is expected to be the one
`fullName` line, because the name feeds no part of the spending model - and if it turns out to be more
than one line, that is a finding about the generator worth stopping on rather than committing past.

**No test changes.** Neither `dummy@spendifico.eu` nor `Showcase User` appears in any spec, checked by
sweep across the repo including dotfiles.

**One guide changes and three records do not.** `docs/guides/seeding-dummy-data.md` carries four hits
and is the how-to, so it changes. The hits in `docs/TODO.md` and `backend/src/database/CLAUDE.md` are
both **incident records** of PET-60's replica bug - "a local seed run put `dummy@spendifico.eu` in the
central replica" - and `docs/plans/2026-08-07_PET-60_showcase-seed-script.md` is history. Editing any
of the three to match a later rename would falsify an account of something that happened and make the
event unfindable by its own identifier. They stay.

Note that `backend/src/database/CLAUDE.md` would have been Prettier-formatted on commit, and **is not
here**, because this worktree has no `.husky/_`. If it did need touching, Prettier runs by hand. It
does not need touching, which is the better outcome.

**Deliverability of the new address is unknown and does not block.** Only `dummy@` has ever received
mail at that domain in the shared inbox, so a catch-all and a single configured forward look identical
from here. It does not matter for the showcase: this flow inserts rows and mails the **participants**,
never the demo account. A deliverable `slavko@` is only an escape hatch - request a link for it and
read the mail in `spendifico@gmail.com` - so it is worth one test mail to know whether we have that
hatch, and worth nothing more than that.

**Two operational consequences.** Changing the constant renames nothing that already exists: the new
account appears at the next reset and reseed, and without a reset the environment simply holds both.
And the repo's fixture persona is Marko Kovač per `docs/agents/conventions.md`, from which the showcase
account already diverges as "Showcase User"; "Slavko" is a third invented persona, which stays inside
the no-personal-data rule and is recorded here so nobody later "corrects" it back.

## Vector 4: the AI Assistant against SQL

### What makes this fair rather than a stunt

`MAX_PROMPT_TRANSACTIONS` is **3,000** and the showcase fixture holds **2,249** transactions, so the
account's entire 36-month history goes into every single prompt. The truncation path is unreachable
on this account - the constant's own comment says so. Two consequences, and both matter on stage:

- A wrong answer is a **genuine hallucination**, not a consequence of data the model never saw. That
  is the claim the demo is making, and it is only true because of this margin.
- The questions are **not** period-limited. The budget and caps in the prompt header are the current
  period's, but the transaction rows are the whole account, so the SQL must span all 36 months too.

### The three questions, approved by the product owner

One of each shape, so a wrong answer says something specific about *how* the model failed rather than
merely that it did. The expected answers below were computed from `fixture.data.json` with the
seeder's own `hasHappened` filter applied, which is what makes them predictions rather than hopes -
but the recorded answers still come from the seeded database, for the reason in the ordering section.

**Question 1, a group-by sum over a date window.**

> Which merchant did I spend the most money at in 2025, and how much was it?

Expected: **Riverside Property, EUR 17,400.00**, against a runner-up of EUR 1,740.00 - a tenfold
margin, so nothing borderline is being asked.

Two wording decisions, both of which change what the question measures. "In 2025" rather than "last
year", because "last year" also reads as the trailing twelve months and the two windows have different
answers, which would make a correct reply look wrong. And **"merchant" rather than "store"**, because
the top two are rent and a health provider: "store" invites the model to reinterpret the question and
answer Lidl, which is genuinely third at EUR 1,713.89. That would be an interpretation miss dressed up
as an arithmetic one, and it is not what this demo is measuring. The aside is worth keeping for the
stage though - the single biggest line in a year of spending is rent.

```sql
SELECT merchant, SUM(amount_cents) AS cents, COUNT(*) AS n
FROM transactions
WHERE deleted_at IS NULL
  AND date >= '2025-01-01'
  AND date <= '2025-12-31'
GROUP BY merchant
ORDER BY cents DESC
LIMIT 5;
```

**Question 2, a maximum within a category.**

> What is the most expensive gift I have ever bought, and where and when did I buy it?

Expected: **EUR 319.33 at Gift Gallery on 2026-07-04**, against a runner-up of EUR 114.52. Three
separately checkable facts out of one answer, and a genuine needle in a haystack: 34 gift rows inside
2,220 transactions.

```sql
SELECT t.date, t.merchant, t.amount_cents
FROM transactions t
JOIN categories c ON c.id = t.category_id
WHERE t.deleted_at IS NULL
  AND c.deleted_at IS NULL
  AND c.name = 'Gifts'
ORDER BY t.amount_cents DESC
LIMIT 5;
```

**Question 3, a group-by count within a category.**

> Which merchant do I shop at most often for groceries, and how many times have I been there?

Expected: **Konzum, 90 times**, against Lidl's 68.

This is the most robust of the three, and for a reason worth keeping rather than rediscovering:
"most" is ambiguous between visits and money, and **both readings answer Konzum** - EUR 4,742.95
against Lidl's EUR 4,141.74. So the ambiguity cannot produce a wrong-looking right answer, which is
exactly the failure that would waste the slot. The query returns both figures so the sheet can say so.

```sql
SELECT t.merchant, COUNT(*) AS visits, SUM(t.amount_cents) AS cents
FROM transactions t
JOIN categories c ON c.id = t.category_id
WHERE t.deleted_at IS NULL
  AND c.deleted_at IS NULL
  AND c.name = 'Groceries'
GROUP BY t.merchant
ORDER BY visits DESC
LIMIT 5;
```

**Every query takes `LIMIT 5`, not `LIMIT 1`.** The runner-up is what proves the margin, and "second
place was a tenth of that" is the sentence that makes a right answer credible to a room instead of
merely asserted.

### Where the SQL runs, and when

Against the demo account's **own** user database - `spendifico-user-<uuid>` on Turso Cloud, whose name
comes from the pointer on its central `users` row - through the Turso MCP, since the Turso CLI cannot
address these databases at all.

Ordering, and it is not negotiable: **reset, reseed, then SQL, then the assistant.** The seeder's
`hasHappened` drops current-month rows dated after today, so the account is a function of the day it
was seeded. Recording an expected answer before the final reseed records a fact about a database
nobody will look at.

The three questions were checked against that sensitivity and all three survive it: 2025 is a closed
year and cannot move at all, and the top gift stays EUR 319.33 however late in August the seed runs,
because the two August gift rows are EUR 309.72 and EUR 121.73. Only question 3's exact visit count
drifts, by a row or two, which is precisely why the count is read back from the database rather than
copied from this plan.

### Each question is asked three times, in three separate chats

The model is not deterministic even when the data is, so one right answer proves nothing. Three asks
each, all replies recorded.

**And each ask is a new chat session, not a follow-up in the same thread.** Asked again in one
conversation the model sees its own previous answer in the history and will tend to restate it, so
three asks in one thread measure its consistency with itself rather than the reproducibility of the
answer. That is a different and much less interesting quantity, and the difference is invisible in the
transcript afterwards.

Nine turns fits comfortably inside `CHAT_RATE_LIMIT`, which production sets to 20 an hour.

Each question is recorded in `ai-vs-sql.md` with its SQL, the answer that SQL returned, and all three
replies. Four traps go in beside them:

- **`deleted_at IS NULL`** on every query. Transactions tombstone rather than delete.
- **Amounts are integer cents**, so every expected figure is divided by 100 exactly once.
- **The digest folds a null category onto the account's fallback** via a LEFT join, so a category
  query must fold the same way or the two disagree for a reason that has nothing to do with the model.
- **The model is not deterministic even when the data is.** Each question is asked **three times**
  and all three replies are recorded, because "it was right once" is not a finding.

The answers are computed **after** the final reset and reseed, since the account is rebuilt before
the showcase and every figure moves with it. This is the last thing done, not the first.

## Vector 6: the Figma screens as full-resolution PNGs

Added after planning started, and **done**: all **24** frames of the Screens page exported at their
native 1440x1024 to `docs/.figma/`, named `NN-slug.png` after the frame numbers the tech spec already
cites, so a slide can be matched back to a frame and a requirement ID without opening Figma.

**It is 24 screens, not the whole file, and that is the rule rather than a shortcut.**
`frontend/CLAUDE.md` opens its Figma section with "the Foundations and Components pages are dead. Do
not work from them, for anything." Exporting them would manufacture exactly the artifact that rule
exists to keep out of circulation - a retired token layer and a nine-tile component set, rendered at
full resolution and looking authoritative on a projector. The Screens page is the live one.

**The repo turned out to be a better inventory than the design file.** The Figma MCP's document page
listing answered with one page, `0:1 Cover`, while every frame resolves perfectly well by node id - so
that listing cannot be trusted as an inventory. `docs/project-management/02-tech-spec-personal-expense-tracker.md`
names all 24 frames with their node ids, and `docs/plans/2026-08-05_PET-52_verify-page-and-session-cookie.md`
independently states the page holds 24, which is what confirmed the set was complete. Worth
remembering next time: this project documents its own design file well enough to enumerate it without
a metadata dump, which is also far cheaper than one.

**On "original resolution".** `get_screenshot`'s `maxDimension` is a **cap and not a scale factor**:
passing 4096 for a 1440-wide frame returns 1440, verified on the first export before doing the rest. So
the flag cannot silently upscale into a blurry oversized PNG. `download_assets` with
`defaultFormat: png` and `defaultScale: 1` is the other route to the same bytes, and returns each
node's raw image fills and vector layers alongside, which is cost this needed nothing from.

**Gitignored rather than committed**, by `docs/.gitignore`. They are 2.4 MB, they are regenerable in
about a minute, and the design file owns them. That file is the standing hidden-file rule vector 3
needed anyway, so this vector added no ignore rule of its own - `.figma/` was already covered the
moment the rule existed, which is the argument for a standing rule over a list.

## Vector 5: what turned up while planning

Recorded here rather than fixed silently, because none of it is this ticket's job:

- **The backend deploy is outstanding.** PET-76's own Definition of Done carries an unticked
  "Backend deployed", and it added `GET /api/assistant/sessions/count`. Production is missing that
  endpoint until `mise run deploy-backend` runs, and the History count badge silently does not
  render. Worth clearing before a demo that features the assistant.
- **Hooks do not run in this worktree.** `core.hooksPath` is `.husky/_` and that directory does not
  exist here, so commitlint and Prettier are absent. Commit messages and any `backend/` or
  `frontend/` markdown formatting are self-enforced on this branch.

## Task checklist

**Groundwork**

- [ ] Commit this plan alone, push the branch, open a draft PR with this checklist in its body
- [ ] Rewrite PET-80's description with the acceptance criteria this plan implies

**Vector 1: statistics**

- [ ] `scripts/showcase/stats-repo.sh`: commits, active days, lines added and deleted with comments
      excluded, file and line counts split into code, documentation and generated, and the
      three-way documentation split, all over `a237207..HEAD`
- [ ] `scripts/showcase/stats-delivery.sh`: pull requests from `gh`, into `data/delivery.json`
- [ ] `scripts/showcase/stats-deps.sh`: installed module counts for root, backend and frontend
- [ ] Write `data/tickets.json` from one JQL query, timestamped, and document that it is the one
      agent-refreshed figure
- [ ] `scripts/showcase/build-charts.mjs`: esbuild bundle of the React and Recharts entry, plus the
      `all.data.js` writer
- [ ] Load the `dataviz` skill, then write `docs/showcase/statistics.html` with the Expensa theme
      values inlined and every figure read from `window.__SHOWCASE__`
- [ ] One `mise run showcase:stats` that refreshes every generator and rewrites `all.data.js`
- [ ] Verify the page in a browser, light and dark, at projector size
- [ ] Optional, network permitting: `npx cloc` for the today-snapshot code / comment / blank split,
      as both a cross-check and a statistic of its own

**Vector 2: diagrams**

- [ ] `diagrams/erd.mmd`, both scopes, verified table by table against the two `schema.ts` files
- [ ] `diagrams/deployment.mmd`, all six services plus the deploy workflow
- [ ] `diagrams/login-flow.mmd`, including single use and supersede
- [ ] `scripts/showcase/render-diagrams.mjs`: headless Chromium, SVG and PNG per source
- [ ] `docs/showcase/diagrams.html` embedding the rendered SVGs, with the "lines are logical, not
      enforced" note on the ERD
- [ ] Stretch: database-per-user, and the assistant cancellation path

**Vector 3: login links and the send**

- [x] Establish which account the Gmail connector is authenticated as: `spendifico@gmail.com`,
      confirmed from its own inbox. Superseded by the MailPace decision, kept as the record of it
- [ ] Add `docs/.gitignore` with `.*` and `!.gitignore`, **before** the participants file exists, and
      confirm with `git check-ignore -v` rather than by assumption
- [ ] Establish that `MAILPACE_API_TOKEN` is readable locally, before writing anything that needs it
- [ ] Make `SHOWCASE_EMAIL` an optional argument of the seed script, defaulting to
      `slavko@spendifico.eu`, and set `fullName` to `Slavko` in `generate.ts`
- [ ] `mise run seed:fixture` in **its own commit**, then `mise run seed:check`; a diff larger than the
      one `fullName` line is a finding, not something to commit past
- [ ] `docs/guides/seeding-dummy-data.md` updated; the PET-60 incident records in `docs/TODO.md` and
      `backend/src/database/CLAUDE.md` deliberately left saying `dummy@spendifico.eu`
- [ ] One test mail to `slavko@spendifico.eu` to learn whether the escape hatch exists
- [ ] `backend/src/scripts/invite-showcase.ts`, the five phases above, dry-run by default
- [ ] Its header comment carries the five phases, and at minimum the `issue()` supersede and the
      database-against-base-URL pairing
- [ ] The email template: what Spendifico is, single use, 24 hours, shared demo account, bring
      receipts, and do not use the login form
- [ ] `showcase:invite` and `showcase:invite:cloud` mise tasks, cloud typed out rather than flagged
- [ ] Dry-run it and read every rendered mail
- [ ] Verify one minted link end to end on a plus-address, mail included, before touching a real
      participant address
- [ ] Send the batch
- [ ] `backend/src/scripts/watch-showcase-invites.ts`: reads the ledger, waiting / logged in / broken
      per participant, re-mint and re-send on broken, capped at two re-sends per address, every send
      logged with its reason
- [ ] The watcher prints `ALL PARTICIPANTS LOGGED IN SUCCESSFULLY` when the last row is spent
- [ ] Write the supersede rule into `docs/showcase/README.md` as a rule, not a note

**Vector 4: assistant against SQL**

- [x] Three questions chosen and approved, with expected answers predicted from the fixture and each
      one checked for a clear margin and for seed-date sensitivity
- [x] The three SQL statements written, with the tombstone, cents and category-fold traps handled
- [ ] After the final reseed: run all three against the account's own user database over the Turso MCP
- [ ] Ask each question three times, **each in a new chat session**, and record all nine replies
- [ ] `ai-vs-sql.md`: question, SQL, the figure SQL returned, the three replies, and the verdict

**Vector 6: Figma screens**

- [x] `docs/.gitignore` written, covering `.env.participants` and `.figma/` under one standing rule
- [x] All 24 Screens-page frames exported to `docs/.figma/` at native 1440x1024, verified as 24 files
      and every one the right dimensions
- [x] Foundations and Components pages deliberately not exported, per `frontend/CLAUDE.md`

**Closing**

- [ ] `docs/showcase/README.md`: what to run, in what order, and what each artifact is for
- [ ] `npm run docs:check` green
- [ ] Refresh every statistic against final `main` on the day, and re-verify the page

## What this plan deliberately does not do

- **No product code changes.** The one file touched outside `docs/showcase/` and
  `scripts/showcase/` is the seed script's email constant, and that is an added argument with an
  unchanged default. No DTO, no endpoint, so `npm run api:sync` is not involved.
- **No new runtime dependency, and no new dependency at all.** Recharts and esbuild are installed;
  Mermaid is reached through a pinned build at render time and never becomes a dependency.
- **The database reset and reseed stay PET-75's steps.** This ticket consumes their result and does
  not own their timing.
- **PET-75's AI prank is out of scope.** It belongs to the outro, not to preparation.
