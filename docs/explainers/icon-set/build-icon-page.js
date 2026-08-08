'use strict';

/**
 * Builds docs/explainers/category-icon-set-preview.html.
 *
 * The grid draws the PROPOSED set - source order with the approved swaps
 * applied. The source itself is still untouched. lucide's per-icon categories
 * are not shipped in lucide-react, so they come from lucide.dev/api/categories,
 * cached beside this script; the app's own interface icons come from
 * scan-app-icons.js reading frontend/src.
 */

const fs = require('fs');
const path = require('path');

const REPO = process.argv[2];
const SP = __dirname;

const tokensSrc = fs.readFileSync(
  path.join(REPO, 'backend/src/database/central/template-tokens.ts'),
  'utf8',
);
const seedSrc = fs.readFileSync(
  path.join(REPO, 'backend/src/database/central/template-seed.ts'),
  'utf8',
);
const lucideCats = JSON.parse(fs.readFileSync(path.join(SP, 'lucide-categories.json'), 'utf8'));
const installed = new Set(
  fs.readFileSync(path.join(SP, 'lucide-1.29.0-names.txt'), 'utf8').trim().split('\n'),
);
const CHROME = JSON.parse(fs.readFileSync(path.join(SP, 'app-icons.json'), 'utf8')).chrome;

const namesBlock = tokensSrc.split('export const ICON_NAMES = [')[1].split('] as const;')[0];
const SOURCE_NAMES = [...namesBlock.matchAll(/^\s*'([a-z0-9-]+)',/gm)].map((m) => m[1]);

const iconSeedBlock = seedSrc.split('const ICON_SEED')[1].split('];')[0];
const LABEL = new Map(
  [...iconSeedBlock.matchAll(/name:\s*'([a-z0-9-]+)',\s*label:\s*'([^']+)'/g)].map((m) => [
    m[1],
    m[2],
  ]),
);

const catSeedBlock = seedSrc.split('CATEGORY_SEED')[1];
const SEEDED_BY_ICON = new Map(
  [
    ...catSeedBlock.matchAll(
      /name:\s*'([^']+)',\s*\n\s*colour:\s*'[^']+',\s*\n\s*icon:\s*'([a-z0-9-]+)'/g,
    ),
  ].map((m) => [m[2], m[1]]),
);
SEEDED_BY_ICON.set('circle-question-mark', 'Uncategorized (fallback)');

// ---------------------------------------------------------------------------
// APPROVED - seventeen, across three rounds, and ALL SEVENTEEN ARE IN THE
// SOURCE. They landed together in one edit, because ICON_NAMES is a published
// OpenAPI enum and each change also needs the ICON_SEED label, the frontend
// CATEGORY_ICON map, and npm run api:sync. None of the 13 seeded icons is
// touched - every drop is a palette icon, and a swap in place keeps every other
// row's sort_order.
//
// So SWAP below is now INERT: every `from` is already gone from ICON_NAMES, no
// SWAP.get() hits, and PROPOSED is byte-for-byte SOURCE_NAMES. The list stays as
// the decision record the page renders - each row's fourth field is why the drop
// happened - and it is what marks a card "New". Read it as history: applying it
// again is not a thing that can happen, and there is nothing here left to apply.
// PENDING is empty for the same reason, which makes the "Being replaced" branch
// in card() dead code kept beside its live counterpart.
// ---------------------------------------------------------------------------
const APPROVED = [
  ['circle-ellipsis', 'heart', 'Heart', 'your call, not a similarity finding'],
  ['laptop', 'pencil', 'Pencil', 'collided with book; bot was the first pick and collided with seeded tv'],
  ['circle-parking', 'square-parking', 'Parking', 'collided with seeded circle-question-mark'],
  ['shopping-bag', 'tag', 'Tag', 'collided with seeded shopping-basket'],
  ['cake-slice', 'ice-cream-cone', 'Ice cream', 'collided with pizza'],
  ['banknote', 'shopping-cart', 'Shopping cart', 'collided with credit-card'],
  ['luggage', 'tree-palm', 'Palm tree', 'collided with briefcase'],
  ['glasses', 'eye', 'Eye', 'collided with bike'],
  ['hand-heart', 'rabbit', 'Rabbit', 'made room for heart - three heart silhouettes otherwise'],
  ['droplets', 'bird', 'Bird', 'collided with flame'],
  ['flame', 'waves-horizontal', 'Waves', 'the other half of the same pair; the canonical name, not the deprecated waves alias of it this first shipped as'],
  ['newspaper', 'fish', 'Fish', 'collided with receipt'],
  ['train-front', 'panda', 'Panda', 'collided with bus; squirrel was the first pick and collided with rabbit'],
  ['hotel', 'key-round', 'Key', 'collided with seeded landmark'],
  ['sparkles', 'sailboat', 'Sailboat', "collided with the app's own Sparkle AI mark - see the interface scan"],
  ['wallet', 'scale', 'Scales', 'collided with credit-card, the shape banknote was already dropped for'],
  ['coins', 'percent', 'Percent', 'not a collision - illegible at 18px, its meaning living in a glyph inside a glyph'],
];
const SWAP = new Map(APPROVED.map(([from, to]) => [from, to]));
const NEW_LABEL = new Map(APPROVED.map(([, to, label]) => [to, label]));

