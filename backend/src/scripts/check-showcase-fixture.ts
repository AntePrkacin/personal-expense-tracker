/**
 * Measures the showcase model without seeding anything.
 *
 * `mise run seed:check` for one account, or `--trials=200` to generate that
 * many and report the distribution across all of them - which is the mode worth
 * using, since a single account cannot tell you whether a category goes over its
 * cap 5% of the time or 60% of the time.
 *
 * Deliberately not a test: it prints numbers and exits 0. See the header of
 * `showcase/check.ts` for why thresholds come later.
 *
 * No Nest, no database, no `.env`. `generate()` is pure, so this is the whole
 * program.
 */
import { checkFixtures } from './showcase/check';
import { generate } from './showcase/generate';
import type { Fixture } from './showcase/fixture';

/** The default seed, matching what `seed-showcase.ts` generates from. */
const BASE_SEED = 20260809;

function parseTrials(argv: readonly string[]): number {
  const flag = argv.find((arg) => arg.startsWith('--trials='));
  if (!flag) {
    return 1;
  }

  const trials = Number(flag.slice('--trials='.length));
  if (!Number.isInteger(trials) || trials < 1) {
    throw new Error(`--trials must be a positive integer, got "${flag}".`);
  }
  return trials;
}

function main(): void {
  const trials = parseTrials(process.argv.slice(2));

  // Seeds walk from the base rather than being random, so a surprising result
  // can be reproduced by running the same command again.
  const fixtures: Fixture[] = Array.from({ length: trials }, (_, i) =>
    generate(BASE_SEED + i),
  );

  console.log(checkFixtures(fixtures));
}

try {
  main();
} catch (error) {
  console.error('Checking failed.', error);
  process.exitCode = 1;
}
