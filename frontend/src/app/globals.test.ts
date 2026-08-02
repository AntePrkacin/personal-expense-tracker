import fs from 'node:fs';
import path from 'node:path';
import { compile } from 'tailwindcss';

// Guards the Foundations design tokens (Figma "Foundations", node 5-2).
//
// Two layers, because either one alone leaves a real gap:
//
//  1. Text assertions over globals.css catch a token whose *value* drifted from
//     the design.
//  2. Compiling globals.css through Tailwind's own compile() catches a token
//     that reads correctly but generates no CSS - a cleared namespace, a
//     misspelled namespace, or a utility that silently vanished. Tailwind drops
//     unknown candidates without warning, so nothing else would notice.
//
// A computed-style test is not an option: next/jest maps every .css import to
// an empty object, so jsdom never receives a stylesheet.

const globalsPath = path.join(__dirname, 'globals.css');
const raw = fs.readFileSync(globalsPath, 'utf8');
// Collapse whitespace so assertions are indifferent to Prettier's formatting.
const css = raw.replace(/\s+/g, ' ');

const COLOUR_TOKENS: [group: string, token: string, value: string][] = [
  ['Brand', 'brand-accent', '#4f46e5'],
  ['Brand', 'brand-accent-pressed', '#3f37c9'],
  ['Brand', 'brand-accent-soft', '#ecebfd'],
  ['Surface', 'surface-canvas', '#f5f7f8'],
  ['Surface', 'surface-card', '#ffffff'],
  ['Surface', 'surface-muted', '#edeff2'],
  ['Surface', 'surface-ink', '#101720'],
  ['Surface', 'surface-ink-raised', '#18202b'],
  ['Surface', 'surface-ink-elevated', '#232c38'],
  ['Text', 'text-primary', '#131820'],
  ['Text', 'text-secondary', '#566072'],
  ['Text', 'text-tertiary', '#98a0ae'],
  ['Text', 'text-on-dark', '#ffffff'],
  ['Text', 'text-on-dark-muted', '#b4bcc9'],
  ['Text', 'text-on-dark-subtle', '#7c8698'],
  ['Text', 'text-on-accent', '#ffffff'],
  ['Border', 'border-default', '#e5e8eb'],
  ['Border', 'border-strong', '#d4d9de'],
  ['Border', 'border-subtle', '#eff1f3'],
  ['Status', 'status-success', '#16a34a'],
  ['Status', 'status-success-text', '#15803d'],
  ['Status', 'status-success-soft', '#e6f4ea'],
  ['Status', 'status-warning', '#e0a020'],
  ['Status', 'status-warning-text', '#b4820e'],
  ['Status', 'status-warning-soft', '#fbf0d9'],
  ['Status', 'status-danger', '#dc2626'],
  ['Status', 'status-danger-text', '#b91c1c'],
  ['Status', 'status-danger-soft', '#fbe9e9'],
  ['Category', 'category-1-coral', '#ef6f6c'],
  ['Category', 'category-2-orange', '#f29a3d'],
  ['Category', 'category-3-yellow', '#e7c24a'],
  ['Category', 'category-4-green', '#57b368'],
  ['Category', 'category-5-teal', '#34b9ae'],
  ['Category', 'category-6-blue', '#3f8ee6'],
  ['Category', 'category-7-violet', '#8a79f1'],
  ['Category', 'category-8-pink', '#ce6fb8'],
];

const RADIUS_TOKENS: [token: string, value: string][] = [
  ['sm', '8px'],
  ['md', '12px'],
  ['lg', '16px'],
  ['xl', '20px'],
];

// [utility, family token, size, weight, tracking, leading]
const TYPE_STYLES: [string, string, string, string, string, string][] = [
  ['text-display-xxl', 'display', '64px', '800', '-0.03em', 'normal'],
  ['text-display-xl', 'display', '44px', '800', '-0.025em', 'normal'],
  ['text-display-l', 'display', '32px', '700', '-0.02em', 'normal'],
  ['text-display-m', 'display', '26px', '700', '-0.02em', 'normal'],
  ['text-display-s', 'display', '22px', '700', '-0.015em', 'normal'],
  ['text-heading-l', 'display', '18px', '700', '-0.01em', 'normal'],
  ['text-heading-m', 'display', '16px', '600', '-0.005em', 'normal'],
  ['text-wordmark', 'display', '19px', '700', '-0.01em', 'normal'],
  ['text-strong-l', 'sans', '15px', '600', '0', 'normal'],
  ['text-strong-m', 'sans', '14px', '600', '0', 'normal'],
  ['text-strong-s', 'sans', '13px', '600', '0', 'normal'],
  ['text-label-l', 'sans', '14px', '500', '0', 'normal'],
  ['text-label-m', 'sans', '13px', '500', '0', 'normal'],
  ['text-label-s', 'sans', '12px', '500', '0', 'normal'],
  ['text-overline', 'sans', '11px', '500', '0.06em', 'normal'],
  ['text-body-l', 'sans', '15px', '400', '0', '1.55'],
  ['text-body-m', 'sans', '14px', '400', '0', 'normal'],
  ['text-body-s', 'sans', '13px', '400', '0', 'normal'],
  ['text-caption', 'sans', '11.5px', '400', '0', 'normal'],
];

describe('Foundations colour tokens', () => {
  it.each(COLOUR_TOKENS)('%s / %s is %s', (_group, token, value) => {
    expect(css).toContain(`--color-${token}: ${value};`);
  });

  it('declares all 36 Foundations colours plus white and black, and nothing else', () => {
    const declared = [...raw.matchAll(/^\s*--color-([a-z0-9-]+):/gm)].map((m) => m[1]);
    expect(declared.sort()).toEqual(
      [...COLOUR_TOKENS.map(([, token]) => token), 'white', 'black'].sort(),
    );
  });
});