// Collisions you judged tolerable.
const HELD = [
  ['package', 'kept - distinct enough from gift'],
  ['beer', 'kept - distinct enough from coffee and trash-2'],
  ['gem', 'kept against tag; crown went to the buffer'],
  ['shopping-cart', 'kept against bike'],
  ['ice-cream-cone', 'kept against tent'],
  ['dumbbell', 'kept against bike'],
  ['pencil', 'kept against pill, and kept as an exact duplicate of the interface Edit action'],
  ['bird', 'kept against fish - the five-animal cluster is accepted'],
  ['trash-2', 'kept as an exact duplicate of the interface Delete action'],
];

// ---------------------------------------------------------------------------
// NOTHING LEFT TO PICK. This held the four open slots while they were open;
// OPEN_PICKS_DONE below is the same four, resolved, and the picks are in
// APPROVED. Empty, so the "Being replaced" branch in card() renders on nothing.
// Refill it to run another round: every candidate must be real in lucide 1.29.0
// and checked against the WHOLE set, not only against the icon it replaces -
// which is what round 1 failed to do and had to be corrected for twice.
// ---------------------------------------------------------------------------
const PENDING = [];

// ---------------------------------------------------------------------------
// RESIDUALS, accepted. The final sheet was read whole one more time; these are
// what is left. All mild, all knowingly kept - the record exists so the next
// person does not "discover" them as defects.
// ---------------------------------------------------------------------------
const RESIDUALS = [
  [
    'panda',
    'baby',
    'Both a round face. panda adds ears and eye patches, baby a tuft. It arrived with the panda pick, which was itself the fix for squirrel against rabbit - the clearest example on this page of a swap moving a collision rather than removing it.',
  ],
  [
    'sailboat',
    'tent',
    'Both resolve to a triangle at 18px; the sail sits over a hull line, the tent over a centre pole.',
  ],
  [
    'percent',
    'pill',
    'A bold diagonal body, and pencil is a third member. percent keeps apart on its two rings, which is also what makes it the most legible mark in the money block.',
  ],
];

