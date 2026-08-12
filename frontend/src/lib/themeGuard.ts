import { readFileSync } from 'node:fs';

import type { components } from '@/types/api';

// The measurement behind `frontend/CLAUDE.md`'s "Changing or adding a theme: the category
// palette is the guard" (PET-79). That procedure was a human opening two HTML files per theme
// and looking; at five themes it is ten browser walks per change, and the file itself recorded
// that **nothing automated checks any of it** - so a theme making six categories look identical
// shipped entirely green. This module is the arithmetic half of closing that, and
// `themeGuard.test.ts` beside it is the gate.
//
// **It measures authored values, not painted pixels, and that limit is the reason the browser
// walk stays in every theme ticket's checklist.** `frontend/CLAUDE.md` requires composited pixel
// reads because a token carrying an alpha means nothing until it is painted - which is exactly
// why `base-content/50` is composited here rather than measured as a token. For everything else
// the arithmetic is exact for the values the CSS declares, which is what PET-74 already relied
// on when it computed `COLOUR_CONTRAST` from the hexes and used Chromium only to cross-check.
// What this cannot see is a value that never reaches the paint: a losing cascade rule, a theme
// name nobody registered (`app/DecorativePanel.tsx` records that failure), an alpha applied at a
// call site. The test stops a regression between walks; it does not replace one.
//
// **Every value is reduced to an sRGB hex before anything is measured, deliberately.** The two
// sources author colour differently - the Expensa blocks in hex, daisyUI's stock themes in
// `oklch()` - and a comparison across five themes is only meaningful if both arrive in one
// space. The hex is also the honest choice rather than merely the convenient one: it is what an
// sRGB compositor paints, so two tokens that quantise to the same byte triple really are
// indistinguishable on the display this app is judged on. It is what reproduces the two
// collisions `components/ui/categoryColour.ts` names, at the ΔE it names them at, which is the
// calibration that makes the unknown answers worth reading.
//
// **An out-of-gamut `oklch()` is clipped per channel, and the tempting correction is wrong.**
// Several stock themes - `abyss` most of all - carry chroma sRGB cannot express, and there are
// three different answers for what such a colour becomes: per-channel clipping, CSS Color 4's
// gamut-mapping algorithm, and the sRGB hex fallback daisyUI's own build emits beside each
// value. They disagree by up to **ΔE 0.053**, which is half the floor below, and they disagree
// about verdicts and not only about bytes: measured against daisyUI's fallback, `abyss` has five
// colliding pairs; against clipping, four. So the difference decides how many overrides a theme
// costs, and PET-79 was planned on a probe that clipped.
//
// **The browser settled it, and it clips.** daisyUI's build emits a hex fallback *and* a
// `lab()` value; every browser that matters supports `lab()`, so the fallback is dead code and
// Chromium resolves the `lab()` and clips the out-of-gamut result per channel. Measured over all
// five themes and twenty tokens each by painting every token on a 1x1 canvas and reading the
// pixel back - the method `docs/agents/claude-tooling.md` prescribes - this module agrees with
// what Chromium paints on **97 of 100 tokens exactly** and the other three within one byte,
// worst case ΔE 0.0019, fifty-four times smaller than the floor. Matching daisyUI's fallback
// instead would have reported a collision the browser does not have. The lesson generalises past
// this file: **the sRGB fallback beside a wide-gamut colour is not what paints**, so a check
// calibrated against it is calibrated against a code path no user reaches.
//
// **This module reads the filesystem and must never be imported by a route.** `readThemeSources`
// is the only function that touches `node:fs`, and it takes the repo root as an argument rather
// than deriving one - `__dirname` exists under Jest's CommonJS transform and not under `node`,
// `import.meta.url` the other way round, and a module that guessed would work in exactly one of
// its two callers. Everything above it is pure and takes strings, which is what lets the suite
// pin the parsers and the maths with no files at all.

/**
 * A stored category colour, read out of the contract rather than restated.
 *
 * The same union `components/ui/categoryColour.ts` keys its four maps on, and for the same
 * reason: an eighteenth token in `backend/src/database/central/template-tokens.ts` plus an
 * `api:sync` breaks this file's build until it is handled, rather than silently going
 * unmeasured. That is the payoff of the allowlist being a real OpenAPI enum.
 */
