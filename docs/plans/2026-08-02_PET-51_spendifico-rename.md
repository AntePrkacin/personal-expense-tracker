# PET-51: rename Expensa to Spendifico

## Context

Decided on 2026-08-02 and tracked as
[PET-51](https://decode.atlassian.net/browse/PET-51). Two forcing reasons: an app named Expensa
already exists on Google Play, and the transactional-mail domain was registered under the
new name, so `spendifico.eu` is the WWW home and `login@spendifico.eu` the official
sender, with replies forwarded to `spendifico@gmail.com`.

The mail infrastructure therefore already speaks Spendifico while the login email and the
OpenAPI document still say Expensa. Today that email arrives **from** "Spendifico" with the
subject "Your Expensa login link", and it is the one email a stranger has to trust enough to
click, so the copy rename should not wait long.

First written against `feat/PET-13-login-links` and rewritten on 2026-08-04 against `main`,
by then five tickets further along: PET-13, PET-14, PET-50, PET-27 and PET-18 have all
landed. Three claims of the first draft were stale and are corrected below - the frontend
half is already done, the OpenAPI title has arrived and is now in scope, and the
`docs/TODO.md` sketch gets **rewritten** rather than removed. The file was renamed to the
`YYYY-MM-DD_PET-{number}_{slug}` pattern CLAUDE.md documents at the same time.

**Revised again later the same day to take the database naming too.** Both earlier drafts
filed `USER_DB_NAME_PREFIX` as out of scope, on the reasoning that changing it silently
strands every existing user's data. That reasoning is sound and unchanged; what changed is
that the premise was checked rather than assumed. Live Turso, 2026-08-04: the group
`decode-pet` holds exactly one database, `expensa-app`, and `select count(*) from users`
against it returns **0**. There are no per-user databases and no rows pointing at any, so
there is nothing to strand. The naming half is now in scope, and it is the last chance to
take it cheaply - see the closing-window caveat under it.

## Already Spendifico, nothing to do

`MAIL_FROM=login@spendifico.eu`, `MAIL_FROM_NAME=Spendifico` and the
`spendifico@gmail.com` smoke-test inbox were set up under the new name from the start. No
DNS, DKIM or sender change is needed, and the README's "Sending real email" procedure is
already correct.

**The frontend half landed with PET-18.** `frontend/src/components/ui/Sidebar.tsx` renders
the wordmark as "Spendifico", `frontend/src/app/layout.tsx` carries it as the `<title>`
(the first draft of this plan still expected "Decode Academy Demo" there), and
`Sidebar.test.tsx` pins it so the deliberate divergence from Figma cannot be half-reverted.
No string in `frontend/` needs to change. What it does need is comment maintenance, below:
three of those comments describe the backend half as not yet moved.

## Commit 1: user-facing copy and the tests that pin it

All of it is a find-and-replace except the `docs/TODO.md` rewrite.

- `backend/src/mail/login-link.template.ts`: the subject becomes "Your Spendifico login
  link" and the body link text "Log in to Spendifico".
- The tests pinning that copy: `backend/src/mail/log.mailer.spec.ts`,
  `backend/src/mail/mailpace.mailer.spec.ts` and `backend/test/auth.e2e-spec.ts`.
- `backend/src/openapi.document.ts`: "Expensa API" and "The HTTP contract of the Expensa
  backend." Then `npm run api:sync` from the repo root, which rewrites `info.title` and
  `info.description` in `backend/openapi.json`. `frontend/src/types/api.d.ts` is not
  expected to move, because `openapi-typescript` emits nothing from `info` - but run the
  full sync anyway, since the two CI drift gates are per-app and a stale `openapi.json`
  fails the backend one. This arrived with PET-50, which the first draft listed as an
  in-flight branch to be picked up by whichever landed second; PET-50 landed first, so this
  is that pickup.
- `README.md`: the sample LogMailer output line quoting the old subject.
- `docs/project-management/01-brief-personal-expense-tracker.md` (the one-line pitch) and
  `02-tech-spec-personal-expense-tracker.md` (WEL-1, BUD-1, REG-1, LOG-1, VER-1, DSH-1 and
  SET-2 all reference the "Expensa logo" or "used across Expensa", plus the
  `avatarInitials` row of the data-model table). Both docs claim to transcribe the Figma
  frames, and the file still draws the old logo, so the tech spec gains **one caveat line**
  beside its existing **Source:** note recording that. Without it, renaming quoted design
  copy silently makes a transcription doc disagree with what it transcribes.
- Throwaway fixtures, whose values nothing outside a test reads: the `expensa-e2e-`
  temp-dir prefix in `backend/test/setup-e2e.ts`, `expensa-openapi-` in
  `backend/src/openapi.env.ts`, `/tmp/expensa-test` in
  `backend/src/database/user-database.service.spec.ts`, and `hello@expensa.test` in
  `backend/src/mail/mailpace.mailer.spec.ts`, which already asserts a `"Spendifico" <...>`
  sender against that address.
- `SYNC_CLIENT_NAME` (`backend/src/database/database.constants.ts`) becomes
  `spendifico-backend`. It is sent to Turso as the sync client identity and nothing keys on
  it here, but it does reach live Turso Cloud in cloud mode, so a green unit suite does not
  prove it out - see the cloud step under Verification. Commit 2 renames the control-plane
  token to the same string, so **do not** write a comment here explaining a deliberate
  divergence from it; an intermediate draft of this plan did, and it would be false by the
  end of the ticket.
- The rest of `docs/plans/` and all of `docs/reviews/` stay untouched: they are dated
  historical records.

## Commit 2: persisted database naming

Separate commit, because it is the only part with a blast radius: it is a string change in
the repo plus an ops action against live Turso, and keeping it on its own commit is what
makes it revertable without taking the copy rename with it.

### Why this is now a rename and not a migration

Both earlier drafts were right about the mechanism. `USER_DB_NAME_PREFIX` feeds
`userDbName(id)`, which derives **both** the remote Turso database name and the local file
path, and the result is persisted in `users.db_name`. Change the prefix with real users in
place and every existing account's derived name stops matching the database that exists:
`getUserDb` creates a fresh empty local file instead of opening the synced one, and
`deleteUserDb` - which derives the name from the id on purpose, because its caller may have
no row to read - targets a database that is not there. Nothing errors loudly.

What makes it free today is that the set of affected users is empty, verified rather than
assumed:

- `list_databases` over the org returns exactly one database, `expensa-app` (group
  `decode-pet`, engine `tursodb`). No `expensa-user-*` exists.
- `select count(*), count(db_url) from users` against it returns `0, 0`. No row names a
  per-user database, provisioned or otherwise.
- `backend/databases/` is gitignored and recreated from the migrations, so every local file
  is disposable by construction.

**Confirm both of those again immediately before starting**, and stop if either is
non-empty: a single verified account turns this commit back into the migration the earlier
drafts refused, and the check costs one MCP call.

### The change itself

- `USER_DB_NAME_PREFIX` becomes `spendifico-user-`, and its doc comment with it.
  `userDbName(id)` stays **derived**, which is the design and is not what is being revisited
  here: deriving is what lets registration's compensation path delete a database when the
  central insert is the thing that failed. Nothing in `UserDatabaseService` changes.
- **No migration.** `users.db_name` is a `text` column and nothing in `drizzle/central/`
  mentions the prefix, so `npm run db:generate` must produce an empty diff. If it wants to
  write a migration, something other than a string changed and this commit is wrong.
- Comments asserting the old name: `backend/src/database/central/schema.ts` (the `db_name`
  comment and the example hostname on `db_url`) and
  `backend/src/database/turso-client.factory.ts` (its example hostname).
- Specs that pin the derived name: `backend/src/auth/verification.service.spec.ts`,
  `backend/src/database/user-database.service.spec.ts`,
  `backend/src/users/users.service.spec.ts`, `backend/test/auth.e2e-spec.ts` and
  `backend/test/verify.e2e-spec.ts`. `backend/src/database/turso-platform.service.spec.ts`
  carries the most hits (21) but pins nothing: that service takes the name as an argument,
  so they are fixture strings, renamed only so a grep for the old name comes back clean.
- Local state, once per developer: `rm -rf backend/databases`. That is the entire local
  migration. Anyone with a filled-in `.env` also loses their dev account and re-registers.

### The two hand-made Turso resources

Both are ops actions rather than edits, and both are cheap for the same reason as above: the
central database holds no rows worth moving.

1. Re-check the inventory (`list_databases`, and `count(*) from users`). Stop if either grew.
2. `turso db create spendifico-app --group decode-pet --tursodb`. The flag is **mandatory
   and undocumented**, the engine is fixed at creation, and getting it wrong is silent - the
   long-form reasoning is in README.md and CLAUDE.md.
3. `turso db show spendifico-app --url` and `turso db tokens create spendifico-app` into
   `TURSO_CENTRAL_DB_URL` and `TURSO_CENTRAL_DB_TOKEN` in `backend/.env`.
4. `turso auth api-tokens mint spendifico-backend --group decode-pet --scope db:create
   --scope db:delete --scope db:mint-token` into `TURSO_ORG_TOKEN`, then
   `turso auth api-tokens revoke expensa-backend`. Mint before revoking, so a failed mint
   does not leave the backend with no control-plane token at all.
5. Start the backend once and let the `APP_DB` factory run the central migrations against
   the new database. Register a throwaway address, verify the emailed link, and confirm a
   `spendifico-user-<uuid>` appears in the group.
6. `turso db destroy expensa-app` **last**, only once the new one has answered a request.

The CLI can address `expensa-app` and `spendifico-app` because both are created through it;
it cannot address the per-user databases, which is a name-cache bug documented in
`docs/TODO.md`. Use the Turso MCP server for those.

### The window this closes

This is safe **only** because nobody has verified an account yet. PET-52 wires the frontend
to the access flow; the first real registration persists a `db_name` and creates a cloud
database, and from that moment this exact change is the data migration the earlier drafts
described. So the reasoning does not get deleted from `docs/TODO.md`, it gets restated as a
constraint on any *future* rename: the prefix would first have to stop being derivable,
`db_name` becoming the source of truth wherever a name is needed and the constant applying
to new users only - which costs `deleteUserDb` its no-row compensation path, and is a real
change to `UserDatabaseService` rather than a rename. Infrastructure naming that no user
ever sees does not need to follow the brand a second time.

### Docs that document those names

- `README.md`, "Connecting it to Turso Cloud": `expensa-app` in the create, show and
  tokens-create commands, and `expensa-backend` in the mint.
- `docs/TODO.md`, three separate places beyond the section rewrite below: the orphaned-database
  fix (`delete expensa-user-<id>`), the token-revocation snippet (`turso db tokens invalidate
  expensa-app`, `turso auth api-tokens revoke expensa-backend`), and the CLI name-cache entry,
  which cites `expensa-app` and `expensa-user-*` as the worked example of what the CLI can and
  cannot address. That last one is a record of an investigation, so update the names without
  rewriting the finding.

## docs/TODO.md and the four pointers into it

`docs/TODO.md` has a `### Renaming the product from Expensa to Spendifico` section that gets
**rewritten, not deleted** - but with commit 2 in scope it shrinks much further than the
2026-08-04 draft planned. Retitle it to **the Figma file still says Expensa**, because after
this ticket that is the only holdout left. What survives from the naming discussion is one
paragraph, kept for the reason given under "The window this closes": that the per-user name
is derived from the id, that a future rename is therefore a data migration rather than a
string change, and what it would cost.

Four places cite that section by name, and each also asserts something this ticket makes
false: `frontend/src/app/layout.tsx` (its comment says the mail copy and OpenAPI title still
say Expensa), `frontend/src/components/ui/Sidebar.tsx` ("along with the backend half that has
not moved yet"), `frontend/src/components/ui/Sidebar.test.tsx`, and the sidebar wordmark
bullet in `CLAUDE.md`. All four point at the retitled section and drop the database half.

`CLAUDE.md` needs one more edit that the earlier drafts did not: its Persistence section
describes the per-user naming, so the prefix appears there as prose.

## Out of scope

- **Nothing in Figma gets touched.** Swapping the logo and wordmark the tech spec references
  is the designer's call rather than something the repo lacks the means to do - the Figma MCP
  server can write to a design file. It stays out for the same reason `docs/plans/` and
  `docs/reviews/` do: that file is the historical design record these docs transcribe, so
  editing it would rewrite the thing the transcription is checked against. The tech spec's
  caveat line is how the repo carries the divergence instead.
- **Repo identity is a separate question.** The GitHub repo is `personal-expense-tracker`,
  the root package is `decode-academy-demo`, the Jira key is PET, and the project-management
  doc filenames say `personal-expense-tracker`. None of them says "Expensa", and renaming
  them (especially the Jira key, which the branch convention depends on) is churn that does
  not belong here. `TURSO_GROUP` (`decode-pet`) is in the same bucket: it names the academy
  group, not the product.
- **Gmail threading, still not this ticket.** The hazard keys on the constant subject line,
  so changing the subject starts fresh threads and then recreates it under the new name.
  PET-14 made the sharp edge answerable rather than a dead end - a superseded link now gets
  409, distinct from every other dead token's 401 - so there is no longer pressure to solve
  it here. If it is ever solved by varying the subject, a rename is the natural moment.

## Verification

1. From `backend/`: `npm test` and `npm run test:e2e`. The copy-pinning specs are the point
   of commit 1, and the whole e2e suite exercises both the renamed temp-dir prefix and the
   renamed database prefix through `auth.e2e-spec.ts` and `verify.e2e-spec.ts`.
2. `npm run db:generate` and confirm it writes **nothing**. A new migration means the commit
   changed more than a string.
3. `npm run api:sync` from the repo root, then `git diff --stat`: expect exactly
   `backend/openapi.json`, two `info` fields, and no `api.d.ts` change. A dirty tree after a
   second run is the CI gate failing early.
4. From `frontend/`: `npm test` and `npm run build`. `Sidebar.test.tsx` still pins the
   wordmark and still asserts no "Expensa" in the sidebar.
5. `rg -in expensa -g '!node_modules'` and confirm every surviving hit is either in
   `docs/plans/` or `docs/reviews/` (dated records), or is one of the deliberate Figma
   references: the tech spec's caveat line, the retitled `docs/TODO.md` section, and the
   three frontend comments pointing at it. Nothing under `backend/src/` should match at all.
   This is the actual completeness check for a rename.
6. Cloud, and the part no test can show: run the resource steps above, then start the backend
   with the four `TURSO_*` variables filled in and confirm it opens and syncs the new central
   database under the new `spendifico-backend` client name. If the remote keys any per-client
   sync state on that name, the first open re-bootstraps from the remote rather than failing,
   so watch that the central database reads correctly instead of waiting for an error.
7. Register and verify a throwaway address against cloud mode, and confirm through the Turso
   MCP server that a `spendifico-user-<uuid>` database now exists in `decode-pet`, that the
   central row's `db_name` matches it, and that no `expensa-user-*` was created. This is the
   one check that proves commit 2 end to end.
8. Run the README's "Sending real email" smoke test to `spendifico@gmail.com` against a
   throwaway database once the copy changes, since the email template is the heart of this
   rename: the message must arrive as Spendifico inside and out.