const OPEN_PICKS_DONE = [
  {
    slot: 'hotel',
    why: 'Collides with the seeded landmark - a building block with a regular grid of openings - and landmark is fixed. You have seen map and route and want neither, so these are five others.',
    picks: ['concierge-bell', 'key-round', 'signpost', 'sunset', 'sailboat'],
    pickNote:
      'concierge-bell is a dome with a button, key-round a ring and shaft, signpost a post with arms, sunset a disc behind a horizon line, sailboat a hull with one sail. All five stay in the travel block.',
    rejected:
      'Four obvious ones are deliberately absent: bed-double walks into sofa, mountain walks into tent, globe and compass join the circle cluster the seeded circle-question-mark anchors, and binoculars is another pair of joined circles beside bike and dumbbell.',
  },
  {
    slot: 'sparkles',
    why: "Your call, and the interface scan below is the hard reason behind it: the app already uses lucide Sparkle as its AI mark, in the sidebar nav and on the dashboard insight teaser. sparkles is that same four-pointed star with two smaller ones added, so a user could pick the app's own AI mark as a category icon.",
    picks: ['flower', 'spray-can', 'bath', 'shower-head', 'venetian-mask'],
    pickNote:
      'It sits in the personal-care block beside the seeded scissors. flower and venetian-mask are the most distinct outlines; bath and shower-head are literal but unmistakable; spray-can is a tall canister, close to nothing here.',
    rejected:
      'smile is left out because it joins the circle cluster, and brush and paintbrush because they are diagonal shafts beside pencil and pill - the collision you accepted once and would be tripling.',
  },
  {
    slot: 'wallet',
    why: 'Your call: it reads as the same wide rounded rectangle as credit-card. Agreed - it was the shape banknote was dropped for, and wallet has it too, which round 1 should have caught when it moved shopping-cart into that block.',
    picks: ['vault', 'scale', 'percent', 'calculator', 'badge-dollar-sign'],
    pickNote:
      'vault is a square with a dial and corner spokes; scale is a balance beam; percent is a bold diagonal with two small rings and is the most legible of the five at 18px.',
    rejected:
      'hand-coins is out for the same reason coins is (below), and wallet-cards and banknote-arrow-up are both the wide rectangle this slot is trying to leave.',
  },
  {
    slot: 'coins',
    why: 'Your call, and it is a legibility objection rather than a collision one: two overlapping discs with a numeral on the front disc, at 18px, is a grey smudge. Nothing else in the set fails this way - it is the only mark whose meaning lives in a glyph inside a glyph.',
    picks: ['vault', 'percent', 'scale', 'calculator', 'badge-dollar-sign'],
    pickNote:
      'Same shortlist as wallet, because both slots are in the money block and whichever two you take have to work beside each other as well as beside credit-card. calculator is the one to watch: it is a rounded rectangle, so it re-opens the credit-card problem if wallet also goes rectangular.',
    rejected:
      'hand-coins repeats the exact defect - small discs carrying the meaning. badge-dollar-sign is offered but is a circle, so it leans on the circle cluster.',
  },
];

// Visual near-misses against the app's own interface cannot be computed, so
// they are named here: [set icon, interface icon, what the interface uses it for].
const NEAR = [
  ['sparkles', 'sparkle', 'the AI mark, in the sidebar nav and the dashboard insight teaser'],
  ['receipt', 'receipt-text', "the dashboard's recent-transactions card"],
  ['trending-up', 'chart-no-axes-column-increasing', "the dashboard's spending-trend card"],
  ['circle-question-mark', 'file-question', 'the transaction-detail not-found page'],
];

const PROPOSED = SOURCE_NAMES.map((n) => SWAP.get(n) ?? n);
const labelOf = (n) => NEW_LABEL.get(n) ?? LABEL.get(n) ?? n;

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const everyName = [
  ...PROPOSED,
  ...APPROVED.map(([f]) => f),
  ...OPEN_PICKS_DONE.flatMap((o) => [o.slot, ...o.picks]),
  ...RESIDUALS.flatMap(([a, b]) => [a, b]),
  ...CHROME.map((c) => c.name),
  ...NEAR.flatMap(([a, b]) => [a, b]),
];
const unknown = [...new Set(everyName)].filter((n) => !installed.has(n));
if (PROPOSED.length !== 64 || unknown.length) {
  throw new Error(
    `expected 64 proposed icons, all real in lucide 1.29.0; got ${PROPOSED.length}, unknown=${unknown}`,
  );
}
if (new Set(PROPOSED).size !== PROPOSED.length) throw new Error('a swap introduced a duplicate');

// An icon can be real and still carry no category: lucide leaves 258 of the
// installed 2011 untagged. Shown, not asserted away - the card says "no lucide
// category" rather than drawing an empty tag row, and check-icon-page.js asserts
// that label instead of asserting every card has a tag. No name in the set is
// untagged today. The one that was, `waves`, was untagged because lucide keys
// this metadata on canonical names only and `waves` is a deprecated alias of
// `waves-horizontal` - so an untagged name here is worth a second look before it
// is worth a card.
const catsOf = (n) => lucideCats[n] ?? [];

