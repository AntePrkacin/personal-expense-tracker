/**
 * How many packages the dependency tree holds, now and at the initial commit.
 *
 * **Counted from the `package-lock.json` files, never from `node_modules`.** A
 * lockfile enumerates every transitive package, so the count is reproducible on
 * any machine - and, the reason that actually decided it, **the same method works
 * at the initial commit**, where nothing is installed. `git show
 * a237207:package-lock.json` against the current file is the whole comparison,
 * and it is the honest way to say "the template shipped with N, we finished with
 * M".
 *
 * The root key of `packages` is the project itself and is not a dependency, so
 * it is dropped. Everything else in there is a real installed package, which is
 * why this counts entries rather than reading `dependencies` - the latter lists
 * only what was asked for by name and misses the transitive tree entirely, which
 * is most of the number.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, INITIAL_COMMIT, git, writeData } from './lib.mjs';

const LOCKFILES = [
  { tree: 'root', path: 'package-lock.json' },
  { tree: 'backend', path: 'backend/package-lock.json' },
  { tree: 'frontend', path: 'frontend/package-lock.json' },
];

function countPackages(contents) {
  const lock = JSON.parse(contents);
  if (!lock.packages) {
    // Lockfile v1 has no `packages` map; this repo has never had one, but
    // answering null beats answering a wrong zero.
    return null;
  }
  return Object.keys(lock.packages).filter((key) => key !== '').length;
}

function now(path) {
  try {
    return countPackages(readFileSync(join(REPO_ROOT, path), 'utf8'));
  } catch {
    return null;
  }
}

function atInitialCommit(path) {
  try {
    return countPackages(git(['show', `${INITIAL_COMMIT}:${path}`]));
  } catch {
    // The template shipped one lockfile; the two app trees did not exist yet,
    // and "not present" is a fact worth publishing rather than a zero.
    return null;
  }
}

const trees = LOCKFILES.map(({ tree, path }) => ({
  tree,
  now: now(path),
  atInitialCommit: atInitialCommit(path),
}));

const sum = (key) =>
  trees.reduce((total, tree) => total + (tree[key] ?? 0), 0);

writeData('deps', {
  trees,
  totalNow: sum('now'),
  totalAtInitialCommit: sum('atInitialCommit'),
});
