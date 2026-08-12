'use strict';

/**
 * Builds docs/explainers/category-palette-preview.html.
 *
 * **This page replaces two.** `category-color-palette-preview.html` drew the seventeen allowlist
 * tokens and `category-colors-icons-description-preview.html` drew the thirteen seeded categories,
 * and each pinned one theme pair in a hand-maintained `<style>` block. At five themes that is a
 * page that lies, so PET-79 merged them into one generated page carrying a **theme switcher that
 * enumerates whatever themes are actually installed**. Add a sixth theme and this grows a sixth
 * option with no edit here.
 *
 * **It is a dumb renderer, and that is the important constraint.** Every colour and every measured
 * figure comes from `docs/explainers/category-palette/theme-data.json`, which
 * `frontend/src/lib/themeGuard.ts` computes and `cd frontend && npm run theme:report` writes. A
 * second theme parser living in this file is exactly the restatement this repo treats as a defect -
 * so this script parses no CSS, converts no colour and measures nothing. If a figure here looks
 * wrong, the guard is where it is wrong.
 *
 * Two hand-held copies of the palette disappear with the two pages, which is the better half of
 * closing `docs/TODO.md`'s explainer-drift entry; the three that remain are diffed by
 * `frontend/src/lib/themeGuard.test.ts`.
 *
 * Follows `docs/explainers/icon-set/`'s convention exactly: plain Node, repo root as `argv[2]`, a
 * paired `check-palette-page.js`, a `README.md`, and deliberately not wired to an npm script.
 */

const fs = require('fs');
const path = require('path');

const REPO = process.argv[2];
if (!REPO) {
  console.error('usage: node docs/explainers/category-palette/build-palette-page.js <repo-root>');
  process.exit(2);
}
const SP = __dirname;

const THEME_DATA = path.join(SP, 'theme-data.json');
if (!fs.existsSync(THEME_DATA)) {
  console.error(
    `missing ${path.relative(REPO, THEME_DATA)}\n` +
      `Run \`cd frontend && npm run theme:report\` first - that command owns this file, ` +
      `deliberately rather than a Jest run, so nothing regenerates a committed artifact behind ` +
      `your back.`,
  );
  process.exit(2);
}

const data = JSON.parse(fs.readFileSync(THEME_DATA, 'utf8'));
const seedSrc = fs.readFileSync(
  path.join(REPO, 'backend/src/database/central/template-seed.ts'),
  'utf8',
);

// --- the seed, read out of its own source ------------------------------------
//
// The same approach `icon-set/build-icon-page.js` takes: read the TypeScript rather than duplicate
// it, so the page cannot claim a label or a pairing the seed does not have.

const colourBlock = seedSrc.split('const COLOUR_SEED')[1].split('];')[0];
const COLOURS = [...colourBlock.matchAll(/token:\s*'([^']+)',\s*label:\s*'([^']+)'(,\s*enabled:\s*(false))?/g)].map(
  (m) => ({ token: m[1], label: m[2], enabled: m[4] !== 'false' }),
);

const categoryBlock = seedSrc.split('CATEGORY_SEED')[1].split('\n];')[0];
const CATEGORIES = [
  ...categoryBlock.matchAll(
    /name:\s*'([^']+)',\s*\n\s*colour:\s*'([^']+)',\s*\n\s*icon:\s*'([a-z0-9-]+)'/g,
  ),
].map((m) => ({ name: m[1], colour: m[2], icon: m[3] }));

if (COLOURS.length === 0 || CATEGORIES.length === 0) {
  console.error('parsed no seed rows - template-seed.ts shape changed; fix this script');
  process.exit(2);
}

/**
 * The fallback, read from where it actually lives.
 *
 * **`CATEGORY_SEED` holds twelve rows and this repo's prose says "thirteen seeded categories",
 * and both are right.** `Uncategorized` is not a template - it is written at provisioning by
 * `backend/src/database/user/starter-categories.ts`, is offered on no screen, and must never
 * appear in the onboarding chip list. So a real account shows thirteen and the template table
 * holds twelve, and a page drawing only the twelve would understate what a user sees. It is drawn
 * last and marked, rather than folded in as a thirteenth template.
 */