export type ColourToken = components['schemas']['CreateCategoryDto']['color'];

/**
 * The sixteen daisyUI semantic tokens a category may carry, base and `-content` alike.
 *
 * `base-content/50` is the seventeenth entry in the allowlist and is deliberately not here: it
 * is not a declared token at all but the *ink* at half strength, so it has no value until it is
 * composited over a particular theme's card. `effectiveTokens` is what adds it.
 */
export const SEMANTIC_TOKENS = [
  'primary',
  'primary-content',
  'secondary',
  'secondary-content',
  'accent',
  'accent-content',
  'neutral',
  'neutral-content',
  'info',
  'info-content',
  'success',
  'success-content',
  'warning',
  'warning-content',
  'error',
  'error-content',
] as const;

export type SemanticToken = (typeof SEMANTIC_TOKENS)[number];

/**
 * The surfaces every measurement is taken against, plus the ink `base-content/50` derives from.
 *
 * Not category colours - `template-tokens.ts` says why the three `base-100/200/300` surfaces are
 * absent from the allowlist, which is that a category painted in the page's own background is a
 * category painted in nothing.
 */
export const SURFACE_TOKENS = ['base-100', 'base-200', 'base-300', 'base-content'] as const;

/** Each `-content` token beside the base colour it exists to be legible on. */
export const CONTENT_PAIRS = [
  ['primary-content', 'primary'],
  ['secondary-content', 'secondary'],
  ['accent-content', 'accent'],
  ['neutral-content', 'neutral'],
  ['info-content', 'info'],
  ['success-content', 'success'],
  ['warning-content', 'warning'],
  ['error-content', 'error'],
] as const satisfies readonly (readonly [SemanticToken, SemanticToken])[];

/**
 * Roughly where two category colours stop being tellable apart, in OKLab.
 *
 * `components/ui/categoryColour.ts` has carried this number as prose since PET-64 ("where
 * roughly 0.10 is the floor for telling two categories apart"); this is the same figure with
 * something reading it. It is a perceptual rule of thumb rather than a standard, which is why
 * the guard reports every measured distance and not merely a verdict.
 */
export const DISTINGUISHABILITY_FLOOR = 0.1;

/**
 * WCAG 1.4.11's non-text floor, used here only for a `-content` value on its own base.
 *
 * **Deliberately not applied to a token against the card**, which is the one assertion this
 * guard cannot make: `frontend/CLAUDE.md` records that "seventeen categories cannot all be
 * distinct and all clear 3:1 in both themes", and it is a property of the pairing rather than of
 * any one assignment - daisyUI puts each `-content` at the opposite end of the lightness range
 * from its base, which is exactly what makes it legible as a glyph on its own tile and
 * near-invisible as a fill on the page's own surface in one theme. PET-64 accepted that for the
 * category templates on the argument its PR records, and `COLOUR_CONTRAST` in
 * `backend/src/database/central/template-tokens.ts` is the measured table that argument rests
 * on. So the card figures are **reported and pinned** rather than floored; see
 * `themeGuard.test.ts` for which of the two each measurement gets.
 */
export const NON_TEXT_CONTRAST_FLOOR = 3;

/**
 * The two pairs this app ships knowingly close, named here so widening the exception is a diff.
 *
 * Both are `components/ui/categoryColour.ts`'s, with its reasoning: breaking Education / Travel
 * would force one of the two near-white tiles onto a dark one and break the picker label it
 * ships under, and near-identical beats exact reuse because the two differ in hue and can
 * separate on a wide-gamut display where a reused token never can. What makes it safe is that
 * every category also carries its own icon.
 *
 * **A third pair is not on this list and must not join it by accident.** Groceries / Utilities
 * (`success` / `accent`) measured 0.060 under the stock themes and 0.137 under Expensa, so the
 * Expensa hues separated it past the floor rather than grandfathering it.
 */
export const GRANDFATHERED_PAIRS = [
  ['primary-content', 'secondary-content'],
  ['accent-content', 'success-content'],
] as const satisfies readonly (readonly [SemanticToken, SemanticToken])[];

