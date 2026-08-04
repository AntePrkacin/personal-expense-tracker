#!/bin/sh
# Single-source assertions over this repo's Markdown.
#
# Every assertion here corresponds to a fact that was once stated in two places
# and where one copy silently went wrong. See docs/agents/conventions.md,
# "Single-source every fact", for the rule these enforce.
#
# POSIX sh + git + grep only: nothing to install, and it runs in well under a
# second. git ls-files is used rather than find because it skips node_modules
# and every gitignored path for free, while still covering dotfiles.
set -eu

fail=0
note() {
  echo "FAIL: $1" >&2
  fail=1
}

# Historical records describe a tree that has moved on, and a plan legitimately
# names files it has not created yet. Vendored skill trees are upstream copies
# we must not edit. Both are excluded from the doc sweeps, never from the
# code-derived assertions.
docs() {
  git ls-files '*.md' |
    grep -Ev '^(docs/plans/|docs/reviews/|\.agents/|\.claude/skills/(gh-stack|drizzle|backend-nestjs|frontend-nextjs))'
}

# ------------------------------------------------------------ 1. Node major
# .nvmrc is the single home. mise cannot read it, so mise.toml must agree, and
# any Markdown restating it in the reviewed "currently **NN**" form must match.
nvmrc="$(tr -d ' \t\n' < .nvmrc)"
mise="$(grep -E '^node = "' mise.toml | sed 's/.*"\(.*\)".*/\1/')"
[ "$nvmrc" = "$mise" ] || note ".nvmrc says $nvmrc but mise.toml pins $mise"

for f in $(docs); do
  grep -oE 'currently \*\*[0-9]+\*\*' "$f" 2>/dev/null | sed 's/[^0-9]//g' |
    while read -r n; do
      [ "$n" = "$nvmrc" ] || echo "FAIL: $f documents Node $n, .nvmrc says $nvmrc" >&2
    done
done
if docs | xargs grep -hoE 'currently \*\*[0-9]+\*\*' 2>/dev/null |
  sed 's/[^0-9]//g' | grep -qv "^${nvmrc}$"; then fail=1; fi

# ------------------------------------------------------------ 2. Node floor
# engines.node in the three package.json files is the single home. They must
# agree with each other, and any Markdown stating a floor must agree with them.
floor=""
for p in package.json backend/package.json frontend/package.json; do
  v="$(grep -E '"node": ">=' "$p" | sed 's/.*>=\([0-9.]*\).*/\1/')"
  [ -n "$v" ] || note "$p declares no engines.node"
  if [ -z "$floor" ]; then floor="$v"; elif [ "$v" != "$floor" ]; then
    note "$p says engines.node >=$v, another package.json says >=$floor"
  fi
done

for f in $(docs); do
  grep -oE 'floor is \*\*v?[0-9.]+\*\*' "$f" 2>/dev/null |
    sed 's/[^0-9.]//g; s/\.$//' | while read -r v; do
      [ "$v" = "$floor" ] || echo "FAIL: $f documents floor v$v, engines.node says >=$floor" >&2
    done
done
if docs | xargs grep -hoE 'floor is \*\*v?[0-9.]+\*\*' 2>/dev/null |
  sed 's/[^0-9.]//g; s/\.$//' | grep -qv "^${floor}$"; then fail=1; fi

# There is no engines.npm in any package.json, so no document may assert one.
if grep -q '"npm":' package.json backend/package.json frontend/package.json 2>/dev/null; then
  :
else
  if docs | xargs grep -nE 'npm \*\*v?[0-9]+\+?\*\*' 2>/dev/null; then
    note "a document asserts an npm version, but no package.json declares engines.npm"
  fi
fi

# --------------------------------------------------- 3. Backend env variables
# Three lists that must be identical: the Joi schema (what the app enforces),
# .env.example (what a fresh clone copies verbatim) and the one documented
# table. NODE_ENV is the single deliberate asymmetry - Nest and Jest set it,
# nobody writes it into .env - so it is dropped from every list.
drop_node_env() { grep -v '^NODE_ENV$' || true; }

