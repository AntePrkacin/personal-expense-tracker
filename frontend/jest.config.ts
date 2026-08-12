import type { Config } from 'jest';
import nextJest from 'next/jest.js';

// next/jest wires the Next.js SWC compiler into Jest, loads next.config and
// .env files, and stubs CSS / static asset imports so component tests run
// without extra transform config.
// Docs: https://nextjs.org/docs/app/guides/testing/jest
const createJestConfig = nextJest({ dir: './' });

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

  /**
   * Both of these are resource ceilings rather than test configuration, and they exist because
   * this repo is routinely worked on from several checkouts at once.
   *
   * Jest's default `maxWorkers` is one less than the core count, and each worker is a full node
   * process with its own jsdom. On a 20-core machine that is 19 of them per run, so two suites
   * started seconds apart in two worktrees ask for 38 - which is how a 31GB machine was driven
   * into swap-thrash hard enough to need a power cycle, with no OOM kill in the journal to
   * explain it afterwards. A proportion rather than a fixed number, so a smaller CI runner
   * scales down instead of over-subscribing.
   *
   * `workerIdleMemoryLimit` is the other half: a worker past the limit is restarted between test
   * files, which bounds the heap each one accumulates over a long run. Without it the cap above
   * limits how many workers there are and says nothing about how large any of them gets.
   */
  maxWorkers: '50%',
  workerIdleMemoryLimit: '512MB',
};

/**
 * The ESM-only families `react-markdown` pulls in, as regex prefixes.
 *
 * PET-76 added `react-markdown` and `remark-gfm`, and their dependency closure is 100 packages, of
 * which **85 are `"type": "module"` with no CJS build**. Jest's default
 * transform never touches `node_modules`, so the first `import` reaches SWC untransformed and the
 * suite dies on `SyntaxError: Unexpected token 'export'` inside `react-markdown/index.js` - which
 * is a failure of the harness rather than of anything this repo wrote.
 *
 * **Both figures are measurements and neither should be trusted after a dependency change.** They
 * said 84 here and 85 in `frontend/src/app/CLAUDE.md` until a review of PR #88 walked the installed
 * tree, which is exactly the drift `docs/agents/conventions.md` puts counts under a
 * single-home rule for. Re-derive rather than reason: walk the `dependencies` of those two packages
 * with `require.resolve`'s own upward search, dedupe by resolved path so a nested copy counts once,
 * and read `type` off each `package.json`. The 15 that are not ESM are `@types/*` plus `debug`,
 * `ms`, `dequal`, `extend`, `inline-style-parser`, `style-to-js` and `style-to-object`.
 *
 * **Prefixes rather than the 85 names**, because the families are the stable unit: `micromark`
 * ships one package per grammar construct and `remark-gfm` alone accounts for nine of them, so a
 * literal list is a file somebody has to come back to the next time a plugin is added. The
 * families are `hast-util-*`, `mdast-util-*`, `micromark*`, `remark-*`, `unist-util-*`, `vfile*`
 * and `character-entities*`; the rest are single packages with no siblings to generalise over.
 *
 * **`escape-string-regexp` is on this list and looks like it should not be**, which is the trap to
 * know before trusting a dependency scan here. The hoisted copy at the top of `node_modules` is
 * v4 and CJS; `mdast-util-find-and-replace` pins v5, which is ESM, so npm installs it **nested**
 * inside that package. A closure walk that reads the hoisted `package.json` reports it as CJS and
 * the suite still dies on it. Names here are matched wherever they sit, because the lookahead is
 * tried at every `/node_modules/` in a path and the **last** segment is what decides - which is
 * also why nesting needs no separate entry.
 */
const ESM_PACKAGES = [
  '@ungap/structured-clone',
  'bail',
  'ccount',
  'character-entities.*',
  'character-reference-invalid',
  'comma-separated-tokens',
  'decode-named-character-reference',
  'devlop',
  'escape-string-regexp',
  'estree-util-is-identifier-name',
  'hast-util-.*',
  'html-url-attributes',
  'is-alphabetical',
  'is-alphanumerical',
  'is-decimal',
  'is-hexadecimal',
  'is-plain-obj',
  'longest-streak',
  'markdown-table',
  'mdast-util-.*',
  'micromark.*',
  'parse-entities',
  'property-information',
  'react-markdown',
  'remark-.*',
  'space-separated-tokens',
  'stringify-entities',
  'trim-lines',
  'trough',
  'unified',
  'unist-util-.*',
  'vfile.*',
  'zwitch',
].join('|');

/**
 * next/jest's own `node_modules` rule, rewritten to let the ESM packages above through.
 *
 * **This has to modify next/jest's pattern rather than add one, and next/jest says so in a
 * comment**: "Custom config can append to transformIgnorePatterns but not modify it". A pattern
 * list is a set of things to *skip*, so a file matching **any** entry is skipped - which means a
 * permissive pattern added beside `/node_modules/` changes nothing whatsoever. A `jest.config.ts`
 * that only widened the array would look like a fix, pass review, and still die on the first
 * `import`. That is why this file post-processes the resolved config, which is otherwise a shape
 * worth being suspicious of.
 *
 * **`transpilePackages` in `next.config.ts` is the other lever next/jest reads, and it is the wrong
 * one.** It would work - next/jest folds those names into this very pattern - but it does so by
 * telling the **application** build to transpile packages it already handles natively, to fix a
 * problem only Jest has. The cost lands on every `next build` and on every dev server start.
 *
 * What it inserts is one more negative lookahead at the same position as next/jest's own, so all of
 * them have to pass for a path to be ignored: `/node_modules/(?!(<ours>)/)(?!.pnpm)(?!(geist|…)/)`.
 * Rewriting the alternation inside next/jest's group would mean parsing its regex; adding a
 * lookahead beside it does not.
 *
 * It **throws when it rewrote nothing** rather than returning the config unchanged, so a next/jest
 * upgrade that reshapes the pattern fails here with this paragraph attached, instead of as a syntax
 * error inside somebody else's package with nothing pointing back at this file.
 */
async function withEsmTransforms(): Promise<Config> {
  const resolved = await createJestConfig(config)();
  const patterns = resolved.transformIgnorePatterns ?? [];
  let rewritten = 0;

  const widened = patterns.map((pattern) => {
    // **What this test actually skips, which is not what an earlier version of this comment
    // claimed.** It said the `.pnpm` sibling is left alone because this repo installs with npm so
    // nothing it could match exists - true, and not the reason: next/jest spells that entry
    // `/node_modules[\\/]\.pnpm[\\/]...`, with character classes rather than literal slashes, so it
    // fails this prefix test on its fifteenth character and would be skipped whatever the installer
    // was. The distinction matters because the two reasons expire differently. If next/jest ever
    // normalises that entry to a literal `/node_modules/`, the prefix test starts matching it,
    // `rewritten` silently becomes 2, and a lookahead is inserted into a pattern this file has never
    // been read against - so the honest guard is the count below, which fails loudly at zero. A
    // review of PR #88 found the reasoning; the behaviour was already correct.
    if (!pattern.startsWith('/node_modules/')) {
      return pattern;
    }

    rewritten += 1;
    return pattern.replace('/node_modules/', `/node_modules/(?!(${ESM_PACKAGES})/)`);
  });

  if (rewritten === 0) {
    throw new Error(
      'next/jest emitted no transformIgnorePattern starting with /node_modules/, so nothing ' +
        'carved out the ESM packages listed in this file and every unified import will fail to ' +
        'parse. See the comment above this function.',
    );
  }

  return { ...resolved, transformIgnorePatterns: widened };
}

export default withEsmTransforms;
