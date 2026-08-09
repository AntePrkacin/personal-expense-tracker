#!/bin/sh
# Single-source assertions over this repo's Markdown.
#
# Every assertion here corresponds to a fact that was once stated in two places
# and where one copy silently went wrong, or to a break that nothing else could
# see. See docs/agents/conventions.md, "Single-source every fact", for the rule
# they enforce.
#
# POSIX sh + git + grep only: nothing to install, and it runs in well under a
# second. git ls-files is used rather than find because it skips node_modules
# and every gitignored path for free, while still covering dotfiles.
#
# Keep it POSIX. /bin/sh is dash on the CI runner and bash on many developer
# machines, so a bashism passes locally and fails only in CI - which is exactly
# how the first version of this script shipped with a <(...) in it.
#
# Faults are appended to one file rather than a shell variable. Every loop below
# reads a pipe, so its body runs in a subshell where an assignment is discarded
# on exit: the first version needed a whole second pass over two of the checks
# just to set a flag, and the later ones stopped at the first fault per file.
set -eu

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT INT TERM
faults="$tmp/faults"
: >"$faults"

note() { echo "FAIL: $1" >>"$faults"; }

# Historical records describe a tree that has moved on, and a plan legitimately
# names files it has not created yet. Vendored skill trees are upstream copies
# we must not edit, so their contents are not ours to keep true. Both are
# excluded from the doc sweeps, never from the code-derived assertions.
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
  grep -oE 'currently \*\*[0-9]+\*\*' "$f" | sed 's/[^0-9]//g' | while read -r n; do
    [ "$n" = "$nvmrc" ] || note "$f documents Node $n, .nvmrc says $nvmrc"
  done
done

# ------------------------------------------------------------ 2. Node floor
# engines.node in the three package.json files is the single home. They must
# agree with each other, and any Markdown stating a floor must agree with them.
floor=""
for p in package.json backend/package.json frontend/package.json; do
  v="$(grep -E '"node": ">=' "$p" | sed 's/.*>=\([0-9.]*\).*/\1/')"
  if [ -z "$v" ]; then
    note "$p declares no engines.node"
  elif [ -z "$floor" ]; then
    floor="$v"
  elif [ "$v" != "$floor" ]; then
    note "$p says engines.node >=$v, another package.json says >=$floor"
  fi
done

for f in $(docs); do
  grep -oE 'floor is \*\*v?[0-9.]+\*\*' "$f" | sed 's/[^0-9.]//g; s/\.$//' | while read -r v; do
    [ "$v" = "$floor" ] || note "$f documents floor v$v, engines.node says >=$floor"
  done
done

# No package.json declares engines.npm, so no document may state an npm
# version. If one is ever added, relax this assertion rather than editing the
# documents back. Two forms are checked, because the prerequisites table
# carried a bare "| npm | 12+ |" cell straight past the first version of this.
for f in $(docs); do
  grep -nE 'npm \*\*v?[0-9]+\+?\*\*|^\| *npm *\| *v?[0-9]+' "$f" | while read -r hit; do
    note "$f states an npm version, but nothing here declares engines.npm: $hit"
  done
done

# --------------------------------------------------- 3. Backend env variables
# Two lists that must be identical: backend/.env.example, which a fresh clone
# copies verbatim, and the one documented table.
#
# The Joi schema is deliberately not read here. It is tied to .env.example by
# backend/src/config/env.validation.spec.ts, which asks Joi itself through
# describe() rather than pattern-matching the TypeScript, so all three agree
# transitively. Regexing the schema here as well gave two checks one job with
# two methods, and the weaker method silently missed any key that was not
# indented by exactly two spaces.
#
# NODE_ENV is the single deliberate asymmetry - Nest and Jest set it, nobody
# writes it into .env - so it is dropped from both lists.
drop_node_env() { grep -v '^NODE_ENV$' || true; }

template_keys="$(grep -oE '^#? *[A-Z][A-Z0-9_]*=' backend/.env.example |
  tr -d '# =' | sort -u | drop_node_env)"

# The documented table is located by a marker, not by a path, so a later
# reshuffle of the docs cannot break this check. Exactly one file may own it.
owners="$(docs | xargs grep -l 'single-source: backend-env' 2>/dev/null || true)"
count="$(printf '%s\n' "$owners" | grep -c . || true)"
if [ "$count" = "1" ]; then
  doc_keys="$(grep -oE '^\| `[A-Z][A-Z0-9_]*`' "$owners" | tr -d '| `' | sort -u | drop_node_env)"
  # Real temp files rather than process substitution: <(...) is a bashism, and
  # this script runs under whatever /bin/sh is, which is dash on the CI runner.
  printf '%s\n' "$template_keys" >"$tmp/template"
  printf '%s\n' "$doc_keys" >"$tmp/doc"
  [ "$template_keys" = "$doc_keys" ] ||
    note "backend/.env.example and $owners document different variables:
