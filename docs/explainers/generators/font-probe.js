'use strict';

/**
 * Probes candidate Google Fonts for the two properties that decided PET-79's typography, and
 * writes `font-metrics.json`.
 *
 *   1. **cap-height / em**, which fixes the exact font-size that makes a text lockup match the
 *      artwork's cap height (artwork: cap 61.1094 where the tile is 99.4331).
 *   2. **whether the family carries a `tnum` feature**, because this app relies on `tabular-nums`
 *      in six places and a font without it drops the class silently rather than failing.
 *
 * **This is a Node port of `font_probe.py`, and it validates itself against that script's committed
 * output rather than being trusted.** A wrong table offset here does not throw - it yields a
 * plausible `cap/em`, which would silently mis-size the logo lockup that derives its font-size from
 * this number. So the default mode is `--check`: re-derive every figure and fail if any disagrees
 * with `font-metrics.json`. `--write` is the only way to move the file, and the diff is then a
 * deliberate act.
 *
 * **Read cap/em from the font binary rather than from a browser.** Chromium rasterises at integer
 * pixels, so measuring Crimson Pro's 'H' at font-size 100 reports 58/100 = 0.5800 where `OS/2`'s
 * `sCapHeight` over `unitsPerEm` gives 0.5732. The binary is exact and the browser is quantised;
 * the lockup uses the browser figure for the `$` (whose ink height has no table entry) and this one
 * for the wordmark.
 *
 * Usage, from the repo root:
 *
 *   node docs/explainers/generators/font-probe.js .                 # check, no writes
 *   node docs/explainers/generators/font-probe.js . --write         # regenerate the JSON
 *
 * Needs network on a cold cache; TTFs are cached under a temp directory between runs.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = process.argv[2];
if (!REPO) {
  console.error('usage: node docs/explainers/generators/font-probe.js <repo-root> [--write]');
  process.exit(2);
}
const WRITE = process.argv.includes('--write');
const SP = __dirname;
const CACHE = path.join(os.tmpdir(), 'spendifico-font-probe');
const METRICS = path.join(SP, 'font-metrics.json');

/** The fourteen candidates PET-79 measured. Order is the audit's, not alphabetical. */
const DISPLAY = [
  'IM Fell English SC',
  'EB Garamond',
  'Cormorant Garamond',
  'Cinzel',
  'Spectral',
  'Crimson Pro',
  'Playfair Display',
  'Lora',
];
const BODY = [
  'Inter',
  'Quicksand',
  'Nunito',
  'Manrope',
  'Figtree',
  'Rubik',
  'Source Sans 3',
  'IBM Plex Sans',
];

/** The features the audit cares about, in the order `font-metrics.json` records them. */
const FEATURES = ['tnum', 'pnum', 'onum', 'lnum', 'smcp', 'kern', 'liga', 'case'];

// --- fetching -----------------------------------------------------------------

function fetchTtf(family) {
  fs.mkdirSync(CACHE, { recursive: true });
  const slug = family.replace(/ /g, '+');
  const cssPath = path.join(CACHE, `css_${family.replace(/ /g, '_')}.css`);
  if (!fs.existsSync(cssPath)) {
    execFileSync('curl', [
      '-sS',
      '-m',
      '30',
      '-o',
      cssPath,
      `https://fonts.googleapis.com/css2?family=${slug}&display=swap`,
    ]);
  }
  const css = fs.readFileSync(cssPath, 'utf8');
  const url = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)/.exec(css);
  if (!url) return null;
  const ttf = path.join(CACHE, `${family.replace(/ /g, '_')}.ttf`);
  if (!fs.existsSync(ttf)) {
    execFileSync('curl', ['-sS', '-m', '30', '-o', ttf, url[1]]);
  }
  return ttf;
}

// --- the font tables ----------------------------------------------------------

function tables(buf) {
  const n = buf.readUInt16BE(4);
  const out = {};
  for (let i = 0; i < n; i += 1) {
    const off = 12 + i * 16;
    out[buf.toString('latin1', off, off + 4)] = [
      buf.readUInt32BE(off + 8),
      buf.readUInt32BE(off + 12),
    ];
  }
  return out;
}

/**
 * Looks a character up in `cmap`, handling formats 4 and 12.
 *
 * **Format 12 is not optional**, which the Python original records: the variable fonts here use
 * segmented coverage, and without that branch Inter and EB Garamond read as having no `$` at all -
 * nonsense that would have gone into a table as if it were a fact about the font.
 */