/** A theme's declared `--color-*` values, by token name, each an sRGB hex. */
export type TokenValues = Partial<Record<SemanticToken | (typeof SURFACE_TOKENS)[number], string>>;

/** One theme as the two sources plus any override block leave it. */
export interface ThemeSource {
  name: string;
  /** `authored` for an `@plugin 'daisyui/theme'` block, `stock` for one out of `themes.css`. */
  origin: 'authored' | 'stock';
  /** Whether `globals.css` marks it `default: true` (the bare `:root` arm). */
  isDefault: boolean;
  /** Whether `globals.css` marks it `prefersdark: true`. */
  prefersDark: boolean;
  /** The base values, before any override block is folded in. */
  declared: TokenValues;
  /** Tokens a plain `[data-theme=...]` block in `globals.css` overrides, and to what. */
  overrides: TokenValues;
}

export interface CollidingPair {
  a: ColourToken;
  b: ColourToken;
  deltaE: number;
  grandfathered: boolean;
}

export interface ThemeMeasurement {
  name: string;
  origin: 'authored' | 'stock';
  isDefault: boolean;
  prefersDark: boolean;
  /** Every allowlist token's effective paintable hex, `base-content/50` composited. */
  effective: Record<ColourToken, string>;
  /** Which tokens this theme's override block moved, and from what to what. */
  overrides: { token: SemanticToken; from: string; to: string }[];
  /** Every pair under `DISTINGUISHABILITY_FLOOR`, closest first. */
  collisions: CollidingPair[];
  /** Each allowlist token's WCAG contrast against this theme's own `base-100`. */
  cardContrast: Record<ColourToken, number>;
  /** Each `-content` token's WCAG contrast against its own base colour. */
  contentLegibility: { content: SemanticToken; base: SemanticToken; ratio: number }[];
}

// ---------------------------------------------------------------------------
// Colour maths
//
// Ported from `docs/explainers/generators/gen_logo_preview.py`, which is the probe the PET-79
// plan's figures were measured with - so the two agree by construction rather than by having
// been checked against each other once.
// ---------------------------------------------------------------------------

