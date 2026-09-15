# Deployment

How this app reaches production, what deploys it, and what to do when something is wrong.

**This guide was rewritten for Google Cloud Run by PET-86.** It previously described Fly.io in
detail, and every command in it has been replaced rather than amended: the app name, the volume,
the machine, `flyctl` and `fly.toml` all belonged to a platform this project left. Git history has
the old version if the reasoning is ever wanted. What survived the move unchanged is in
`backend/CLAUDE.md`, because the constraints there are properties of a local replica synced to a
cloud rather than of any host.

## What is deployed

| Half         | Where                                              | How it gets there            |
| ------------ | -------------------------------------------------- | ---------------------------- |
| **Backend**  | Cloud Run service `expenso`, project `expensa-app-26`, region `europe-west1` | Cloud Build trigger, on push to `main` |
| **Frontend** | Vercel, `https://spendifico.vercel.app`            | Vercel's own Git integration |

The backend's URL is `https://expenso-pjmskjsr7q-ew.a.run.app`. Cloud Run also serves a second,
deterministic hostname for the same service; this repo names only this one, because the other
embeds the project number. There is **no custom domain**:
`spendifico.eu` and `api.spendifico.eu` are gone, and every reference to them in this repo's older
documents is history rather than configuration.

**There is also no mail service.** Login links are written to the backend's log and delivered to
nobody, which is why `/demo` exists and is the only working way into the deployed app. See
[Demo accounts](demo-accounts.md).

## Deploying is merging

**A push to `main` builds and deploys the backend automatically, within minutes.** A Cloud Build
trigger (`cloudrun-expenso-europe-west1-…`, created 2026-09-10, linked through Developer Connect)
builds `backend/Dockerfile` with `backend` as its context, pushes the image to Artifact Registry,
and runs `gcloud run services update expenso --image=…`. Nothing in this repository fires it and
nothing needs to: there is no deploy workflow, no `mise run deploy-backend`, and no secret in
GitHub.

**That inverts the rule this project used to have.** On Fly the deploy was a manual
`workflow_dispatch`, deliberately, so that a merge adding a new environment variable could not boot
production into a configuration nobody had set. The reasoning still holds and nothing enforces it
any more, so it is now a habit rather than a gate:

> **Set new configuration on Cloud Run _before_ merging the code that reads it.**

The pre-commit hook says so on any commit touching `backend/`.

Watching a deploy:

```sh
gcloud builds list --project=expensa-app-26 --region=europe-west1 --limit=5
gcloud builds log <BUILD_ID> --project=expensa-app-26 --region=europe-west1
```

A PR that touches `backend/Dockerfile`, `.dockerignore` or the lockfile runs
`.github/workflows/deploy-verify.yml`, which builds the image and deploys nothing. That job needs
no credentials, so it works on a fork, and it is the only thing between a Dockerfile that does not
build and an unattended failed deploy on `main`.

## Exactly one instance, and why it is set by hand

The architecture is a local replica synced to Turso Cloud, so a second process is a second replica
set with its own unpushed writes. Three things in the app assume one instance and degrade **quietly**
without saying so: the rate limiter's in-memory store, the absent cross-process migration lock, and
the insight runner's in-process state. PET-86 adds a fourth, since two instances would hold two
replicas of one leased demo account.

Fly held this by construction, because a volume attaches to one machine. **Cloud Run does not**, and
the service shipped at `maxScale: 20` for a while before anybody noticed. It is now:

```sh
gcloud run services update expenso \
  --project=expensa-app-26 --region=europe-west1 --max-instances=1
```

Check it:

```sh
gcloud run services describe expenso --project=expensa-app-26 --region=europe-west1 \
  --format='value(spec.template.metadata.annotations["autoscaling.knative.dev/maxScale"])'
```

**A deploy does not reset it.** The trigger uses `services update --image`, which changes the image
and inherits every other setting, so the cap survives. Recreating the service from scratch would
lose it.

