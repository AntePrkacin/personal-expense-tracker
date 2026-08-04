import fs from 'node:fs';
import path from 'node:path';
import { compile } from 'tailwindcss';

import { BUTTON_VARIANTS } from './Button';
import { CATEGORY_TILE } from './categoryColour';
import { FIELD_CONTROL_BASE, FIELD_CONTROL_BORDER, FIELD_CONTROL_SURFACE } from './Field';
import { INPUT_VARIANTS } from './Input';
import { SELECT_CONTROL } from './Select';
import { NAV_ITEM_ICON, NAV_ITEM_LABEL, NAV_ITEM_SURFACE } from './Sidebar';
import { TAG_TONES } from './Tag';

// Proves every utility the components and the app shell rely on actually
// generates CSS.
//
// It covers app/(app)/ as well as this folder, despite living here. A parallel
// guard next to the shell would mean a third copy of the compile harness below,
// and the note at the end of this comment says to lift it into a helper before
// that happens - so until somebody does, one list is better than two.
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

/** Every class the components hard-code, grouped by what would break. */
const HARDCODED = [
  // type styles
  'text-label-s',
  'text-label-m',
  'text-label-l',
  'text-display-s',
  'text-display-m',
  'text-heading-m',
  'text-strong-s',
  'text-strong-m',
  'text-body-s',
  'text-body-m',
  'text-caption',
  'text-overline',
  'text-wordmark',
  // colours outside the tone and category maps
  'text-text-primary',
  'text-text-secondary',
  'text-text-tertiary',
  'text-brand-accent',
  'text-white',
  'bg-surface-muted',
  'bg-brand-accent',
  'bg-status-danger',
  'bg-transparent',
  // the dark-surface tokens, which only the sidebar uses
  'bg-surface-ink',
  'bg-surface-ink-elevated',
  'text-text-on-dark',
  'text-text-on-dark-subtle',
  // radius, whose namespace is cleared: `rounded` on its own does not exist
  'rounded-md',
  'rounded-full',
  // Off the Foundations scale, which offers only 8 and 12. Figma bound the
  // sidebar's logo tile and nav pills to a raw 10px rather than a radius
  // variable, so this is a literal. It compiles without a token lookup, so no
  // token change can break it; it is here to be found when the designer resolves
  // the gap.
  'rounded-[10px]',
  // sizing and spacing, which share the --spacing namespace
  'size-1.5',
  'size-4',
  'size-5',
  'size-8.5',
  'size-9',
  'size-10',
  'h-1.25',
  'h-2',
  'h-full',
  'w-2.5',
  'w-65',
  'w-full',
  'gap-0.5',
  'gap-1',
  'gap-1.25',
  'gap-1.5',
  'gap-1.75',
  'gap-2',
  'gap-2.75',
  'gap-3',
  'gap-3.5',
  'gap-5.5',
  'gap-px',
  'px-2.5',
  'px-3',
  'px-5',
  'py-1',
  'py-2.75',
  'py-3',
  'pt-1',
  'pt-3',
  'pt-7',
  'pb-0.5',
  'pb-2',
  'pb-6',
  'pl-2',
  'pl-3',
  'min-w-0',
  'right-3.5',
  'left-4',
  'top-1/2',
  '-translate-y-1/2',
  // The app shell: app/(app)/layout.tsx, SidebarNav, PageHeader and the two
  // inert header pills. Same reasoning as everything above - these are typed
  // straight into JSX, so nothing else would notice one of them generating
  // nothing.
  //
  // gap-0.75 is the header's 3px overline-to-title gap, and py-2.5 the pills'
  // 10px. They resolve off the --spacing namespace exactly like the gap-2.75 and
  // py-3.25 the sidebar and button already prove, but a fractional step is
  // precisely what a cleared or redefined scale would silently drop.
  //
  // The month chevron's 4.5x9 is deliberately absent: 4.5px would be `h-1.125`,
  // and Tailwind generates nothing for a three-decimal step, so MonthPill uses
  // literal pixels instead. This guard is what found that.
  'sticky',
  'top-0',
  'h-screen',
  'gap-0.75',
  'px-10',
  'py-2.5',
  'pb-5',
  'pb-10',
  'pr-3',
  'pr-3.5',
  // layout and text handling the components depend on
  'flex',
  'flex-col',
  'items-center',
  'justify-center',
  'justify-between',
  'shrink-0',
  'flex-1',
  'truncate',
  'tabular-nums',
  'text-right',
  'overflow-hidden',
  'overflow-visible',
  'sr-only',
  'relative',
  'absolute',
  'pointer-events-none',
  // interaction states, which only the form, action and navigation components have
  'outline-none',
  'focus-visible:outline-2',
  'focus-visible:outline-offset-2',
  'focus-visible:outline-brand-accent',
  // White rather than the accent, and only in the sidebar: brand-accent on
  // surface-ink is too dark to read as a focus ring.
  'focus-visible:outline-white',
  'disabled:cursor-not-allowed',
  'disabled:opacity-60',
  'disabled:text-text-tertiary',
  'placeholder:text-text-tertiary',
];

