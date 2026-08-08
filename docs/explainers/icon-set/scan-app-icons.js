'use strict';

/**
 * Every lucide icon the frontend's own interface imports, and where.
 *
 * Two importers, deliberately kept apart:
 *   - the CATEGORY_ICON map in components/ui/categoryColour.ts, which IS the
 *     64-icon set and is not "chrome"
 *   - everything else, which is the app's own furniture - nav, controls,
 *     empty states, dialogs
 *
 * An icon in both is the interesting case: the same mark means "AI insights"
 * in the sidebar and "a category you picked" in a table row.
 */

const fs = require('fs');
const path = require('path');

const REPO = process.argv[2];
const SRC = path.join(REPO, 'frontend/src');
const CATEGORY_MAP_FILE = 'components/ui/categoryColour.ts';

// lucide writes Trash2 as trash-2 and Gamepad2 as gamepad-2, so a trailing
// digit takes a dash too. Without this the overlap check silently misses
// trash-2, which is the one exact duplicate that matters most.
const kebab = (pascal) =>
  pascal
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d)/g, '$1-$2')
    .toLowerCase();

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p);
  }
  return out;
};

const chrome = new Map(); // kebab name -> Set of files
const categoryMap = new Set();

for (const file of walk(SRC)) {
  const rel = path.relative(SRC, file);
  const src = fs.readFileSync(file, 'utf8');
  // Multi-line import blocks are the norm here, so match lazily across newlines.
  for (const m of src.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*'lucide-react'/g)) {
    for (const raw of m[1].split(',')) {
      const ident = raw.trim().split(/\s+as\s+/)[0].trim();
      // type-only imports (LucideIcon) are not marks
      if (!ident || !/^[A-Z]/.test(ident) || ident === 'LucideIcon') continue;
      const name = kebab(ident);
      if (rel === CATEGORY_MAP_FILE) categoryMap.add(name);
      else {
        if (!chrome.has(name)) chrome.set(name, new Set());
        chrome.get(name).add(rel);
      }
    }
  }
}

const result = {
  chrome: [...chrome.entries()]
    .map(([name, files]) => ({ name, files: [...files].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name)),
  categoryMap: [...categoryMap].sort(),
};

fs.writeFileSync(
  path.join(__dirname, 'app-icons.json'),
  JSON.stringify(result, null, 2),
);

console.log(`chrome icons: ${result.chrome.length}`);
for (const c of result.chrome) console.log(`  ${c.name.padEnd(22)} ${c.files.join(', ')}`);
console.log(`\nCATEGORY_ICON map entries: ${result.categoryMap.length}`);
