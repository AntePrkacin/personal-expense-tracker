# Demo Accounts

This guide covers the demo pool: the ten pre-seeded accounts behind `/demo`, how to build and
refresh them, and what to do when something goes wrong. The reasoning behind the design is in
`backend/CLAUDE.md` under "The demo pool"; this file is the procedure.

## What it is

Opening `https://<the app>/demo` hands the visitor their own pre-seeded account and lands them on a
populated Dashboard. No email, no password, no form. Each visitor gets a different account out of a
pool of ten, so two people clicking at the same time cannot see each other's edits, and a visitor is
free to add, edit and delete anything they like.

An account is **leased** for an hour. When the lease elapses, the account goes back into the pool,
and the next visitor to be given it has it restored to the showcase fixture first.

## Why it exists

Access to this app is passwordless: you enter an email and click the link that arrives. The domain
and the mail service behind that are gone, so no link reaches anybody and the backend writes them to
its log instead. On a deployed backend there is no terminal to read that log in, which makes `/demo`
the only working way into the app for anyone, including its owner.

## Setting it up

Three steps, and only the first two are ever repeated.

**1. Seed and enrol the pool.**

```bash
mise run seed:demo-pool          # local SQLite files under backend/databases/
mise run seed:demo-pool:cloud    # Turso Cloud, using backend/.env
```

This provisions `demo1@spendifico.eu` through `demo10@spendifico.eu` if they do not exist, fills
each with the committed fixture, and enrols each into the pool. One application context serves all
ten, so it costs one boot rather than ten.

**Stop your dev server first.** The database engine takes an exclusive file lock, so the seed cannot
run while a backend is up in either mode. Nothing is written when that happens - the repair is to
stop the server and run it again.

**2. Turn the feature on.**

```
DEMO_ENABLED=true
```

It defaults to **false** everywhere, so a fresh clone and CI never publish a route that hands
sessions to anonymous callers. With it off, `POST /api/demo/session` answers **404** - a deployment
with no demo has no such route.

On Cloud Run:

```bash
gcloud run services update expenso \
  --project=expensa-app-26 --region=europe-west1 \
  --update-env-vars=DEMO_ENABLED=true
```

**3. Check it.** Open `/demo` in a private window. You should land on `/dashboard` with real figures
on it. Opening it again in a second private window should give you a **different** account: change
something in one and confirm the other is untouched.

## Refreshing the pool

Re-run `mise run seed:demo-pool:cloud`. It is idempotent - an enrolled account keeps its lease and
only has its `seeded_at` moved forward - but it **rewrites data a visitor may be looking at right
now**, so prefer a quiet moment.

You mostly do not have to. A leased account is restored automatically on the next hand-out, so the
pool repairs itself as it is used. Re-seed by hand when:

- the fixture itself changed (`mise run seed:fixture` was run, or `CATEGORY_PLANS` moved);
- a category template was added, renamed or removed, which makes the restore fail (see below);
- you want the whole pool fresh before something that matters, like sending the link to somebody.

## Configuration

| Variable           | Default | What it does                                              |
| ------------------ | ------- | --------------------------------------------------------- |
| `DEMO_ENABLED`     | `false` | Whether the route exists at all; 404 when off             |
| `DEMO_LEASE_TTL_M` | `60`    | How long one visitor keeps an account                     |
| `DEMO_RATE_LIMIT`  | `5`     | Hand-outs per window, per caller IP                       |
| `DEMO_RATE_TTL_S`  | `3600`  | Length of that window, in seconds                         |

`docs/guides/configuration.md` is the home for the full table.

## Troubleshooting

**Every visitor sees "The demo is busy right now".**

All ten accounts are leased. Either ten people really are using it, or leases were taken by testing
and have not elapsed yet. Wait out `DEMO_LEASE_TTL_M`, or lower it and redeploy. A pool that is
busy far too often wants more accounts rather than shorter leases - a lease that is too short
rewrites an account under somebody still reading it.

**Every visitor sees it, and nobody has used the demo.**

The pool is probably empty rather than busy: a pool with no accounts in it has none free, so an
un-seeded deployment answers exactly the same 503. Run the pool seed.

**Visitors get "The demo is not available here".**

`DEMO_ENABLED` is not `true` on that deployment. Note it must be the string `true`; the schema
parses it as a boolean and anything else is false.

**The dashboard is populated but the current period is empty.**

The account's fixture went stale - transactions are placed relative to the day they were written, so
an account seeded weeks ago has nothing in *this* period. A hand-out is supposed to catch that and
restore it. If it did not, check that `seeded_at` is being stamped: an account whose restore throws
has its lease released and is handed to nobody until the cause is fixed.

**The logs show the restore failing with "the fixture and the category templates disagree".**

A category template was added, renamed or removed since the fixture was generated. That is now the
only cause: a visitor renaming or deleting a category used to produce the same message and no longer
can, because the restore deletes the account's categories - tombstones included - and rewrites them
from the templates rather than checking the ones it finds. Fixing it means rebuilding the fixture
(`docs/guides/seeding-dummy-data.md` covers that, and regenerating alone does not fix it).

**A visitor is still signed in to an account somebody else now has.**

That cannot happen any more, and if you see it, it is a bug rather than the design. A demo session
now expires with the lease that minted it rather than after `SESSION_TTL_D` days, and every session
on a pooled account is revoked twice over: when the lease is reclaimed, and again when the account
is claimed for the next visitor, before a single row of it is rewritten.

What it costs is real and was accepted: an abandoned tab is signed out at the end of the hour rather
than showing the fixture it started from. What it buys is the claim the README makes - two visitors
cannot see each other's data - being true of a visitor who keeps their bearer, not only of one who
closes the tab. Ending a session on a **non-pooled** account is still an operator's manual tombstone;
`docs/TODO.md` carries that.

## What a demo visitor can do

Everything a real user can, on their own account: add, edit and delete transactions and categories,
change the budget and the pay day, scan a receipt, and chat to the assistant. Two of those cost real
money on a shared Gemini key, and both carry their own per-user rate limits; there is no separate
cap for demo accounts, which is recorded in `docs/TODO.md` rather than solved.

What they leave behind goes with them. The restore rewrites the transactions, all three histories,
the display name and the currency, and **deletes every assistant conversation** - so one visitor's
questions are not listed under the next visitor's History tab. Insight sets regenerate on the same
pass.

They cannot reach anybody else's data. A demo account is an ordinary account with its own database,
so isolation is the same structural isolation every user has, not a filter somebody remembered to
apply.