const fallbackSrc = fs.readFileSync(
  path.join(REPO, 'backend/src/database/user/starter-categories.ts'),
  'utf8',
);
const fallbackBlock = fallbackSrc.split('FALLBACK_CATEGORY = {')[1].split('}')[0];
const FALLBACK = {
  name: /name:\s*'([^']+)'/.exec(fallbackBlock)[1],
  colour: /color:\s*'([^']+)'/.exec(fallbackBlock)[1],
  icon: /icon:\s*'([a-z0-9-]+)'/.exec(fallbackBlock)[1],
};

// --- helpers -----------------------------------------------------------------

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Every theme's values, as CSS custom properties on the switcher's own scopes.
 *
 * **Two families, and the second one is the fix for a defect a review of PET-79 found.** The
 * `--swatch-*` properties feed the marks, and they were the whole of what this emitted - so the
 * page's own canvas and cards, which are Tailwind `bg-base-200` / `card bg-base-100` /
 * `border-base-300` / `text-base-content`, went on resolving from the CDN `daisyui.css`'s
 * stock-light `:root` no matter what the switcher said. That quietly defeated the second of the
 * three conditions `frontend/CLAUDE.md` says this page exists for - "every colour has to stay
 * visible against `bg-base-100` as an 8px dot" - because every dot was drawn on white: `abyss`'s
 * overridden `info-content` looked perfectly visible beside a contrast column reading 1.062.
 *
 * So the four surface tokens are emitted under **daisyUI's own `--color-*` names**, which is what
 * makes the utilities follow; `--swatch-*` names would have been read by nothing. They come from
 * `themes[].surfaces`, whose `base-100` is the same merged value the contrast figures are measured
 * against, so a dot and the number beside it cannot disagree about what the card is.
 *
 * `--swatch-muted` used to be emitted here and is deliberately gone: it duplicated
 * `--swatch-base-content-50` and was referenced by nothing on the page.
 */
function themeVars(theme) {
  const swatches = Object.entries(theme.effective).map(
    ([token, hex]) => `      --swatch-${token.replace('/', '-')}: ${hex};`,
  );
  const surfaces = Object.entries(theme.surfaces).map(
    ([token, hex]) => `      --color-${token}: ${hex};`,
  );
  // `color-scheme` so the UA paints scrollbars and form controls to match, which is what stops a
  // dark theme's own switcher reading as a light widget on a dark canvas.
  const scheme = `      color-scheme: ${theme.prefersDark || isDarkSurface(theme) ? 'dark' : 'light'};`;
  return [...surfaces, scheme, ...swatches].join('\n');
}

/**
 * Whether a theme's card is dark, by luminance of its own `base-100`.
 *
 * `prefersDark` is a fact about *registration* - which theme daisyUI's `prefers-color-scheme` rule
 * selects - and only `expensa-dark` carries it, so `dark` and `abyss` would otherwise be handed
 * `color-scheme: light` over a near-black canvas. Derived rather than listed, so a sixth theme
 * needs no edit here.
 */
function isDarkSurface(theme) {
  const hex = theme.surfaces['base-100'].replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}

const themeNames = data.themes.map((t) => t.name);

/** `base-content/50` is the one token whose name is not a valid CSS ident fragment. */
const varName = (token) => `--swatch-${token.replace('/', '-')}`;

function contrastCell(theme, token) {
  const v = theme.cardContrast[token];
  return v === undefined ? '&mdash;' : v.toFixed(3);
}

const FLOOR = data.floors.nonTextContrast;

// --- the page ----------------------------------------------------------------

const rows = COLOURS.map((c) => {
  const perTheme = data.themes
    .map(
      (t) =>
        `<td class="tabular-nums text-right px-3 py-2 theme-col" data-theme-col="${esc(t.name)}">` +
        `${contrastCell(t, c.token)}</td>`,
    )
    .join('');
  return `          <tr class="border-base-300 border-t">
            <td class="px-3 py-2">
              <div class="flex items-center gap-3">
                <span class="size-9 rounded-field flex items-center justify-center shrink-0"
                      style="background: var(${varName(c.token)})"></span>
                <span class="size-2 rounded-full shrink-0"
                      style="background: var(${varName(c.token)})"></span>
                <span class="h-4 w-10 rounded-sm shrink-0"
                      style="background: var(${varName(c.token)})"></span>
              </div>
            </td>
            <td class="px-3 py-2 font-medium">${esc(c.label)}</td>
            <td class="px-3 py-2 font-mono text-xs opacity-70">${esc(c.token)}</td>
            <td class="px-3 py-2 font-mono text-xs opacity-70 swatch-hex" data-token="${esc(c.token)}"></td>
            <td class="px-3 py-2 text-xs">${c.enabled ? '' : '<span class="badge badge-sm">disabled</span>'}</td>
${perTheme}
          </tr>`;
}).join('\n');