/**
 * The variant maps, flattened.
 *
 * Every value is a multi-class string, so each has to be split: the assertion
 * below is a per-class selector lookup, and `.bg-brand-accent text-text-on-accent`
 * is not a selector anything compiles to.
 */
const split = (classes: string) => classes.split(' ');

const BUTTON_VARIANTS_CLASSES = Object.values(BUTTON_VARIANTS).flatMap(split);

const FIELD_CLASSES = [
  ...split(FIELD_CONTROL_BASE),
  ...Object.values(FIELD_CONTROL_SURFACE).flatMap(split),
  ...Object.values(FIELD_CONTROL_BORDER).flatMap(split),
];

const INPUT_VARIANT_CLASSES = Object.values(INPUT_VARIANTS).flatMap(split);

/**
 * The sidebar's three state maps.
 *
 * Three rather than one because the row fill, the label colour and the glyph
 * colour are separate properties that do not move together: the active item draws
 * an accent glyph against a white label. Each is a single class today, but split
 * anyway so the map keeps working when one of them stops being.
 */
const NAV_ITEM_CLASSES = [NAV_ITEM_SURFACE, NAV_ITEM_LABEL, NAV_ITEM_ICON].flatMap((map) =>
  Object.values(map).flatMap(split),
);

/**
 * Classes used only by the stories, to frame a component against a card.
 *
 * Worth guarding for the same reason as the components: Storybook is where
 * these get diffed against Figma, and a chrome class that generates nothing
 * makes a story render wrong while every other test stays green.
 *
 * Fixed story widths (`w-[520px]`) are still left out: they compile to literal CSS
 * with no token lookup, so there is nothing about them a token change could break.
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
  'gap-4',
  'gap-5',
  'gap-12',
  // The sidebar's own decorator: a fixed-height frame, because justify-between
  // needs a constrained height to put the footer at the bottom.
  'h-[1024px]',
  'bg-surface-canvas',
];

// `gap-3` used to live in STORY_CHROME. The sidebar's nav items hard-code it, so
// it moved to HARDCODED above; it is still guarded either way.

const EXPECTED = [
  ...Object.values(TAG_TONES).flatMap(({ pill, dot }) => [...pill.split(' '), dot]),
  ...Object.values(CATEGORY_TILE),
  ...BUTTON_VARIANTS_CLASSES,
  ...FIELD_CLASSES,
  ...INPUT_VARIANT_CLASSES,
  ...SELECT_CONTROL.split(' '),
  ...NAV_ITEM_CLASSES,
  ...HARDCODED,
  ...STORY_CHROME,
];

/**
 * Negative control. Without it, a harness bug that returned the whole stylesheet
 * would make every assertion above pass without testing anything.
 *
 * `bg-status-danger-sof` is not a typo. It is a prefix of the real
 * `bg-status-danger-soft` that TAG_TONES puts in the output, so it is the case
 * that catches `generates` losing its boundary check: with a bare
 * `String.includes` it reads as compiled, and this test fails.
 */
const FORBIDDEN = ['bg-category-9-taupe', 'text-status-info', 'bg-status-danger-sof'];

/**
 * The compiled selector for a candidate class.
 *
 * Escapes every character CSS needs escaped in an identifier and that these
 * classes actually contain: `.` in `size-1.5`, `:` in a variant prefix like
 * `focus-visible:outline-2`, `/` in `top-1/2`, and the brackets of an arbitrary
 * value such as `border-[1.5px]`.
 */
