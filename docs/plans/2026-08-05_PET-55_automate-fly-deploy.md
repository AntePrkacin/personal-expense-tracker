# PET-55: automate the backend deploy with GitHub Actions

## Context

PET-53 shipped the Fly.io deploy but left it **manual**: a person runs
`fly deploy --remote-only --ha=false` from `backend/`. That ordering was deliberate - automating
before a manual deploy had ever succeeded would make a red CI run indistinguishable from a bad
`fly.toml`, Dockerfile or secret. The manual deploy has now succeeded many times, including across
a region migration and a rate-limit change, so the precondition is met and PET-55 is unblocked.

The cost of it staying manual is already visible. Merging PET-53 did not redeploy anything, and
`main` immediately drifted ahead of production: the dashboard, categories and transaction-read
endpoints (PET-20/28/35) sat un-deployed until a person noticed and ran `fly deploy` by hand. That
drift is the pain this ticket removes.

This plan also absorbs the deferred item from `docs/TODO.md`, "Nothing verifies the `Dockerfile`
or `fly.toml` after they were written": CI never builds the image or validates the Fly config, so
both can rot until the next manual deploy discovers it. That belongs here because the deploy job
needs the same `FLY_API_TOKEN` the validation does.

## Two pieces, deliberately separate triggers

**1. PR-time verification (on `pull_request`).** When a PR touches the deploy files, validate the
Fly config and build the image without deploying, so a broken `fly.toml` or Dockerfile fails the
PR rather than a future manual deploy. Steps: `fly config validate --strict` and
`fly deploy --remote-only --build-only`. Both reach Fly's API, so both need `FLY_API_TOKEN`.

**2. Deploy (on `workflow_dispatch`, manually).** Not push-to-`main`. Three reasons, all learned
from operating this app:

- Every deploy **stops the machine**, so every trigger is a full replica-flush plus a cold start
  plus brief downtime under `strategy = "immediate"`. The flush is proven to complete, but
  push-to-`main` would multiply how often the one path with a silent-data-loss failure mode runs.
- A merge can add a **new env var with no safe default**. This exact class of thing just happened:
  PET-20 added `APP_TIMEZONE`, which happened to default to the production-correct value - but the
  next one might not, and a blind auto-deploy would then fail to boot or silently misbehave. A
  human pressing the button gets to set config first.
- The backend changes rarely and has no availability target, so on-demand is the right cadence.

## Design decisions

1. **`--ha=false` on the deploy, non-negotiable.** The flag defaults to true and would create a
   second machine, a second replica set with its own unpushed writes. This is the single most
   important line in the workflow.
2. **A post-deploy assertion, not just a green `fly deploy` step.** `fly deploy` does not start a
   *stopped* machine and can report success while the API 503s. The job must assert **exactly one**
   machine, that it is `started`, then `curl` `/api/hello` for a 200 before it goes green.
3. **`FLY_API_TOKEN` repository secret**, app-scoped, from `fly tokens create deploy -a
   spendifico-api`. Already created and stored. App-scoped rather than org-scoped keeps the blast
   radius to this app.
4. **`working-directory: backend`**, matching the existing CI jobs and where `fly.toml` lives.
5. **`flyctl` pinned**, via `superfly/flyctl-actions/setup-flyctl` at a fixed version, so a flyctl
   release cannot change the deploy under us.
6. **A concurrency group** so two dispatches cannot deploy at once, which would race
   `--ha=false`'s single-machine guarantee.

## Files

- **New `.github/workflows/deploy.yml`** - the `workflow_dispatch` deploy job with the
  post-deploy assertion.
- **New `.github/workflows/deploy-verify.yml`** (or a job in the existing `ci.yml`) - the
  PR-time `fly config validate --strict` + `--build-only`, gated on changes to
  `backend/Dockerfile`, `backend/.dockerignore` or `backend/fly.toml`.
- **`docs/guides/deployment.md`** - a short "Automated deploys" note pointing at the workflow, so
  the manual runbook and the automated path are both documented.
- **`docs/TODO.md`** - resolve the "Nothing verifies the `Dockerfile` or `fly.toml`" entry, since
  the PR-time job now does.

## Tasks

- [x] Create the `FLY_API_TOKEN` repository secret (`fly tokens create deploy`, app-scoped)
- [ ] Write `.github/workflows/deploy.yml`: `workflow_dispatch`, pinned flyctl,
      `fly deploy --remote-only --ha=false`, then assert one started machine and a 200 from
      `/api/hello`
- [ ] Add PR-time verification (`fly config validate --strict` + `fly deploy --build-only`) gated
      on the deploy-file paths
- [ ] Update `docs/guides/deployment.md` with the automated path and `docs/TODO.md` to resolve the
      drift-risk entry
- [ ] Dry-run the deploy via manual dispatch and confirm the post-deploy assertion passes
- [ ] Open a throwaway PR touching `fly.toml` to confirm the verification job runs and gates

## Verification

- **The deploy job**, triggered from the Actions tab (`workflow_dispatch`): watch it build on Fly's
  remote builder, deploy with `--ha=false`, and pass the post-deploy assertion. Confirm afterward
  that `fly machine list` still shows exactly one machine and the app answers 200.
- **The verification job**: open a PR that edits a comment in `fly.toml`; the job runs
  `fly config validate --strict` and a `--build-only`, and a deliberately broken `fly.toml` fails
  it. Revert the edit before merge.
- **The token**: `gh secret list` shows `FLY_API_TOKEN`; the first successful dispatch proves it
  authenticates.

## Out of scope

- **Auto-deploy on push to `main`.** Rejected above; the trigger is deliberate.
- **A rollback workflow.** Rollback stays the manual `fly deploy --image <ref>` documented in the
  deployment guide; automating it is not worth the surface today.
- **Multi-environment (staging) deploys.** There is one backend and no staging environment, by the
  same decision that previews share the production backend.
