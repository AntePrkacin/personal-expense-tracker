import path from 'node:path';

import {
  CONTENT_PAIRS,
  DISTINGUISHABILITY_FLOOR,
  GRANDFATHERED_PAIRS,
  NON_TEXT_CONTRAST_FLOOR,
  SEMANTIC_TOKENS,
  THEME_DATA_PATH,
  buildThemeData,
  compositeOver,
  contrastRatio,
  cssColourToHex,
  deltaE,
  measureThemes,
  oklchToHex,
  parseAuthoredThemes,
  parseRegisteredStockThemes,
  parseStockThemes,
  parseThemeOverrides,
  readCommittedThemeData,
  readDaisyuiVersion,
  readThemeSources,
  serialiseThemeData,
  type ThemeData,
} from './themeGuard';

// The gate `frontend/CLAUDE.md`'s theme procedure never had (PET-79). Two halves, and the split
// matters: the cases above the `describe('the shipped themes')` block are unit tests over pure
// functions with literal inputs, and the ones inside it read the real `globals.css` and the real
// installed `daisyui/themes.css` - so this file fails both when the maths breaks and when
// somebody edits a theme value.
//
// **The calibration cases are the reason to trust the rest.** A probe that reproduces the two
// collisions `components/ui/categoryColour.ts` already documents, at the ΔE it documents them
// at, is a probe whose unknown answers are worth reading; one that merely runs is not. They are
// written as exact figures rather than as bounds for that reason.

const REPO_ROOT = path.resolve(__dirname, '../../..');