$(comm -3 "$tmp/template" "$tmp/doc")"
else
  note "expected exactly one file marked 'single-source: backend-env', found $count"
fi

# ------------------------------------------- 4. Backticked rooted paths exist
# A backticked path anchored at a top-level directory must resolve. Gitignored
# paths are skipped, because the docs correctly discuss files that correctly do
# not exist in a clone (backend/.env, .claude/settings.local.json).
#
# Two further classes are named on purpose and are not expected to exist. Keep
# this list short: every entry is a place the check cannot help you, so an entry
# whose file has since been created is dead weight and gets deleted - both
# CLAUDE.md promotion targets listed here originally have now been promoted for
# real, and only the next named candidate belongs in the list.
#   .husky/_                              generated by husky's install, and
#                                         documented as core.hooksPath's value
#   frontend/src/lib/CLAUDE.md            the promotion target currently named by
#                                         the sizing trigger in conventions.md
#   backend/src/categories/CLAUDE.md      the same, for backend/CLAUDE.md, which
#                                         PET-70 took to roughly 950 lines
absent_by_design() {
  case "$1" in
  .husky/_ | frontend/src/lib/CLAUDE.md | backend/src/categories/CLAUDE.md) return 0 ;;
  # Build output, present only after an install or a build, and never committed.
  *node_modules* | */dist/* | */dist | */.next/* | */.next) return 0 ;;
  *) return 1 ;;
  esac
}
for f in $(docs); do
  grep -oE '`(backend|frontend|docs|scripts|\.claude|\.github|\.husky)/[A-Za-z0-9_./()-]+`' "$f" |
    tr -d '`' | sort -u | while read -r p; do
      case "$p" in *'*'* | */) continue ;; esac
      [ -e "$p" ] && continue
      absent_by_design "$p" && continue
      # Two forms, because a .gitignore pattern ending in / only matches a
      # directory and older git cannot tell that a path which does not exist is
      # one. The runner's git could not classify `backend/node_modules` from the
      # `node_modules/` pattern while the git here could, so this failed only in
      # CI - and only in the conventions job, which installs the root deps alone.
      git check-ignore -q "$p" && continue
      git check-ignore -q "$p/" && continue
      note "$f names $p, which does not exist"
    done
done

# --------------------------------------------- 5. Deliberate copies are wired
# A copy that has to stay a copy carries a marker naming its source. The named
# file must exist. This checks wiring only: it does not compare content, and it
# is a breadcrumb for a reviewer rather than drift detection.
for f in $(docs); do
  grep -oE '<!-- sync: [^ ]+ -->' "$f" | sed 's/<!-- sync: //; s/ -->//' | while read -r t; do
    [ -e "${t%%#*}" ] || note "$f syncs from ${t%%#*}, which does not exist"
  done
done

# ------------------------------------------------ 6. Relative links are alive
for f in $(docs); do
  grep -oE '\]\([^)#][^)]*\)' "$f" | sed 's/^](//; s/)$//' | while read -r l; do
    case "$l" in http* | mailto* | '<'*) continue ;; esac
    t="$(dirname "$f")/${l%%#*}"
    [ -e "$t" ] || note "$f links to $l, which does not resolve"
  done
done

# -------------------------------------------------- 7. No unclosed code fence
# An odd number of fence lines means a block never closed, which on GitHub
# swallows every heading and paragraph after it into one grey box. Nothing else
# notices: the file stays valid Markdown, every other assertion here still
# passes, and the damage is close to invisible in a diff. Two guides shipped
# this way, each having quietly lost the command its empty fence was to hold.
for f in $(docs); do
  n="$(grep -c '^```' "$f" || true)"
  [ $((n % 2)) -eq 0 ] || note "$f has an unclosed code fence: $n fence lines, which is odd"
done

# ------------------------------ 8. Every scoped CLAUDE.md warns about its gaps
# Root CLAUDE.md is the index and deliberately keeps no such list, because a
# shared list of everybody's gaps is the one merge conflict this repo has had.
# Every scoped file is an area guide and must carry one, because a feature that
# was never built looks exactly like a feature you have not found yet. A file
# deeper in the tree may point at its parent's list rather than keep its own,
# since both load together, but it may not stay silent - which is how the
# newest guide shipped covering the least finished area in the repo.
for f in $(git ls-files '*CLAUDE.md'); do
  if [ "$f" = "CLAUDE.md" ]; then continue; fi
  grep -q '^## Not built here' "$f" || note "$f has no '## Not built here' section"
done

if [ -s "$faults" ]; then
  cat "$faults" >&2
  exit 1
fi
echo "docs-check: single-source assertions pass"
