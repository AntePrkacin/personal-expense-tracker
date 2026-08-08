'use strict';

/**
 * A plain contact sheet of glyphs at a size where shape similarity is judgeable.
 * No colour, no cards, no labels competing with the mark - the point is to look
 * at the drawing, not to read the name.
 */

const fs = require('fs');
const path = require('path');

const REPO = process.argv[2];
const OUT = process.argv[3];
const EXTRA = process.argv.slice(4); // extra names to append (candidates)

const tokensSrc = fs.readFileSync(
  path.join(REPO, 'backend/src/database/central/template-tokens.ts'),
  'utf8',
);
const block = tokensSrc.split('export const ICON_NAMES = [')[1].split('] as const;')[0];
let names = [...block.matchAll(/^\s*'([a-z0-9-]+)',/gm)].map((m) => m[1]);

// Candidate names can be appended on the command line, to audition one against
// the real set at a size where shape similarity is judgeable - which is the only
// way any of PET-65's seventeen swaps were decided.
names = names.concat(EXTRA);

const cell = (n, i) => `
      <figure class="border-base-300 bg-base-100 rounded-box flex flex-col items-center gap-2 border p-3">
        <span class="bg-primary text-primary-content rounded-field flex size-16 items-center justify-center">
          <i data-lucide="${n}" class="size-10" aria-hidden="true"></i>
        </span>
        <figcaption class="text-center font-mono text-[11px] leading-tight font-semibold">${
          i + 1
        }. ${n}</figcaption>
      </figure>`;

fs.writeFileSync(
  OUT,
  `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>contact sheet</title>
<link href="https://cdn.jsdelivr.net/npm/daisyui@5.7.16/daisyui.css" rel="stylesheet" type="text/css" />
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.3.3"></script>
<script src="https://unpkg.com/lucide@1.29.0"></script>
</head>
<body class="bg-base-100 text-base-content p-6">
  <div class="grid grid-cols-8 gap-x-4 gap-y-6">
${names.map(cell).join('\n')}
  </div>
  <script>lucide.createIcons();</script>
</body></html>
`,
);
console.log('wrote', OUT, names.length, 'glyphs');
