/**
 * Command A: turns the plan into the committed `showcase/fixture.data.json`.
 *
 * `mise run seed:fixture`. No Nest, no database, no `.env` - `generate()`
 * is pure, so this is the whole program: run the asserts, generate against a
 * seed, write the file, and print what it wrote.
 *
 * Regenerating changes a committed artifact, so it belongs in its own commit
 * (see root `CLAUDE.md`'s never-hand-edit list). Run `mise run seed:check`
 * against the result before committing - this command has no opinion on
 * whether the numbers it produced are good, only on producing them
 * reproducibly.
 */
import { generate } from './showcase/generate';
import { save } from './showcase/fixture';

/** Matches the default `BASE_SEED` in `check-showcase-fixture.ts`. */
const DEFAULT_SEED = 20260809;

function parseSeed(argv: readonly string[]): number {
  const flag = argv.find((arg) => arg.startsWith('--seed='));
  if (!flag) {
    return DEFAULT_SEED;
  }

  // Tested on the text, not on the parsed number, because this command
  // overwrites a committed artifact: `Number('')` is 0 and `Number('2e7')` is
  // an integer, so both would pass `Number.isInteger` and regenerate the
  // fixture against a seed nobody asked for, with the wrong value visible only
  // in the success line.
  const raw = flag.slice('--seed='.length);
  if (!/^-?\d+$/.test(raw)) {
    throw new Error(`--seed must be an integer, got "${flag}".`);
  }
  return Number(raw);
}

function main(): void {
  const seed = parseSeed(process.argv.slice(2));
  const fixture = generate(seed);
  save(fixture);

  console.log(
    `Wrote ${fixture.transactions.length} transactions across ` +
      `${fixture.months} months to showcase/fixture.data.json (seed ${seed}).`,
  );
}

try {
  main();
} catch (error) {
  console.error('Building the showcase fixture failed.', error);
  process.exitCode = 1;
}
