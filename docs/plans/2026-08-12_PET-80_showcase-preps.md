# PET-80: Showcase preps

**Ticket:** [PET-80](https://decode.atlassian.net/browse/PET-80) - Showcase preps
**Serves:** [PET-75](https://decode.atlassian.net/browse/PET-75) - Prezentacija
**Branch:** `chore/PET-80-showcase-preps`

Everything the showcase needs that is not a slide. PET-75 owns the running order and what the audience
sees; this plan builds the artifacts it points at.

**Scope rule for this document: it carries what changes what we build or what we do on the day.**
Things discovered along the way that turned out not to matter for the showcase are deliberately not
recorded here.

## The constraint that shapes all of it

The showcase is **today**, and coding continues for hours after this plan lands. So:

**No number is ever typed into a document.** A script computes it into JSON, a page renders the JSON.
Refreshing the whole statistics set is then one command run minutes before the talk, and a refresh
cannot break a page, because no page contains a figure of its own.

## Where it all lives

    docs/showcase/
      README.md            what to run, in what order
      statistics.html      the charts, rendered from data/*.json
      diagrams.md          the Mermaid sources, rendered by GitHub
      ai-vs-sql.md         the assistant questions, their SQL, the recorded answers
      data/*.json          generated, committed, refreshed on the day
      .participants        the invite list. Gitignored, never committed
    scripts/showcase/      the generators, which open no database
    backend/src/scripts/   invite-showcase.ts and its watcher, which do

The split is by dependency, not topic: **anything that opens a database lives in
`backend/src/scripts/`** beside `seed-showcase.ts`, because it needs the central-database client, the
two Turso drivers, `newId()` for the UUIDv7 key, and the local-against-cloud env loading. The
statistics generators need none of that.

---

## Vector 1: statistics

### What gets counted

**Two commits are excluded, not one.** `a237207`, the initial commit, is the template the repo was
created from. `ab73abd` is the academy's own project-management docs - the student handout, the brief and
the tech spec, 644 lines by a third author who did nothing else here. Both are **inputs to the project
rather than output of it**, which is the same reasoning for both, and excluding the second one also
makes the per-author split genuinely two-way rather than two-way with an invisible third slice.

**Activity**

- Commits, and how they fall across the calendar
- Active days, meaning days with at least one commit
- Merged pull requests, and how many were opened in total
- Jira tickets and epics, by type and by status

**Size of the result**

- Total lines today, comments and blanks excluded, split three ways: hand-written code,
  documentation, and generated-or-vendored
- Comment density, as comment lines against code lines
- Documentation split: `docs/plans/`, agent files, and all other docs
- Agent files: how many, and how many lines

**Weight of the dependency tree**

- Installed packages today, per `package.json` tree, and the same count at the initial commit

**Shape of the thing built**

- Database tables, across the two scopes
- API operations, and how many paths they sit on
- Committed migrations
- Tests, across the three suites

**Who did what**

- Commits, merged pull requests and surviving lines, each split between the two authors
- The same work split by **area**, backend against frontend against documentation, per author

### Attribution: by blame, and by area as well as by author

**"Lines by author" means surviving lines, via `git blame`**, not lines added. It answers "whose code
is in the repo now", which is consistent with the headline decision above to report the snapshot rather
than the churn. One caveat to state rather than hide: refactoring somebody else's file transfers those
lines to you, which is the honest answer to the question asked but not the same as "who typed more".

**One pie per metric, two slices, the same two colours throughout.** That is the one thing a pie does
well, and the split is balanced enough to be worth drawing: commits run about 59 to 41, merged pull
requests 61 to 39, and lines added 52 to 47.

**But the ratios are so close across metrics that three pies tell one story three times**, which is why
the area split earns its own chart. Measured on additions with generated files excluded, it is
genuinely complementary rather than competitive: one author's work is overwhelmingly frontend, the
other's is backend first and documentation second, and both crossed over. It is also the only chart on
the page a viewer cannot predict from the others, and it matches the running order PET-75 sets out,
where the two of you present the two halves.

**Two honesty notes, both belonging on the page rather than in this plan only.** Attribution is by
**committer**, which on this project means who ran the session rather than who typed the lines. And
author display names are already public in the git history so using them is fine, but **no email
address goes into the committed JSON**.

### How lines get measured, which was an open question

Three different numbers get called "lines of code" and they answer different questions. The decision
here, and the reasoning, because a presentation partly about how this repo was built should be able to
say how its own numbers were arrived at:

**The headline is the current size, not the churn.** "Total lines today, comments excluded" answers
"how big is this thing", and it is the number that can be measured *accurately*: a snapshot sees whole
files, so a block comment can be tracked properly from `/*` to `*/`. A diff cannot, because it only
shows the lines that changed, so classifying an added line as code or comment is guesswork at the
edges.

**Churn is reported separately and labelled as activity.** Lines added plus lines deleted over the
whole history is a measure of *work done*, not of size: a line written on Tuesday and rewritten on
Friday counts three times, which is correct for effort and wrong for size. It gets stated as "lines
written and rewritten", never as "lines of code".

**Net is not presented at all.** Added minus deleted approximately equals the current size, but it
will not reconcile exactly, because of deleted files, renames and binary content. Putting a number on
a slide that invites the audience to check arithmetic that does not quite add up costs more
credibility than the number is worth. Two honest figures beat three that argue with each other.

**Generated and vendored files are their own bucket, never counted as hand-written code.** That is the
exact set root `CLAUDE.md` forbids hand-editing: the three `package-lock.json` files,
`backend/openapi.json`, `frontend/src/types/api.d.ts`, `backend/drizzle/**`, `.agents/skills/**` and
`backend/src/scripts/showcase/fixture.data.json`. Folded in, the lockfiles alone dwarf everything else
and the interesting figure disappears. Split out, the split is itself worth showing.

**Documentation is a bucket, not a subtraction.** This repo has an unusual ratio and the chart should
show it head on rather than implying it.

### How package counts get measured

**From the `package-lock.json` files, not from `node_modules`.** A lockfile enumerates every transitive
package, so the count is reproducible on any machine and, more importantly, **the same method works at
the initial commit**, where nothing is installed. `git show a237207:package-lock.json` against the
current file is the whole comparison, and it is the honest way to say "the template shipped with N,
we finished with M".

### The sources, and the one that is not a script

| Data | Source | Refreshed by |
| --- | --- | --- |
| commits, active days, churn, line and file counts | `git log`, `git ls-files` | `scripts/showcase/stats-repo.sh` |
| merged and total pull requests | `gh pr list --json` | `scripts/showcase/stats-delivery.sh` |
| package counts, now and at the initial commit | the three `package-lock.json` files | `scripts/showcase/stats-deps.sh` |
| tables, API operations, migrations | the two `schema.ts` files, `backend/openapi.json`, `backend/drizzle/` | `scripts/showcase/stats-shape.sh` |
| tests | the three suites | `scripts/showcase/stats-tests.sh`, optional: it runs them |
| Jira tickets and epics | the Atlassian MCP | **an agent step, not a script** |

Two notes on that table. The ticket counts are written by an agent running one JQL query, because
there is no Jira CLI here and the MCP is not reachable from a shell script; the JSON carries the
timestamp it was written at so a stale count cannot pass as fresh. And the test counts need the suites
to actually run, which takes minutes, so that generator is separate and optional rather than part of
the one-command refresh.

### How the charts get drawn

**Recharts, the repo's own chart library, bundled locally with esbuild.** Recharts ships a UMD bundle
that expects `React` as a global and React 19 ships no UMD build, so a plain page loading both from
disk renders a blank chart area. `esbuild` is already installed in both apps, so
`scripts/showcase/build-charts.mjs` bundles a small React entry into one file that a plain `<script>`
loads. No CDN, and therefore no dependency on the room's wifi.

**The data loads as a script, not a fetch.** A page opened over `file://` cannot `fetch` a sibling JSON
file. The build writes `data/all.data.js`, one `window.__SHOWCASE__ = {...}` assignment, from the JSON.
So refreshing means re-running the generators and rewriting that one file, never re-bundling.

**Theme values are inlined** the way the six `docs/explainers/*.html` pages already do it, so the page
looks like the product.

### Which chart for which number

**Load the `dataviz` skill before writing any chart code.** It is the authority on palette and
chart-type choice, and this is a chart-dense page projected onto a wall.

The proposal, and it deliberately uses a pie for one thing only:

| Surface | Chart | Why this one |
| --- | --- | --- |
| Commits, merged PRs and surviving lines, per author | **One pie each, two slices** | Part-of-a-whole with two slices is exactly what a pie can carry, and the same two colours across all three make the set readable at a glance |
| Work by area, per author | **Stacked bar** | The one chart nobody can predict from the others, and the one that reads as a partnership rather than a scoreboard |
| Code / documentation / generated | **Donut** | A genuine part-of-a-whole with three slices |
| Documentation split, and packages per tree | **Bars** | Comparing magnitudes. Length is easy to compare, angle is not, and these carry more slices than a pie can |
| Commits across the calendar | **Area** | The history is short and dense, and the shape over time is the point |
| Commits, PRs, tickets, tables, endpoints, active days | **Stat tiles** | A single number is not a chart, and six of them in a row read faster than six charts |

**One pie, several bars.** A pie cannot show a comparison, cannot carry more than about five slices,
and cannot be read precisely. Anything that is "how does A compare to B" becomes a bar.

### Also worth measuring, on current evidence

Measured while writing this plan, so the numbers are real and the ones that are duds have already been
dropped:

- **16 active days**, from 2026-07-27 to 2026-08-12. Against the volume of everything else, this is
  probably the single strongest number on the page, and it frames every other one.
- **16 database tables** across two scopes, and **29 API operations** across 22 paths, both read
  straight out of committed artifacts.
- **Comment density.** This repo comments unusually heavily and deliberately; a bar of code against
  comments says something true about how it was built that no other number here says.
- **The biggest single document.** `docs/TODO.md` is most of the non-plan documentation on its own,
  which is a better way to make the point than a total.
- **Tests**, if the suites are run: roughly four thousand across the three of them.

Considered and rejected: lines per commit and average commit size, which say nothing; and anything
counting Claude Code sessions or tokens, which cannot be measured from the repository.

---

## Vector 2: diagrams

**Drafted, reviewed and approved.** They live twice over, deliberately: `docs/showcase/diagrams.md` is
the combined page GitHub renders, and each diagram is also its own source file under
`docs/showcase/diagrams/` for rendering one at a time onto a slide. The two ER diagrams are separate
files rather than one, because two schemas on a single slide are not legible at projector size.

GitHub renders Mermaid inside a markdown fence but **not** a bare `.mmd` file, so the combined page
stays the place to read them while the separate sources are what a renderer consumes. That duplication
is real and is the argument for the PNG export below, which would make the `.mmd` files the single
source and the images the only thing a slide touches.

What is drawn:

1. **The data model, both scopes.** Two ER diagrams rather than one, because "every user gets their own
   database" is the architectural claim being made. It states in prose that **the relationship lines are
   logical, not enforced** - neither schema declares a foreign key, because the Turso engine has
   `PRAGMA foreign_keys` off per connection. Mermaid draws relationships as if they were constraints,
   so saying so is what keeps the diagram honest.
2. **Deployment and infrastructure.** Vercel, Fly.io, Turso Cloud with the central database plus one per
   user, MailPace, Porkbun, Gemini, and the two GitHub Actions workflows.
3. **Passwordless login**, as a sequence diagram, including the two things people ask about: a link is
   single use, and issuing one supersedes every unused link for that account.

**Still open:** whether PNG export is wanted. If it is, a script drives the Chromium already on this
machine and writes an `.svg` and a `.png` beside each source, committed, so nothing needs Mermaid or a
network at presentation time. Mermaid never becomes a dependency of this repo either way.

**Candidates not drawn:** one database per user from registration to first open, and the assistant's
three-hop cancellation path.

---

## Vector 3: emailed 24-hour login links

### The mechanism

Three facts from `backend/src/auth/login-token.service.ts` decide this whole vector.

**One account can hold many simultaneously valid links.** `consume()` marks only the row whose hash
matched and touches no sibling, so N rows inserted directly all work, each independently single-use.
One prepared link per participant into one shared demo account needs no per-person account.

**Clicking a link does not invalidate anybody else's.** Ten participants can open their links in the
same second and all ten succeed. `superseded_at` has exactly **one** writer in the backend,
`LoginTokenService.issue()`, and `issue()` has exactly **one** caller, the login-link request. The
verify path calls only `consume()`. So **nothing here needs to be serialized**: all the mail goes out
at once.

**The 24-hour lifetime is a stored column.** `expires_at` is an absolute timestamp and `consume()` only
compares it against now. But the rows must be **inserted rather than minted and patched**: `issue()`
hands the raw token to the mailer and stores only its hash, so a link created through the app is one
whose token we can never learn.

`LOGIN_LINK_TTL_M` stays at its 15-minute default. The 24 hours is a value in our own rows, not a
change to how every real login behaves.

### The one hazard, and what it does not touch

**`issue()` supersedes every unused row for that user in one statement.** So somebody submitting the
login *form* for the demo address kills every not-yet-clicked link at once, silently. The likely path
is a participant who lost the mail or clicked after expiry and sensibly tries to request a new one.

It does not touch anyone already logged in: the supersede matches `used_at IS NULL`, and a session
lasts 30 days regardless.

**Prevention, which is cheaper than recovery:**

- The email says: click the link, do not use the login form, and message us if it fails.
- Links are minted the **morning of** the event, so 24 hours covers it with margin.
- If the login flow is demonstrated live, it is demonstrated on a plus-address such as
  `spendifico+demo@gmail.com`, never the demo account. That inbox already receives plus-addressed mail,
  so this is an established trick rather than a new one.
- `docs/showcase/README.md` carries this as a rule, not a note.

### Throttling is not in the way

Ten participants in one room share one public IP, so this is worth settling rather than assuming.
`POST /api/auth/verify` is guarded by the **ip** throttler only - it carries
`@SkipThrottle({ email: true })`, so ten links pointing at one shared address costs nothing. Production
sets `AUTH_RATE_IP_LIMIT = 150` per 900 seconds, and `TRUST_PROXY_HOPS = 2` so `req.ip` is the real
caller rather than Fly's proxy. Ten clicks, or twenty with retries, sit far under it.
`GET /api/auth/session` skips both throttlers.

### The script: `backend/src/scripts/invite-showcase.ts`

**Two mise tasks rather than one flag**, copying `seed` and `seed:cloud`: a mistaken local run writes a
throwaway file, a mistaken cloud run mails real people, so reaching production is typed out.

`mise run showcase:invite:cloud -- --send`

**Phase 1, preflight. Reads everything, writes nothing, stops on the first fault.** Every failure it
catches is one a participant would otherwise catch.

1. Read `docs/showcase/.participants`, one address per line, ignoring blanks and `#` comments. Trim,
   lowercase, de-duplicate, reject anything not shaped like an address.
2. Resolve the demo account in `users` and take its id. **Not found, stop** - links for a user that does
   not exist authenticate nothing.
3. If `--send`, require `MAILPACE_API_TOKEN` and `MAIL_FROM` now, not after the rows exist.
4. Print the plan and pause: how many addresses and which, the account and its id, **which database**,
   **which base URL**, the exact expiry instant, and the from address.

   Step 4 is the trap this is built around: the database target and the link base URL are independent
   settings, so **a run that mints rows in Turso Cloud while building `http://localhost:4200` links is a
   complete success that delivers nothing usable**, and the reverse fails identically. Nothing
   downstream can detect it, so the two are printed together and confirmed before any write.

**Phase 2, mint. One transaction, all participants, or nothing.**

5. Per address: 32 random bytes as base64url, its hex SHA-256 as `token_hash`, `newId()` for the id,
   `expires_at` at now plus 24 hours, `used_at` and `superseded_at` null.
6. Insert **directly into `login_links`** in a single transaction. Never through `LoginTokenService`,
   whose `issue()` would supersede every sibling it just created.

   Atomic because a half-finished mint is worse than a half-finished send: an unreceived link merely
   expires, while a missing row is a person with no way in and no error to explain it.

**Phase 3, the ledger, written before the first email.**

7. One JSON file **outside the working tree** holding, per participant: address, `login_links.id`,
   expiry, raw link, and `sent: false`. This is what makes a crash mid-send resumable and what the
   watcher reads to know which rows are ours. It holds live credentials, hence outside the tree rather
   than merely gitignored.

**Phase 4, send. Sequential, one failure does not stop the rest.**

8. Per participant, `POST https://app.mailpace.com/api/v1/send`, from `MAIL_FROM`, one address, one
   link. Mark `sent` on success.
9. A rejected address is recorded with its error and the run continues, because aborting the batch over
   one bounce leaves the room half-invited with no record of which half.

**Phase 5, report.** Address against minted against sent, the expiry instant, the login-form rule, and
**the exact watcher command to paste next**.

**Without `--send`, phases 2 to 4 do not happen.** The dry run does the full preflight, renders one
complete email with an obviously fake token, lists every recipient, and writes nothing anywhere. It is
the default, and it is what replaces a draft-review step.

**The script carries this walkthrough as its header comment**, in the voice `seed-showcase.ts` and
`mise.toml` already use. Two comments are non-negotiable because both encode a failure invisible at the
call site: the `issue()` supersede, and the database-against-base-URL pairing. A plan is read once
before the work; a script header is read by whoever runs it at 20:00 with a room waiting.

### MailPace, not Gmail drafts

The Gmail connector exposes `create_draft` and `update_draft` and **no send tool**, which puts a human
keystroke between every mint and every delivery. Tolerable for the first batch, not for the watcher's
re-sends.

So the script posts to MailPace directly, from `login@spendifico.eu`, which MailPace has authorized,
whose DKIM is real, and whose replies forward to `spendifico@gmail.com` so a participant who replies
reaches a human. Three things it needs:

- **`MAILPACE_API_TOKEN` readable locally.** Fly secrets are write-only, so if it lives only there it
  has to come from the MailPace dashboard or an existing `backend/.env`. Establish this before writing
  the sender.
- **Its own template** in `scripts/showcase/`, not the app's transactional login mail.
- **`--send` off by default.**

### The watcher

`backend/src/scripts/watch-showcase-invites.ts` reads the ledger, polls those rows every 30 seconds, and
reports each participant as **waiting**, **logged in** (`used_at` set) or **broken** (`superseded_at`
set). On a broken row it mints a replacement and re-sends, unattended, because the send is MailPace.
Two guards, since an auto-sender that loops is worse than a dead link: at most two re-sends per
address, and every send logged with its reason.

It is also a live dashboard of who has logged in, which is otherwise invisible. **And it has an
ending:** when the last ledger row flips to `used_at` it prints `ALL PARTICIPANTS LOGGED IN
SUCCESSFULLY` and exits zero. A product-owner request, kept verbatim, because the point is that the
room sees it.

### Secrets and personal data

- **`docs/showcase/.participants`** holds the addresses, one per line. Ignored by `docs/.gitignore`,
  which ignores every hidden file under `docs/` at any depth. A standing rule rather than a named
  exception, so the next local input file needs no edit.
- **The minted links go outside the working tree.** A gitignored secret is still a secret sitting in a
  directory people screen-share from.
- Committed copy carries a placeholder address only.

### The demo account becomes Slavko

`fullName` becomes `Slavko` and the address `slavko@spendifico.eu`. Measured cost: two lines, one
regenerated artifact, one guide.

- `SHOWCASE_EMAIL` in `backend/src/scripts/seed-showcase.ts`, which this plan already turns into an
  argument, so the rename is that edit with a different default.
- `fullName` in `backend/src/scripts/showcase/generate.ts`.
- **`fixture.data.json` is regenerated, never hand-edited**: `mise run seed:fixture`, **its own
  commit**, then `mise run seed:check`. The diff is expected to be the one `fullName` line, because the
  name feeds no part of the spending model. A larger diff is a finding about the generator, not
  something to commit past.
- `docs/guides/seeding-dummy-data.md` changes. The `dummy@spendifico.eu` mentions in `docs/TODO.md` and
  `backend/src/database/CLAUDE.md` are **incident records** of PET-60's replica bug and stay as they
  are: editing them to match a later rename would falsify an account of something that happened.
- No spec mentions either string, so no test changes.

**Deliverability of the new address does not block anything**, because this flow mails the
**participants**, never the demo account. A deliverable `slavko@` is only an escape hatch - request a
link for it and read the mail in the shared inbox - so it is worth one test mail and nothing more.

Changing the constant renames nothing that exists: the new account appears at the next reset and
reseed.

---

## Vector 4: the AI Assistant against SQL

### What makes this fair rather than a stunt

`MAX_PROMPT_TRANSACTIONS` is **3,000** and the showcase account holds **2,249** transactions, so the
entire 36-month history goes into every prompt and the truncation path is unreachable. Two
consequences:

- A wrong answer is a **genuine hallucination**, not a consequence of data the model never saw.
- The questions are **not** period-limited. The budget and caps in the prompt header are the current
  period's, but the transaction rows are the whole account.

### The three questions, approved

Expected answers were computed from `fixture.data.json` with the seeder's `hasHappened` filter applied,
so they are predictions. The recorded answers still come from the seeded database.

**1. A group-by sum over a date window.**

> Which merchant did I spend the most money at in 2025, and how much was it?

Expected: **Riverside Property, EUR 17,400.00**, against a runner-up of EUR 1,740.00.

"In 2025" rather than "last year", because "last year" also reads as the trailing twelve months and the
two windows disagree. **"Merchant" rather than "store"**, because the top two are rent and a health
provider: "store" invites the model to reinterpret the question and answer Lidl, genuinely third at
EUR 1,713.89, which would be an interpretation miss dressed up as an arithmetic one.

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

**2. A maximum within a category.**

> What is the most expensive gift I have ever bought, and where and when did I buy it?

Expected: **EUR 319.33 at Gift Gallery on 2026-07-04**, runner-up EUR 114.52. Three checkable facts
from one answer, and a needle in a haystack: 34 gift rows inside 2,220 transactions.

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

**3. A group-by count within a category.**

> Which merchant do I shop at most often for groceries, and how many times have I been there?

Expected: **Konzum, 90 times**, against Lidl's 68. The most robust of the three: "most" is ambiguous
between visits and money and **both readings answer Konzum** (EUR 4,742.95 against EUR 4,141.74), so
the ambiguity cannot produce a wrong-looking right answer.

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

**Every query takes `LIMIT 5`, not `LIMIT 1`.** The runner-up proves the margin, and "second place was
a tenth of that" is what makes a right answer credible to a room rather than merely asserted.

### Where and when

Against the demo account's **own** user database, `spendifico-user-<uuid>` on Turso Cloud, through the
Turso MCP, since the CLI cannot address these databases.

**Reset, reseed, then SQL, then the assistant.** `hasHappened` drops current-month rows dated after
today, so the account is a function of the day it was seeded, and an expected answer recorded before
the final reseed describes a database nobody will look at. All three questions were checked against
that: 2025 is a closed year, and the top gift holds at EUR 319.33 however late in August the seed runs.
Only question 3's visit count drifts by a row or two, which is why it is read back rather than copied
from here.

### Three asks each, in three separate chats

The model is not deterministic even when the data is, so one right answer proves nothing.

**Each ask is a new chat session, not a follow-up.** In one conversation the model sees its own previous
answer and will tend to restate it, so three asks in one thread measure its consistency with itself
rather than the reproducibility of the answer - a different and much less interesting quantity, and one
that looks identical in the transcript afterwards. Nine turns fits inside `CHAT_RATE_LIMIT`, which
production sets to 20 an hour.

### Four traps in the SQL

- **`deleted_at IS NULL`** everywhere. Transactions tombstone rather than delete.
- **Amounts are integer cents**, divided by 100 exactly once.
- **The digest folds a null or dangling category onto the fallback** via a LEFT join, so a category
  query must fold the same way or the two disagree for a reason that has nothing to do with the model.
- **Merchant is free text** and goes to the model verbatim, so grouping is on the exact string.

---

## Vector 5: outstanding, and not this ticket's to fix

- **The backend deploy is outstanding.** PET-76's Definition of Done carries an unticked "Backend
  deployed", and it added `GET /api/assistant/sessions/count`. Production lacks that endpoint until
  `mise run deploy-backend` runs, and the History count badge silently does not render. Worth clearing
  before a demo that features the assistant.

## Vector 6: Figma screens, done

All 24 frames of the Screens page exported at native 1440x1024 and handed over; they now live outside
the repository. Foundations and Components were **not** exported, because `frontend/CLAUDE.md` declares
both pages dead, and a full-resolution render of a retired token layer looks authoritative on a
projector in a way that would actively mislead.

---

## Task checklist

**Groundwork**

- [x] Commit the plan alone, push, open a draft PR with this checklist in its body
- [ ] Rewrite PET-80's description with the acceptance criteria this plan implies

**Vector 1: statistics**

- [ ] `stats-repo.sh`: commits, active days, churn, and the snapshot line counts split into code,
      documentation and generated, plus the three-way documentation split. Excludes both `a237207` and
      `ab73abd`
- [ ] `stats-authors.sh`: commits, merged PRs and **`git blame` surviving lines** per author, plus the
      area split. Display names only, no email addresses in the JSON
- [ ] `stats-delivery.sh`: merged and total pull requests
- [ ] `stats-deps.sh`: package counts from the three lockfiles, now and at `a237207`
- [ ] `stats-shape.sh`: tables, API operations, migrations
- [ ] `stats-tests.sh`, optional and separate because it runs the suites
- [ ] `data/tickets.json` from one JQL query, timestamped, tickets and epics
- [ ] `build-charts.mjs`: the esbuild bundle and the `all.data.js` writer
- [ ] Load the `dataviz` skill, then write `statistics.html`: three two-slice pies per author, one
      stacked bar by area, one donut, several bars, one area chart, a row of stat tiles
- [ ] One `mise run showcase:stats` that refreshes everything and rewrites `all.data.js`
- [ ] Verify in a browser, light and dark, at projector size

**Vector 2: diagrams**

- [x] `docs/showcase/diagrams.md` with the ERD for both scopes, the deployment map and the login flow
- [x] Reviewed and approved by the product owner
- [x] Each diagram also as its own source under `docs/showcase/diagrams/`, four files
- [ ] Decide whether PNG export is wanted; if so, the Chromium render script, which also collapses the
      combined page and the separate sources back to one source of truth
- [ ] Optional: database-per-user, and the assistant cancellation path

**Vector 3: login links and the send**

- [x] `docs/.gitignore`, confirmed with `git check-ignore -v`
- [ ] `docs/showcase/.participants` supplied
- [ ] Establish that `MAILPACE_API_TOKEN` is readable locally
- [ ] `SHOWCASE_EMAIL` becomes an argument defaulting to `slavko@spendifico.eu`; `fullName` becomes
      `Slavko`
- [ ] `mise run seed:fixture` in its own commit, then `mise run seed:check`
- [ ] `docs/guides/seeding-dummy-data.md` updated, the two PET-60 incident records left alone
- [ ] `invite-showcase.ts`, five phases, dry-run by default, header comment carrying the walkthrough
- [ ] The email template
- [ ] `showcase:invite` and `showcase:invite:cloud`
- [ ] Dry-run and read every rendered mail
- [ ] End-to-end test on a plus-address before any real participant address
- [ ] Send the batch
- [ ] `watch-showcase-invites.ts`, including the completion line
- [ ] The supersede rule written into `docs/showcase/README.md` as a rule

**Vector 4: assistant against SQL**

- [x] Three questions approved, expected answers predicted, margins and seed-date sensitivity checked
- [x] The three SQL statements written
- [ ] After the final reseed: run all three over the Turso MCP
- [ ] Ask each question three times, each in a new chat session
- [ ] `ai-vs-sql.md`: question, SQL, the figure, the three replies, the verdict

**Closing**

- [ ] `docs/showcase/README.md`
- [ ] `npm run docs:check` green
- [ ] Refresh every statistic against final `main` on the day

## What this deliberately does not do

- **No product code changes.** The only file touched outside `docs/showcase/`, `scripts/showcase/` and
  `backend/src/scripts/` is the seed script's email constant, an added argument with a default. No DTO,
  no endpoint, so `npm run api:sync` is not involved.
- **No new dependency of any kind.** Recharts and esbuild are installed; Mermaid is reached through a
  pinned build at render time only if PNG export is wanted.
- **The reset and reseed stay PET-75's steps.** This ticket consumes their result.
- **PET-75's AI prank is out of scope.** It belongs to the outro.
