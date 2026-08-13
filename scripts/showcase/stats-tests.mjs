/**
 * How many tests there are, across the three suites.
 *
 * **Separate from the one-command refresh, and optional, because it is the only
 * generator that runs anything.** The other five read committed artifacts and
 * finish in seconds; this one executes the whole test estate, which takes
 * minutes and needs both apps' `node_modules` installed. Folding it into
 * `showcase:stats` would turn a refresh done minutes before a talk into a
 * coffee break, so it is its own command and the page renders whatever it last
 * wrote.
 *
 * It parses Jest's own summary line rather than counting `it(` calls in source,
 * which would miss every `it.each` case - and `it.each` is where a good part of
 * this repository's count lives, so the difference is not a rounding error.
 */

import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { REPO_ROOT, writeData } from './lib.mjs';

const SUITES = [
  { name: 'backend unit', directory: 'backend', script: 'test' },
  { name: 'backend e2e', directory: 'backend', script: 'test:e2e' },
  { name: 'frontend', directory: 'frontend', script: 'test' },
];

/** `Tests: 12 failed, 3 skipped, 4213 passed, 4228 total` */
function parseJest(output) {
  const line = output
    .split('\n')
    .reverse()
    .find((candidate) => /^Tests:/.test(candidate.trim()));

  if (!line) {
    return null;
  }

  const total = /(\d+) total/.exec(line);
  const passed = /(\d+) passed/.exec(line);
  const failed = /(\d+) failed/.exec(line);

  return {
    total: total ? Number(total[1]) : null,
    passed: passed ? Number(passed[1]) : 0,
    failed: failed ? Number(failed[1]) : 0,
  };
}

const results = [];

for (const suite of SUITES) {
  console.log(`running ${suite.name}...`);

  let output;
  try {
    // `2>&1` is load-bearing: Jest writes its summary - the line every count
    // here comes from - to **stderr**, so capturing only stdout reads back a
    // successful run with no numbers in it.
    output = execSync(`npm run ${suite.script} --silent 2>&1`, {
      cwd: join(REPO_ROOT, suite.directory),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, CI: 'true' },
    });
  } catch (error) {
    // A failing suite still prints the summary, and the count is what is wanted
    // here. A suite that could not run at all yields null and says so.
    output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`;
  }

  const parsed = parseJest(output);
  if (!parsed) {
    console.warn(`  could not read a test count from ${suite.name}`);
  } else {
    console.log(`  ${parsed.total} tests, ${parsed.failed} failing`);
  }

  results.push({ suite: suite.name, ...(parsed ?? { total: null }) });
}

writeData('tests', {
  suites: results,
  total: results.reduce((sum, suite) => sum + (suite.total ?? 0), 0),
});
