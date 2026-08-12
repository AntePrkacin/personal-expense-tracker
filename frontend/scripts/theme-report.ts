import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  DISTINGUISHABILITY_FLOOR,
  NON_TEXT_CONTRAST_FLOOR,
  THEME_DATA_PATH,
  buildThemeData,
  measureCandidateThemes,
  measureThemes,
  readDaisyuiVersion,
  readThemeSources,
  serialiseThemeData,
  type ThemeMeasurement,
} from '../src/lib/themeGuard.ts';

// The reporting half of PET-79's theme guard, and the one command that writes
// `docs/explainers/category-palette/theme-data.json`.
//
// **Which command writes that file is a decision, and the tempting answer is the wrong one.** A
// Jest test must not write it: a suite that regenerates a committed artifact passes on a machine
// whose output has drifted, which is the opposite of a gate, and it makes `npm run test` mutate
// the working tree. So this script writes and `themeGuard.test.ts` asserts the committed file
// still matches - the same division `docs/explainers/icon-set/check-icon-page.js` already draws
// against `build-icon-page.js`.
//
// It is run by `node` directly. Node 26 strips the type annotations itself, and the guard's one
// aliased import is `import type`, so it is erased before any resolver sees `@/` - which is why
// this needs neither `ts-node` nor `tsx`. `frontend/package.json`'s script passes
// `--no-warnings=MODULE_TYPELESS_PACKAGE_JSON`, a targeted suppression of the one benign warning
// that arrangement produces; see the script for why the alternative (`"type": "module"`) is not
// on the table.

const REPO = path.resolve(import.meta.dirname, '../..');

const sources = readThemeSources(REPO);
const daisyuiVersion = readDaisyuiVersion(REPO);
const shipped = measureThemes(sources);

const pad = (value: string, width: number) => value.padEnd(width);
const num = (value: number, width: number) => value.toFixed(3).padStart(width);
const rule = (width = 92) => '-'.repeat(width);

// --- 1. What ships -----------------------------------------------------------

console.log(
  `\ndaisyUI ${daisyuiVersion} · floor ΔE ${DISTINGUISHABILITY_FLOOR} · ` +
    `${NON_TEXT_CONTRAST_FLOOR}:1 for a -content value on its own base\n`,
);
console.log(`REGISTERED THEMES (${shipped.length})`);
console.log(rule());
for (const theme of shipped) {
  const flags = [
    theme.origin,
    theme.isDefault ? 'default' : null,
    theme.prefersDark ? 'prefersdark' : null,
    theme.overrides.length ? `${theme.overrides.length} override(s)` : null,
  ]
    .filter(Boolean)
    .join(', ');
  const fresh = theme.collisions.filter((c) => !c.grandfathered);
  console.log(
    `${pad(theme.name, 16)} ${pad(flags, 46)} ` +
      `${theme.collisions.length} colliding pair(s), ${fresh.length} not grandfathered`,
  );
}

// --- 2. Collisions, per theme ------------------------------------------------

console.log(`\n\nCOLLIDING PAIRS UNDER ΔE ${DISTINGUISHABILITY_FLOOR}`);
console.log(rule());
for (const theme of shipped) {
  if (theme.collisions.length === 0) {
    console.log(`${theme.name}: none`);
    continue;
  }
  console.log(`${theme.name}:`);
  for (const pair of theme.collisions) {
    const note = pair.grandfathered ? 'grandfathered' : '** NOT GRANDFATHERED **';
    console.log(`  ${num(pair.deltaE, 6)}  ${pad(`${pair.a} / ${pair.b}`, 46)} ${note}`);
  }
}

// --- 3. Contrast against each theme's own card -------------------------------
//
// Reported and never floored. `frontend/CLAUDE.md` records why: seventeen categories cannot all
// be distinct and all clear 3:1 in both themes, because daisyUI puts each `-content` at the
// opposite end of the lightness range from its base - which is exactly what makes it legible on
// its own tile and near-invisible on the page's own surface in one theme. PET-64 accepted that
// on the record. The one token that IS floored is `base-content/50`, marked below, because the
// backend's orphan fold routes real money into the donut slice it paints.

console.log('\n\nWCAG CONTRAST AGAINST EACH THEME’S OWN base-100 CARD');
console.log('(reported, not floored - see the note in this script and frontend/CLAUDE.md)');
console.log(rule());
const tokens = Object.keys(shipped[0].effective);
console.log(`${pad('token', 18)}${shipped.map((t) => t.name.slice(0, 13).padStart(14)).join('')}`);
for (const token of tokens) {
  const cells = shipped.map((t) => num(t.cardContrast[token as keyof typeof t.cardContrast], 14));
  const floored = token === 'base-content/50' ? '  <- floored at 3:1' : '';
  console.log(`${pad(token, 18)}${cells.join('')}${floored}`);
}

// --- 4. -content legibility on its own base ----------------------------------

console.log('\n\n-CONTENT LEGIBILITY ON ITS OWN BASE (floored at 3:1)');
console.log(rule());
console.log(`${pad('pair', 18)}${shipped.map((t) => t.name.slice(0, 13).padStart(14)).join('')}`);
for (let row = 0; row < shipped[0].contentLegibility.length; row += 1) {
  const label = shipped[0].contentLegibility[row].content;
  const cells = shipped.map((t) => {
    const ratio = t.contentLegibility[row].ratio;
    return `${ratio < NON_TEXT_CONTRAST_FLOOR ? '!' : ' '}${ratio.toFixed(3).padStart(13)}`;
  });
  console.log(`${pad(label, 18)}${cells.join('')}`);
}

// --- 5. Every candidate daisyUI ships ----------------------------------------
//
// The question a human weighing a new theme actually has, which is "could this one join at
// all". Measured over the unmodified stock values, so the count is what it would cost in
// overrides before any steering.

console.log('\n\nEVERY STOCK THEME, BY COLLIDING PAIRS (the candidate list)');
console.log(rule());
const candidates = measureCandidateThemes(sources.themesCss)
  .map((theme: ThemeMeasurement) => ({
    name: theme.name,
    total: theme.collisions.length,
    fresh: theme.collisions.filter((c) => !c.grandfathered).length,
  }))
  .sort((a, b) => a.total - b.total || a.name.localeCompare(b.name));
const registered = new Set(shipped.map((t) => t.name));
for (const candidate of candidates) {
  const mark = registered.has(candidate.name) ? ' <- registered' : '';
  console.log(
    `${String(candidate.total).padStart(3)} pair(s)  ${pad(candidate.name, 16)}` +
      `${String(candidate.fresh).padStart(3)} not grandfathered${mark}`,
  );
}

// --- 6. Write the committed artifact ----------------------------------------

const target = path.join(REPO, THEME_DATA_PATH);
mkdirSync(path.dirname(target), { recursive: true });
writeFileSync(target, serialiseThemeData(buildThemeData(sources, daisyuiVersion)), 'utf8');
console.log(`\n\nWrote ${THEME_DATA_PATH}`);
console.log('Commit it: themeGuard.test.ts asserts the committed copy matches this output.\n');
