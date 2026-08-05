# Deployment

How to deploy the NestJS backend to Fly.io and point the Vercel frontend at it. Why the
deployment is shaped this way - one instance, the long kill timeout, the container running as
root - is in `backend/CLAUDE.md` under Deployment. Variable defaults are in
[`configuration.md`](configuration.md), which is their single home; this file names variables but
never restates a default.

The frontend's own Vercel setup is in [`../../frontend/README.md`](../../frontend/README.md).

## What is deployed

| Thing | Value |
| --- | --- |
| Fly app | `spendifico-api`, in the `spendifico` organization |
| URL | `https://spendifico-api.fly.dev` |
| Region | `lhr`, chosen to sit near the Turso group in `aws-eu-west-1` |
| Machine | One, `shared-cpu-1x` with 512MB and 512MB of swap. Stops when idle |
| Volume | `spendifico_data`, 1GB, encrypted, mounted at `/data` |
| Config | `backend/fly.toml`, `backend/Dockerfile`, `backend/.dockerignore` |

Everything runs from `backend/`, because that is the build context and where `fly.toml` lives.

## The one command

```sh
cd backend
fly deploy --remote-only --ha=false
```

**`--ha=false` is not optional.** `fly deploy --ha` defaults to **true**, so a bare `fly deploy`
creates a spare machine. There is no `fly.toml` key that prevents this and neither
`auto_stop_machines` nor `min_machines_running` affects it. A second machine is a second replica
set holding its own unpushed writes, which is a correctness failure rather than a cost surprise -
see `backend/CLAUDE.md`. After any deploy, confirm the count:

```sh
fly machine list          # must show exactly one machine
```

`--remote-only` is already the default in flyctl 0.4.77; it is passed explicitly so the command
documents itself and matches what a CI job will run.

## First-time setup

Ordered so each step can fail for one reason only. Only step 4 needs real secret values.

```sh
# 1. The app. --org is mandatory: fly defaults to `personal`, and a volume cannot
#    move between organizations afterwards.
fly apps create spendifico-api --org spendifico

# 2. The config, before anything boots from it. --strict also rejects unrecognized
#    keys, which is the mistake this file is most likely to introduce.
cd backend && fly config validate --strict

# 3. The volume. The region must match primary_region or the machine cannot
#    attach it. Scheduled snapshots are on by default, 5-day retention.
#    1GB is Fly's minimum and still far more than this app needs. Size up rather
#    than down if unsure: volumes can be EXTENDED but never shrunk.
fly volumes create spendifico_data --region lhr --size 1

# 4. The secrets, in ONE command. See the warning below.
fly secrets import        # then paste NAME=VALUE lines, or pipe them in

# 5. Packaging alone, nothing booted. A failure here is the Dockerfile.
fly deploy --remote-only --build-only

# 6. The real thing.
fly deploy --remote-only --ha=false
```

**Set the secrets in one command, never one at a time.** `fly secrets set` restarts every machine,
and the four `TURSO_*` variables are validated as a group, so setting them individually boots the
app against an incomplete set and Joi fails it each time. On a brand-new app the values are staged
until the first deploy, which is why step 4 comes before step 6. To change a secret later without
an immediate restart, use `fly secrets set --stage` and then `fly secrets deploy`.

Five secrets are set: `TURSO_ORG`, `TURSO_ORG_TOKEN`, `TURSO_CENTRAL_DB_URL`,
`TURSO_CENTRAL_DB_TOKEN` and `MAILPACE_API_TOKEN`. Everything else the app reads is non-secret and
lives in `fly.toml`'s `[env]`. `TURSO_GROUP_TOKEN` is deliberately **not** set, because the
application never reads it.

Piping from a local `.env` keeps the values out of your shell history and out of any terminal
transcript, since `fly secrets import` echoes only names:

```sh
rg -N '^(TURSO_ORG|TURSO_ORG_TOKEN|TURSO_CENTRAL_DB_URL|TURSO_CENTRAL_DB_TOKEN|MAILPACE_API_TOKEN)=' \
  backend/.env | fly secrets import
```

Check the file first for values carrying a trailing `#` comment or wrapping quotes; either would
be imported as part of the token.

## Day to day

```sh
fly status                     # machine state and current release
fly logs                       # live tail. Nothing is retained, so copy anything you need
fly logs --no-tail             # the recent buffer, without holding the terminal
fly ssh console                # a shell in the running machine
fly machine list               # ids, and the count that must stay at one
fly secrets list               # names and digests only, never values
fly volumes list               # size, region, and which machine holds it
fly config show                # the config as the RUNNING machine resolved it
```

`fly config show` reads from a running machine, so it fails on an app that has never deployed. It
is the only way to confirm what the platform made of the file rather than what you meant: it is
what shows `kill_timeout = "60s"` arriving as `"1m0s"`.

## Verifying a deploy

The first four are the ones that fail silently.

**1. Exactly one machine.** `fly machine list`. Two means `--ha=false` was missed.

**2. The boot sequence.** In `fly logs`, in order: the volume mounting at `/data`, Nest starting,
`UsersModule dependencies initialized` (that pause is the central replica opening and migrating),
then `Nest application successfully started`. Observed at about **9 seconds** from machine start
to listening, of which ~2s is the central replica on a cold volume and ~1s on a warm one. The
health check's `grace_period` is set to roughly three times that.