const seededCount = PROPOSED.filter((n) => SEEDED_BY_ICON.has(n)).length;
const allCats = [...new Set(PROPOSED.flatMap(catsOf))].sort();
const changed = new Set(APPROVED.map(([, to]) => to));
const proposedSet = new Set(PROPOSED);

// The finding the scan exists for: one mark, two meanings.
const EXACT = CHROME.filter((c) => proposedSet.has(c.name));

const card = (name, index) => {
  const seeded = SEEDED_BY_ICON.get(name);
  const isNew = changed.has(name);
  const isPending = PENDING.includes(name);
  const cats = catsOf(name);
  return `
        <li
          class="rounded-box border-base-300 bg-base-100 flex flex-col gap-3 border p-4${
            seeded ? ' ring-primary ring-2' : ''
          }"
          data-seeded="${seeded ? 'true' : 'false'}"
          data-categories="${esc(cats.join(' '))}"
        >
          <div class="flex items-start gap-3">
            <span
              class="rounded-field flex size-9 shrink-0 items-center justify-center ${
                seeded
                  ? 'bg-primary text-primary-content'
                  : isNew
                    ? 'bg-secondary text-secondary-content'
                    : 'bg-base-200 text-base-content'
              }"
            >
              <i data-lucide="${esc(name)}" class="size-4.5" aria-hidden="true"></i>
            </span>
            <div class="min-w-0">
              <p class="leading-tight font-semibold">${esc(labelOf(name))}</p>
              <p class="font-mono text-xs break-all opacity-70">${esc(name)}</p>
            </div>
            <span class="ml-auto font-mono text-xs opacity-40">${index + 1}</span>
          </div>
${
  seeded
    ? `          <p class="text-xs font-semibold"><span class="badge badge-primary badge-sm">Seeded</span> <span class="opacity-70">${esc(
        seeded,
      )}</span></p>\n`
    : ''
}${
    isNew
      ? `          <p class="text-xs font-semibold"><span class="badge badge-secondary badge-sm">New</span> <span class="opacity-70">replaces ${esc(
          APPROVED.find(([, to]) => to === name)[0],
        )}</span></p>\n`
      : ''
  }${
    isPending
      ? `          <p class="text-xs font-semibold"><span class="badge badge-outline badge-sm">Being replaced</span> <span class="opacity-70">awaiting your pick</span></p>\n`
      : ''
  }          <ul class="flex flex-wrap gap-1">
${
  cats.length
    ? cats
        .map((c) => `            <li class="badge badge-ghost badge-sm font-mono">${esc(c)}</li>`)
        .join('\n')
    : `            <li class="badge badge-outline badge-sm font-mono opacity-60">no lucide category</li>`
}
          </ul>
        </li>`;
};

const glyph = (n, size) =>
  `<span class="bg-primary text-primary-content rounded-field flex ${
    size === 'sm' ? 'size-6' : 'size-11'
  } shrink-0 items-center justify-center"><i data-lucide="${n}" class="${
    size === 'sm' ? 'size-4.5' : 'size-7'
  }" aria-hidden="true"></i></span>`;

const mark = (n, label) => `
            <figure class="flex flex-col items-center gap-1">
              <div class="flex items-center gap-1">${glyph(n, 'lg')}${glyph(n, 'sm')}</div>
              <figcaption class="text-center font-mono text-[11px] leading-tight">${esc(n)}</figcaption>
              <span class="text-[10px] font-semibold tracking-wide uppercase opacity-60">${esc(label)}</span>
            </figure>`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Category icon set preview</title>

    <!--
      Pinned to exactly what frontend/package.json installs, the reasoning
      docs/explainers/category-colors-icons-description-preview.html carries in full.
      lucide 1.29.0 matters twice over here: it is the version the app imports from, and
      because this page renders every name through it, a name that is not really in 1.29.0
      draws an empty tile instead of quietly passing review.
    -->
    <link href="https://cdn.jsdelivr.net/npm/daisyui@5.7.16/daisyui.css" rel="stylesheet" type="text/css" />
    <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.3.3"></script>
    <script src="https://unpkg.com/lucide@1.29.0"></script>
