---
name: repo-fly
description: This skill should be used when the user asks to "deploy the backend", "deploy to Fly", "run a fly command", "check the deployed app", "restart the machine", "roll back the deploy", "add or rotate a Fly secret", "set up a custom domain", "bump the rate limit for a demo", or edits `backend/fly.toml` / `backend/Dockerfile` / debugs a Fly deploy. Drives Fly through flyctl in Bash, never the MCP server, and carries the traps that bit this project so they do not bite again.
argument-hint: "[deploy | status | logs | stop | rollback | secrets | domain | showcase]"
allowed-tools: Bash(fly:*), Bash(flyctl:*), Bash(curl:*), Read
---

> **Tools used:** `Bash(fly:*)` / `Bash(flyctl:*)` to drive the platform (both binary
> names work; they are the same tool), `Bash(curl:*)` to probe the deployed API, `Read`
> for the authoritative docs this skill points at.

This skill is **not** the runbook. The runbook - every command with its real flags, the
first-time setup order, the verification steps, the showcase lever - lives in
`docs/guides/deployment.md`, and the config with its reasoning lives in `backend/fly.toml`
and `backend/CLAUDE.md` (Deployment). Read those for the *how* and *why*. What follows is
the agent-facing layer: when this loads, and the traps that a human reading the runbook
would not need spelled out but an agent driving `flyctl` must know.

Drive Fly through `flyctl` in Bash. The Fly MCP server was evaluated and declined for this
project; do not re-evaluate or offer to install it.

## Before you run anything

- **`fly auth login` needs a real TTY and a browser.** An agent session cannot run it - it
  fails with "requires an interactive terminal". If `fly auth whoami` does not already
  return the account, **stop and ask the user** to log in themselves (or, for a headless
  context, to provide a `FLY_API_TOKEN`). Never try to work around it.
- **Run every `fly` command from `backend/`.** That directory holds `fly.toml`; from the
  repo root, `fly` errors with "the config for your app is missing an app name". The error
  is loud, which is the one upside.
- **`--org` is mandatory on create commands.** `fly apps create` / `fly volumes create`
  default to the `personal` org, and a volume cannot move between orgs afterwards.

## The traps that bit this project

Each of these caused, or nearly caused, a real failure during the initial deploy.

- **`fly deploy` must carry `--ha=false`, every time.** `--ha` defaults to `true` and
  silently creates a spare machine, which is a second replica set with its own unpushed
  writes - the exact correctness failure the whole single-instance design forbids. No
  `fly.toml` key prevents it. After any deploy, confirm `fly machine list` shows exactly
  one machine.
- **`fly machine stop` must be bare - never pass `--timeout`.** The flag overrides the
  configured `kill_timeout`, which would cut off the shutdown flush and void the
  graceful-stop check that this deployment exists to protect. `--signal` already defaults
  to the configured `kill_signal`.
- **`fly deploy` does not start a *stopped* machine.** It updates config and leaves a
  stopped machine stopped, so a deploy can report success while every request 503s. If
  `fly status` shows `stopped`, run `fly machine start <id>`.
- **`fly config show` reads a *running* machine.** It fails on an app that has never
  deployed or is stopped. It is also the only way to see what the platform actually
  resolved (e.g. a quoted duration arriving normalized), so prefer it over trusting the
  file when confirming a change landed.
- **Set secrets in one command, never one at a time.** `fly secrets import` (values piped
  from stdin, names only echoed back) applies them atomically; setting a validated group
  one variable at a time boots the app against an incomplete set and crashes it on each
  restart. Never let a secret value reach the transcript - pipe it, redact it.
- **A volume is region-pinned and can only be extended, never shrunk.** To change region
  or shrink, destroy and recreate - which is safe **only** after a clean stop where the
  shutdown log printed *both* its bracket lines, because the volume then holds nothing that
  Turso Cloud cannot re-bootstrap.

## Debugging what the proxy actually sends

When a request-header question comes up (client IP, `X-Forwarded-For`, hop count), do not
guess from docs. Add a **temporary, uncommitted** diagnostic route to `backend/src/main.ts`
that echoes `req.ip`, `req.ips` and the raw headers, deploy it (Fly builds from the working
tree, not git, so it never touches history), read it, then revert the file. This is how the
real proxy chain was measured rather than assumed.

**One footgun to avoid in that route:** `app.get('some string')` on a Nest application is
the **dependency-injection resolver**, not Express's setting getter - it throws
`UnknownElementException` for an unknown key and takes the whole process down. Reach Express
settings through `app.getHttpAdapter().getInstance()`, or do not read them at all. Getting
this wrong caused a live outage.

## Where the facts live (do not restate them here)

| You need                                                    | Read                                          |
| ----------------------------------------------------------- | --------------------------------------------- |
| the command sequence, verification, showcase lever          | `docs/guides/deployment.md`                   |
| the deployed config and why each value is what it is        | `backend/fly.toml`                            |
| why one instance, the kill-timeout, root, trust-proxy count | `backend/CLAUDE.md` (Deployment)              |
| the image build and what must ship in it                    | `backend/Dockerfile`                          |

Anything with a concrete value - the region, `kill_timeout`, the volume size, the rate
limits, `TRUST_PROXY_HOPS` - is owned by those files. Point at them; a copy here would drift.
