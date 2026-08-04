# PET-53: deploy the NestJS backend to Fly.io

## Context

PET-53 ("[INFRA] Deploy the NestJS backend to Fly.io", no epic, Medium, 5 points) gives
the backend its first deployment target. Branch `chore/PET-53-fly-io-backend-deploy` is
cut from `main`, not stacked: the deploy touches no application code and has no
dependency on the endpoint queue (PET-45, 35, 28, 20, 41, 40).

The frontend already has a home. `frontend/README.md` documents importing the repo into
Vercel with **Root Directory** set to `frontend`, and it already states that the NestJS
backend "is not deployed to Vercel - it ships separately." This plan is the other half of
that sentence.

The question that started this was whether the database architecture would work on
Vercel. It will not, and the reason is structural rather than a matter of configuration.
That analysis is recorded below because it is the justification for spending money on a
second host, and because it names the invariants any future host has to preserve.

Two process notes. This task cites **no requirement ID**, deliberately: the tech spec
(`docs/project-management/02-tech-spec-personal-expense-tracker.md`) contains no
deployment or hosting requirement anywhere, so there is nothing honest to cite. It also
has **no epic parent**: all seven PET epics are feature areas and the project has no
platform epic. Create one if deployment work grows past this ticket.

## Why not Vercel

The architecture is a **local replica synced to the cloud**. It assumes one long-lived
process with a writable, single-owner filesystem and a graceful shutdown. Vercel provides
many short-lived processes, each with a private `/tmp` and no guaranteed stop signal.
Five consequences, worst first:

1. **Silent data loss on writes.** In cloud mode a write lands in the local file and
   reaches Turso only when `push()` runs, which happens on a `setInterval`
   (`backend/src/database/turso-client.factory.ts`, 60s default and `.unref()`'d) or on
   `close()` during `onApplicationShutdown`
   (`backend/src/database/database.module.ts`). Vercel freezes the instance the moment
   the response is flushed and later discards it, frequently with no SIGTERM. So
   `POST /api/transactions` can answer 201 for a row that only ever existed in a `/tmp`
   file nobody resumes.
2. **It would not boot on defaults.** `openCentralDatabase` does `mkdir(DATABASE_DIR)`,
   default `./databases`, and the deployment filesystem is read-only outside `/tmp`.
3. **N uncoordinated replicas.** Each concurrent instance holds its own copy with its own
   pending writes. This breaks invariants the code built on purpose:
   `LoginTokenService.issue()` wraps supersede-then-insert in a transaction so two
   concurrent resends cannot both leave a live link, and `consume()` is one conditional
   `UPDATE ... RETURNING` so a token cannot be spent twice. Both are atomic only **within
   one replica**. Two instances mean two live links, or one token consumed twice.
4. **Cold-start cost on the request path.** Each cold start opens and migrates the central
   replica; the first request for a given user pulls and migrates that user's replica
   (`UserDatabaseService.openUserDb`). Bootstrap pulls land on the user's latency budget,
   per instance.
5. **`drizzle/` is resolved from `process.cwd()`** (`backend/src/database/database.constants.ts`).
   Vercel's bundler traces imports statically and cannot see a folder read at runtime.

Two non-database consequences of the same root cause: the in-memory throttler makes
`AUTH_RATE_LIMIT` per instance, so the effective auth rate limit becomes limit x instance
count, and `main.ts` calls `app.listen()`, so a serverless handler entry would be needed
regardless. Fluid compute softens 1 slightly and does nothing for 3.

## What the architecture actually requires

Worth stating precisely, because it is narrower than "needs a persistent disk" and that
distinction is what opened up the free options:

1. **Exactly one instance.** Non-negotiable. Problem 3 above applies to any host that
   scales horizontally.
2. **A graceful stop signal with enough grace time**, so the final `push()` lands. This is
   the whole difference between Fly and Vercel.
3. **A writable filesystem** for `DATABASE_DIR`.
4. **Node 22.12+ on glibc**, for the ESM-only napi bindings.

A persistent disk is a strong want, not a hard requirement: the local file is a
**replica**, not the system of record, and `connectSync` re-bootstraps from Turso Cloud
on a fresh open. A wiped disk therefore costs a re-pull, not data, provided the last push
succeeded. That is why requirement 2 matters more than the volume does.

## Hosts evaluated

Checked 2026-08-04. Fly's figures are from fly.io's own docs; the rest came from vendor
pages and comparison sites of uneven quality, so re-verify before switching.

| Host               | Free? | Fits                     | Notes                                                                                                                                         |
| ------------------ | ----- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fly.io**         | No    | Yes, cleanly             | Est. ~$3.80/mo of usage: shared-cpu-1x 512MB ($3.32) + 3GB volume ($0.45). No fixed plan exists - see below                                   |
| Northflank Sandbox | Yes   | Probably                 | Always-on, no sleeping, 2 free services, claims free persistent volumes. Pricing page publishes no CPU/RAM/volume numbers                     |
| Oracle Always Free | Yes   | Yes, but you own the box | Real VM + 200GB block storage, free indefinitely. ARM allocation cut to 2 OCPU / 12GB in June 2026. Needs linux-arm64 napi bindings confirmed |
| Render free        | Yes   | **No**                   | No persistent disk on free web services, ephemeral filesystem, spins down after 15 min idle                                                   |
| Koyeb free         | Yes   | Marginal                 | Scale-to-zero after 1h idle and it cannot be disabled; 0.1 vCPU                                                                               |
| Railway            | No    | Yes                      | Hobby $5/mo with $5 included usage, no hard spend cap                                                                                         |

## Decisions made

1. **Fly.io, one machine, one region, one mounted volume.** It matches the four
   requirements above without compromise, and `fly.toml` lets the constraints be written
   down rather than hoped for. An estimated **~$4/month of usage** is accepted for an academy
   project; the free options were rejected for this ticket but Northflank and Oracle stay
   documented above as fallbacks if the cost becomes a problem.

   **Note the wording, because it is not a plan.** Fly has no fixed hosting plans: it
   abandoned them, deprecating Hobby, Launch and Scale on 2024-10-07, and every new
   organization is on **Pay As You Go**, billed purely for resource usage. `spendifico` is
   therefore on Pay As You Go, not on a "$4 plan", and that number is an estimate rather
   than a subscription. Three consequences:

   - **The bill varies.** It is roughly $3.32 for a 512MB shared-cpu-1x running 24/7 (which
     it must, since `auto_stop_machines = "off"`) plus $0.45 for a 3GB volume, plus egress at
     $0.02/GB in this region group. The volume bills on provisioned capacity **even while
     the machine is stopped**.
   - **There is no minimum spend**, per Fly's pricing page, so a stopped app costs only its
     volume.
   - **There is also no hard spend cap by default.** Nothing structurally prevents a
     mistake - an accidentally larger VM, a second machine, an egress spike - from billing
     more than expected. Worth checking whether a budget alert can be set on the org, since
     the usual protection of "the plan caps it" does not exist here.

   The $29 / $199 / $2,500 figures visible in third-party pricing summaries are **optional
   support tiers**, not hosting plans, and none of them is needed.

2. **Debian-based Node image, never Alpine.** The `@tursodatabase/*` prebuilds target
   `linux-x64-gnu`; Alpine is musl, and the failure would be a missing-binding crash at
   startup. `node:26-slim` matches `.nvmrc` and clears the 22.12 floor.
3. **`kill_signal = "SIGINT"` with a raised `kill_timeout`.** Fly sends SIGINT by default,
   which Nest's `enableShutdownHooks()` already handles, but the **default timeout is only
   5 seconds** and `closeAll()` has to flush every open user replica within it. 60s is
   cheap insurance against exactly the failure that disqualified Vercel.
4. **`auto_stop_machines = "off"`, `min_machines_running = 1`, no autoscaling, one
   region.** A second machine is a second replica set, which is problem 3. A volume can
   only be attached to one machine anyway, so the platform partly enforces this, but the
   config states it so nobody "helpfully" scales it later.
5. **Deploy strategy `immediate`.** With a single volume-bound machine, Fly's default
   rolling strategy has no second machine to roll to. Accept a few seconds of downtime on
   deploy rather than fight it; this is an academy project with no availability target.
6. **Region chosen to sit near the Turso group, not near the users: `lhr`.** Every request
   reads a local replica, so user proximity barely matters, while sync latency to the
   Turso group does. The `decode-pet` group is in **Ireland** (`aws-eu-west-1`), confirmed
   2026-08-04, and Fly has no Dublin region, so London is the nearest hop. Confirm the
   region list has not changed with `fly platform regions` before the first deploy; `ams`
   is the fallback if `lhr` is ever capacity-constrained.
7. **Secrets via `fly secrets`, never baked into the image or `fly.toml`.** Non-secret
   values (`PORT`, `DATABASE_DIR`, `FRONTEND_URL`, `TURSO_GROUP`, `MAIL_FROM`,
   `MAIL_FROM_NAME`) go in `[env]` where they are visible in the repo; the tokens do not.
   The one deliberate exception is that the four `TURSO_*` cloud variables travel together
   in `fly secrets` even though two of them are not sensitive, because Joi's `.and()` treats
   them as a unit. Note the pairing rules survive deployment: those four must be all set or
   all absent, and `MAILPACE_API_TOKEN` pairs with `MAIL_FROM`, or the app fails at boot
   with a message naming the missing one.
8. **One operator, no Fly org members.** The `spendifico` org has a single Admin and the
   repo owner was deliberately not invited (decided 2026-08-04). Nobody else needs to deploy
   or read logs today, and the smaller blast radius is worth more than the convenience.
   Reversible at any time with `fly orgs invite`.

## Design

### Dockerfile

Two stages, both on `node:26-slim`. The runtime stage runs its own `npm ci --omit=dev`
rather than copying `node_modules` across, so the native bindings are resolved by npm for
that exact image instead of being trusted to survive a copy.

```dockerfile
FROM node:26-slim AS builder
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

FROM node:26-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
EXPOSE 3000
CMD ["node", "dist/main"]
```

The `COPY drizzle/` line is the one that fails quietly if forgotten: `CENTRAL_MIGRATIONS_DIR`
and `USER_MIGRATIONS_DIR` are `join(process.cwd(), 'drizzle', ...)`, and `WORKDIR /app`
makes `/app` the cwd, so the folder has to sit at `/app/drizzle`. This is the deployment
consequence already flagged in `database.constants.ts`.

Note the build context is the **repo root**, not `backend/`, because the multi-app layout
puts `backend/` one level down. Either build with `fly deploy --dockerfile Dockerfile`
from the root, or keep the Dockerfile in `backend/` and strip the `backend/` prefixes.
Pick one and be consistent; the paths above assume a root context.

### .dockerignore

Not housekeeping. This file is load-bearing for both correctness and data safety, which is
why it is drafted here rather than mentioned in passing:

```text
**/node_modules
backend/databases
backend/dist
frontend
**/.env
**/.env.local
.git
.claude
```

Two specific failures it prevents. `COPY backend/ ./` runs _after_ `RUN npm ci`, so without
the `node_modules` line the host's tree overwrites the clean dependency layer that was just
installed for this image. And `backend/databases/` holds **real local user database files**,
so without that line a development machine's user data ships inside a deployed image; the
`.env` lines are the same argument for local secrets. Excluding `frontend/` is only about
build speed and context size.

### fly.toml

```toml
app = "spendifico-api"
primary_region = "lhr"
kill_signal = "SIGINT"
kill_timeout = 60

[build]

[deploy]
  strategy = "immediate"

[env]
  PORT = "3000"
  DATABASE_DIR = "/data/databases"
  FRONTEND_URL = "https://spendifico.vercel.app"   # placeholder, see below
  TURSO_GROUP = "decode-pet"
  MAIL_FROM = "login@spendifico.eu"
  MAIL_FROM_NAME = "Spendifico"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "off"
  auto_start_machines = false
  min_machines_running = 1

[[http_service.checks]]
  interval = "30s"
  timeout = "5s"
  grace_period = "20s"
  method = "GET"
  path = "/api/hello"

[[mounts]]
  source = "spendifico_data"
  destination = "/data"

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
```

`/api/hello` is the health check because it is one of the four `@Public()` routes, so it
needs no bearer. `grace_period` has to cover boot, which includes opening the central
replica and running its migrations.

Two easy syntax traps in that block, both checked against Fly's reference on 2026-08-04
with flyctl 0.4.77:

- **`auto_stop_machines` is a string**, one of `"off"`, `"stop"` or `"suspend"`. There is no
  boolean form. `auto_start_machines` on the very next line **is** a boolean, and that
  asymmetry is the whole trap - a plausible-looking `auto_stop_machines = false` is invalid.
- **`kill_timeout` is a bare integer of seconds**, not a duration string. `60`, not `"60s"`.

Run `fly config validate` before the first deploy anyway; it is instant and it is the only
thing that checks this file before a machine tries to boot from it.

`FRONTEND_URL` above is a **placeholder** and has to be replaced with the real Vercel
domain, because `main.ts` allows exactly one CORS origin. Note the consequence for preview
deployments: Vercel gives every preview a unique URL, so none of them will ever pass CORS
against this value. That does not bite today, since every frontend fetch is server-side and
CORS is not involved, but it will the moment something fetches from the browser.

### Volume and secrets

```sh
fly volumes create spendifico_data --org spendifico --region lhr --size 3
fly secrets set \
  TURSO_ORG=... TURSO_ORG_TOKEN=... \
  TURSO_CENTRAL_DB_URL=... TURSO_CENTRAL_DB_TOKEN=... \
  MAILPACE_API_TOKEN=...
```

Only genuine secrets are here; `TURSO_GROUP`, `MAIL_FROM` and `MAIL_FROM_NAME` are public
values and live in `[env]` above, per decision 7. The four `TURSO_*` variables stay together
as one unit even though `TURSO_ORG` and `TURSO_CENTRAL_DB_URL` are not really secret, because
Joi ties all four with `.and()` and keeping them in one place makes a half-filled set harder
to create by accident.

**That one-command form is load-bearing, not tidiness.** `fly secrets set` updates every
Machine in the app, which means a restart. Setting these one variable at a time would
therefore boot the app three times against an incomplete `TURSO_*` group, and Joi turns each
of those into a crash at startup. On a brand-new app the secrets are instead _staged_ until
the first deploy, which is why the volume and secrets come before `fly deploy` in the steps.
Use `--stage` if you ever need to change a secret without an immediate restart, then
`fly secrets deploy` when you want it to take effect.

3GB is generous: the central database is small and each user replica is a few hundred KB,
but volumes bill on provisioned capacity ($0.15/GB/mo) and growing one later is more
annoying than paying $0.30 now. Note that every user's replica accumulates on this one
volume, so it is the disk-side twin of the memory concern in the risks below.

### The Vercel function region: `lhr1`

Vercel Functions default to **`iad1` (Washington, D.C.)** for all new projects, and leaving
that default is a real cost here: every server-side fetch from a Server Component would
cross the Atlantic to reach London and come back, adding roughly 80-100ms each way to a
call that should be single-digit milliseconds.

**Match Fly, not Turso.** This is easy to get backwards, because Vercel's own guidance is
"run functions close to your database." The frontend's data source is not Turso, it is the
backend API: the path is browser to Vercel function to Fly, and only Fly talks to Turso. So
the region to match is Fly's `lhr`, giving **`lhr1`** (London). `dub1` is `eu-west-1`, the
same AWS region the Turso group lives in, and it is the wrong choice today for exactly that
reason - it would only become right if the deferred "hand a browser a token to sync
directly" item in `docs/TODO.md` ever ships and a client reaches Turso without passing
through Fly.

Set it in `frontend/vercel.json` (the Vercel project root is `frontend/`, so it goes there,
not at the repo root):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["lhr1"]
}
```

or in the dashboard under Settings, Functions, Function Regions.

Three facts about the **Hobby** plan, confirmed against Vercel's docs on 2026-08-04:

- **A single region, freely chosen.** Hobby gets one region and it can be any of the 20;
  Pro gets 5 and Enterprise all. One region is the correct configuration here anyway, since
  a second would only be a slower path to the same single-machine origin.
- **Exceeding the plan's region count fails the deployment** before the build step rather
  than silently dropping the extras, so a mistake here is loud.
- **No failover.** `functionFailoverRegions` and the Function Failover toggle are
  Enterprise-only, so an `lhr1` outage is downtime. Functions keep multi-availability-zone
  redundancy within the region. Nobody should later assume failover exists.

One thing that is not restricted to `lhr1`: Routing Middleware deploys to all regions
regardless of the `regions` setting, though on Hobby it runs in fewer of them. Irrelevant
today because the frontend has no middleware, but it matters if PET-52 puts the session
check in one.

## Already in place, as of 2026-08-04

Groundwork done before the ticket's own work starts, recorded so nobody redoes it or
wonders where it came from:

| Thing                | State                                                             |
| -------------------- | ----------------------------------------------------------------- |
| Fly organization     | **`spendifico`**, type `SHARED`, Pay As You Go, card on file      |
| Fly org members      | One Admin, the account that created it. No members, by decision 8 |
| flyctl               | **0.4.77**, installed via mise                                    |
| Fly login            | Done; token persisted at `~/.fly/config.yml`                      |
| Region               | `lhr`, verified present in `fly platform regions`                 |
| Local cloud mode     | All four `TURSO_*` set in `backend/.env`; Turso CLI authenticated |
| Container runtime    | **Neither docker nor podman installed.** See the note below       |
| App, volume, secrets | **Not created yet.** That is this ticket                          |

**flyctl lives in the global mise config, not this repo's `mise.toml`.** That matches how the
`turso` CLI is already managed and keeps deploy tooling out of the team's diff:

```sh
mise use -g flyctl@latest
```

Adding it to the repo's `mise.toml` instead would hand every collaborator the binary
automatically, which is defensible once the deploy actually works, but it is a team-wide
change and not needed to finish this ticket.

### Verified against the live services, 2026-08-04

Checks run before implementation, so that a failed deploy cannot be blamed on any of them:

| Check                     | Command                     | Result                                                      |
| ------------------------- | --------------------------- | ----------------------------------------------------------- |
| Central database engine   | `turso db list`             | `spendifico-app`, TYPE **`Turso`** (not `SQLite`) - correct |
| Group region              | `turso group list`          | `decode-pet`, `aws-eu-west-1` primary, Healthy              |
| Fly has the chosen region | `fly platform regions`      | `lhr` and `ams` present; **no Dublin region**, as expected  |
| Cloud mode, end to end    | README smoke-test procedure | **Passed.** Full cycle, provisioning included               |

The engine check is the one that mattered most: `use_tursodb` is undocumented, getting it
wrong is silent, and the only remedy is deleting the database and recreating it. It is
correct, so the sync driver will replicate against it. Note the URL that check returned uses
the **`turso://`** scheme, which is exactly the case `toSyncUrl()` rewrites to `https://`.

