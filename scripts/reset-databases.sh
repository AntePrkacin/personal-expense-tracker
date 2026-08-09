#!/usr/bin/env bash
# Reset Spendifico's databases back to a clean state.
#
# Two modes, and the flag is REQUIRED rather than defaulted, because the two are
# not equally forgiving. Invoked by `mise run reset` and `mise run reset:cloud`.
#
#   --local   Delete the SQLite files under backend/databases/. They are
#             gitignored and the app rebuilds them on next boot. Needs no
#             credentials and touches nothing remote.
#
#   --cloud   Delete every Turso database, recreate the central one, replace the
#             Fly volume and redeploy. DESTROYS PRODUCTION DATA: every account,
#             every transaction, every session.
#
# ---------------------------------------------------------------------------
# WHY THE CLOUD ORDER IS WHAT IT IS
#
# The Fly volume holds embedded REPLICAS, not caches, and they sync in both
# directions: turso-client.factory.ts schedules push() then pull() on a timer,
# and DatabaseModule.onApplicationShutdown does a final push() on every open
# replica. So deleting rows in Turso while the machine is running lets the
# replica push them straight back, silently restoring the state you were
# clearing. The machine is therefore stopped BEFORE any Turso call, and the
# volume is DISCARDED rather than reused - sanctioned by backend/fly.toml's own
# note that the volume "holds a replica that connectSync re-pulls, never the
# system of record".
#
# The redeploy pins the digest that was already running, captured before the
# machine is destroyed. A reset must never ship whatever is in the working tree.
#
# ---------------------------------------------------------------------------
# CREDENTIALS
#
# Needs TURSO_API_TOKEN, an operator token that can LIST databases. The app's
# own TURSO_ORG_TOKEN cannot: it is scoped to db:create, db:delete and
# db:mint-token, and GET /v1/organizations/{org}/databases answers 403 with it
# (verified 2026-08-09). TURSO_API_TOKEN is deliberately absent from
# backend/.env.example and from the Joi schema in src/config/env.validation.ts -
# the app must never hold a credential that can delete databases.
#
# Read from the environment, falling back to backend/.env.local (gitignored).
# Also needs flyctl authenticated (`flyctl auth whoami`).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$REPO_ROOT/backend"
FLY_TOML="$BACKEND/fly.toml"
DB_DIR="$BACKEND/databases"

# Every env file that may carry the central pointer. Both are gitignored. The
# app reads .env; .env.local is where cloud credentials are commonly stashed
# while .env stays in local mode.
#
# This list is the WHOLE reach of the token rotation in step 8. Any other copy of
# TURSO_CENTRAL_DB_TOKEN - a second machine, a CI secret, a password manager, a
# stash outside the repo - goes stale on every reset and nothing here will find
# it. Adding a path is cheap; discovering a stale copy is not, because the
# symptom is a boot failure on a credential rather than anything resembling a
# reset problem.
ENV_FILES=("$BACKEND/.env" "$BACKEND/.env.local")

TURSO_API="https://api.turso.tech/v1/organizations"
USER_DB_PREFIX="spendifico-user-"

step() { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

usage() {
  cat >&2 <<'USAGE'
Usage: reset-databases.sh (--local | --cloud)

  --local   Delete backend/databases/. Safe, needs no credentials.
  --cloud   Delete every Turso database, recreate central, replace the Fly
            volume and redeploy. DESTRUCTIVE.
USAGE
  exit 2
}

# --------------------------------------------------------------------------
# Shared helpers
# --------------------------------------------------------------------------

# Read a key out of the first env file that defines it. Values are unquoted.
env_get() {
  local key="$1" file
  for file in "${ENV_FILES[@]}"; do
    [ -f "$file" ] || continue
    local line
    line="$(grep -m1 "^${key}=" "$file" 2>/dev/null || true)"
    if [ -n "$line" ]; then
      printf '%s' "${line#*=}"
      return 0
    fi
  done
  return 1
}

# Set a key in every env file that already defines it. Never creates the key in
# a file that did not have it: a file in local mode must stay in local mode, or
# the next boot silently switches persistence modes. Reads the value from a file
# so a secret never appears in a process argument list.
env_set_from_file() {
  local key="$1" value_file="$2" file
  for file in "${ENV_FILES[@]}"; do
    [ -f "$file" ] || continue
    grep -q "^${key}=" "$file" || continue
    python3 - "$file" "$key" "$value_file" <<'PY'
import sys
path, key, value_file = sys.argv[1], sys.argv[2], sys.argv[3]
value = open(value_file).read().strip()
lines = open(path).read().split('\n')
for i, line in enumerate(lines):
    if line.startswith(key + '='):
        lines[i] = key + '=' + value
open(path, 'w').write('\n'.join(lines))
PY
    info "updated $key in ${file#"$REPO_ROOT"/}"
  done
}

# A value out of fly.toml, so the app name, region and volume name keep their
# single home rather than being restated here.
fly_toml_get() {
  python3 - "$FLY_TOML" "$1" <<'PY'
import sys, tomllib
doc = tomllib.load(open(sys.argv[1], 'rb'))
key = sys.argv[2]
print(doc['mounts'][0]['source'] if key == 'volume' else doc[key])
PY
}

# Turso Platform API. Writes the body to $API_BODY and returns the status code
# in $API_STATUS rather than failing, so callers can tolerate a 404.
API_BODY=""
API_STATUS=""
turso_api() {
  local method="$1" path="$2" payload="${3:-}"
  local tmp status
  tmp="$(mktemp)"
  if [ -n "$payload" ]; then
    status="$(curl -sS -o "$tmp" -w '%{http_code}' -X "$method" \
      -H "Authorization: Bearer $TURSO_API_TOKEN" \
      -H 'Content-Type: application/json' \
      -d "$payload" "$TURSO_API/$TURSO_ORG$path")"
  else
    status="$(curl -sS -o "$tmp" -w '%{http_code}' -X "$method" \
      -H "Authorization: Bearer $TURSO_API_TOKEN" \
      "$TURSO_API/$TURSO_ORG$path")"
  fi
  API_STATUS="$status"
  API_BODY="$(cat "$tmp")"
  rm -f "$tmp"
}

# One SQL statement against a database over the Hrana HTTP pipeline, using its
# data-plane token. Prints the first column of the first row.
hrana_scalar() {
  local hostname="$1" token="$2" sql="$3" payload
  payload="$(python3 -c '
import json, sys
print(json.dumps({"requests": [
    {"type": "execute", "stmt": {"sql": sys.argv[1]}},
    {"type": "close"},
]}))' "$sql")"
  curl -sS -X POST -H "Authorization: Bearer $token" \
    -H 'Content-Type: application/json' -d "$payload" \
    "https://$hostname/v2/pipeline" \
    | jq -r '.results[0].response.result.rows[0][0].value // empty'
}

# --------------------------------------------------------------------------
# Local reset
# --------------------------------------------------------------------------

reset_local() {
  step "Local reset"
  if [ -d "$DB_DIR" ]; then
    rm -rf "$DB_DIR"
    info "removed ${DB_DIR#"$REPO_ROOT"/}"
  else
    info "${DB_DIR#"$REPO_ROOT"/} does not exist, nothing to remove"
  fi
  info "The app recreates it, migrates and re-seeds templates on next boot."
  printf '\nDone.\n'
}

# --------------------------------------------------------------------------
# Cloud reset
# --------------------------------------------------------------------------

reset_cloud() {
  # ---- 1. Preflight, before anything is touched --------------------------
  step "1/11 Preflight"

  for tool in curl jq python3 flyctl; do
    command -v "$tool" >/dev/null 2>&1 || die "$tool is required but not installed"
  done
  [ -f "$FLY_TOML" ] || die "not found: $FLY_TOML"

  flyctl auth whoami >/dev/null 2>&1 \
    || die "flyctl is not authenticated. Run: flyctl auth login"

  FLY_APP="$(fly_toml_get app)"
  FLY_REGION="$(fly_toml_get primary_region)"
  FLY_VOLUME="$(fly_toml_get volume)"

  TURSO_ORG="${TURSO_ORG:-$(env_get TURSO_ORG || true)}"
  [ -n "${TURSO_ORG:-}" ] || die "TURSO_ORG is not set and not in any backend env file"

  TURSO_GROUP="${TURSO_GROUP:-$(env_get TURSO_GROUP || true)}"
  TURSO_GROUP="${TURSO_GROUP:-decode-pet}"

  TURSO_API_TOKEN="${TURSO_API_TOKEN:-$(env_get TURSO_API_TOKEN || true)}"
  [ -n "${TURSO_API_TOKEN:-}" ] || die \
"TURSO_API_TOKEN is not set.

This needs an operator token that can LIST databases. The app's TURSO_ORG_TOKEN
cannot - it is scoped to db:create, db:delete and db:mint-token only.

Create one at https://app.turso.tech (Account -> API Tokens), then either:
  export TURSO_API_TOKEN=...
or add it to backend/.env.local (gitignored)."

  CENTRAL_URL="$(env_get TURSO_CENTRAL_DB_URL || true)"
  [ -n "$CENTRAL_URL" ] || die "TURSO_CENTRAL_DB_URL is not in any backend env file"

  # The central database NAME is not stored anywhere on its own, so derive it
  # from the hostname, which is "<name>-<org>.<region>.turso.io". Overridable in
  # case that convention ever changes.
  CENTRAL_HOST="${CENTRAL_URL#*://}"
  CENTRAL_DB="${CENTRAL_DB_NAME:-${CENTRAL_HOST%%-"$TURSO_ORG".*}}"
  [ -n "$CENTRAL_DB" ] && [ "$CENTRAL_DB" != "$CENTRAL_HOST" ] \
    || die "could not derive the central database name from $CENTRAL_URL (set CENTRAL_DB_NAME)"

  # Prove the token can list before destroying anything. This is the exact call
  # the app's own token gets a 403 on, so it is also the check that the right
  # token was supplied.
  turso_api GET "/databases"
  [ "$API_STATUS" = "200" ] || die \
    "listing databases failed with HTTP $API_STATUS. Is TURSO_API_TOKEN a full-access API token?"

  mapfile -t USER_DBS < <(printf '%s' "$API_BODY" \
    | jq -r --arg p "$USER_DB_PREFIX" --arg g "$TURSO_GROUP" \
        '.databases[] | select(.Name | startswith($p)) | select(.group == $g) | .Name')

  info "Fly app        : $FLY_APP ($FLY_REGION, volume $FLY_VOLUME)"
  info "Turso org      : $TURSO_ORG (group $TURSO_GROUP)"
  info "Central db     : $CENTRAL_DB"
  info "User databases : ${#USER_DBS[@]}"

  # ---- 2. Confirmation ---------------------------------------------------
  step "2/11 Confirmation"
  cat <<CONFIRM
This will PERMANENTLY DELETE:
  - ${#USER_DBS[@]} user database(s) in Turso group '$TURSO_GROUP'
  - the central database '$CENTRAL_DB' (recreated empty)
  - the Fly machine and volume '$FLY_VOLUME' for app '$FLY_APP'

Every account, transaction, category and session is destroyed. There is no
backup and no undo.
CONFIRM
  [ -t 0 ] || die "refusing to run without a terminal to confirm on"
  printf "\nType the app name (%s) to proceed: " "$FLY_APP"
  local reply=""
  read -r reply || reply=""
  [ "$reply" = "$FLY_APP" ] || die "confirmation did not match, nothing was changed"

  # ---- 3. Capture the running image, BEFORE destroying the machine -------
  step "3/11 Capturing the deployed image"
  DEPLOYED_IMAGE="${RESET_IMAGE:-$(flyctl machines list --app "$FLY_APP" --json 2>/dev/null \
    | jq -r '[.[] | .config.image] | first // empty')}"
  # No machine means no image to pin - which happens when a previous run died
  # after destroying the machine. Abort rather than fall back to building the
  # working tree: a reset must never be the thing that ships unmerged code, and
  # silently deploying whatever is checked out is exactly that.
  [ -n "$DEPLOYED_IMAGE" ] || die \
"no machine found, so there is no deployed image to pin.

This is expected if an earlier reset failed after destroying the machine. Pass
the image to redeploy explicitly, for example:

  RESET_IMAGE=\$(flyctl releases --app $FLY_APP --image -j | jq -r '.[0].ImageRef') \\
    mise run reset:cloud"
  info "$DEPLOYED_IMAGE"

  # ---- 4. Stop the machine, so no replica can push deleted rows back -----
  step "4/11 Stopping the Fly machine"
  mapfile -t MACHINE_IDS < <(flyctl machines list --app "$FLY_APP" --json 2>/dev/null \
    | jq -r '.[].id')
  if [ "${#MACHINE_IDS[@]}" -eq 0 ]; then
    info "no machines running"
  else
    for id in "${MACHINE_IDS[@]}"; do
      flyctl machine stop "$id" --app "$FLY_APP" >/dev/null 2>&1 || true
      info "stopped $id"
    done
  fi

  # ---- 5. Delete every user database -------------------------------------
  step "5/11 Deleting ${#USER_DBS[@]} user database(s)"
  for db in "${USER_DBS[@]:-}"; do
    [ -n "$db" ] || continue
    turso_api DELETE "/databases/$db"
    case "$API_STATUS" in
      200|204|404) info "deleted $db" ;;
      *) die "deleting $db failed with HTTP $API_STATUS: $API_BODY" ;;
    esac
  done

  # ---- 6. Recreate central ------------------------------------------------
  step "6/11 Recreating the central database"
  turso_api DELETE "/databases/$CENTRAL_DB"
  case "$API_STATUS" in
    200|204|404) info "deleted $CENTRAL_DB" ;;
    *) die "deleting $CENTRAL_DB failed with HTTP $API_STATUS: $API_BODY" ;;
  esac

  # use_tursodb selects the Turso engine rather than the libSQL default. It is
  # REQUIRED: the local half of @tursodatabase/sync is a real Turso database, so
  # the remote must be one too. The field is undocumented and getting it wrong is
  # silent, so the response is asserted rather than trusted.
  turso_api POST "/databases" \
    "$(jq -nc --arg n "$CENTRAL_DB" --arg g "$TURSO_GROUP" \
        '{name: $n, group: $g, use_tursodb: true}')"
  [ "$API_STATUS" = "200" ] || die "creating $CENTRAL_DB failed with HTTP $API_STATUS: $API_BODY"

  ENGINE="$(printf '%s' "$API_BODY" | jq -r '.database.engine // empty')"
  NEW_HOST="$(printf '%s' "$API_BODY" | jq -r '.database.Hostname // .database.hostname // empty')"
  [ "$ENGINE" = "tursodb" ] \
    || die "created $CENTRAL_DB but engine is '$ENGINE', not 'tursodb'. Delete it and retry."
  [ -n "$NEW_HOST" ] || die "Turso returned no hostname for $CENTRAL_DB"
  info "created $CENTRAL_DB (engine $ENGINE)"
  info "hostname $NEW_HOST"

  # ---- 7. Mint and verify a data-plane token -----------------------------
  step "7/11 Minting a data-plane token"
  turso_api POST "/databases/$CENTRAL_DB/auth/tokens?authorization=full-access&expiration=never"
  [ "$API_STATUS" = "200" ] || die "minting a token failed with HTTP $API_STATUS: $API_BODY"

  TOKEN_FILE="$(mktemp)"
  chmod 600 "$TOKEN_FILE"
  trap 'rm -f "$TOKEN_FILE"' EXIT
  printf '%s' "$API_BODY" | jq -r '.jwt // empty' > "$TOKEN_FILE"
  [ -s "$TOKEN_FILE" ] || die "Turso returned no jwt for $CENTRAL_DB"

  NEW_TOKEN="$(cat "$TOKEN_FILE")"
  # Verify with a real query rather than trusting the mint: a token that does not
  # work here fails the next boot instead, where it looks like a reset problem.
  [ "$(hrana_scalar "$NEW_HOST" "$NEW_TOKEN" 'select 1')" = "1" ] \
    || die "the minted token could not query $CENTRAL_DB"
  info "verified against $CENTRAL_DB"

  # ---- 8. Distribute the new credentials ---------------------------------
  step "8/11 Updating Fly secrets and backend env files"
  # `secrets import` reads NAME=VALUE from stdin, and printf is a shell builtin,
  # so the token never appears in a process argument list the way `secrets set`
  # would put it.
  printf 'TURSO_CENTRAL_DB_TOKEN=%s\n' "$NEW_TOKEN" \
    | flyctl secrets import --stage --app "$FLY_APP" >/dev/null
  info "staged TURSO_CENTRAL_DB_TOKEN on $FLY_APP"
  env_set_from_file TURSO_CENTRAL_DB_TOKEN "$TOKEN_FILE"

  # Turso has always reassigned the same hostname for the same name+org, so this
  # is usually a no-op - but the reset must not depend on that holding.
  NEW_URL="turso://$NEW_HOST"
  if [ "$NEW_URL" != "$CENTRAL_URL" ]; then
    info "hostname changed, updating TURSO_CENTRAL_DB_URL"
    printf 'TURSO_CENTRAL_DB_URL=%s\n' "$NEW_URL" \
      | flyctl secrets import --stage --app "$FLY_APP" >/dev/null
    URL_FILE="$(mktemp)"
    printf '%s' "$NEW_URL" > "$URL_FILE"
    env_set_from_file TURSO_CENTRAL_DB_URL "$URL_FILE"
    rm -f "$URL_FILE"
  else
    info "hostname unchanged, TURSO_CENTRAL_DB_URL left alone"
  fi

  # ---- 9. Replace the volume ---------------------------------------------
  step "9/11 Replacing the Fly volume"
  for id in "${MACHINE_IDS[@]:-}"; do
    [ -n "$id" ] || continue
    flyctl machine destroy "$id" --app "$FLY_APP" --force >/dev/null 2>&1 || true
    info "destroyed machine $id"
  done

  mapfile -t VOLUME_IDS < <(flyctl volumes list --app "$FLY_APP" --json 2>/dev/null \
    | jq -r --arg n "$FLY_VOLUME" '.[] | select(.name == $n) | .id')
  for vid in "${VOLUME_IDS[@]:-}"; do
    [ -n "$vid" ] || continue
    flyctl volumes destroy "$vid" --yes >/dev/null 2>&1 || true
    info "destroyed volume $vid"
  done

  # 1GB is Fly's minimum and fly.toml omits initial_size on purpose, so the
  # volume is created explicitly rather than by the deploy.
  flyctl volumes create "$FLY_VOLUME" --size 1 --region "$FLY_REGION" \
    --app "$FLY_APP" --yes >/dev/null
  info "created a fresh $FLY_VOLUME in $FLY_REGION"

  # ---- 10. Redeploy -------------------------------------------------------
  step "10/11 Redeploying"
  # --ha=false is not optional: it defaults to TRUE and no fly.toml setting
  # overrides it. A second machine is a second replica set with its own pending
  # writes, which breaks the per-replica atomicity the login tokens rely on.
  info "pinned to $DEPLOYED_IMAGE"
  (cd "$BACKEND" && flyctl deploy --app "$FLY_APP" --ha=false --image "$DEPLOYED_IMAGE")

  # ---- 11. Verify ---------------------------------------------------------
  step "11/11 Verifying"
  local failed=0

  local health="https://$FLY_APP.fly.dev/api/health"
  local code=""
  for _ in $(seq 1 30); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' "$health" 2>/dev/null || true)"
    [ "$code" = "200" ] && break
    sleep 2
  done
  if [ "$code" = "200" ]; then
    info "health: 200"
  else
    info "health: $code (expected 200)"
    failed=1
  fi

  local users templates
  users="$(hrana_scalar "$NEW_HOST" "$NEW_TOKEN" 'select count(*) from users' || true)"
  templates="$(hrana_scalar "$NEW_HOST" "$NEW_TOKEN" 'select count(*) from category_templates' || true)"

  if [ "$users" = "0" ]; then
    info "users: 0"
  else
    info "users: ${users:-<unreadable>} (expected 0)"
    failed=1
  fi

  if [ -n "$templates" ] && [ "$templates" -gt 0 ] 2>/dev/null; then
    info "category templates: $templates (re-seeded)"
  else
    info "category templates: ${templates:-<unreadable>} (expected > 0)"
    failed=1
  fi

  [ "$failed" -eq 0 ] || die "the reset finished but verification failed - see above"

  cat <<DONE

Done. Clean state:
  - one database in Turso ('$CENTRAL_DB'), engine tursodb, no accounts
  - a fresh Fly volume and machine, running the image that was already deployed
  - templates re-seeded from current code

Local files are NOT touched by --cloud. Run 'mise run reset' for those.
DONE
}

# --------------------------------------------------------------------------

case "${1:-}" in
  --local) reset_local ;;
  --cloud) reset_cloud ;;
  *) usage ;;
esac
