import fs from 'node:fs';
import path from 'node:path';
import { compile } from 'tailwindcss';

import { CATEGORY_TILE } from './categoryColour';
import { TAG_TONES } from './Tag';

// Proves every utility these components rely on actually generates CSS.
//
// The colocated *.test.tsx files assert that a component applies the *expected*
// class. Only this file catches the other failure: a class that is spelled
// plausibly but generates nothing at all. globals.css clears the --color-*,
// --text-* and --radius-* namespaces, and Tailwind drops unknown candidates
// silently, so `bg-status-succes` or a re-cleared namespace ships a transparent
// pill with a green test suite. That is exactly the gap src/app/globals.test.ts
// opened this technique for.
//
// The compile harness below is duplicated from the "compiled output" block in
// src/app/globals.test.ts rather than shared. If a third consumer appears, lift
// it into a helper then.

const globalsPath = path.join(__dirname, '..', '..', 'app', 'globals.css');
const raw = fs.readFileSync(globalsPath, 'utf8');

/** Every class the five components hard-code, grouped by what would break. */
const HARDCODED = [
  // type styles
  'text-label-s',
  'text-display-s',
  'text-heading-m',
  'text-strong-s',
  'text-strong-m',
  'text-body-s',
  // colours outside the tone and category maps
  'text-text-primary',
  'text-text-tertiary',
  'text-brand-accent',
  'text-white',
  'bg-surface-muted',
  'bg-brand-accent',
  'bg-status-danger',
  // radius, whose namespace is cleared: `rounded` on its own does not exist
  'rounded-md',
  'rounded-full',
  // sizing and spacing, which share the --spacing namespace
  'size-1.5',
  'size-5',
  'size-10',
  'h-2',
  'h-full',
  'w-full',
  'gap-0.5',
  'gap-1.25',
  'gap-1.5',
  'gap-3.5',
  'px-2.5',
  'py-1',
  'py-3',
  'min-w-0',
  // layout and text handling the components depend on
  'shrink-0',
  'flex-1',
  'truncate',
  'tabular-nums',
  'text-right',
  'overflow-hidden',
  'overflow-visible',
  'sr-only',
];

/**
 * Classes used only by the stories, to frame a component against a card.
 *
 * Worth guarding for the same reason as the components: Storybook is where
 * these get diffed against Figma, and a chrome class that generates nothing
 * makes a story render wrong while every other test stays green.
 *
 * Arbitrary values (`w-[560px]`) are left out deliberately - they compile to
 * literal CSS with no token lookup, and their selectors need bracket escaping
 * the helper below does not do.
 */
const STORY_CHROME = [
  'bg-surface-card',
  'border-border-default',
  'divide-border-subtle',
  'divide-y',
  'rounded-xl',
  'p-8',
  'px-7',
  'py-6',
  'gap-3',
  'gap-12',
];

const EXPECTED = [
  ...Object.values(TAG_TONES).flatMap(({ pill, dot }) => [...pill.split(' '), dot]),
  ...Object.values(CATEGORY_TILE),
  ...HARDCODED,
  ...STORY_CHROME,
];

// Negative control. Without it, a harness bug that returned the whole
// stylesheet - or an empty selector - would make every assertion above pass
// without testing anything.
const FORBIDDEN = ['bg-category-9-taupe', 'text-status-info'];

const selector = (candidate: string) => `.${candidate.replace(/\./g, '\\.')}`;

describe('component utilities compile', () => {
  let compiled: string;

  beforeAll(async () => {
    const compiler = await compile(raw, {
      base: path.dirname(globalsPath),
      loadStylesheet: async (id: string, base: string) => {
        // Resolved via package.json rather than require.resolve('tailwindcss/index.css'),
        // because next/jest's moduleNameMapper rewrites every .css request to a
        // JS stub - which the CSS parser then chokes on.
        const file =
          id === 'tailwindcss'
            ? path.join(path.dirname(require.resolve('tailwindcss/package.json')), 'index.css')
            : path.resolve(base, id);
        return { path: file, base: path.dirname(file), content: fs.readFileSync(file, 'utf8') };
      },
    });
    compiled = compiler.build([...EXPECTED, ...FORBIDDEN]);
  });

  it('collects a candidate from every tone and every category', () => {
    // Guards the collection above: an emptied map would leave it.each with
    // nothing to iterate and still report success.
    expect(Object.keys(TAG_TONES)).toHaveLength(5);
    expect(Object.keys(CATEGORY_TILE)).toHaveLength(8);
    expect(EXPECTED).toContain('bg-category-8-pink');
    expect(EXPECTED).toContain('text-brand-accent-pressed');
  });

  it.each(EXPECTED)('%s generates CSS', (candidate) => {
    expect(compiled).toContain(selector(candidate));
  });

  it.each(FORBIDDEN)('%s generates nothing', (candidate) => {
    expect(compiled).not.toContain(selector(candidate));
  });
});
