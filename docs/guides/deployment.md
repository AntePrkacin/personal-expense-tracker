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
| Machine | One, `shared-cpu-1x` with 512MB and 512MB of swap. Runs continuously |
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
prove nothing. `auto_start_machines` is false, so the machine stays stopped and the test is not
raced by the next request. Look for both bracket lines:

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

## The machine runs continuously, and autostop was rejected

`auto_stop_machines = "off"`, so responses are always warm (~200ms) and there is never a cold
start. That costs roughly $3.32/month of machine time, which is accepted.

Autostop was configured, deployed and measured before being reverted, so it does not need
retesting. It works: the shutdown flush ran on an autostop, and the health check did not keep the
machine alive. What ruled it out was **~15 seconds** to serve the first request after idling -
about 9s app, the rest Fly starting the machine - and the fact that Fly gives **no way to tune the
idle delay**. The proxy's stop loop runs on its own schedule and decides on excess capacity;
`idle_timeout` is an HTTP connection setting, not this. `backend/CLAUDE.md` has the full reasoning.

`auto_start_machines` is also false, which matters mainly for one thing: a `fly machine stop`
**stays** stopped, so the graceful-shutdown check below is deterministic. Crashes are covered
separately by Fly's own restart policy.

The trade-off is sharper than it sounds, and it bit during this ticket: a machine that is stopped
for any reason **stays down and every request 503s**, because nothing is permitted to wake it. Note
in particular that **`fly deploy` does not start a stopped machine** - it updates the config and
leaves it stopped. So after switching autostop off, or any time `fly status` shows `stopped`:

```sh
fly machine start <id>
```

## Rolling back

There is no second machine to fail over to, so rollback is the recovery path:

```sh
fly releases                          # version history
fly deploy --image <previous-image-ref>
```

Worth doing once deliberately, while nothing is at stake, so the procedure is known before it is
needed. It requires at least two releases to exist.

## `FRONTEND_URL` is load-bearing

The production frontend is **`https://www.spendifico.eu`**, and that is what `fly.toml` sets.
Local development does not use this value: the default there is `http://localhost:4200`, per
[Configuration](configuration.md).

It has **two** consumers, and the second is the one that gets missed:

- `main.ts` uses it as the only allowed CORS origin.
- `auth.service.ts` uses it as the **base of every emailed login link**.

So a wrong value does not fail at boot - Joi checks only that it parses as a URI - it fails as
login emails pointing at a dead host, with a 202 and nothing usable in the inbox. Getting it
exactly right matters more than it looks.

Three consequences of "exactly one origin", all live:

- **`www` is not interchangeable with the apex.** A browser on `https://spendifico.eu` sends that
  as its `Origin`, and it will not match `https://www.spendifico.eu`. The apex has to **redirect**
  to `www` rather than serve the app, or those visitors get CORS failures and login links they
  cannot use.
- **No Vercel preview deployment will ever pass CORS**, since each preview gets its own hostname.
- Changing it is an edit plus a deploy:

```sh
cd backend
# edit FRONTEND_URL in fly.toml, then
fly deploy --remote-only --ha=false
```

One thing still missing, so nobody reads this as finished: links now point at
`https://www.spendifico.eu/auth/verify?token=...`, and that **route does not exist yet**. The
frontend half of verification is PET-52. Until it ships, a link resolves to the domain and then
404s, and the flow can only be completed by posting the token to `POST /api/auth/verify` directly.

## The Vercel side

Three settings, all in the Vercel project whose root directory is `frontend/`:

- **`BACKEND_URL`** points at `https://spendifico-api.fly.dev`.
- **The function region is `lhr1`**, pinned by `frontend/vercel.json` and confirmable under
  Settings, Functions, Function Regions.
- **The production domain is `www.spendifico.eu`**, with the apex `spendifico.eu` **redirecting**
  to it rather than serving the app. That is not cosmetic: the backend allows exactly one CORS
  origin and it is the `www` form, so an apex that serves the app directly breaks both CORS and
  every login link. See the `FRONTEND_URL` section above.

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

Roughly **$3.47/month**: about $3.32 for the machine running continuously plus **$0.15** for the
1GB volume, which bills on provisioned capacity even while the machine is stopped. Egress is extra.

Nothing structurally prevents a mistake - a larger VM, a second machine from a missing
`--ha=false`, an egress spike - from costing more, so a budget alert on the organization is worth
setting.

Two levers if it ever needs to be cheaper. Dropping the machine to 256MB would save roughly
$1.34/month of running time, but measured idle RSS is **119MB with no user databases open**, and
`UserDatabaseService.connections` never evicts - so 256MB (about 210MB usable) leaves little room,
and the failure mode is an OOM kill, which skips the shutdown flush and loses writes silently.
The volume cannot go below 1GB. Autostop would cut the machine charge to near zero but was
rejected for the cold start, as above.

## Not automated yet

The deploy is manual. A GitHub Actions job is PET-55, and nothing in CI currently builds the image
or validates `fly.toml`, so both can drift until the next manual deploy discovers it.