</head>

<!--
  GENERATED, NOT HAND-WRITTEN. Rebuild rather than edit.

  The grid below IS ICON_NAMES, read straight out of the source. The seventeen swaps have
  landed, so the page and the source agree again - which is the point of generating it. Rerun
  the generator after any change to the set and the page follows; hand-edit it and it lies.

    ICON_NAMES     backend/src/database/central/template-tokens.ts   the closed set, in order
    ICON_SEED      backend/src/database/central/template-seed.ts     the picker label
    CATEGORY_SEED  the same file                                     which category carries which icon
    interface icons  scanned out of frontend/src - see the last section

  THE ORDER IS NOT COSMETIC. It is icon_templates.sort_order, assigned from ICON_NAMES at seed
  time - which is also why a swap is safe where an insertion would not be: replacing a name in
  place keeps every other row's position, so a database seeded before the change and one seeded
  after still agree.

  WHY THE SCAN RAN REPEATEDLY. Each round's own picks introduced collisions the round before
  could not have seen: bot was chosen against book and turned out to be the seeded tv, and
  squirrel was chosen against bus and turned out to be rabbit. A set this size is not verifiable
  one pair at a time - it has to be re-read whole after every change, against the whole set.

  THE CATEGORY TAGS ARE LUCIDE'S OWN, AND ARE THE ONE THING HERE THAT IS NOT FROM THIS REPO.
  lucide-react ships components only, with no category metadata, so the tags come from
  lucide.dev/api/categories - which serves the current lucide, not the pinned 1.29.0. They are
  descriptive only: nothing in this app reads them, no template row references them, an icon
  commonly carries several, and lucide leaves 258 of its 2011 icons untagged entirely.
-->
<body class="bg-base-200 text-base-content min-h-screen p-4 sm:p-8">
  <div class="mx-auto flex max-w-6xl flex-col gap-6">

    <header class="flex flex-wrap items-center justify-between gap-4">
        <div>
            <h1 class="text-3xl font-bold">Category icon set</h1>
            <p class="mt-1 text-sm opacity-70">
                All ${PROPOSED.length} icons a category may carry, in seed order, tagged with lucide's own categories.
            </p>
        </div>
        <!-- daisyUI's theme-controller switches the theme in CSS, so this page needs no theme JavaScript. -->
        <label class="flex cursor-pointer items-center gap-2">
            <i data-lucide="sun" class="size-5" aria-hidden="true"></i>
            <span class="sr-only">Dark theme</span>
            <input type="checkbox" value="dark" class="toggle theme-controller" />
            <i data-lucide="moon" class="size-5" aria-hidden="true"></i>
        </label>
    </header>

    <div class="border-base-300 bg-base-100 rounded-box flex items-start gap-3 border p-4 text-sm">
        <i data-lucide="info" class="size-5 shrink-0 opacity-60" aria-hidden="true"></i>
        <p>
            <strong>This grid is <code>ICON_NAMES</code> itself</strong>, generated from the source rather
            than transcribed, so it cannot drift from what the seed writes. The ${APPROVED.length} marked
            <span class="badge badge-secondary badge-sm">New</span> are PET-65's visual-similarity pass.
            The <strong>${seededCount} ringed</strong> icons are load-bearing - each is what a seeded category is
            written with at provisioning - and none of them changed. The monospace line under each label is
            the stored key, the value that travels in the API enum and lands in <code>categories.icon</code>.
        </p>
    </div>

    <div class="stats stats-vertical sm:stats-horizontal bg-base-100 border-base-300 border">
        <div class="stat">
            <div class="stat-title">Icons</div>
            <div class="stat-value text-3xl">${PROPOSED.length}</div>
            <div class="stat-desc">unchanged - every swap is in place</div>
        </div>
        <div class="stat">
            <div class="stat-title">Seeded</div>
            <div class="stat-value text-primary text-3xl">${seededCount}</div>
            <div class="stat-desc">untouched, as instructed</div>
        </div>
        <div class="stat">
            <div class="stat-title">Swapped</div>
            <div class="stat-value text-secondary text-3xl">${APPROVED.length}</div>
            <div class="stat-desc">PET-65's visual pass</div>
        </div>
        <div class="stat">
            <div class="stat-title">Residuals</div>
            <div class="stat-value text-3xl">${RESIDUALS.length}</div>
            <div class="stat-desc">mild, knowingly accepted</div>
        </div>
    </div>

    <ul id="icon-grid" class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
