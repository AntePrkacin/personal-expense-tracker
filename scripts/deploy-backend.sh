#!/usr/bin/env bash
# Dispatch the "Deploy backend to Fly.io" workflow, stream it to completion, and
# open the run page in a browser.
#
# The workflow is workflow_dispatch-only (see .github/workflows/deploy.yml) and
# refuses any ref other than main, so this always deploys main - the one-command
# way to fire it and watch it live from a terminal instead of the Actions tab.
# Invoked by the `mise run deploy-backend` task.
#
# Needs the GitHub CLI authenticated (`gh auth status`). It exits non-zero if the
# run fails, so the mise task and any caller see the real result.
set -euo pipefail

WORKFLOW="deploy.yml"
REF="main"

echo "==> Dispatching $WORKFLOW from ref '$REF'"

# `gh workflow run` prints no run id (a GitHub API quirk), so snapshot the latest
# run id for this workflow+ref, dispatch, then poll until a newer one appears.
before="$(gh run list --workflow "$WORKFLOW" --branch "$REF" -L 1 \
  --json databaseId -q '.[0].databaseId // 0')"
gh workflow run "$WORKFLOW" --ref "$REF"

echo "==> Waiting for the run to register"
run_id=""
for _ in $(seq 1 30); do
  latest="$(gh run list --workflow "$WORKFLOW" --branch "$REF" -L 1 \
    --json databaseId -q '.[0].databaseId // 0')"
  if [ "$latest" != "$before" ] && [ "$latest" != "0" ]; then
    run_id="$latest"
    break
  fi
  sleep 2
done

if [ -z "$run_id" ]; then
  echo "==> Could not find the dispatched run - check: gh run list --workflow $WORKFLOW" >&2
  exit 1
fi

url="https://github.com/AntePrkacin/personal-expense-tracker/actions/runs/$run_id"
echo "==> Watching run $run_id"

# Stream to completion. Keep the run's success/failure even if it fails, so the
# page still opens and the script exits with the real code.
status=0
gh run watch "$run_id" --exit-status || status=$?

# Open the run page at the end. Guarded so a headless box without xdg-open (or a
# failed open) never masks the deploy's real exit code.
command -v xdg-open >/dev/null 2>&1 && xdg-open "$url" >/dev/null 2>&1 || true

exit "$status"