**3. The graceful stop. This is the most important check.** Tail the logs in one terminal, then:

```sh
fly machine stop <id>          # BARE. Never pass --timeout
```

`fly machine stop --timeout` overrides `kill_timeout` for that stop, which would make this test
prove nothing. Note that with autostop on, `auto_start_machines` is `true`, so any request - a
browser tab, a curl - wakes the machine straight back up. Either set `auto_start_machines = false`
for the duration of the test, or read the flush out of the logs after an ordinary idle autostop,
which exercises the same path. Look for both bracket lines:

```text
INFO Sending signal SIGINT to main child process w/ PID 657
[DatabaseModule] Flushing and closing 0 user database(s) and the central replica...
[DatabaseModule] Databases flushed and closed
INFO Main child exited with signal (with signal 'SIGINT', core dumped? false)
```

**An opening line with no closing line means the flush was cut off**, writes are being lost on
every restart, and `kill_timeout` is too low. That is the failure the whole deployment is built
around, and the two log lines exist so it is visible rather than silent.

**4. Restart without data loss.** `fly machine start <id>`, then read a record back through the
API - and read the same record from a second client (the Turso MCP server) to prove the push
happened rather than a stale local file being served. Allow up to one `TURSO_SYNC_INTERVAL_S`
beat: the cloud copy legitimately lags by up to one interval.

**5. Migrations resolved in the image.** A brand-new user's first authenticated request has to
create their tables. If `drizzle/` were missing from the image, the migrator throws at that
moment rather than at boot. Confirm the folder is where the code expects it:

```sh
fly ssh console --command "ls /app/drizzle"     # must list central and user
```

**6. The engine of a newly provisioned user database.** `turso db list`, and the `TYPE` column
must read `Turso`, not `SQLite`. Getting this wrong is silent and the only remedy is deleting the
database. Note the CLI cannot address a per-user database beyond `list`; use the Turso MCP server.

## Idling and cold starts

The machine stops when Fly's proxy sees no traffic, and starts again on the next request. That is
a cost decision for a showcase, and it costs a **cold start of about nine seconds** on the first
request after an idle period - Node booting, then the central replica opening and migrating. Later
requests are warm.

Two things this deliberately does not do. It does not create a second instance: autostart starts
*the* machine, while a second replica set only comes from `--ha` or autoscaling. And it does not
skip the shutdown flush - an autostop sends the configured `kill_signal` and honours
`kill_timeout`, so writes are pushed exactly as they are on a manual stop.

`"suspend"` would resume faster by freezing the process instead of stopping it, but the shutdown
hook never runs, so locally-committed writes stay unpushed in frozen memory. `"stop"` is the right
trade here.

To pin the machine on - before a demo, say - set `min_machines_running = 1` and
`auto_stop_machines = "off"`, then deploy. To confirm what the platform actually applied, use
`fly config show`.

## Rolling back

There is no second machine to fail over to, so rollback is the recovery path:

```sh
fly releases                          # version history
fly deploy --image <previous-image-ref>
```

Worth doing once deliberately, while nothing is at stake, so the procedure is known before it is
needed. It requires at least two releases to exist.

## The Vercel side

Two settings, both in the Vercel project whose root directory is `frontend/`:

- **`BACKEND_URL`** points at `https://spendifico-api.fly.dev`.
- **The function region is `lhr1`**, pinned by `frontend/vercel.json` and confirmable under
  Settings, Functions, Function Regions.

**Match Fly, not Turso.** This is easy to get backwards, because Vercel's own guidance is "run
functions close to your database". The frontend's data source is not Turso, it is this API: the
path is browser to Vercel function to Fly, and only Fly talks to Turso. `dub1` is the same AWS
region as the Turso group and is the wrong choice for that reason. The default is `iad1`
(Washington), which would put a transatlantic round trip on every server-side fetch.

Hobby gets one region, freely chosen, and exceeding the plan's count fails the deployment before
the build rather than silently dropping extras. There is no function failover on Hobby, so an
`lhr1` outage is downtime.

Neither setting can be exercised end to end yet: nothing in `frontend/src` fetches the backend
until the session cookie lands.

## Costs

Pay As You Go, with no fixed plan and **no hard spend cap by default**.

The volume is the only guaranteed charge: **$0.15/month** for 1GB, billed on provisioned capacity
even while the machine is stopped. The machine bills only for the time it actually runs, which
with autostop is a small fraction of the day for a showcase - against roughly $3.32/month had it
run continuously. Egress is extra.

Nothing structurally prevents a mistake - a larger VM, a second machine from a missing
`--ha=false`, an egress spike - from costing more, so a budget alert on the organization is worth
setting.

Two levers if it ever needs to be cheaper. Dropping the machine to 256MB would save roughly
$1.34/month of running time, but measured idle RSS is **119MB with no user databases open**, and
`UserDatabaseService.connections` never evicts - so 256MB (about 210MB usable) leaves little room,
and the failure mode is an OOM kill, which skips the shutdown flush and loses writes silently.
With autostop on, that saving is mostly moot anyway. The volume cannot go below 1GB.

## Not automated yet

The deploy is manual. A GitHub Actions job is PET-55, and nothing in CI currently builds the image
or validates `fly.toml`, so both can drift until the next manual deploy discovers it.