/** sRGB transfer function, gamma-encoded channel to linear light. */
function toLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** Linear light back to a gamma-encoded channel. */
function toGamma(channel: number): number {
  const v = Math.max(0, Math.min(1, channel));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

/** `#rrggbb` to three 0..1 channels. Accepts any case; throws on anything else. */
export function hexToRgb(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) throw new Error(`themeGuard: not a six-digit hex colour: ${JSON.stringify(hex)}`);
  const n = Number.parseInt(match[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Three 0..1 channels to a lowercase `#rrggbb`, clamped and rounded as a compositor would. */
export function rgbToHex(rgb: readonly [number, number, number]): string {
  const byte = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${byte(rgb[0])}${byte(rgb[1])}${byte(rgb[2])}`;
}

/**
 * `oklch(L% C H)` to an sRGB hex, out-of-gamut values clamped per channel.
 *
 * Only the three-component form is handled, because that is the only one daisyUI 5.7's
 * `themes.css` uses - verified across all thirty-five stock themes, not assumed. A value this
 * cannot read throws rather than being skipped: a token silently absent from the measurement is
 * the failure mode this whole module exists to remove.
 *
 * Clamping rather than gamut-mapping is what a browser painting into an sRGB surface does, and
 * it is why this is lossy in exactly the way the display is.
 */
export function oklchToHex(lightness: number, chroma: number, hueDegrees: number): string {
  const hue = (hueDegrees * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return rgbToHex([
    toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]);
}

/** Reads either colour syntax the two theme sources use into an sRGB hex. */
export function cssColourToHex(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('#')) return trimmed.toLowerCase();
  const oklch = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)$/i.exec(trimmed);
  if (oklch) {
    return oklchToHex(Number(oklch[1]) / 100, Number(oklch[2]), Number(oklch[3]));
  }
  throw new Error(`themeGuard: unreadable colour value ${JSON.stringify(value)}`);
}

/** sRGB hex to OKLab, which is the space the distinguishability floor is expressed in. */
export function hexToOklab(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Euclidean distance in OKLab between two sRGB hexes. */
export function deltaE(hexA: string, hexB: string): number {
  const a = hexToOklab(hexA);
  const b = hexToOklab(hexB);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** WCAG relative luminance of an sRGB hex. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, order-independent, 1..21. */
export function contrastRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * `foreground` at `alpha` over an opaque `background`, composited in sRGB as a browser would.
 *
 * This is the whole of what makes `base-content/50` measurable, and the reason
 * `frontend/CLAUDE.md` insists a check stopping at `getComputedStyle` has not checked a
 * translucent token: the declared value is an ink and an alpha, and neither says anything about
 * what lands on the screen until this step runs.
 */
export function compositeOver(foreground: string, background: string, alpha: number): string {
  const f = hexToRgb(foreground);
  const b = hexToRgb(background);
  return rgbToHex([
    f[0] * alpha + b[0] * (1 - alpha),
    f[1] * alpha + b[1] * (1 - alpha),
    f[2] * alpha + b[2] * (1 - alpha),
  ]);
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const ALL_DECLARABLE: readonly string[] = [...SEMANTIC_TOKENS, ...SURFACE_TOKENS];

/**
 * Drops CSS comments before anything is matched.
 *
 * Not tidiness: `globals.css`'s own comments quote selectors and token names while explaining
 * them, and every parser below works by regex over the raw text - so a comment naming
 * `[data-theme='dark']` would otherwise register as a rule overriding that theme. The guard would
 * then report values nothing paints, which is the same class of wrongness as missing values that
 * something does.
 */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Pulls every `--color-<known token>` declaration out of one CSS block body. */
function readDeclarations(body: string): TokenValues {
  const values: TokenValues = {};
  for (const match of body.matchAll(/--color-([a-z0-9-]+)\s*:\s*([^;}]+)/g)) {
    const token = match[1];
    if (!ALL_DECLARABLE.includes(token)) continue;
    values[token as keyof TokenValues] = cssColourToHex(match[2]);
  }
  return values;
}

/**
 * The stock theme names `globals.css` enables, out of its `@plugin 'daisyui'` registration.
 *
 * `themes: false` means none, which is what shipped from PET-74 until PET-79. A list means those
 * names are registered from `themes.css`, so a name here with no block there is a theme that
 * paints nothing - the silent failure `app/DecorativePanel.tsx` records - and
 * `measureThemes` throws on it rather than reporting a theme with no colours.
 */
export function parseRegisteredStockThemes(globalsCss: string): string[] {
  const block = /@plugin\s+'daisyui'\s*\{([\s\S]*?)\}/.exec(stripComments(globalsCss));
  if (!block) return [];
  const themes = /themes:\s*([^;]+);/.exec(block[1]);
  if (!themes) return [];
  const list = themes[1].trim();
  if (list === 'false' || list === 'all') return [];
  return list
    .split(',')
    .map((entry) => entry.trim().split(/\s+/)[0])
    .filter((name) => name.length > 0 && name !== 'false');
}

/**
 * The `@plugin 'daisyui/theme'` blocks `globals.css` authors, keyed by their own `name:`.
 *
 * The closing brace is matched at column zero (`\n\}`) rather than by the first `}`, because a
 * theme block's body is many lines of declarations and a non-greedy match to any brace would
 * stop at the first nested one the day somebody writes a `color-mix()` in here.
 */
export function parseAuthoredThemes(globalsCss: string): ThemeSource[] {
  const out: ThemeSource[] = [];
  for (const block of stripComments(globalsCss).matchAll(
    /@plugin\s+'daisyui\/theme'\s*\{([^{}]*)\}/g,
  )) {
    const body = block[1];
    const name = /name:\s*'([^']+)'/.exec(body)?.[1];
    if (!name) continue;
    out.push({
      name,
      origin: 'authored',
      isDefault: /default:\s*true/.test(body),
      prefersDark: /prefersdark:\s*true/.test(body),
      declared: readDeclarations(body),
      overrides: {},
    });
  }
  return out;
}

/**
 * Every theme daisyUI ships, out of the installed `themes.css`, keyed by `[data-theme=...]`.
 *
 * Reads the installed package rather than a copy, which is what keeps `theme:report` honest
 * about a candidate theme after a daisyUI bump: the values it measures are the values that
 * would paint.
 */
export function parseStockThemes(themesCss: string): Record<string, TokenValues> {
  const out: Record<string, TokenValues> = {};
  for (const block of themesCss.matchAll(/\[data-theme=([a-z0-9-]+)\]\s*\{([^}]*)\}/g)) {
    out[block[1]] = readDeclarations(block[2]);
  }
  return out;
}

/**
 * Plain `[data-theme='name'] { --color-*: ... }` rules in `globals.css`, which are the overrides.
 *
 * **Unlayered author CSS is what makes these win**, the same mechanism `globals.css`'s field
 * focus rules rely on and the same one its own comment explains: daisyUI's theme rules sit
 * inside nested `@layer` blocks, and unlayered author CSS outranks any layered rule at any
 * specificity. So an override needs no `!important` and no specificity hack, and a reader
 * wondering why a two-line block beats a whole theme should read that paragraph.
 *
 * The selector is matched with either quote style or none, because all three are valid CSS and
 * a guard that silently missed one would report a collision the browser does not have.
 *
 * **It reads every selector in a list, not the last one before the brace**, and that is a fix
 * rather than a nicety: `light` and `dark` share one override block
 * (`[data-theme='light'], [data-theme='dark'] { ... }`), and the version of this function that
 * matched a single selector saw only `dark`. The browser applied both, so the guard reported
 * three collisions in `light` that were already fixed - it found the defect in itself, which is
 * the one kind of failure a gate cannot be trusted without.
 */
export function parseThemeOverrides(globalsCss: string): Record<string, TokenValues> {
  const out: Record<string, TokenValues> = {};
  for (const block of stripComments(globalsCss).matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const names = [
      ...block[1].matchAll(/\[data-theme=(?:'([^']+)'|"([^"]+)"|([a-z0-9-]+))\]/g),
    ].map((match) => match[1] ?? match[2] ?? match[3]);
    if (names.length === 0) continue;
    const declared = readDeclarations(block[2]);
    if (Object.keys(declared).length === 0) continue;
    for (const name of names) out[name] = { ...out[name], ...declared };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

/**
 * Every allowlist token's effective paintable value for one theme.
 *
 * Two things happen here and both are the point. An override block's value replaces the
 * declared one, so a registered stock theme is measured as it will actually paint rather than as
 * daisyUI shipped it. And `base-content/50` is composited over this theme's own `base-100`,
 * which is what turns the seventeenth allowlist entry from an ink and an alpha into a colour
 * that can be compared with the other sixteen.
 */
export function mergedValues(source: ThemeSource): TokenValues {
  return { ...source.declared, ...source.overrides };
}

export function effectiveTokens(source: ThemeSource): Record<ColourToken, string> {
  const merged = mergedValues(source);
  const card = merged['base-100'];
  const ink = merged['base-content'];
  if (!card || !ink) {
    throw new Error(
      `themeGuard: theme '${source.name}' declares no ${!card ? 'base-100' : 'base-content'}, ` +
        `so nothing can be measured against its card`,
    );
  }
  const out = {} as Record<ColourToken, string>;
  for (const token of SEMANTIC_TOKENS) {
    const value = merged[token];
    if (!value) {
      throw new Error(`themeGuard: theme '${source.name}' declares no --color-${token}`);
    }
    out[token] = value;
  }
  out['base-content/50'] = compositeOver(ink, card, 0.5);
  return out;
}

const isGrandfathered = (a: string, b: string): boolean =>
  GRANDFATHERED_PAIRS.some(([x, y]) => (a === x && b === y) || (a === y && b === x));

/**
 * Measures one theme: its collisions, its card contrast and its `-content` legibility.
 *
 * **Collisions are counted over every allowlist token including the disabled one.** `COLOUR_SEED`
 * ships `error-content` with `enabled: false`, so a picker never offers it and a narrower count
 * would be defensible - it is counted anyway because `enabled` is presentation and validation
 * accepts the whole allowlist, so a category already carrying it keeps rendering. Measured both
 * ways while PET-79 was planned, the two sets agree on all five shipped themes: no collision in
 * any of them involves `error-content` or `base-content/50`, so nothing rests on the choice.
 */
export function measureTheme(source: ThemeSource): ThemeMeasurement {
  const effective = effectiveTokens(source);
  const tokens = Object.keys(effective) as ColourToken[];

  const collisions: CollidingPair[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    for (let j = i + 1; j < tokens.length; j += 1) {
      const distance = deltaE(effective[tokens[i]], effective[tokens[j]]);
      if (distance >= DISTINGUISHABILITY_FLOOR) continue;
      collisions.push({
        a: tokens[i],
        b: tokens[j],
        deltaE: distance,
        grandfathered: isGrandfathered(tokens[i], tokens[j]),
      });
    }
  }
  collisions.sort((x, y) => x.deltaE - y.deltaE);

  // `effectiveTokens` has already thrown if this is absent, so the assertion is a narrowing
  // rather than a claim - and it reads the merged value, so an override of the card itself is
  // measured against rather than the value daisyUI shipped.
  const card = mergedValues(source)['base-100'] as string;
  const cardContrast = {} as Record<ColourToken, number>;
  for (const token of tokens) {
    cardContrast[token] = contrastRatio(effective[token], card);
  }

  const contentLegibility = CONTENT_PAIRS.map(([content, base]) => ({
    content,
    base,
    ratio: contrastRatio(effective[content], effective[base]),
  }));

  const overrides = (Object.keys(source.overrides) as (keyof TokenValues)[])
    .filter((token): token is SemanticToken =>
      (SEMANTIC_TOKENS as readonly string[]).includes(token as string),
    )
    .map((token) => ({
      token,
      from: source.declared[token] ?? '(undeclared)',
      to: source.overrides[token] as string,
    }));

  return {
    name: source.name,
    origin: source.origin,
    isDefault: source.isDefault,
    prefersDark: source.prefersDark,
    effective,
    overrides,
    collisions,
    cardContrast,
    contentLegibility,
  };
}

/**
 * Every theme the app registers, authored and stock alike, in the order a reader wants them.
 *
 * A registered stock name with no block in the installed `themes.css` throws rather than being
 * skipped, because that is precisely the silent failure this guard exists to convert into a
 * loud one - an unregistered `data-theme` value matches nothing and pins nothing, which
 * `app/DecorativePanel.tsx` learned by shipping it.
 */
export function measureThemes(sources: ThemeSources): ThemeMeasurement[] {
  const authored = parseAuthoredThemes(sources.globalsCss);
  const overrides = parseThemeOverrides(sources.globalsCss);
  const stock = parseStockThemes(sources.themesCss);
  const registered = parseRegisteredStockThemes(sources.globalsCss);

  const authoredNames = new Set(authored.map((theme) => theme.name));
  const all: ThemeSource[] = authored.map((theme) => ({
    ...theme,
    overrides: overrides[theme.name] ?? {},
  }));

  for (const name of registered) {
    if (authoredNames.has(name)) continue;
    if (!stock[name]) {
      throw new Error(
        `themeGuard: globals.css registers the stock theme '${name}', which the installed ` +
          `daisyui/themes.css does not define - it would match nothing and paint nothing`,
      );
    }
    all.push({
      name,
      origin: 'stock',
      isDefault: false,
      prefersDark: false,
      declared: stock[name],
      overrides: overrides[name] ?? {},
    });
  }

  return all.map(measureTheme);
}

/**
 * Measures an arbitrary stock theme that the app does **not** register.
 *
 * This is the reporting half rather than the gate's: `theme:report` uses it to answer "could
 * this theme join at all" for all thirty-five, which is the question a human weighing a
 * candidate actually has. Nothing in the test suite calls it.
 */
export function measureCandidateThemes(themesCss: string): ThemeMeasurement[] {
  const stock = parseStockThemes(themesCss);
  return Object.entries(stock).map(([name, declared]) =>
    measureTheme({
      name,
      origin: 'stock',
      isDefault: false,
      prefersDark: false,
      declared,
      overrides: {},
    }),
  );
}

// ---------------------------------------------------------------------------
// The committed artifact
// ---------------------------------------------------------------------------

/**
 * The path of the committed measurement, relative to the repo root.
 *
 * One constant rather than three string literals, because it is named by `theme:report` (which
 * writes it), by `themeGuard.test.ts` (which asserts the committed copy still matches) and by
 * `docs/explainers/category-palette/build-palette-page.js` (which renders it).
 */
export const THEME_DATA_PATH = 'docs/explainers/category-palette/theme-data.json';

export interface ThemeData {
  /** How to regenerate it, carried in the file so a reader never has to go and find out. */
  regenerate: string;
  /** The installed daisyUI, because the stock themes' values are its to change. */
  daisyuiVersion: string;
  floors: { distinguishability: number; nonTextContrast: number };
  grandfathered: [SemanticToken, SemanticToken][];
  themes: ThemeMeasurement[];
}

/**
 * The committed measurement, as data.
 *
 * **Deliberately carries no timestamp and no host detail.** The test asserts that the committed
 * file equals what this function computes now, so anything varying per run would make the gate
 * fail on every machine and pass on none - and the artifact's whole job is to make a theme edit
 * fail the suite until somebody re-runs the report and commits the diff. `docs/agents/`'s own
 * rule about generated artifacts applies: regenerate, never hand-edit.
 *
 * A daisyUI bump that moves a stock theme's values will also fail it. That is correct rather
 * than annoying, and it is why the version is recorded here: the diff then says which of the two
 * causes it was.
 */
export function buildThemeData(sources: ThemeSources, daisyuiVersion: string): ThemeData {
  return {
    regenerate: 'cd frontend && npm run theme:report',
    daisyuiVersion,
    floors: {
      distinguishability: DISTINGUISHABILITY_FLOOR,
      nonTextContrast: NON_TEXT_CONTRAST_FLOOR,
    },
    grandfathered: GRANDFATHERED_PAIRS.map(([a, b]) => [a, b]),
    themes: measureThemes(sources),
  };
}

/**
 * Serialises the measurement exactly as the committed file holds it.
 *
 * Two spaces and a trailing newline, so the file survives Prettier and a diff of it is legible.
 * `docs/**` is formatted by nobody (root `CLAUDE.md`), so this function is the only formatter
 * this artifact has - which is why the shape is pinned here rather than left to a caller.
 */
export function serialiseThemeData(data: ThemeData): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// The one impure function
// ---------------------------------------------------------------------------

export interface ThemeSources {
  globalsCss: string;
  themesCss: string;
}

/**
 * Reads the two theme sources off disk, relative to the repo root the caller supplies.
 *
 * `repoRoot` is a parameter rather than something derived here, for the reason the header note
 * gives: the two callers disagree about which of `__dirname` and `import.meta.url` exists. The
 * test passes a path computed from its own location; the report script follows
 * `docs/explainers/icon-set/build-icon-page.js`'s convention and takes the repo root as
 * `argv[2]`.
 */
export function readThemeSources(repoRoot: string): ThemeSources {
  return {
    globalsCss: readFileSync(`${repoRoot}/frontend/src/app/globals.css`, 'utf8'),
    themesCss: readFileSync(`${repoRoot}/frontend/node_modules/daisyui/themes.css`, 'utf8'),
  };
}

/** The installed daisyUI's version, read off its own manifest rather than off `package.json`. */
export function readDaisyuiVersion(repoRoot: string): string {
  const manifest = readFileSync(`${repoRoot}/frontend/node_modules/daisyui/package.json`, 'utf8');
  const version = (JSON.parse(manifest) as { version?: string }).version;
  if (!version) throw new Error('themeGuard: the installed daisyui manifest carries no version');
  return version;
}

/** The committed measurement as it stands on disk, or `null` if it has never been written. */
export function readCommittedThemeData(repoRoot: string): string | null {
  try {
    return readFileSync(`${repoRoot}/${THEME_DATA_PATH}`, 'utf8');
  } catch {
    return null;
  }
}