## Configuration

Non-secret values are environment variables on the service; the secrets come from Secret
Manager - five of them, or six once the demo's shared secret is set (see below). Both are listed by:

```sh
gcloud run services describe expenso --project=expensa-app-26 --region=europe-west1 \
  --format='yaml(spec.template.spec.containers[0].env)'
```

Setting one:

```sh
gcloud run services update expenso --project=expensa-app-26 --region=europe-west1 \
  --update-env-vars=DEMO_ENABLED=true
```

[Configuration](configuration.md) is the home for the full variable table. Three that carry
consequences here:

- **`FRONTEND_URL`** is `https://spendifico.vercel.app`, and it has two consumers. `main.ts` uses it
  as the **only** allowed CORS origin, and `auth.service.ts` uses it as the base of every emailed
  login link. A wrong value does not fail at boot - Joi only checks that it parses - it fails as a
  browser that cannot call the API. No Vercel preview deployment will ever pass CORS, since each
  preview gets its own hostname.
- **`DATABASE_DIR`** is `/tmp/databases`, and on Cloud Run `/tmp` is memory that vanishes with the
  instance. That is survivable because Turso Cloud is the source of truth and a cold instance
  re-bootstraps its replica, but it means every cold start pays a bootstrap and nothing local is
  durable.
- **`TRUST_PROXY_HOPS`** is `1`, **and that number was derived for Fly's topology, not Google's.**
  It has not been re-measured since the move. It decides what `req.ip` means, so if it is wrong
  every caller lands in one shared rate-limit bucket. Worth an hour's work: reach the deployed API
  from two networks and confirm one exhausting its budget does not throttle the other. The auth
  limiters are what that buys, and they are what it costs while it is wrong.
  **The `demo` limiter no longer depends on it.** It counts the address the frontend names in
  `x-demo-client-ip`, which the backend reads only alongside a valid `DEMO_SHARED_SECRET`, so its
  buckets are per visitor whatever the hop count is - and the header cannot be forged, because a
  caller who could set it is answered 404 before the limiter runs.
- **`DEMO_SHARED_SECRET`** is what makes the hand-out route reachable, and it must match the value
  on the Vercel project exactly. The backend **refuses to boot** without it when `DEMO_ENABLED` is
  true, so set it before deploying a backend with the demo on:

  It is a **secret**, so it goes in Secret Manager beside the other five rather than into a plain
  environment variable:

  ```sh
  openssl rand -base64 32 | tr -d '\n' | \
    gcloud secrets create demo-shared-secret --project=expensa-app-26 --data-file=-
  gcloud run services update expenso --project=expensa-app-26 --region=europe-west1 \
    --update-secrets=DEMO_SHARED_SECRET=demo-shared-secret:latest
  ```

  Read the value back with `gcloud secrets versions access latest --secret=demo-shared-secret` to
  set the frontend's half in the Vercel project's Environment Variables, with **no**
  `NEXT_PUBLIC_` prefix, and redeploy. That makes it six secrets rather than five wherever this
  guide counts them. A frontend whose value disagrees reaches a 404 and the
  visitor is told this deployment has no demo; the backend logs a warning naming the header, which
  is the only way to tell that apart from the demo genuinely being off.

## The Gemini quota, and the project it belongs to

**The Gemini key is not in `expensa-app-26`.** It is an AI Studio key belonging to a second
project, `gen-lang-client-0566337014` ("Expanso"), which is the one AI Studio created; that project
has `generativelanguage.googleapis.com` enabled and **billing disabled**, so the key is on the free
tier. Nothing about the demo can produce a charge today. What it can produce is an exhausted quota,
which breaks receipt scanning and the assistant for the owner and every visitor at once and
announces itself nowhere.

Two layers bound that, and only the second is a real ceiling:

