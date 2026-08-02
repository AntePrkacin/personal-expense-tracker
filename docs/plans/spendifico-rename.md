# PET-51: rename Expensa to Spendifico

## Context

Decided on 2026-08-02 and tracked as
[PET-51](https://decode.atlassian.net/browse/PET-51). Two forcing reasons: an app named Expensa
already exists on Google Play, and the transactional-mail domain was registered under the
new name, so `spendifico.eu` is the WWW home and `login@spendifico.eu` the official
sender, with replies forwarded to `spendifico@gmail.com`.

The mail infrastructure therefore already speaks Spendifico while every screen and email
body still says Expensa. Today the login email arrives from "Spendifico" with the subject
"Your Expensa login link", and that is the one email a stranger has to trust enough to
click, so the copy rename should not wait long.

This plan was written against `feat/PET-13-login-links`, where almost all of the affected
code lives; `main` has none of the mail templates yet. **It executes after PET-13
lands.** The shorter sketch of this rename in `docs/TODO.md` (also arriving with PET-13)
is superseded by this plan and gets removed by this work.

## Already Spendifico, nothing to do

`MAIL_FROM=login@spendifico.eu`, `MAIL_FROM_NAME=Spendifico` and the
`spendifico@gmail.com` smoke-test inbox were set up under the new name from the start. No
DNS, DKIM or sender change is needed, and the README's "Sending real email" procedure is
already correct.

## The rename proper: user-facing copy and the tests that pin it

All of this is a safe find-and-replace, landed as one commit:

- `backend/src/mail/login-link.template.ts`: the subject "Your Expensa login link" and
  the body link text "Log in to Expensa".
- The tests pinning that copy: `backend/src/mail/log.mailer.spec.ts`,
  `backend/src/mail/mailpace.mailer.spec.ts` and `backend/test/auth.e2e-spec.ts`.
- `frontend/src/app/layout.tsx`: the `<title>` still says "Decode Academy Demo", not even
  Expensa. Nothing else in the frontend carries the brand yet (no logo, no welcome
  screen), so this one line is the whole frontend rename.
- `README.md`: the sample LogMailer output line quoting the old subject.
- `docs/project-management/01-brief-personal-expense-tracker.md` (the one-line pitch) and
  `02-tech-spec-personal-expense-tracker.md` (WEL-1, BUD-1, REG-1, LOG-1, VER-1, DSH-1
  and SET-2 all reference the "Expensa logo" or "used across Expensa").
- `docs/plans/` and `docs/reviews/` stay untouched: they are dated historical records.

Optional cosmetic identifiers, same commit if wanted, zero risk either way:
`SYNC_CLIENT_NAME` (`expensa-backend` in `backend/src/database/database.constants.ts`) is
sent to Turso for observability only and nothing keys on it; the test fixtures
`hello@expensa.test`, `/tmp/expensa-test` and the `expensa-e2e-` temp-dir prefix in
`backend/test/setup-e2e.ts`.

## Out of scope: persisted database naming

**`USER_DB_NAME_PREFIX` (`expensa-user-`) stays.** This is the part of the rename that is
a data migration wearing a find-and-replace costume. The prefix feeds `userDbName(id)`,
which derives both the remote Turso database name and the local file path, and the result
is persisted in `users.db_name`. Change the string and every existing user's derived name
stops matching both their central row and the database that actually exists:
`getUserDb` opens or creates the wrong file, and `deleteUserDb`, which derives the name
from the id on purpose because its caller may have no row to read, targets a database
that is not there. Nothing errors loudly; people simply lose their data.

If it ever has to follow the brand, `db_name` must first become the source of truth (read
from the central row wherever a name is needed) and the constant apply to new users only.
That is a real change to `UserDatabaseService`, not a rename, and infrastructure naming
that no user ever sees does not need to follow the brand. About a dozen spec expectations
pin the prefix (`user-database.service.spec.ts`, `users.service.spec.ts`,
`turso-platform.service.spec.ts`, `auth.e2e-spec.ts`, comments in `central/schema.ts`);
they stay as they are.

The central database `expensa-app` (created by hand, so a rename means creating a new
Turso database with `--tursodb` and moving the data, then re-minting
`TURSO_CENTRAL_DB_URL` and `TURSO_CENTRAL_DB_TOKEN`) and the control-plane token named
`expensa-backend` (a mint-new, revoke-old ops action) also stay. If either is ever
renamed, the documented commands in `README.md`, `backend/.env.example` and
`docs/TODO.md` change with it.

## Adjacent decisions this raises

- **Gmail threading.** The threading hazard noted in `docs/TODO.md` keys on the constant
  subject line. Changing the subject to "Your Spendifico login link" starts fresh threads
  but recreates the same hazard under the new name; if threading is to be fixed, the
  subject change is the natural moment.
- **Repo identity is a separate question.** The GitHub repo is
  `personal-expense-tracker`, the root package is `decode-academy-demo`, the Jira key is
  PET, and the project-management doc filenames say `personal-expense-tracker`. None of
  them say "Expensa", and renaming them (especially the Jira key, which the branch
  convention depends on) is churn that does not belong in this ticket.
- **In-flight branches carry the old name.** `feat/PET-50-api-openapi-typegen` titles the
  OpenAPI document with the old name; whichever of PET-50 and this rename lands second
  picks up the other.
- **The Expensa logo lives in Figma.** Swapping the asset is a designer task the tech
  spec references but the repo cannot perform.

## Verification

- Backend, from `backend/`: `npm test` and `npm run test:e2e` (the copy-pinning specs are
  the point of the change).
- Frontend, from `frontend/`: `npm test` and `npm run build`.
- Run the README's "Sending real email" smoke test to `spendifico@gmail.com` once the
  copy changes, since the email template is the heart of this rename: the message must
  arrive as Spendifico inside and out.