schema_keys="$(grep -oE '^  [A-Z][A-Z0-9_]*:' backend/src/config/env.validation.ts |
  tr -d ' :' | sort -u | drop_node_env)"
template_keys="$(grep -oE '^#? *[A-Z][A-Z0-9_]*=' backend/.env.example |
  tr -d '# =' | sort -u | drop_node_env)"

# The documented table is located by a marker, not by a path, so a later
# reshuffle of the docs cannot break this check. Exactly one file may own it.
owners="$(docs | xargs grep -l 'single-source: backend-env' 2>/dev/null || true)"
count="$(printf '%s\n' "$owners" | grep -c . || true)"
[ "$count" = "1" ] || note "expected exactly one file marked 'single-source: backend-env', found $count"

if [ "$count" = "1" ]; then
  doc_keys="$(grep -oE '^\| `[A-Z][A-Z0-9_]*`' "$owners" | tr -d '| `' | sort -u | drop_node_env)"
  [ "$schema_keys" = "$template_keys" ] ||
    note "the Joi schema and backend/.env.example declare different variables:
$(printf '%s\n' "$schema_keys" | comm -3 - <(printf '%s\n' "$template_keys") 2>/dev/null || true)"
  [ "$schema_keys" = "$doc_keys" ] ||
    note "the Joi schema and $owners document different variables:
$(printf '%s\n' "$schema_keys" | comm -3 - <(printf '%s\n' "$doc_keys") 2>/dev/null || true)"
fi

# ------------------------------------------- 4. Backticked rooted paths exist
# A backticked path anchored at a top-level directory must resolve. Gitignored
# paths are skipped, because the docs correctly discuss files that correctly do
# not exist in a clone (backend/.env, .claude/settings.local.json).
#
# Two further classes are named on purpose and are not expected to exist. Keep
# this list short: every entry is a place the check cannot help you.
#   .husky/_                              generated by husky's install, and
#                                         documented as core.hooksPath's value
#   backend/src/database/CLAUDE.md        promotion targets named by the sizing
#   frontend/src/components/CLAUDE.md     trigger in docs/agents/conventions.md
absent_by_design() {
  case "$1" in
  .husky/_ | backend/src/database/CLAUDE.md | frontend/src/components/CLAUDE.md) return 0 ;;
  *) return 1 ;;
  esac
}
for f in $(docs); do
  grep -oE '`(backend|frontend|docs|scripts|\.claude|\.github|\.husky)/[A-Za-z0-9_./()-]+`' "$f" |
    tr -d '`' | sort -u | while read -r p; do
      case "$p" in *'*'* | */) continue ;; esac
      [ -e "$p" ] && continue
      absent_by_design "$p" && continue
      git check-ignore -q "$p" && continue
      echo "FAIL: $f names $p, which does not exist" >&2
      exit 1
    done || fail=1
done

# --------------------------------------------- 5. Deliberate copies are wired
# A copy that has to stay a copy carries a marker naming its source. The named
# file must exist. This checks wiring only: it does not compare content, and it
# is a breadcrumb for a reviewer rather than drift detection.
for f in $(docs); do
  grep -oE '<!-- sync: [^ ]+ -->' "$f" 2>/dev/null | sed 's/<!-- sync: //; s/ -->//' |
    while read -r t; do
      [ -e "${t%%#*}" ] || { echo "FAIL: $f syncs from ${t%%#*}, which does not exist" >&2; exit 1; }
    done || fail=1
done

# ------------------------------------------------ 6. Relative links are alive
for f in $(docs); do
  grep -oE '\]\([^)#][^)]*\)' "$f" | sed 's/^](//; s/)$//' | while read -r l; do
    case "$l" in http*| mailto* | '<'*) continue ;; esac
    t="$(dirname "$f")/${l%%#*}"
    [ -e "$t" ] || { echo "FAIL: $f links to $l, which does not resolve" >&2; exit 1; }
  done || fail=1
done

if [ "$fail" = "0" ]; then
  echo "docs-check: single-source assertions pass"
fi
exit "$fail"