const categoryCard = (cat, isFallback) =>
  `        <li class="card bg-base-100 border-base-300 border" data-fallback="${isFallback}">
          <div class="card-body gap-3 p-4">
            <div class="flex items-center gap-3">
              <span class="size-9 rounded-field flex shrink-0 items-center justify-center"
                    style="background: var(${varName(cat.colour)})">
                <i data-lucide="${esc(cat.icon)}" class="size-5 opacity-90"></i>
              </span>
              <div class="min-w-0">
                <p class="truncate font-medium">${esc(cat.name)}</p>
                <p class="font-mono text-xs opacity-60">${esc(cat.colour)} &middot; ${esc(cat.icon)}</p>
              </div>
            </div>
            ${isFallback ? '<p class="text-xs opacity-70">Seeded at provisioning, not a template. Offered on no screen.</p>' : ''}
          </div>
        </li>`;

const categoryCards = [
  ...CATEGORIES.map((cat) => categoryCard(cat, false)),
  categoryCard(FALLBACK, true),
].join('\n');

const collisionSections = data.themes
  .map((t) => {
    const listed = t.collisions.length
      ? t.collisions
          .map(
            (c) =>
              `<li><code class="font-mono">${esc(c.a)}</code> / <code class="font-mono">${esc(c.b)}</code> ` +
              `at &Delta;E ${c.deltaE.toFixed(4)} ` +
              (c.grandfathered
                ? '<span class="badge badge-sm badge-ghost">grandfathered</span>'
                : '<span class="badge badge-sm badge-error">NOT grandfathered</span>') +
              `</li>`,
          )
          .join('')
      : '<li class="opacity-60">none</li>';
    const overrides = t.overrides.length
      ? t.overrides
          .map(
            (o) =>
              `<li><code class="font-mono">--color-${esc(o.token)}</code> ${esc(o.from)} &rarr; ${esc(o.to)}</li>`,
          )
          .join('')
      : '<li class="opacity-60">none</li>';
    return `      <section class="theme-col" data-theme-col="${esc(t.name)}">
        <h3 class="font-semibold">${esc(t.name)}</h3>
        <p class="text-sm opacity-70">${esc(t.origin)}${t.isDefault ? ', default' : ''}${t.prefersDark ? ', prefers-dark' : ''}</p>
        <p class="mt-3 text-sm font-medium">Colliding pairs under &Delta;E ${data.floors.distinguishability}</p>
        <ul class="list-inside list-disc text-sm">${listed}</ul>
        <p class="mt-3 text-sm font-medium">Token overrides</p>
        <ul class="list-inside list-disc text-sm">${overrides}</ul>
      </section>`;
  })
  .join('\n');

const themeStyles = data.themes
  .map((t) => `    [data-palette-theme='${t.name}'] {\n${themeVars(t)}\n    }`)
  .join('\n');

const options = themeNames
  .map(
    (n, i) =>
      `        <label class="btn btn-sm ${i === 0 ? 'btn-active' : ''}">
          <input type="radio" name="palette-theme" value="${esc(n)}" class="sr-only"${i === 0 ? ' checked' : ''} />
          ${esc(n)}
        </label>`,
  )
  .join('\n');