${PROPOSED.map(card).join('\n')}
    </ul>

    <!--
      The decision record. This started as a temporary review surface and is kept
      deliberately: it is the only place that says WHY each of the seventeen moved,
      and the residual list is what stops the next reader reporting the three
      remaining near-misses as defects. A swap is cheap to make and expensive to
      re-argue from an empty page.
    -->
    <section class="rounded-box border-primary bg-base-100 flex flex-col gap-4 border-2 border-dashed p-4 sm:p-6">
      <div>
        <h2 class="text-2xl font-bold">The set is settled</h2>
        <p class="mt-1 text-sm opacity-70">
          Judged throughout on <strong>shape alone</strong>, at the two sizes shown: the large mark, and the
          <strong>18px the app actually draws</strong> beside it, which is where a collision bites and where
          the old <code>coins</code> failed outright. ${APPROVED.length} swaps, no icon added or removed,
          the ${seededCount} seeded untouched.
        </p>
      </div>

      <h3 class="text-lg font-semibold">Residuals, knowingly accepted</h3>
      <p class="text-sm opacity-70">
        The finished set was read whole one last time. These are what is left - all mild, all kept on
        purpose. The record exists so the next person does not report them as defects.
      </p>
      <ul class="grid grid-cols-1 gap-3 md:grid-cols-2">
${RESIDUALS.map(
  ([a, b, why]) => `        <li class="rounded-box border-base-300 flex items-start gap-4 border p-4">
          <div class="flex gap-1">${glyph(a, 'lg')}${glyph(b, 'lg')}</div>
          <div>
            <p class="font-mono text-xs">${esc(a)} &middot; ${esc(b)}</p>
            <p class="mt-1 text-sm opacity-70">${esc(why)}</p>
          </div>
        </li>`,
).join('\n')}
      </ul>

      <h3 class="mt-2 text-lg font-semibold">Every swap, and everything held</h3>
      <ul class="grid grid-cols-1 gap-3 md:grid-cols-2">
${APPROVED.map(
  ([from, to, , why]) => `        <li class="rounded-box border-base-300 flex items-center gap-4 border p-3">
          <div class="flex items-center gap-2">${glyph(from, 'lg')}<span class="opacity-40">&rarr;</span>${glyph(
            to,
            'lg',
          )}${glyph(to, 'sm')}</div>
          <div>
            <p class="font-mono text-xs">${esc(from)} &rarr; <strong>${esc(to)}</strong></p>
            <p class="mt-1 text-sm opacity-70">${esc(why)}</p>
          </div>
        </li>`,
).join('\n')}
${HELD.map(
  ([n, why]) => `        <li class="rounded-box border-base-300 flex items-center gap-4 border border-dotted p-3">
          <div class="flex items-center gap-1">${glyph(n, 'lg')}${glyph(n, 'sm')}</div>
          <div>
            <p class="font-mono text-xs">${esc(n)}</p>
            <p class="mt-1 text-sm opacity-70">${esc(why)}</p>
          </div>
        </li>`,
).join('\n')}
      </ul>
    </section>

    <!--
      The interface scan, also kept. It is regenerated by scan-app-icons.js from
      frontend/src, so it answers a question no amount of reading ICON_NAMES can:
      which of these marks the product already uses for something else. Rerun it
      before adding an icon to either side.
    -->
    <section class="rounded-box border-secondary bg-base-100 flex flex-col gap-4 border-2 border-dashed p-4 sm:p-6">
      <div>
        <h2 class="text-2xl font-bold">What the app's own interface already uses</h2>
        <p class="mt-1 text-sm opacity-70">
          Scanned out of <code>frontend/src</code>: every <code>lucide-react</code> import that is
          <strong>not</strong> the <code>CATEGORY_ICON</code> map - so nav, controls, empty states and dialogs.
          <strong>${CHROME.length} icons.</strong> The question this answers is whether one mark carries two
          meanings: the app's furniture on one screen, a category a user picked on another.
        </p>
      </div>

      <h3 class="text-lg font-semibold">Exact duplicates &mdash; the same lucide name in both</h3>
      <ul class="flex flex-col gap-3">