function glyphId(buf, tbl, ch) {
  if (!tbl.cmap) return null;
  const base = tbl.cmap[0];
  const count = buf.readUInt16BE(base + 2);
  let best = null;
  for (let i = 0; i < count; i += 1) {
    const rec = base + 4 + i * 8;
    const pid = buf.readUInt16BE(rec);
    const eid = buf.readUInt16BE(rec + 2);
    const off = buf.readUInt32BE(rec + 4);
    const pair = `${pid},${eid}`;
    if (['3,1', '3,10', '0,3', '0,4'].includes(pair)) best = base + off;
  }
  if (best === null) return null;
  const code = ch.codePointAt(0);
  const fmt = buf.readUInt16BE(best);

  if (fmt === 12) {
    const groups = buf.readUInt32BE(best + 12);
    for (let i = 0; i < groups; i += 1) {
      const g = best + 16 + i * 12;
      const start = buf.readUInt32BE(g);
      const end = buf.readUInt32BE(g + 4);
      const startGid = buf.readUInt32BE(g + 8);
      if (start <= code && code <= end) return startGid + (code - start);
    }
    return 0;
  }
  if (fmt !== 4) return null;

  const seg2 = buf.readUInt16BE(best + 6);
  const seg = seg2 / 2;
  const ends = best + 14;
  const starts = ends + seg2 + 2;
  const deltas = starts + seg2;
  const ranges = deltas + seg2;
  for (let i = 0; i < seg; i += 1) {
    const end = buf.readUInt16BE(ends + i * 2);
    if (code > end) continue;
    const start = buf.readUInt16BE(starts + i * 2);
    if (code < start) return 0;
    const delta = buf.readInt16BE(deltas + i * 2);
    const ro = buf.readUInt16BE(ranges + i * 2);
    if (ro === 0) return (code + delta) & 0xffff;
    const addr = ranges + i * 2 + ro + (code - start) * 2;
    const g = buf.readUInt16BE(addr);
    return g === 0 ? 0 : (g + delta) & 0xffff;
  }
  return 0;
}

/**
 * How many named weights the family offers, from the variable-font `fvar` weight axis.
 *
 * **The count is what decides whether `font-bold` gets a real weight or a synthesized one**, which
 * is the constraint that ruled out IM Fell English SC - so it belongs in the table beside cap/em.
 *
 * Read from the binary rather than from the CSS, which is the mistake the first version of this
 * port made: `?family=X&display=swap` returns weight 400 only, so every family probed as 1 and the
 * self-check caught all fifteen. The axis gives the range (Crimson Pro 200-900) and the count is
 * the hundreds in it inclusive, which reproduces every committed figure.
 *
 * A static family carries no `fvar` at all - IBM Plex Sans is the one here - so that returns null
 * and the caller keeps the committed value rather than inventing one.
 */
function weightAxisCount(buf, tbl) {
  if (!tbl.fvar) return null;
  const base = tbl.fvar[0];
  const axesOffset = buf.readUInt16BE(base + 4);
  const axisCount = buf.readUInt16BE(base + 8);
  const axisSize = buf.readUInt16BE(base + 10);
  for (let i = 0; i < axisCount; i += 1) {
    const a = base + axesOffset + i * axisSize;
    if (buf.toString('latin1', a, a + 4) !== 'wght') continue;
    // Fixed 16.16, so the integer part is the high half.
    const min = buf.readInt32BE(a + 4) / 65536;
    const max = buf.readInt32BE(a + 12) / 65536;
    return Math.round((max - min) / 100) + 1;
  }
  return null;
}

function advance(buf, tbl, gid) {
  if (gid === null || gid === undefined || !tbl.hhea || !tbl.hmtx) return null;
  const numH = buf.readUInt16BE(tbl.hhea[0] + 34);
  const i = Math.min(gid, numH - 1);
  return buf.readUInt16BE(tbl.hmtx[0] + i * 4);
}

function probe(family) {
  const ttf = fetchTtf(family);
  if (!ttf) return { family, error: 'no ttf in css' };
  const buf = fs.readFileSync(ttf);
  const tbl = tables(buf);
  const upem = buf.readUInt16BE(tbl.head[0] + 18);
  const os2 = tbl['OS/2'][0];
  const ver = buf.readUInt16BE(os2);
  // `sCapHeight` exists from OS/2 version 2; below that there is nothing to read and the audit
  // records the family as having no measurable cap height rather than guessing one.
  const cap = ver >= 2 ? buf.readInt16BE(os2 + 88) : 0;
  // A feature tag is looked for as raw bytes rather than by walking GSUB, which is what the Python
  // original does - it over-reports in principle and matched the shipped table in practice, and
  // changing the method here would make the two disagree for a reason that is not a font.
  const feats = FEATURES.filter((t) => buf.includes(Buffer.from(t, 'latin1')));
  return {
    family,
    upem,
    cap,
    cap_em: cap ? cap / upem : null,
    feats,
    w0: advance(buf, tbl, glyphId(buf, tbl, '0')),
    w1: advance(buf, tbl, glyphId(buf, tbl, '1')),
    dollar: Boolean(glyphId(buf, tbl, '$')),
    weights: weightAxisCount(buf, tbl),
    // The font-size that makes this family's caps match the artwork's cap/tile ratio.
    size_factor: cap ? 61.1094 / 99.4331 / (cap / upem) : null,
  };
}

