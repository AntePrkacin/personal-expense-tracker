'use strict';

/**
 * Every `icon:` / `icon=` string literal in the repo, checked against the live
 * ICON_NAMES. A stale one is @IsIn(ICON_NAMES) rejecting it at runtime - a 400
 * from the API and a failing e2e, not a type error.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO = process.argv[2];
const tokens = fs.readFileSync(
  path.join(REPO, 'backend/src/database/central/template-tokens.ts'),
  'utf8',
);
const block = tokens.split('export const ICON_NAMES = [')[1].split('] as const;')[0];
const NAMES = new Set([...block.matchAll(/^\s*'([a-z0-9-]+)',/gm)].map((m) => m[1]));

const files = execSync('git ls-files', { cwd: REPO, encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter((f) => /\.(ts|tsx|js|json)$/.test(f))
  .filter((f) => !['backend/openapi.json', 'frontend/src/types/api.d.ts'].includes(f));

// Deliberately invalid, and must STAY invalid: these are the negative fixtures
// asserting @IsIn(ICON_NAMES) rejects a non-lucide name. If one of these ever
// becomes a real icon the test silently stops proving anything, so the guard is
// inverted for them - they are required to be absent from ICON_NAMES.
const INTENTIONALLY_INVALID = ['cup', 'box'];
const wronglyValid = INTENTIONALLY_INVALID.filter((n) => NAMES.has(n));
if (wronglyValid.length) {
  console.log(`FAIL: negative fixture value is now a real icon: ${wronglyValid}`);
  process.exit(1);
}

// A capture holding `${` is a template-literal placeholder, not a literal, so
// this script has nothing to say about it. Skipping it is not tidiness: without
// it the scan matches its own reporting line below - the `icon: '${value}'`
// inside the template that formats a stale name - captures `${value}` verbatim,
// finds it absent from ICON_NAMES, and files the script itself as the finding.
// That pinned the exit code at 1 no matter what the repo contained, so a real
// stale literal was indistinguishable from the standing baseline and this guard
// could never pass. Found in the review of PET-65.
const interpolated = (v) => v.includes('${');

const bad = [];
for (const rel of files) {
  const src = fs.readFileSync(path.join(REPO, rel), 'utf8');
  for (const m of src.matchAll(/\bicon"?\s*[:=]\s*'([^']*)'|\bicon"?\s*[:=]\s*"([^"]*)"/g)) {
    const value = m[1] ?? m[2];
    if (!value || value === 'null') continue;
    if (interpolated(value)) continue;
    if (INTENTIONALLY_INVALID.includes(value)) continue;
    if (!NAMES.has(value)) {
      const line = src.slice(0, m.index).split('\n').length;
      bad.push(`${rel}:${line}  icon: '${value}'`);
    }
  }
}

console.log(`ICON_NAMES: ${NAMES.size}`);
console.log(bad.length ? `STALE:\n  ${bad.join('\n  ')}` : 'no stale icon literals');
process.exit(bad.length ? 1 : 0);
