/**
 * Shared ground for the showcase statistics generators.
 *
 * **These are `.mjs` rather than the `.sh` the plan named.** Three of the six
 * numbers need something shell is bad at: counting comment lines needs a scanner
 * that knows a `//` inside a string literal is not a comment and that a block
 * comment spans lines, and `git blame` attribution and lockfile walking are both
 * tree-shaped rather than line-shaped. Node is already a hard dependency of this
 * repo - mise pins it, and `build-charts.mjs` had to be Node regardless - so the
 * choice is one language for the whole generator set against two, and a
 * comment counter written in awk that nobody would trust on a projector.
 *
 * Everything here is deliberately dependency-free: no npm install stands between
 * a checkout and a refreshed statistics page, because the refresh happens minutes
 * before the talk.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
);

export const DATA_DIR = join(REPO_ROOT, 'docs/showcase/data');

/**
 * The two commits that are inputs to this project rather than output of it, and
 * are excluded from every count.
 *
 * `a237207` is the template the repository was created from. `ab73abd` is the
 * academy's own project-management handout - the brief and the tech spec, by a
 * third author who did nothing else here. Excluding the second is also what
 * makes the per-author split genuinely two-way rather than two-way with an
 * invisible one-commit third slice.
 */
export const EXCLUDED_COMMITS = ['a237207', 'ab73abd'];

/** The initial commit, kept by name because the dependency count compares against it. */
export const INITIAL_COMMIT = 'a237207';

/**
 * Generated or vendored, never counted as hand-written code.
 *
 * This is exactly the never-hand-edit list in root `CLAUDE.md`, and it is a
 * bucket rather than a subtraction: folded into the code total the three
 * lockfiles alone dwarf everything else and the interesting figure disappears,
 * while split out the split is itself worth showing.
 */
const GENERATED_PATTERNS = [
  /^package-lock\.json$/,
  /^(backend|frontend)\/package-lock\.json$/,
  /^backend\/openapi\.json$/,
  /^frontend\/src\/types\/api\.d\.ts$/,
  /^backend\/drizzle\//,
  /^\.agents\/skills\//,
  /^\.claude\/skills\/drizzle/,
  /^backend\/src\/scripts\/showcase\/fixture\.data\.json$/,
  // This page's own output, which is committed so the statistics render from a
  // fresh clone with no build and no network. Excluded for the obvious reason
  // and one less obvious: `charts.js` is a 600KB minified Recharts bundle, so
  // counting it as hand-written code would let the page measuring this
  // repository become one of the largest things in it.
  /^docs\/showcase\/charts\.js$/,
  /^docs\/showcase\/data\//,
];

/**
 * One person, one name.
 *
 * Git carries five author names for three people here: two spellings of one
 * surname and two handles for one account. Left alone, every per-author figure
 * is wrong twice over - split across two slices each - which no amount of
 * charting fixes. Canonicalising in code rather than in a committed `.mailmap`
 * is deliberate: a mailmap is a file full of real email addresses, and this
 * repository keeps those out of source absolutely.
 */
const AUTHOR_ALIASES = new Map([
  ['Iskren', 'izkreny'],
  ['Ante Prkacin', 'Ante Prkačin'],
]);

export function canonicalAuthor(name) {
  return AUTHOR_ALIASES.get(name) ?? name;
}

export function isGenerated(path) {
  return GENERATED_PATTERNS.some((pattern) => pattern.test(path));
}

export function isDocumentation(path) {
  return path.endsWith('.md');
}

/** `git`, run at the repo root, returning stdout. */
export function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
}

export function gitLines(args) {
  return git(args)
    .split('\n')
    .filter((line) => line !== '');
}

/** Every tracked file, as repo-relative paths. */
export function trackedFiles() {
  return gitLines(['ls-files']);
}

/**
 * Every tracked symlink, which every count has to skip.
 *
 * Not a detail: `AGENTS.md` and `GEMINI.md` are symlinks to the `CLAUDE.md`
 * beside them, in six directories, and the eight `.claude/skills/drizzle*`
 * entries point into `node_modules`. Followed, that counts the entire agent
 * documentation **three times** - the first run of this generator reported the
 * largest three documents in the repository as one file under three names. Git
 * records a symlink as mode 120000 with the target path as its content, so the
 * mode is the reliable test; a stat-based one would have to resolve every path.
 */
export function trackedSymlinks() {
  return new Set(
    gitLines(['ls-files', '-s'])
      .filter((row) => row.startsWith('120000 '))
      .map((row) => row.split('\t').slice(1).join('\t')),
  );
}

/**
 * The revision range every activity count runs over: everything except the two
 * excluded commits.
 */
export function historyArgs() {
  return ['HEAD', ...EXCLUDED_COMMITS.map((sha) => `^${sha}`)];
}

/**
 * Writes one generated data file, with the instant it was written.
 *
 * **Every file carries `generatedAt`**, so a stale count cannot pass as fresh on
 * the day - which matters more here than usual, because the whole page is
 * refreshed minutes before the talk and a generator that silently failed would
 * otherwise leave yesterday's number looking exactly like today's.
 */
export function writeData(name, payload) {
  mkdirSync(DATA_DIR, { recursive: true });
  const path = join(DATA_DIR, `${name}.json`);
  writeFileSync(
    path,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), ...payload }, null, 2)}\n`,
  );
  console.log(`wrote ${path}`);
  return path;
}