describe('colour maths', () => {
  it('round-trips a hex through OKLab distance as exactly zero', () => {
    expect(deltaE('#4f46e5', '#4f46e5')).toBe(0);
  });

  it('reads both colour syntaxes the two theme sources use', () => {
    expect(cssColourToHex('#4F46E5')).toBe('#4f46e5');
    expect(cssColourToHex(' #4f46e5 ')).toBe('#4f46e5');
    // daisyUI's own `light` theme card, which is plain white.
    expect(cssColourToHex('oklch(100% 0 0)')).toBe('#ffffff');
  });

  it('throws on a colour value it cannot read rather than skipping the token', () => {
    // A skipped token is a token silently unmeasured, which is the failure this module exists
    // to remove - so an unreadable value has to be louder than an absent one.
    expect(() => cssColourToHex('var(--something)')).toThrow(/unreadable colour/);
    expect(() => cssColourToHex('rgb(1 2 3)')).toThrow(/unreadable colour/);
    expect(() => cssColourToHex('oklch(50% 0.1 200 / 0.5)')).toThrow(/unreadable colour/);
  });

  it('clamps an out-of-gamut oklch per channel, as an sRGB compositor does', () => {
    // Chroma far past what sRGB can express; every channel must still land inside 00..ff
    // rather than producing NaN or a value that breaks the hex parse downstream.
    expect(oklchToHex(0.6, 0.9, 0)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('computes WCAG contrast order-independently, with black on white at 21', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#4f46e5', '#4f46e5')).toBeCloseTo(1, 10);
  });

  it('composites an alpha over a background rather than reporting the declared value', () => {
    // The whole of what makes `base-content/50` measurable, and the check
    // `frontend/CLAUDE.md` means by "a check that stops at getComputedStyle has not checked
    // base-content/50".
    expect(compositeOver('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(compositeOver('#000000', '#ffffff', 1)).toBe('#000000');
    expect(compositeOver('#000000', '#ffffff', 0)).toBe('#ffffff');
  });
});

describe('parsing', () => {
  const GLOBALS = `
@plugin 'daisyui' {
  themes: light, dark, abyss;
}

@plugin 'daisyui/theme' {
  name: 'expensa-light';
  default: true;
  --color-base-100: #ffffff;
  --color-primary: #4f46e5;
}

@plugin 'daisyui/theme' {
  name: 'expensa-dark';
  prefersdark: true;
  --color-base-100: #18202b;
  --color-primary: #6963ee;
}

[data-theme='light'] {
  --color-neutral-content: #123456;
}
`;

  it('reads the registered stock theme names off the plugin block', () => {
    expect(parseRegisteredStockThemes(GLOBALS)).toEqual(['light', 'dark', 'abyss']);
  });

  it('reads `themes: false` as no stock themes at all', () => {
    // What shipped from PET-74 until PET-79, so this is the pre-ticket state and not a
    // hypothetical one.
    expect(parseRegisteredStockThemes(`@plugin 'daisyui' {\n  themes: false;\n}`)).toEqual([]);
  });

  it('reads no plugin block as no stock themes rather than throwing', () => {
    expect(parseRegisteredStockThemes('/* nothing here */')).toEqual([]);
  });

  it('reads each authored theme with its default and prefersdark flags', () => {
    const authored = parseAuthoredThemes(GLOBALS);
    expect(authored.map((theme) => theme.name)).toEqual(['expensa-light', 'expensa-dark']);
    expect(authored[0]).toMatchObject({ isDefault: true, prefersDark: false });
    expect(authored[1]).toMatchObject({ isDefault: false, prefersDark: true });
    expect(authored[0].declared).toEqual({ 'base-100': '#ffffff', primary: '#4f46e5' });
  });

  it('reads a plain [data-theme] block as an override, in any quote style', () => {
    expect(parseThemeOverrides(GLOBALS)).toEqual({ light: { 'neutral-content': '#123456' } });
    expect(parseThemeOverrides(`[data-theme="dark"] { --color-accent: #abcdef; }`)).toEqual({
      dark: { accent: '#abcdef' },
    });
    expect(parseThemeOverrides(`[data-theme=dark] { --color-accent: #abcdef; }`)).toEqual({
      dark: { accent: '#abcdef' },
    });
  });

  it('reads every selector in an override list, not just the last before the brace', () => {
    // The defect the gate found in itself. `light` and `dark` share one override block, and the
    // single-selector version of the parser saw only `dark` - so the browser applied both while
    // the guard went on reporting three collisions in `light` that were already fixed.
    expect(
      parseThemeOverrides(
        `[data-theme='light'],\n[data-theme='dark'] {\n  --color-accent: #47f1d8;\n}`,
      ),
    ).toEqual({
      light: { accent: '#47f1d8' },
      dark: { accent: '#47f1d8' },
    });
  });

  it('does not read a selector out of a comment', () => {
    // `globals.css` explains its own override blocks in prose that names them, so a parser
    // reading comments would report values nothing paints - the mirror of the bug above.
    expect(
      parseThemeOverrides(`/* [data-theme='abyss'] { --color-accent: #000000; } */
[data-theme='dark'] { --color-accent: #47f1d8; }`),
    ).toEqual({ dark: { accent: '#47f1d8' } });
  });

  it('ignores a [data-theme] block that declares no colour token', () => {
    // The explainer pages carry such blocks for layout, and a theme entry with an empty
    // override map would report as an override of nothing.
    expect(parseThemeOverrides(`[data-theme='dark'] { color-scheme: dark; }`)).toEqual({});
  });

  it('ignores a --color-* name that is not an allowlist token', () => {
    // `--color-orange` is PET-74's app-authored fourth status hue and is deliberately not one
    // of the seventeen picker colours, so the guard must not measure it.
    const authored = parseAuthoredThemes(`@plugin 'daisyui/theme' {
  name: 'x';
  --color-orange: #ea580c;
  --color-primary: #4f46e5;
}`);
    expect(authored[0].declared).toEqual({ primary: '#4f46e5' });
  });

  it('reads every theme daisyUI ships out of the installed themes.css', () => {
    const { themesCss } = readThemeSources(REPO_ROOT);
    const stock = parseStockThemes(themesCss);
    // Pinned as a lower bound rather than an exact count, because a daisyUI bump adding a
    // theme is not a regression - what would be one is the parse finding almost none.
    expect(Object.keys(stock).length).toBeGreaterThanOrEqual(30);
    for (const name of ['light', 'dark', 'abyss']) {
      expect(Object.keys(stock[name])).toEqual(expect.arrayContaining([...SEMANTIC_TOKENS]));
    }
  });
});

describe('the shipped themes', () => {
  const measured = measureThemes(readThemeSources(REPO_ROOT));
  const byName = new Map(measured.map((theme) => [theme.name, theme]));

  it('measures both Expensa themes, whatever else is registered', () => {
    expect(byName.has('expensa-light')).toBe(true);
    expect(byName.has('expensa-dark')).toBe(true);
  });

  it('keeps exactly one default theme and one prefers-dark theme', () => {
    // `lib/theme.ts`'s whole mechanism rests on this: `system` means no `data-theme` attribute,
    // which is the state daisyUI's `--prefersdark` selector (`:root:not([data-theme])`)
    // requires, and a second default would make the bare `:root` arm ambiguous.
    expect(measured.filter((theme) => theme.isDefault).map((t) => t.name)).toEqual([
      'expensa-light',
    ]);
    expect(measured.filter((theme) => theme.prefersDark).map((t) => t.name)).toEqual([
      'expensa-dark',
    ]);
  });

  // --- calibration ---------------------------------------------------------

  it.each(['expensa-light', 'expensa-dark'])(
    'reproduces the two documented collisions in %s, at their documented ΔE',
    (name) => {
      const theme = byName.get(name);
      const pair = (a: string, b: string) =>
        theme!.collisions.find((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a));

      // `components/ui/categoryColour.ts` names both, with these figures.
      expect(pair('primary-content', 'secondary-content')!.deltaE).toBeCloseTo(0.02, 3);
      expect(pair('accent-content', 'success-content')!.deltaE).toBeCloseTo(0.06, 3);
    },
  );

  it('separates Groceries / Utilities, which the stock themes collapsed', () => {
    // The third pair, and the one that is NOT grandfathered: 0.060 under the stock themes,
    // 0.137 under Expensa. A regression here would put a third pair on a list that names two.
    for (const name of ['expensa-light', 'expensa-dark']) {
      const theme = byName.get(name)!;
      expect(deltaE(theme.effective.success, theme.effective.accent)).toBeCloseTo(0.137, 3);
    }
  });

  // --- the collision gate --------------------------------------------------

  it('has no colliding pair that is not one of the two grandfathered ones', () => {
    const unexpected = measured.flatMap((theme) =>
      theme.collisions
        .filter((c) => !c.grandfathered)
        .map((c) => `${theme.name}: ${c.a} / ${c.b} at ΔE ${c.deltaE.toFixed(4)}`),
    );
    // A picker offering two colours that paint the same is a picker with one fewer entry and a
    // lie in it. Widening the exception means editing GRANDFATHERED_PAIRS, which is a visible
    // diff and never an accident.
    expect(unexpected).toEqual([]);
  });

  it('grandfathers exactly two pairs, so the exception cannot widen unnoticed', () => {
    expect(GRANDFATHERED_PAIRS).toHaveLength(2);
  });

  // --- -content legibility on its own base ---------------------------------

  it('keeps every -content token legible on its own base colour', () => {
    // This is the assertion that makes the palette usable: what a `-content` value buys is a
    // glyph that reads on its own tile, which is what `CATEGORY_TILE` pairs. It is a real
    // floor rather than a pin, because every one of the five themes clears it today.
    const illegible = measured.flatMap((theme) =>
      theme.contentLegibility
        .filter((row) => row.ratio < NON_TEXT_CONTRAST_FLOOR)
        .map((row) => `${theme.name}: ${row.content} on ${row.base} at ${row.ratio.toFixed(3)}:1`),
    );
    expect(illegible).toEqual([]);
  });

  it('measures every -content pair, so none can drop out of the check', () => {
    for (const theme of measured) {
      expect(theme.contentLegibility).toHaveLength(CONTENT_PAIRS.length);
    }
  });

  // --- contrast against the card -------------------------------------------

  it('keeps base-content/50 visible on every theme’s card', () => {
    // The one card-contrast assertion that is a real floor rather than a pin, and the only
    // token in the allowlist with a recorded requirement to be visible as bare colour: the
    // backend's orphan fold routes real money into the donut slice it paints, so an invisible
    // one is the ring failing to close by another route. PET-22 rejected `base-300` for the
    // trend chart's muted bars on the same measurement, and PET-23 for this exact slice.
    for (const theme of measured) {
      expect(theme.cardContrast['base-content/50']).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST_FLOOR);
    }
  });

  it('does not floor the other sixteen tokens against the card, deliberately', () => {
    // Pinning the ABSENCE of that assertion, the way `(app)/layout.test.tsx` pins the absence
    // of a `force-dynamic` export - because the obvious "improvement" here is to extend the
    // floor above to every token, and it is unsatisfiable: `frontend/CLAUDE.md` records that
    // seventeen categories cannot all be distinct and all clear 3:1 in both themes, and
    // measured today the two Expensa themes alone fail such a floor five and six times. That
    // is a property of the pairing rather than of any assignment, and PET-64 accepted it on the
    // record. This case exists so somebody reaching for the floor reads that argument first.
    const below = measured.flatMap((theme) =>
      (Object.keys(theme.cardContrast) as (keyof typeof theme.cardContrast)[])
        .filter((token) => theme.cardContrast[token] < NON_TEXT_CONTRAST_FLOOR)
        .map((token) => `${theme.name}: ${token}`),
    );
    expect(below.length).toBeGreaterThan(0);
  });

  // --- the regression pin --------------------------------------------------

  it('matches the committed theme-data.json exactly', () => {
    // The drift detector, and the reason it is an artifact rather than a floor. Every figure
    // this module computes is void the moment a theme value moves, and nothing else in either
    // app reads a colour - so without this a theme edit changes eighty-five measurements with
    // `build`, `lint` and every other suite green, which is the failure PET-79 exists to close.
    //
    // **The test asserts and never writes.** A suite that regenerated this file would pass on a
    // machine whose output had drifted, which is the opposite of a gate, and it would make
    // `npm run test` mutate the working tree. `npm run theme:report` is what writes it.
    const committed = readCommittedThemeData(REPO_ROOT);
    expect(committed).not.toBeNull();

    const fresh = serialiseThemeData(
      buildThemeData(readThemeSources(REPO_ROOT), readDaisyuiVersion(REPO_ROOT)),
    );
    if (committed !== fresh) {
      // Named rather than diffed, because a raw diff of eighty-five figures says nothing about
      // which theme moved.
      const before = JSON.parse(committed as string) as ThemeData;
      const after = JSON.parse(fresh) as ThemeData;
      const moved = after.themes
        .filter((theme) => {
          const previous = before.themes.find((t) => t.name === theme.name);
          return JSON.stringify(previous) !== JSON.stringify(theme);
        })
        .map((theme) => theme.name);
      throw new Error(
        `${THEME_DATA_PATH} is stale. daisyUI committed ${before.daisyuiVersion}, installed ` +
          `${after.daisyuiVersion}. Themes that moved: ${
            moved.join(', ') || '(none - the ' + 'theme list itself changed)'
          }. Run \`npm run theme:report\` and commit the diff.`,
      );
    }
  });

  // --- shape ---------------------------------------------------------------

  it('measures all seventeen allowlist tokens per theme, base-content/50 included', () => {
    for (const theme of measured) {
      expect(Object.keys(theme.effective)).toHaveLength(SEMANTIC_TOKENS.length + 1);
      expect(theme.effective['base-content/50']).toMatch(/^#[0-9a-f]{6}$/);
      expect(Object.keys(theme.cardContrast)).toHaveLength(SEMANTIC_TOKENS.length + 1);
    }
  });

  it('composites base-content/50 rather than reporting the ink', () => {
    // Compared against the ink read back out of the source, not against
    // `effective['base-content']` - that is not a key of this map, so the obvious version of
    // this assertion compares a hex with `undefined` and cannot fail.
    const { globalsCss, themesCss } = readThemeSources(REPO_ROOT);
    const declared = {
      ...Object.fromEntries(parseAuthoredThemes(globalsCss).map((t) => [t.name, t.declared])),
      ...parseStockThemes(themesCss),
    };
    for (const theme of measured) {
      const ink = declared[theme.name]['base-content'] as string;
      expect(ink).toMatch(/^#[0-9a-f]{6}$/);
      expect(theme.effective['base-content/50']).not.toBe(ink);
      // And it really is the half-strength mix, not some other derivation.
      expect(theme.effective['base-content/50']).toBe(
        compositeOver(ink, declared[theme.name]['base-100'] as string, 0.5),
      );
    }
  });

  it('uses the same floor the category palette documents', () => {
    expect(DISTINGUISHABILITY_FLOOR).toBe(0.1);
  });
});