**Cloud mode works as designed, and that is settled.** A real smoke test has been run against
live Turso: the whole cycle, register through the emailed link to verification, and that
means the `VerificationService` provisioning path - create the database, mint its token,
persist the pointer, open and migrate it, insert the profile, seed categories - is proven
rather than assumed. This removes the largest unknown from the deploy: the persistence layer
is not on trial here, only the container and the Fly configuration are.

Two consequences worth being precise about:

- **The remaining verification is narrow.** The ticket's "cloud mode verified end to end" AC
  is about the same flow running **inside the container, on Fly** - a different environment
  (`drizzle/` resolved from the image's `WORKDIR`, the volume mounted at `/data`, the napi
  bindings from the image's own `npm ci`), not a re-litigation of whether cloud mode works.
- **The group currently shows no `expensa-user-*` databases**, test artifacts having been
  cleaned up. That is a statement about the group's present contents, not about the smoke
  test, and it is what keeps the prefix-rename window in Out of scope genuinely open.

### Container runtime: podman locally, `--remote-only` to deploy

Neither docker nor podman is installed. The approach is **both tools, for different jobs, and
deliberately not wired together**:

```sh
sudo zypper install podman

podman build -t spendifico-api .                                  # packaging, in seconds
podman run --rm -p 3000:3000 -v ./tmpdata:/data:Z spendifico-api   # local mode, no TURSO_* set
fly config validate                                               # fly.toml, before any boot
fly deploy --remote-only                                          # the only deploy path
```

Note podman comes from **zypper** while flyctl came from **mise**, and that is the right split
rather than an inconsistency: mise handles self-contained versioned binaries, whereas a
container runtime needs system integration (subuid/subgid ranges, netavark) that only the
distro package wires up. This is openSUSE Tumbleweed, so `zypper`, never `dnf` or `apt`.

Four reasons this split is the right one:

- **Deploy always via `--remote-only`, because that is what CI will do.** PET-55 runs
  `flyctl deploy --remote-only` on a GitHub runner. A laptop that deploys through a local
  daemon while CI deploys remotely is **two build paths that can diverge**, and the failure
  presents as "works on my machine". Matching them now costs nothing.
- **Build locally anyway, for the feedback loop.** A first containerization of an app with
  native napi bindings and a runtime-resolved migrations folder takes several iterations.
  `podman build` with a warm cache is seconds; a `--remote-only` round trip is minutes.
- **Never connect podman to flyctl.** flyctl looks for a **Docker daemon socket**, and podman
  is daemonless, so integrating them means running `podman system service` and exporting
  `DOCKER_HOST`. That works but it is a community workaround, and it is unnecessary: podman
  validates the image, flyctl deploys it, and neither needs to know the other exists.
- **Run the local test in local mode**, no `TURSO_*` variables. That isolates what the
  container is actually responsible for - does it boot, do the ESM/napi bindings load, does
  `drizzle/` resolve from `/app`, does `mkdir(DATABASE_DIR)` succeed on the mount - without
  dragging Turso into a test about packaging. Cloud mode is already proven and is not what is
  on trial.

**One thing not to attempt locally: the volume-permission behaviour from risk 7.** Rootless
podman maps container root to your own UID through user namespaces, so it cannot reproduce
Fly mounting a volume root-owned. A local result there is misleading in both directions.
Validate it on Fly, on the first deploy, which is the cheap moment: new app, empty volume,
no data to lose. That is also when to decide about `USER node`, rather than guessing first.

## Using Fly: a runbook

### Logging in requires a real terminal

`fly auth login` needs an interactive TTY and a browser handoff, so it **cannot** be run
from an agent session, a CI job, or any non-interactive shell - it fails with "requires an
interactive terminal". Do it once in a normal terminal window. The token then persists to
`~/.fly/config.yml`, and every later `fly` command, including ones run by tooling in the
same home directory, picks it up from there. Headless contexts use `FLY_API_TOKEN` from
`fly tokens create` instead, which is the mechanism a future CI deploy would use.

### Always name the org

**`fly launch` defaults to the `personal` org**, which is the single-user one and is not
where this app belongs. Pass `--org spendifico` explicitly:

```sh
fly launch --org spendifico --no-deploy
fly volumes create spendifico_data --org spendifico --region lhr --size 3
```

Getting this wrong is recoverable but genuinely annoying, because **a volume cannot move
between orgs**: the fix is recreating the machine and re-bootstrapping every replica from
Turso Cloud.

### Day to day

```sh
fly config validate            # the only pre-boot check on fly.toml. Run before every deploy
fly deploy                     # build and release. Brief downtime, by decision 5
fly status                     # machine state, current release
fly logs                       # live tail. Ephemeral: nothing is retained
fly ssh console                # a shell in the running machine
fly machine list               # ids, needed by the commands below
fly secrets list               # names and digests only, never values
fly volumes list               # confirm the volume is attached and its size
```

### The two commands this ticket exists to exercise

```sh
fly machine stop <id>          # then watch `fly logs` for the shutdown path completing
fly machine start <id>         # confirm the replica reopens from the volume
```

If the shutdown log is cut off rather than finishing, `kill_timeout` is too low and writes
are being lost on every restart. That is the failure this whole plan is built around.

### Rolling back

There is no second machine to fall back to, so rollback is the recovery path:

```sh
fly releases                   # version history
fly deploy --image <previous-image-ref>
```

Worth doing once deliberately, while nothing is at stake, so the procedure is known before
it is needed.

## Tasks

The order is chosen so each step can fail for **one** reason only. That is the whole value of
it: a failure at step 7 that could have been the Dockerfile, the Fly config, or provisioning
is a failure you cannot diagnose.

- [ ] **Install podman** (`sudo zypper install podman`). Do not wire it to flyctl
- [ ] **Write the `Dockerfile` and the `.dockerignore`**, both drafted above. Do not skip the
      second: it is what keeps local user databases and `.env` files out of the image
- [ ] **`podman build`** - proves packaging alone
- [ ] **`podman run` in local mode** with a bind-mounted `/data`, no `TURSO_*` set - proves
      boot, ESM/napi bindings, and that `drizzle/` resolves from `/app`
- [ ] **`fly launch --org spendifico --no-deploy`**, then replace the generated `fly.toml`
      with the one above. The `--org` flag is mandatory: `fly launch` defaults to `personal`
- [ ] **`fly config validate`** - the only check on `fly.toml` before a machine boots from it
- [ ] **Create the volume, then set the secrets in one command.** A split `fly secrets set`
      restarts the machine against an incomplete `TURSO_*` group and crashes on Joi each time
- [ ] **`fly deploy --remote-only`.** Watch the logs for the boot sequence: config
      validation, central open, central migrate, listen
- [ ] **`fly machine stop` while tailing `fly logs`** - confirm the shutdown path completes
      rather than being cut off. **This is the check the whole ticket exists for**
- [ ] **Restart and confirm no data was lost**, then run the cloud-mode flow inside the
      container and confirm the row reaches Turso Cloud
- [ ] **Decide about `USER node`** now that the real mount behaviour has been observed, per
      risk 7
- [ ] **Exercise the rollback path once** (`fly releases`, `fly deploy --image <ref>`) while
      nothing is at stake
- [ ] **In the Vercel project**, set `BACKEND_URL` to the Fly URL and the function region to
      `lhr1`. Neither can be exercised yet: PET-19 deleted the scaffold greeting page, so
      nothing in `frontend/src` fetches the backend and the wire arrives with PET-52
- [ ] **Write the README deploy section**: commands, required secrets, and the
      single-instance constraint with its reason

The last two `fly machine` items are the real acceptance. Everything before them is getting
to the starting line.

## Verification

All of it is done **directly against the API**, with curl or the Swagger UI, because the
frontend currently makes no backend calls at all. That is not a gap in this ticket: the
access flow's frontend half (PET-52) plus the profile read (PET-45) are what restore the
wire, and until they land there is no screen that would exercise a deployed backend.

The first four are the ones that would otherwise fail silently:

1. **Graceful stop.** `fly machine stop <id>` while tailing `fly logs`, and confirm the
   shutdown path completes rather than being cut off. This is the single most important
   check in the ticket.
2. **Restart without data loss.** Write a transaction, restart the machine, read it back.
   Then confirm it is also present in Turso Cloud from a second client, which proves the
   push happened rather than the read being served from a stale local file.
3. **Migrations resolved.** A fresh user's first authenticated request must create their
   tables. If `drizzle/` is missing, the migrator throws at that moment, not at boot.
4. **Engine check.** `turso db list` and confirm TYPE reads `Turso`, not `SQLite`, for a
   newly provisioned user database. Getting `use_tursodb` wrong is silent and only fixable
   by deleting the database.
5. Mail smoke test to `spendifico@gmail.com` per README, using a throwaway central
   database so a test registration never reaches the real user directory.
6. `GET /api/docs` renders, and `GET /` still 404s (the global `api` prefix).

## Known risks and accepted trade-offs

1. **Single instance means single point of failure and downtime on every deploy.**
   Accepted: no availability target exists, and the alternative is the multi-replica
   correctness problem, which is worse than being down for ten seconds.
2. **512MB may be tight.** One Node process holding the central replica plus every open
   user replica, with an unbounded connection cache (`UserDatabaseService.connections` is
   deliberately unbounded, per its own comment). Fine at academy scale; the LRU with idle
   eviction that comment mentions becomes real work if memory pressure shows up. Bumping
   to 1GB costs $2.60/mo more.
3. **Swagger UI is served publicly at `/api/docs`.** Fine for a teaching project and
   useful for the frontend, but it is worth a conscious decision rather than an accident.
   Out of scope here; noted so it is not discovered later.
4. **`turso db destroy` cannot address per-user databases** because the CLI uses a stale
   local name cache. Cleanup of test users provisioned against the real group has to go
   through the Turso MCP or the Platform API.
5. **The volume is not backed up by this plan.** Fly snapshots exist (first 10GB free) but
   the real answer is that Turso Cloud is the system of record, so the volume is
   expendable. Worth confirming Turso's own backup story separately.
6. **Deploy is manual.** No GitHub Actions deploy job; CI still only lints, builds and
   tests. Automating it is **PET-55** ("[INFRA] Automate the backend deploy with GitHub
   Actions", 3 points), which is linked as blocked by this ticket. The order is deliberate,
   not bureaucratic: automating before a manual `fly deploy` has ever succeeded makes a red
   CI run indistinguishable from a bad `fly.toml`, a bad Dockerfile or a bad secret.
7. **The container runs as root.** No `USER` directive, which is a security smell rather
   than a live problem on a single-tenant machine. Note the trap before "fixing" it: Fly
   mounts volumes root-owned, so adding `USER node` without a `chown` or an init step turns
   `mkdir(DATABASE_DIR)` into a permission error at boot. Either change both together or
   leave it alone deliberately.
8. **Nothing verifies the `Dockerfile` or `fly.toml` after this ticket.** This repo is
   otherwise strict about drift, with two CI jobs whose only purpose is failing on a stale
   generated artifact - yet CI will never build the image or validate the Fly config, so
   both can rot silently until the next manual deploy discovers it. A `docker build` step,
   or even just `fly config validate`, would match how the rest of the repo treats this
   class of problem. Deliberately not added here, because it belongs with the CI deploy job.

## Out of scope, flagged deliberately

- The Vercel project for the frontend beyond two settings: `BACKEND_URL` and the `lhr1`
  function region. The rest is already documented in `frontend/README.md` and needs no code.
  Those two are in scope only because they are the same settings visit and the region
  default is wrong for this topology; getting them at deploy time costs nothing, while
  discovering the `iad1` default later means debugging mysterious latency.
- A CI deploy job, which is **PET-55**, blocked by this ticket. Three findings from
  2026-08-04 that it inherits, the first two the opposite of what was assumed:
  - **Fly has no GitHub integration to connect.** There is no repo picker, no GitHub App, no
    import flow. Fly's entire documented GitHub path is a workflow file you write yourself,
    authenticated by a `FLY_API_TOKEN` repository secret from `fly tokens create deploy`. Do
    not go looking for a dashboard connection; it does not exist at any repo visibility.
  - **No repo admin is needed, and none can be granted.** This repo is owned by a personal
    account, where GitHub offers only owner and collaborator - the granular five-role model
    is an organization feature, so the owner _cannot_ grant admin even if asked. It does not
    matter: admin is required only to see the secrets UI in Settings, while a write-level
    collaborator can create and update Actions secrets through the API
    (`gh secret set FLY_API_TOKEN`). Verified by reaching the secrets public-key endpoint.
    This ticket itself needs no GitHub permissions at all, because it deploys from a local
    checkout.
  - **Deploy-on-every-merge is riskier here than for a stateless app**, which is PET-55's
    main design decision. Every deploy stops the machine, so every trigger is a full
    replica-flush cycle: `closeAll()` pushing every open user database, then a cold start
    re-pulling the central replica and re-migrating each user database on first touch. Plus
    brief downtime, by decision 5. Acceptable _if_ `kill_timeout` is right, but it multiplies
    how often the graceful-stop path runs, and that path's failure mode is silent data loss.
    `workflow_dispatch` or a tag trigger keeps the flush cycles deliberate; push-to-`main` is
    the right default for a stateless service and a slightly aggressive one here.
- Any change to the persistence layer. If the free-tier question comes back and the answer
  becomes "run it on Vercel after all", that is a different ticket: it means dropping the
  sync replica for a remote HTTP driver, which changes read latency, moves migrations off
  first-open, and walks away from the offline/sync roadmap that the tombstone columns and
  the deferred "hand the browser its own sync token" item in `docs/TODO.md` exist to serve.
- **Renaming `USER_DB_NAME_PREFIX`, though the window to do it cheaply is open right now.**
  It is still `expensa-user-` in `database.constants.ts`, left from before the PET-51 rename,
  and `CLAUDE.md` records that the rename deliberately stopped there because changing the
  prefix would orphan existing per-user databases. The `turso db list` check above shows
  **zero** per-user databases exist, so today that constraint does not actually bind and a
  rename would cost nothing. It stops being free the first time anyone verifies in cloud
  mode - which is a step in this very ticket. Deliberately not done here, because it touches
  the persistence layer rather than the deployment, and it deserves its own ticket rather
  than being smuggled into an INFRA one. Noted here so the window is a decision rather than
  something discovered after it closed.
