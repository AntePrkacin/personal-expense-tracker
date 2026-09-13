---
name: repo-gcp
description: This skill should be used when the user asks to "deploy the backend", "check the deployed app", "watch the build", "roll back the deploy", "add or rotate a secret", "bump the rate limit for a demo", "turn the demo on", or edits `backend/Dockerfile` / debugs a Cloud Run or Cloud Build failure. Drives Google Cloud through `gcloud` in Bash, and carries the traps that bit this project so they do not bite again.
argument-hint: "[deploy | status | logs | rollback | secrets | config | demo]"
allowed-tools: Bash(gcloud:*), Bash(curl:*), Read
---

> **Tools used:** `Bash(gcloud:*)` to drive the platform, `Bash(curl:*)` to probe the
> deployed API, `Read` for the authoritative docs this skill points at.

This skill replaces `repo-fly`, which drove a platform this project left. It is **not** the
runbook: every command with its real flags, the rollback, the reset sketch and the
configuration table live in `docs/guides/deployment.md`, and the reasoning lives in
`backend/CLAUDE.md` (Deployment). Read those for the *how* and *why*. What follows is the
agent-facing layer: when this loads, and the traps a human reading the runbook would not
need spelled out but an agent driving `gcloud` must know.

## The coordinates

| Thing    | Value                                              |
| -------- | -------------------------------------------------- |
| Project  | `expensa-app-26`                                   |
| Service  | `expenso`                                          |
| Region   | `europe-west1`                                     |
| URL      | `https://expenso-692959542833.europe-west1.run.app` |
| Frontend | `https://spendifico.vercel.app` (Vercel)           |

Pass `--project` and `--region` explicitly on every command. The account's default project
is unset, so a command without them fails with "The [project] resource is not properly
specified" - which is loud, and the one upside.

## Before you run anything

- **There is no deploy command, and offering one is the mistake to avoid.** A Cloud Build
  trigger builds and deploys on every push to `main`. Deploying *is* merging. An agent asked
  to "deploy the backend" should explain that, not reach for `gcloud run deploy` - which
  would race the trigger and deploy whatever is in the working tree rather than what was
  reviewed.
- **Changing the running service is a production action.** Every `gcloud run services update`
  creates a revision and shifts traffic. Explain it in plain text first, then run it, so the
  permission prompt arrives after the explanation rather than instead of it. Expect some of
  these to be denied by the permission layer; if so, hand the user the exact command rather
  than working around the denial.
- **`gcloud auth login` needs a real TTY and a browser.** If `gcloud config list` shows no
  account, stop and ask the user to log in themselves. Never try to work around it.

## The traps

- **`--max-instances=1` is not decoration.** Three things in this app assume a single
  instance and degrade silently without one: the in-memory rate limiter, the absent
  cross-process migration lock, and the insight runner's in-process state. Since PET-86 a
  fourth joins them, because two instances hold two replicas of one leased demo account. The
  service shipped at `maxScale: 20` for a while and nothing failed - it just quietly stopped
  being true. **Check it after any change that recreates the service**, and never lower the
  cap's importance because nothing is visibly broken.

- **A deploy inherits service settings; recreating the service does not.** The trigger runs
  `services update --image`, which changes only the image, so `--max-instances`, the env vars
  and the secret bindings all survive a deploy. Anything that deletes and recreates the
  service loses every one of them.

- **`/tmp` is memory, and `DATABASE_DIR` points into it.** The embedded replicas are not
  durable: a new instance re-bootstraps from Turso Cloud. Never reason about "the data on the
  server" - there is none, and a shell into a container would show a cache.

- **Deleting anything in Turso while an instance can still run is how data comes back.** The
  live replica pushes on a timer, so a deletion made while the service is reachable can be
  undone by a single request afterwards. `scripts/reset-databases.sh --cloud` is disabled for
  exactly this reason and says so; do not re-enable it without rehearsing the ordering.

- **`TRUST_PROXY_HOPS` is `1` and was measured for Fly, not Google.** It decides what `req.ip`
  means, so a wrong value puts every caller in one rate-limit bucket. It has not been
  re-measured since the platform move. Do not assert it is correct; say it is unverified.

- **Secrets live in Secret Manager, not in env vars.** Five of them are bound by reference.
  Never print a secret's value, and never move one into a plain environment variable to make
  a command simpler.

## Common jobs

```sh
# What is deployed, and is the instance cap still right
gcloud run services describe expenso --project=expensa-app-26 --region=europe-west1 \
  --format='yaml(status.latestReadyRevisionName, spec.template.metadata.annotations)'

# Watch the build that a merge kicked off
gcloud builds list --project=expensa-app-26 --region=europe-west1 --limit=5

# Logs
gcloud run services logs read expenso --project=expensa-app-26 --region=europe-west1 --limit=100

# Is it alive
curl -s -o /dev/null -w '%{http_code}\n' https://expenso-pjmskjsr7q-ew.a.run.app/api/health

# Turn the demo pool on (the pool must be seeded first - see docs/guides/demo-accounts.md)
gcloud run services update expenso --project=expensa-app-26 --region=europe-west1 \
  --update-env-vars=DEMO_ENABLED=true
```

Rolling back is a traffic change rather than a rebuild, and it does **not** revert a database
migration - there is no down-migration anywhere in this project. `docs/guides/deployment.md`
has the commands.
