'use strict';

/**
 * Headless-Chromium check of docs/explainers/category-icon-set-preview.html.
 *
 * The defect this exists to catch: a name lucide 1.29.0 does not know renders
 * NOTHING, and the card around it still looks correct. So the assertions are
 * about the drawn SVG, not about the markup we generated.
 *
 * Includes a deliberate control - a card injected with a bogus icon name must
 * FAIL the same check - because a check never seen to fail is not evidence.
 */

const { spawn } = require('child_process');
const http = require('http');

// Derived from the pid, NOT a constant. On a fixed port a run that fails before
// its browser is killed leaves that browser squatting the port, and the next run
// attaches to the STALE page and reports its contents - which looks like a defect
// in the page under test. That happened once; hence this.
const PORT = 9300 + (process.pid % 300);
// Resolved, because Chromium is handed a file:// URL and a relative path there
// silently loads nothing - the page then reports zero cards rather than an error.
const FILE = require('path').resolve(process.argv[2]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJSON(path) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: PORT, path }, (res) => {
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
    `--user-data-dir=/tmp/claude-chromium-icon-check-${process.pid}`,
    '--no-first-run',
    '--disable-gpu',
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

  // The CDN scripts have to land and lucide.createIcons() has to run.
  let ready = false;
  for (let i = 0; i < 60; i++) {
    ready = await cdp.evaluate(
      `document.readyState === 'complete' && typeof lucide !== 'undefined'`,
    );
    if (ready) break;
    await sleep(500);
  }
  // Said plainly rather than left to fail as `lucide is not defined` inside the
  // report: the page needs network for the three CDN tags, so "no network" and
  // "the page is broken" are different answers and must not look alike.
  if (!ready) {
    chrome.kill();
    throw new Error(
      `lucide never loaded from the CDN after 30s - this page needs network for daisyUI, ` +
        `Tailwind and lucide. Nothing was checked; do not read this as a page defect.`,
    );
  }
  await sleep(1500);

  const report = await cdp.evaluate(`(() => {
    const cards = [...document.querySelectorAll('#icon-grid > li')];
    const drawn = cards.map((li) => {
      const svg = li.querySelector('svg');
      const key = li.querySelector('.font-mono.break-all')?.textContent?.trim();
      return {
        key,
        hasSvg: !!svg,
        paths: svg ? svg.querySelectorAll('path, circle, rect, line, polyline, polygon, ellipse').length : 0,
        seeded: li.dataset.seeded === 'true',
        cats: (li.dataset.categories || '').split(' ').filter(Boolean).length,
        // A card with no lucide category must SAY so rather than render an
        // empty tag row - lucide leaves 258 of its icons untagged.
        saysUntagged: /no lucide category/.test(li.textContent),
      };
    });

    // CONTROL: an icon name lucide does not know must fail the same check.
    const probe = document.createElement('i');
    probe.setAttribute('data-lucide', 'definitely-not-an-icon');
    document.body.appendChild(probe);
    lucide.createIcons();
    const controlDrew = !!probe.querySelector('svg');
    probe.remove();

    // lucide KEEPS the data-lucide attribute on the element it fills, so the
    // attribute's presence proves nothing - an unknown name is the element that
    // ends up with no svg inside it. This covers the review section's candidate
    // names too, not just the grid.
    const unresolved = [...document.querySelectorAll('[data-lucide]')]
      .filter((el) => !el.querySelector('svg') && el.tagName.toLowerCase() !== 'svg')
      .map((el) => el.getAttribute('data-lucide'));

    return {
      unresolved,
      cards: cards.length,
      drew: drawn.filter((d) => d.hasSvg && d.paths > 0).length,
      blank: drawn.filter((d) => !d.hasSvg || d.paths === 0).map((d) => d.key),
      seeded: drawn.filter((d) => d.seeded).length,
      untaggedUnlabelled: drawn
        .filter((d) => d.cats === 0 && !d.saysUntagged)
        .map((d) => d.key),
      untagged: drawn.filter((d) => d.cats === 0).map((d) => d.key),
      keys: drawn.map((d) => d.key),
      controlDrew,
      themeToggle: !!document.querySelector('input.theme-controller'),
    };
  })()`);

  const dupes = report.keys.filter((k, i) => report.keys.indexOf(k) !== i);

  const checks = [
    ['64 cards rendered', report.cards === 64, report.cards],
    ['every card drew a real glyph', report.blank.length === 0, report.blank],
    ['64 glyphs drawn', report.drew === 64, report.drew],
    ['13 marked seeded', report.seeded === 13, report.seeded],
    [
      'a card with no lucide category says so explicitly',
      report.untaggedUnlabelled.length === 0,
      report.untaggedUnlabelled,
    ],
    ['no duplicate keys', dupes.length === 0, dupes],
    [
      'every name on the page resolves in lucide 1.29.0 (incl. candidates)',
      report.unresolved.length === 0,
      report.unresolved,
    ],
    ['theme toggle present', report.themeToggle, report.themeToggle],
    ['CONTROL: bogus name draws nothing', report.controlDrew === false, report.controlDrew],
  ];

  let failed = 0;
  for (const [name, ok, detail] of checks) {
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${JSON.stringify(detail)}`}`);
  }

  chrome.kill();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('harness error:', e.message);
  process.exit(2);
});