// --- report and check ---------------------------------------------------------

const results = [...DISPLAY, ...BODY].map(probe);

for (const [title, names] of [
  ['Display candidates', DISPLAY],
  ['Body candidates', BODY],
]) {
  console.log(`\n=== ${title} ===`);
  console.log(
    `${'family'.padEnd(22)} ${'cap/em'.padEnd(8)} ${'size/tile'.padEnd(9)} ${'digits'.padEnd(9)} ${'$'.padEnd(5)} features`,
  );
  console.log('-'.repeat(96));
  for (const name of names) {
    const r = results.find((x) => x.family === name);
    if (r.error) {
      console.log(`${name.padEnd(22)} ${r.error}`);
      continue;
    }
    const digits = r.w0 && r.w1 ? (r.w0 === r.w1 ? 'uniform' : 'ragged') : '?';
    const note = r.feats.includes('tnum') || title.startsWith('Display')
      ? ''
      : '   <-- no tabular figures';
    console.log(
      `${name.padEnd(22)} ${(r.cap_em ? r.cap_em.toFixed(4) : '-').padEnd(8)} ` +
        `${(r.size_factor ? r.size_factor.toFixed(4) : '-').padEnd(9)} ${digits.padEnd(9)} ` +
        `${(r.dollar ? 'yes' : 'NO').padEnd(5)} ${r.feats.join(' ')}${note}`,
    );
  }
}

const committedRaw = JSON.parse(fs.readFileSync(METRICS, 'utf8'));
const committedWeights = Object.fromEntries(
  Object.entries(committedRaw).map(([k, v]) => [k, v.weights]),
);

/** The shape `font-metrics.json` holds: keyed by family, four fields, sorted keys. */
const emitted = {};
for (const family of [...DISPLAY, ...BODY].sort()) {
  const r = results.find((x) => x.family === family);
  if (r.error) continue;
  emitted[family] = {
    cap_em: Number(r.cap_em.toFixed(4)),
    features: r.feats,
    tnum: r.feats.includes('tnum'),
  };
}

// A static family carries no `fvar`, so its weight count is not in the binary. IBM Plex Sans is the
// only one here; its committed figure is kept rather than invented, and the self-check below
// therefore cannot regress it. Everything else is derived.
for (const family of Object.keys(emitted)) {
  const r = results.find((x) => x.family === family);
  emitted[family].weights = r.weights ?? committedWeights[family] ?? null;
}

if (WRITE) {
  fs.writeFileSync(METRICS, `${JSON.stringify(emitted, null, 1)}\n`, 'utf8');
  console.log(`\nwrote ${path.relative(REPO, METRICS)}`);
  process.exit(0);
}

// --- the self-check -----------------------------------------------------------

const committed = committedRaw;
const drift = [];
for (const family of Object.keys(committed)) {
  const a = committed[family];
  const b = emitted[family];
  if (!b) {
    drift.push(`${family}: probed nothing`);
    continue;
  }
  if (Math.abs(a.cap_em - b.cap_em) > 0.0001) {
    drift.push(`${family}: cap_em committed ${a.cap_em}, probed ${b.cap_em}`);
  }
  if (a.tnum !== b.tnum) drift.push(`${family}: tnum committed ${a.tnum}, probed ${b.tnum}`);
  if (a.weights !== b.weights) {
    drift.push(`${family}: weights committed ${a.weights}, probed ${b.weights}`);
  }
  if (a.features.join(' ') !== b.features.join(' ')) {
    drift.push(`${family}: features committed [${a.features}], probed [${b.features}]`);
  }
}

console.log(`\n${'='.repeat(60)}`);
if (drift.length === 0) {
  console.log(`PASS  this port reproduces font-metrics.json for all ${Object.keys(committed).length} families`);
  process.exit(0);
}
console.log(`FAIL  ${drift.length} disagreement(s) with the committed font-metrics.json:`);
for (const d of drift) console.log(`  ${d}`);
console.log(
  `\nThis port is wrong, or a Google Fonts binary changed. Do NOT pass --write to make it go\n` +
    `away: the lockup's wordmark font-size is derived from cap_em, so a wrong figure here\n` +
    `silently mis-sizes the brand mark. font_probe.py is the reference.`,
);
process.exit(1);