- **In the app**, a pooled demo account gets `DEMO_CHAT_RATE_LIMIT` and `DEMO_SCAN_RATE_LIMIT`
  instead of the ordinary budgets. Per user, in memory, so it bounds one visitor rather than the
  sum of them.
- **In the console**, a quota override on the Generative Language API in that project caps the
  total. This is the layer that survives a bug in every other one, and it is not set today: on the
  free tier the tier's own limits already are the ceiling, and lowering them further only makes the
  outage arrive sooner.

**Set both of these on the day billing is enabled on that project**, because that is the day a
quota stops being an outage and starts being an invoice: a Cloud Billing budget with alerts on the
billing account, and a per-day request quota override under IAM & Admin, Quotas, filtered to
`generativelanguage.googleapis.com`. Alerts only tell you; the quota is what stops it.

There is no per-key rate limit in AI Studio, and looking for one is the wrong place: a key is a
credential, and the limits belong to the project and its tier.

## Rolling back

Revisions are immutable, so a rollback is a traffic change rather than a rebuild:

```sh
gcloud run revisions list --service=expenso --project=expensa-app-26 --region=europe-west1
gcloud run services update-traffic expenso --project=expensa-app-26 --region=europe-west1 \
  --to-revisions=<REVISION>=100
```

Put traffic back on the newest with `--to-latest`. Note a rollback does **not** revert a database
migration: a user-scope migration runs unattended on first open and there is no down-migration
anywhere in this project.

## Verifying a deploy

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://expenso-pjmskjsr7q-ew.a.run.app/api/health
```

200 means the process serves. For anything more, check that the central database really opened -
the templates read is public and touches it:

```sh
curl -s https://expenso-pjmskjsr7q-ew.a.run.app/api/templates/categories | head -c 200
```

An empty category list from a fresh central database means the boot seed did not run, which is a
real failure wearing a 200.

## Resetting the cloud databases

`scripts/reset-databases.sh --cloud` is **disabled**, deliberately. Its eleven steps stop a Fly
machine, replace a Fly volume and redeploy a pinned Fly image, and none of those exists here. A
half-ported version would still delete every Turso database - that part is platform-neutral - and
then fail to stop the live instance pushing its stale replicas back, silently restoring data the
operator believed they had destroyed. `--local` is unaffected.

The shape of the procedure by hand, **not rehearsed since the platform move**, so treat it as a
sketch to think through rather than a script to follow:

1. Cut external traffic so nothing wakes an instance: `--ingress=internal`. CPU is throttled
   between requests, so an idle instance runs no sync timer.
2. Wait for the service to scale to zero.
3. Delete every `expenso-user-*` database and the central one, then recreate central **with
   `--tursodb`** - the engine is fixed at creation and getting it wrong is silent.
4. Mint a new data-plane token and update the `TURSO_CENTRAL_DB_URL` and `TURSO_CENTRAL_DB_TOKEN`
   secrets.
5. Deploy a new revision, so the instance starts with an empty `/tmp` and the new secrets.
6. Restore `--ingress=all`, verify health and templates, then re-seed the demo pool.

The ordering constraint is the whole point and is the same one Fly's version had: **nothing may be
deleted while a process that holds a replica of it can still run.**

## The Vercel side

`https://spendifico.vercel.app` serves the frontend and answers 200. Its only configuration is
`BACKEND_URL`, which must point at the Cloud Run URL above and is server-side only - it has no
`NEXT_PUBLIC_` prefix and must never be given one, because such a variable is inlined into the
browser bundle and is public forever.

## What is gone

Named so that a reader who finds a reference elsewhere knows it is history rather than something
they have failed to find: Fly.io and `flyctl`, `fly.toml`, the `Deploy backend to Fly.io`
workflow, `deploy-backend.sh`, `mise run deploy-backend`, the `spendifico.eu` and
`api.spendifico.eu` domains, and MailPace. `docs/plans/` still describes all of them, correctly, as
the record of what shipped at the time.
