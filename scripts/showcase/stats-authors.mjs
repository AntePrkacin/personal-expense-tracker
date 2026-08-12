/**
 * Who did what: commits, merged pull requests, surviving lines, and the same
 * work split by area.
 *
 * ## Three decisions worth knowing before quoting any of this
 *
 * **"Lines by author" means surviving lines, via `git blame`**, not lines added.
 * It answers "whose code is in the repository now", which is the same snapshot
 * question the size figures answer. One caveat to state rather than hide:
 * refactoring somebody else's file transfers those lines to you. That is the
 * honest answer to the question actually asked, and it is not the same as "who
 * typed more".
 *
 * **Attribution is by author, not committer, and the plan said committer.** The
 * plan's reasoning was that on this project the committer is "who ran the
 * session rather than who typed the lines", which is true - but 57 commits here
 * carry a committer of `GitHub`, because they were merged through the web UI.
 * Committer attribution therefore invents a third contributor who is a website
 * and silently takes those merges away from the people who made them. The author
 * field carries the same "who ran the session" meaning with no such hole.
 *
 * **Lines originating in the two excluded commits are excluded here too**, and
 * bucketed separately rather than dropped silently. They are the template the
 * repository was created from; counting the surviving ones toward whoever
 * happened to push the template would overstate one author by a whole scaffold.
 *
 * **No email address goes into the output.** Display names are already public in
 * the git history so using them is fine; addresses are not, and this repository
 * keeps them out of anything committed.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EXCLUDED_COMMITS,
  REPO_ROOT,
  canonicalAuthor,
  git,
  gitLines,
  historyArgs,
  isGenerated,
  trackedFiles,
  trackedSymlinks,
  writeData,
} from './lib.mjs';

const excludedShas = new Set(
  EXCLUDED_COMMITS.map((sha) => git(['rev-parse', sha]).trim()),
);

function add(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function commitsByAuthor() {
  const counts = new Map();
  for (const name of gitLines(['log', ...historyArgs(), '--format=%aN'])) {
    add(counts, canonicalAuthor(name));
  }
  return counts;
}

/**
 * Which half of the app a path belongs to.
 *
 * Documentation is its own area rather than being folded into whichever app it
 * sits next to: a `CLAUDE.md` under `backend/` is writing, not backend work, and
 * the whole point of this chart is that one author's contribution is
 * documentation-shaped.
 */
function areaOf(path) {
  if (path.endsWith('.md')) {
    return 'documentation';
  }
  if (path.startsWith('backend/')) {
    return 'backend';
  }
  if (path.startsWith('frontend/')) {
    return 'frontend';
  }
  return 'tooling';
}

/**
 * The area split, measured on **additions** rather than on surviving lines.
 *
 * Deliberately a different measure from the blame figures above it, and the
 * reason is that this chart is about what each person spent their time on. A
 * deleted file is still work that was done; blame cannot see it, and a
 * contribution that was later replaced would vanish from a chart claiming to
 * describe a partnership.
 */
function areasByAuthor() {
  const rows = gitLines([
    'log',
    ...historyArgs(),
    '--numstat',
    '--format=commit\t%aN',
    '--no-renames',
  ]);

  const byAuthor = new Map();
  let author = null;

  for (const row of rows) {
    if (row.startsWith('commit\t')) {
      author = canonicalAuthor(row.slice('commit\t'.length));
      continue;
    }

    const [insertions, , path] = row.split('\t');
    if (insertions === '-' || !author || isGenerated(path)) {
      continue;
    }

    if (!byAuthor.has(author)) {
      byAuthor.set(author, {
        backend: 0,
        frontend: 0,
        documentation: 0,
        tooling: 0,
      });
    }
    byAuthor.get(author)[areaOf(path)] += Number(insertions);
  }

  return byAuthor;
}

/**
 * Surviving lines per author, from `git blame` over every hand-written file.
 *
 * `-w` ignores whitespace-only changes, so a reformatting pass does not hand a
 * file to whoever ran Prettier. Generated files are skipped for the same reason
 * they are their own bucket everywhere else: nobody wrote them.
 */
function survivingLines() {
  const symlinks = trackedSymlinks();
  const byAuthor = new Map();
  let fromExcluded = 0;

  for (const path of trackedFiles()) {
    if (symlinks.has(path) || isGenerated(path)) {
      continue;
    }

    let contents;
    try {
      contents = readFileSync(join(REPO_ROOT, path), 'utf8');
    } catch {
      continue;
    }
    if (contents.includes('\0')) {
      continue;
    }

    let blame;
    try {
      blame = execFileSync(
        'git',
        ['blame', '-w', '--line-porcelain', 'HEAD', '--', path],
        { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
      );
    } catch {
      // An unmerged path or a file with no blame. Skipping beats guessing.
      continue;
    }

    let sha = null;
    for (const line of blame.split('\n')) {
      // The porcelain format opens each line's block with "<sha> <n> <n>".
      if (/^[0-9a-f]{40} \d+ \d+/.test(line)) {
        sha = line.slice(0, 40);
        continue;
      }
      if (line.startsWith('author ')) {
        if (sha && excludedShas.has(sha)) {
          fromExcluded++;
        } else {
          add(byAuthor, canonicalAuthor(line.slice('author '.length)), 1);
        }
      }
    }
  }

  return { byAuthor, fromExcluded };
}

/**
 * Merged pull requests per author, from `gh`.
 *
 * Degrades to nulls rather than failing the run: this is the one generator that
 * needs the network and an authenticated CLI, and a refresh minutes before a
 * talk must not die on a wifi captive portal. A missing figure is visible on the
 * page; a failed refresh would leave every other figure stale instead.
 */
function pullRequests() {
  try {
    const raw = execFileSync(
      'gh',
      [
        'pr',
        'list',
        '--state',
        'merged',
        '--limit',
        '500',
        '--json',
        'author,number',
      ],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    );

    const counts = new Map();
    for (const pr of JSON.parse(raw)) {
      add(counts, canonicalAuthor(pr.author?.name ?? pr.author?.login ?? '?'));
    }
    return counts;
  } catch (error) {
    console.warn(`gh unavailable, merged-PR split omitted: ${error.message}`);
    return null;
  }
}

const commits = commitsByAuthor();
const { byAuthor: lines, fromExcluded } = survivingLines();
const areas = areasByAuthor();
const prs = pullRequests();

const names = [
  ...new Set([...commits.keys(), ...lines.keys(), ...areas.keys()]),
].sort((a, b) => (commits.get(b) ?? 0) - (commits.get(a) ?? 0));

writeData('authors', {
  authors: names.map((name) => ({
    name,
    commits: commits.get(name) ?? 0,
    survivingLines: lines.get(name) ?? 0,
    mergedPullRequests: prs ? (prs.get(name) ?? 0) : null,
    areas: areas.get(name) ?? {
      backend: 0,
      frontend: 0,
      documentation: 0,
      tooling: 0,
    },
  })),
  survivingLinesFromExcludedCommits: fromExcluded,
});