${EXACT.map(
  (c) => `        <li class="rounded-box border-base-300 flex flex-wrap items-center gap-4 border p-4">
          <div class="flex items-center gap-1">${glyph(c.name, 'lg')}${glyph(c.name, 'sm')}</div>
          <div class="min-w-0 flex-1">
            <p class="font-mono text-sm font-semibold">${esc(c.name)}</p>
            <p class="mt-1 text-sm opacity-70">Interface use: ${c.files
              .map((f) => `<code>${esc(f)}</code>`)
              .join(', ')}</p>
          </div>
        </li>`,
).join('\n')}
      </ul>

      <h3 class="mt-2 text-lg font-semibold">Near-identical &mdash; different name, same mark to an eye</h3>
      <ul class="grid grid-cols-1 gap-3 md:grid-cols-2">
${NEAR.map(
  ([setIcon, chromeIcon, use]) => `        <li class="rounded-box border-base-300 flex items-start gap-4 border p-4">
          <div class="flex gap-1">${glyph(setIcon, 'lg')}${glyph(chromeIcon, 'lg')}</div>
          <div>
            <p class="font-mono text-xs">${esc(setIcon)} <span class="opacity-50">(set)</span> &middot; ${esc(
              chromeIcon,
            )} <span class="opacity-50">(interface)</span></p>
            <p class="mt-1 text-sm opacity-70">${esc(use)}</p>
          </div>
        </li>`,
).join('\n')}
      </ul>

      <h3 class="mt-2 text-lg font-semibold">Every interface icon, for the record</h3>
      <div class="overflow-x-auto">
        <table class="table table-sm">
          <thead><tr><th>Mark</th><th>Name</th><th>In the category set</th><th>Where it is used</th></tr></thead>
          <tbody>
${CHROME.map(
  (c) => `            <tr>
              <td>${glyph(c.name, 'sm')}</td>
              <td class="font-mono text-xs whitespace-nowrap">${esc(c.name)}</td>
              <td>${
                proposedSet.has(c.name)
                  ? '<span class="badge badge-primary badge-sm">exact</span>'
                  : NEAR.some(([, b]) => b === c.name)
                    ? '<span class="badge badge-secondary badge-sm">near</span>'
                    : '<span class="opacity-40">&mdash;</span>'
              }</td>
              <td class="text-xs opacity-70">${c.files.map((f) => `<code>${esc(f)}</code>`).join('<br>')}</td>
            </tr>`,
).join('\n')}
          </tbody>
        </table>
      </div>
    </section>

    <footer class="text-xs opacity-60">
        <p>
            Generated from <code>backend/src/database/central/template-tokens.ts</code> and
            <code>template-seed.ts</code>, with the approved swaps applied on top; category tags from
            <code>lucide.dev/api/categories</code>; interface icons scanned from <code>frontend/src</code>.
            Icons drawn by lucide 1.29.0, the version <code>frontend/package.json</code> installs.
        </p>
    </footer>
  </div>

  <script>
    lucide.createIcons();
  </script>
</body>
</html>
`;

const out = path.join(REPO, 'docs/explainers/category-icon-set-preview.html');
fs.writeFileSync(out, html);
console.log(
  `wrote ${out}\n${PROPOSED.length} icons, ${seededCount} seeded, ${APPROVED.length} swapped, ` +
    `${RESIDUALS.length} accepted residuals, ${allCats.length} lucide categories\n` +
    `interface icons ${CHROME.length}, exact overlaps ${EXACT.map((c) => c.name).join(', ')}`,
);
