'use strict';

/**
 * Headless-Chromium check of docs/explainers/category-palette-preview.html.
 *
 * **The defect this exists to catch is a swatch that paints nothing.** Every mark on that page is
 * filled from a CSS custom property, and a property that does not resolve paints *transparent* -
 * so the tile, the dot and the bar all vanish into the card while the row around them still looks
 * correct, the label still reads and the contrast column still shows a number. `base-content/50`
 * is the likely one, because it is the single token whose name carries a `/` and therefore the one
 * whose custom-property name has to be rewritten.
 *
 * So the assertions are about **painted colour** rather than about the markup the builder emitted,
 * and they run under every installed theme rather than only the first - a switcher that swaps the
 * attribute and resolves nothing is exactly the failure a single-theme check misses.
 *
 * Includes two deliberate controls, because a check never seen to fail is not evidence: a swatch
 * pointed at a property that does not exist must come back transparent, and switching to a theme
 * name nothing defines must leave **every** swatch unpainted - which is what proves the colours
 * come from the theme scopes rather than from a fallback somewhere. The first version of that
 * second control asserted "repaints nothing" meaning *unchanged*, which was wrong about the
 * mechanism and failed on the first run for exactly the right reason.
 *
 * Shape copied from `docs/explainers/icon-set/check-icon-page.js`, including the pid-derived port
 * and the resolved file path - both of which that file explains and both of which bit it once.
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

// Derived from the pid, NOT a constant: on a fixed port a run that dies before killing its browser
// leaves it squatting, and the next run attaches to the STALE page and reports its contents.
const PORT = 9600 + (process.pid % 300);
// Resolved, because Chromium is handed a file:// URL and a relative path there silently loads
// nothing - the page then reports zero rows rather than an error.
const FILE = path.resolve(process.argv[2] || 'docs/explainers/category-palette-preview.html');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJSON(p) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: PORT, path: p }, (res) => {
        let b = '';
        res.on('data', (d) => (b += d));
        res.on('end', () => {
          try {
            resolve(JSON.parse(b));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      const p = this.pending.get(msg.id);
      if (p) {
        this.pending.delete(msg.id);
        msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
      }
    });
    this.ready = new Promise((r) => this.ws.addEventListener('open', r));
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  }
}

(async () => {
  const chrome = spawn('/usr/bin/chromium', [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=/tmp/claude-chromium-palette-check-${process.pid}`,
    '--no-first-run',
    '--disable-gpu',
    '--force-color-profile=srgb',
    `file://${FILE}`,
  ]);
  chrome.stderr.on('data', () => {});

  let version;
  for (let i = 0; i < 40; i++) {
    try {
      version = await getJSON('/json/version');
      break;
    } catch {
      await sleep(250);
    }
  }
  if (!version) throw new Error('chromium did not expose a debugging endpoint');

  let target;
  for (let i = 0; i < 40; i++) {
    const targets = await getJSON('/json/list');
    target = targets.find((t) => t.type === 'page' && t.url.startsWith('file://'));
    if (target) break;
    await sleep(250);
  }
  if (!target) throw new Error('no file:// page target');

  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.ready;

  // The three CDN tags have to land and lucide.createIcons() has to run.
  let ready = false;
  for (let i = 0; i < 60; i++) {
    ready = await cdp.evaluate(
      `document.readyState === 'complete' && typeof lucide !== 'undefined'`,
    );
    if (ready) break;
    await sleep(500);
  }
  // Said plainly rather than left to fail as `lucide is not defined`: this page needs network for
  // Tailwind, daisyUI and lucide, so "no network" and "the page is broken" must not look alike.
  if (!ready) {
    chrome.kill();
    throw new Error(
      `lucide never loaded from the CDN after 30s - this page needs network for Tailwind, ` +
        `daisyUI and lucide. Nothing was checked; do not read this as a page defect.`,
    );
  }
  await sleep(1500);

  const report = await cdp.evaluate(`(() => {
    const opaque = (c) => {
      // Chromium reports colour as rgb()/rgba()/oklab(); what matters is only whether anything
      // was painted, so the test is on the alpha component generically rather than on a prefix.
      if (!c || c === 'transparent') return false;
      const m = /rgba?\\(([^)]+)\\)/.exec(c);
      if (m) {
        const parts = m[1].split(/[\\s,\\/]+/).filter(Boolean);
        return parts.length < 4 || Number(parts[3]) > 0;
      }
      return true;
    };

    const themes = [...document.querySelectorAll('#theme-switcher input')].map((i) => i.value);
    const root = document.documentElement;
    const perTheme = {};

    for (const name of themes) {
      root.setAttribute('data-palette-theme', name);
      const marks = [...document.querySelectorAll('#palette-rows span[style]')];
      const blank = marks.filter((el) => !opaque(getComputedStyle(el).backgroundColor)).length;
      const tiles = [...document.querySelectorAll('#category-cards span[style]')];
      const blankTiles = tiles.filter((el) => !opaque(getComputedStyle(el).backgroundColor)).length;
      // Every mark's painted colour, so two themes rendering identically is detectable.
      const fingerprint = marks.map((el) => getComputedStyle(el).backgroundColor).join('|');
      perTheme[name] = { marks: marks.length, blank, tiles: tiles.length, blankTiles, fingerprint };
    }

    // CONTROL 1: a swatch pointed at a property nothing defines must paint nothing.
    const probe = document.createElement('span');
    probe.setAttribute('style', 'background: var(--swatch-definitely-not-a-token)');
    document.body.appendChild(probe);
    const controlBlank = !opaque(getComputedStyle(probe).backgroundColor);
    probe.remove();

    // CONTROL 2: with an unknown theme name every scope stops matching, so every custom property
    // becomes undefined and every mark must paint NOTHING. That is what proves the colours come
    // from the theme scopes rather than from a hardcoded fallback somewhere - and it is the
    // stronger form of this control. The first version asserted "repaints nothing" meaning
    // unchanged, which was simply wrong about the mechanism and failed for the right reason.
    root.setAttribute('data-palette-theme', 'not-a-theme');
    const unknownThemeMarks = [...document.querySelectorAll('#palette-rows span[style]')];
    const unknownThemeAllBlank = unknownThemeMarks.every(
      (el) => !opaque(getComputedStyle(el).backgroundColor),
    );
    root.setAttribute('data-palette-theme', themes[0]);

    const rows = document.querySelectorAll('#palette-rows tr').length;
    const cards = document.querySelectorAll('#category-cards > li').length;
    const fallbackCards = document.querySelectorAll('#category-cards > li[data-fallback="true"]').length;
    const unresolvedIcons = [...document.querySelectorAll('[data-lucide]')]
      .filter((el) => !el.querySelector('svg') && el.tagName.toLowerCase() !== 'svg')
      .map((el) => el.getAttribute('data-lucide'));

    return {
      themes, perTheme, rows, cards, fallbackCards, unresolvedIcons,
      controlBlank, unknownThemeAllBlank,
    };
  })()`);

  const themes = report.themes;
  const fingerprints = themes.map((n) => report.perTheme[n].fingerprint);
  const duplicateThemes = themes.filter((n, i) => fingerprints.indexOf(fingerprints[i]) !== i);
  const blankAnywhere = themes.filter(
    (n) => report.perTheme[n].blank > 0 || report.perTheme[n].blankTiles > 0,
  );

  const checks = [
    ['the switcher offers at least the two Expensa themes', themes.length >= 2, themes],
    ['17 allowlist rows rendered', report.rows === 17, report.rows],
    ['13 category cards rendered', report.cards === 13, report.cards],
    ['exactly one is marked the fallback', report.fallbackCards === 1, report.fallbackCards],
    [
      'every mark paints an opaque colour in EVERY theme',
      blankAnywhere.length === 0,
      blankAnywhere.map((n) => ({
        theme: n,
        blankMarks: report.perTheme[n].blank,
        blankTiles: report.perTheme[n].blankTiles,
      })),
    ],
    [
      'no two themes render an identical palette',
      duplicateThemes.length === 0,
      duplicateThemes,
    ],
    [
      'every lucide name on the page resolves',
      report.unresolvedIcons.length === 0,
      report.unresolvedIcons,
    ],
    ['CONTROL: an undefined property paints nothing', report.controlBlank === true, report.controlBlank],
    [
      'CONTROL: an unknown theme name leaves every mark unpainted',
      report.unknownThemeAllBlank === true,
      report.unknownThemeAllBlank,
    ],
  ];

  let failed = 0;
  for (const [name, ok, detail] of checks) {
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${JSON.stringify(detail)}`}`);
  }
  console.log(
    `\n${themes.length} themes checked: ${themes.join(', ')}` +
      `\n${report.perTheme[themes[0]].marks} marks and ${report.perTheme[themes[0]].tiles} tiles per theme`,
  );

  chrome.kill();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('harness error:', e.message);
  process.exit(2);
});