const selector = (candidate: string) => `.${candidate.replace(/[.:/[\]]/g, (char) => `\\${char}`)}`;

/**
 * Characters that may legally follow a class name in a compiled selector.
 *
 * `:` is in the set because a variant prefix compiles to a pseudo-class on the
 * same name - `.focus-within\:border-\[1\.5px\]:focus-within` - and `,`, `{` and
 * the combinators cover a grouped or descendant rule.
 */
const BOUNDARY = /[\s,{:>~+)\]]/;

/**
 * Whether the compiled stylesheet really contains a rule for this class.
 *
 * The boundary check is the whole point, and a plain `compiled.includes(...)` is
 * what this replaced. `.bg-status-danger` is a substring of
 * `.bg-status-danger-soft`, so an unanchored match made 18 of the candidates
 * below - among them `bg-status-danger`, `bg-brand-accent`, `border`, `flex` and
 * `py-3` - assertions that could never fail. Dropping the `--color-status-danger`
 * token would then have left the "Delete" button in the confirmation dialogs with
 * no fill and a white label on a white card, with the suite still green.
 *
 * An empty candidate is rejected outright: `selector('')` is `"."`, which occurs
 * in every stylesheet.
 */
const generates = (compiled: string, candidate: string) => {
  if (candidate === '') return false;

  const sel = selector(candidate);
  for (let from = 0; ; from += 1) {
    const at = compiled.indexOf(sel, from);
    if (at === -1) return false;

    const next = compiled[at + sel.length];
    if (next === undefined || BOUNDARY.test(next)) return true;
    from = at;
  }
};

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

  it('collects a candidate from every map', () => {
    // Guards the collection above: an emptied map would leave it.each with
    // nothing to iterate and still report success.
    expect(Object.keys(TAG_TONES)).toHaveLength(5);
    expect(Object.keys(CATEGORY_TILE)).toHaveLength(8);
    expect(Object.keys(BUTTON_VARIANTS)).toHaveLength(5);
    expect(Object.keys(FIELD_CONTROL_SURFACE)).toHaveLength(2);
    expect(Object.keys(FIELD_CONTROL_BORDER)).toHaveLength(2);
    expect(Object.keys(INPUT_VARIANTS)).toHaveLength(2);
    expect(Object.keys(NAV_ITEM_SURFACE)).toHaveLength(2);
    expect(Object.keys(NAV_ITEM_LABEL)).toHaveLength(2);
    expect(Object.keys(NAV_ITEM_ICON)).toHaveLength(2);
    expect(EXPECTED).toContain('bg-category-8-pink');
    expect(EXPECTED).toContain('text-brand-accent-pressed');
    expect(EXPECTED).toContain('text-status-danger-text');
    expect(EXPECTED).toContain('focus-within:border-[1.5px]');
    expect(EXPECTED).toContain('appearance-none');
    expect(EXPECTED).toContain('bg-surface-ink-raised');
    expect(EXPECTED).toContain('text-text-on-dark-subtle');
  });

  it('guards the two constants that are bare strings rather than maps', () => {
    // A key count cannot protect these. Empty either one and it contributes a
    // single '' to EXPECTED, which `generates` now rejects - but only because it
    // special-cases it, so the shape is worth asserting at the source too.
    expect(FIELD_CONTROL_BASE.split(' ').length).toBeGreaterThanOrEqual(6);
    expect(SELECT_CONTROL.split(' ').length).toBeGreaterThanOrEqual(9);
    expect(EXPECTED).not.toContain('');
  });

  it('rejects an empty candidate rather than matching every stylesheet', () => {
    // selector('') is "." on its own. Left unguarded, an emptied constant turns
    // its whole assertion into `expect(anyCss).toContain('.')`.
    expect(generates(compiled, '')).toBe(false);
  });

  it.each(EXPECTED)('%s generates CSS', (candidate) => {
    expect(generates(compiled, candidate)).toBe(true);
  });

  it.each(FORBIDDEN)('%s generates nothing', (candidate) => {
    expect(generates(compiled, candidate)).toBe(false);
  });
});