const html = `<!doctype html>
<!-- GENERATED by docs/explainers/category-palette/build-palette-page.js - do not hand-edit.

     Regenerate:
       cd frontend && npm run theme:report        # recomputes theme-data.json
       node docs/explainers/category-palette/build-palette-page.js .
       node docs/explainers/category-palette/check-palette-page.js docs/explainers/category-palette-preview.html

     This page replaces category-color-palette-preview.html and
     category-colors-icons-description-preview.html, which each pinned one theme pair in a
     hand-maintained <style> block. Every colour and every figure below comes from
     category-palette/theme-data.json, which frontend/src/lib/themeGuard.ts computes - so there is
     one theme parser in this repo and it is the one with tests around it.

     daisyUI ${esc(data.daisyuiVersion)} at generation time. -->
<html lang="en" data-palette-theme="${esc(themeNames[0])}">
  <head>
    <meta charset="utf-8" />
    <title>Category palette across every installed theme</title>
    <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@5/daisyui.css" rel="stylesheet" type="text/css" />
    <script src="https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.min.js"></script>
    <style>
      /* One scope per installed theme, each carrying that theme's EFFECTIVE token values - the
         seven PET-79 overrides already folded in, because theme-data.json holds effective values
         rather than declared ones. The switcher swaps the attribute on <html>; nothing else moves. */
${themeStyles}
    </style>
  </head>
  <body class="bg-base-200 text-base-content min-h-screen p-6">
    <main class="mx-auto flex max-w-6xl flex-col gap-8">
      <header class="flex flex-col gap-2">
        <h1 class="text-2xl font-bold">Category palette across every installed theme</h1>
        <p class="max-w-3xl text-sm opacity-80">
          The ${COLOURS.length} allowlist tokens as the three marks the app really paints them as -
          a 36px tile, an 8px dot and a bar - beside the ${CATEGORIES.length + 1} categories a real
          account shows. Every figure is measured by
          <code class="font-mono">frontend/src/lib/themeGuard.ts</code>; the contrast column follows
          the switcher.
        </p>
        <div id="theme-switcher" class="join mt-2">
${options}
        </div>
        <p class="text-xs opacity-60">
          Contrast is WCAG against each theme's own <code class="font-mono">base-100</code> card.
          Only three tokens clear ${FLOOR}:1 in every theme, which is structural rather than a
          defect - see <code class="font-mono">COLOUR_CONTRAST</code> in
          <code class="font-mono">backend/src/database/central/template-tokens.ts</code>.
        </p>
      </header>

      <section class="card bg-base-100 border-base-300 overflow-x-auto border">
        <table class="table-sm table">
          <thead>
            <tr>
              <th class="px-3 py-2 text-left">Marks</th>
              <th class="px-3 py-2 text-left">Label</th>
              <th class="px-3 py-2 text-left">Token</th>
              <th class="px-3 py-2 text-left">Hex</th>
              <th class="px-3 py-2 text-left"></th>
${data.themes
  .map(
    (t) =>
      `              <th class="theme-col px-3 py-2 text-right" data-theme-col="${esc(t.name)}">${esc(t.name)}</th>`,
  )
  .join('\n')}
            </tr>
          </thead>
          <tbody id="palette-rows">
${rows}
          </tbody>
        </table>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-xl font-semibold">The ${CATEGORIES.length + 1} categories a real account shows</h2>
        <p class="max-w-3xl text-sm opacity-80">
          The ${CATEGORIES.length} onboarding templates plus the
          <code class="font-mono">Uncategorized</code> fallback, which is seeded at provisioning
          rather than being a template - which is why this repo says "thirteen seeded categories"
          where <code class="font-mono">CATEGORY_SEED</code> holds ${CATEGORIES.length}. This is the
          half that came from
          <code class="font-mono">category-colors-icons-description-preview.html</code>.
        </p>
        <ul id="category-cards" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
${categoryCards}
        </ul>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-xl font-semibold">Per-theme measurement</h2>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
${collisionSections}
        </div>
      </section>
    </main>

    <script>
      // The switcher, and the whole of the page's behaviour. It swaps one attribute on <html> and
      // shows the matching column; every colour is already in CSS, so nothing is recomputed here.
      const root = document.documentElement;
      function apply(name) {
        root.setAttribute('data-palette-theme', name);
        for (const el of document.querySelectorAll('.theme-col')) {
          el.hidden = el.dataset.themeCol !== name;
        }
        for (const cell of document.querySelectorAll('.swatch-hex')) {
          const token = cell.dataset.token.replace('/', '-');
          cell.textContent = getComputedStyle(root).getPropertyValue('--swatch-' + token).trim();
        }
        for (const label of document.querySelectorAll('#theme-switcher label')) {
          label.classList.toggle('btn-active', label.querySelector('input').value === name);
        }
      }
      document.getElementById('theme-switcher').addEventListener('change', (e) => {
        if (e.target instanceof HTMLInputElement) apply(e.target.value);
      });
      lucide.createIcons();
      apply(${JSON.stringify(themeNames[0])});
    </script>
  </body>
</html>
`;

const target = path.join(REPO, 'docs/explainers/category-palette-preview.html');
fs.writeFileSync(target, html, 'utf8');
console.log(
  `wrote docs/explainers/category-palette-preview.html\n` +
    `  ${data.themes.length} themes (${themeNames.join(', ')})\n` +
    `  ${COLOURS.length} allowlist tokens, ${CATEGORIES.length} seeded categories\n` +
    `  daisyUI ${data.daisyuiVersion}`,
);