describe('Foundations radius scale', () => {
  it.each(RADIUS_TOKENS)('Radius/%s is %s', (token, value) => {
    expect(css).toContain(`--radius-${token}: ${value};`);
  });

  // Radius/Full is Tailwind's built-in rounded-full (calc(infinity * 1px)); a
  // --radius-full declaration would be silently ignored, so it must not exist
  // or a reader would think it was doing something.
  it('does not declare --radius-full, which the compiler ignores', () => {
    expect(raw).not.toMatch(/--radius-full:/);
  });
});

describe('Foundations type styles', () => {
  it('defines all 19 styles', () => {
    const declared = [...raw.matchAll(/@utility\s+([a-z0-9-]+)\s*\{/g)].map((m) => m[1]);
    expect(declared.sort()).toEqual(TYPE_STYLES.map(([name]) => name).sort());
  });

  it.each(TYPE_STYLES)(
    '%s is --font-%s at %s / %s, tracking %s, leading %s',
    (name, family, size, weight, tracking, leading) => {
      const block = css.match(new RegExp(`@utility ${name} \\{([^}]*)\\}`))?.[1];
      expect(block).toBeDefined();
      expect(block).toContain(`font-family: var(--font-${family});`);
      expect(block).toContain(`font-size: ${size};`);
      expect(block).toContain(`font-weight: ${weight};`);
      expect(block).toContain(`letter-spacing: ${tracking};`);
      expect(block).toContain(`line-height: ${leading};`);
    },
  );

  it('splits the two typefaces the way the design does', () => {
    const family = (name: string) =>
      css.match(new RegExp(`@utility ${name} \\{[^}]*font-family: var\\(--font-([a-z]+)\\)`))?.[1];

    // Plus Jakarta Sans carries wordmark, display and heading.
    for (const name of ['text-wordmark', 'text-display-xxl', 'text-heading-l', 'text-heading-m']) {
      expect(family(name)).toBe('display');
    }
    // Inter carries strong, label, body, caption and overline.
    for (const name of ['text-strong-l', 'text-label-l', 'text-body-m', 'text-caption']) {
      expect(family(name)).toBe('sans');
    }
    expect(family('text-overline')).toBe('sans');
  });
});

describe('light mode only', () => {
  it('ships no dark or alternate theme', () => {
    expect(raw).not.toMatch(/prefers-color-scheme/);
    expect(raw).not.toMatch(/@custom-variant\s+dark/);
  });

  it('pins the colour scheme to light', () => {
    expect(css).toContain('color-scheme: light;');
  });
});

describe('compiled output', () => {
  // One compile() call for every candidate - per-test compiles would be slow.
  let compiled: string;

  const EXPECTED = [
    // one utility per colour token, across all six groups
    ...COLOUR_TOKENS.map(([, token]) => `bg-${token}`),
    'bg-white',
    'bg-black',
    // escape hatches Tailwind keeps outside the --color-* namespace
    'bg-transparent',
    'text-current',
    // radius, including the built-in pill
    ...RADIUS_TOKENS.map(([token]) => `rounded-${token}`),
    'rounded-full',
    // every type style
    ...TYPE_STYLES.map(([name]) => name),
    // both families
    'font-display',
    'font-sans',
    // the Figma spacing scale, on Tailwind's grid
    'p-0.5',
    'p-1',
    'p-2',
    'p-3',
    'p-4',
    'p-5',
    'p-6',
    'p-8',
    'p-10',
    'p-12',
    'p-16',
    // sizing utilities share the --spacing namespace and must survive
    'w-10',
    'h-6',
    'size-4',
  ];

  // Clearing --color-* and --text-* is what makes these build failures rather
  // than review catches. If any of them starts generating CSS again, a screen
  // can drift from the design without anyone noticing.
  const FORBIDDEN = [
    'text-red-600',
    'bg-red-500',
    'text-green-600',
    'bg-green-500',
    'bg-amber-500',
    'text-zinc-600',
    'bg-zinc-100',
    'bg-slate-50',
    'text-xs',
    'text-sm',
    'text-base',
    'text-lg',
    'text-4xl',
    'rounded-2xl',
    'rounded-3xl',
  ];

  const selector = (candidate: string) => `.${candidate.replace(/\./g, '\\.')}`;

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

  it.each(EXPECTED)('%s generates CSS', (candidate) => {
    expect(compiled).toContain(selector(candidate));
  });

  it.each(FORBIDDEN)('%s generates nothing', (candidate) => {
    expect(compiled).not.toContain(selector(candidate));
  });

  it('puts every colour token on :root, even the ones nothing uses yet', () => {
    // @theme static defeats Tailwind's tree-shaking, which otherwise drops
    // unused tokens entirely - including from anything reading them from JS.
    for (const [, token, value] of COLOUR_TOKENS) {
      expect(compiled).toContain(`--color-${token}: ${value};`);
    }
  });

  it('resolves the font families at the use site rather than against :root', () => {
    // @theme inline is what makes this work when the next/font variable class
    // is on an element rather than baked into the stylesheet.
    expect(compiled).toMatch(
      /\.font-display\s*\{\s*font-family:\s*var\(--font-plus-jakarta-sans\)/,
    );
    expect(compiled).toMatch(/\.font-sans\s*\{\s*font-family:\s*var\(--font-inter\)/);
  });
});
