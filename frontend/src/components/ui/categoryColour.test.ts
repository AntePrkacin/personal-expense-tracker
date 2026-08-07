import {
  CATEGORY_DOT,
  CATEGORY_DOT_NEUTRAL,
  CATEGORY_FILL,
  CATEGORY_FILL_NEUTRAL,
  CATEGORY_ICON,
  CATEGORY_TILE,
  CATEGORY_TILE_NEUTRAL,
  categoryDotClass,
  categoryFillVar,
  categoryIcon,
  categoryTileClass,
  type CategoryColour,
  type IconName,
} from './categoryColour';

// **What is worth pinning here changed shape at PET-64, and it is worth saying how.**
// This suite used to exist for a *lookup*: `color` was a hex, the maps were keyed by
// colour words, and a wrong digit in the bridge between them was invisible - the tile
// just rendered the fallback grey, which is a real colour in this design and so read
// as a category with no colour rather than as a bug.
//
// That bridge is gone. `color` stores the daisyUI token verbatim, so a lookup is an
// identity check, and the type system covers the exhaustiveness: `Record<CategoryColour,
// string>` is keyed by the contract's own union, so a missing key is a build error.
// What is left for a test is what a type cannot say - that the three maps agree with
// each other, that the tile's pairing inverts correctly for a `-content` token, and
// that the deliberate close pairs are still there.

const COLOURS = Object.keys(CATEGORY_TILE) as CategoryColour[];

describe('CATEGORY_TILE', () => {
  it('covers all sixteen daisyUI semantic tokens', () => {
    // Sixteen because `base-*` is deliberately absent: those are the page's own
    // surfaces, so a category painted in one is a category painted in nothing.
    expect(COLOURS).toHaveLength(16);
  });

  it('pairs every background with a content colour', () => {
    // The pairing is the point: a glyph drawn on the tile with currentColor has to
    // pick up a legible colour, not assume white.
    for (const colour of COLOURS) {
      const classes = CATEGORY_TILE[colour].split(' ');

      expect(classes).toHaveLength(2);
      expect(classes[0]).toBe(`bg-${colour}`);
      expect(classes[1].startsWith('text-')).toBe(true);
    }
  });

  it('inverts the pairing for a -content token, which looks like a mistake', () => {
    // `accent-content` maps to `bg-accent-content text-accent`. The glyph has to be
    // legible against the tile, and a `-content` token's partner is the base colour
    // it was derived from - so this is the correct direction, not a transposition.
    expect(CATEGORY_TILE['accent-content']).toBe('bg-accent-content text-accent');
    expect(CATEGORY_TILE.accent).toBe('bg-accent text-accent-content');
  });

  it('gives every token its own tile, with no collisions', () => {
    // The old eight-colour map deliberately collided orange and yellow onto
    // `warning`. Nothing collides now - the keys *are* the tokens - so a duplicate
    // value here would mean a copy-paste slip rather than a design decision.
    expect(new Set(Object.values(CATEGORY_TILE)).size).toBe(COLOURS.length);
  });
});

describe('the three deliberately close colour pairs', () => {
  // Measured in OKLab against a ~0.10 floor, and kept rather than re-picked: see
  // the note in categoryColour.ts for why breaking Education / Travel would cost
  // more than it buys. Pinned here so the map cannot silently be "fixed" into
  // something the sign-off artifact never showed - and so that anybody reading a
  // rendered screen and finding two categories the same colour finds this first.
  it.each([
    ['Personal care / Gifts', 0.029, 'accent-content', 'success-content'],
    ['Education / Travel', 0.037, 'primary-content', 'secondary-content'],
    ['Groceries / Utilities', 0.06, 'success', 'accent'],
  ])('keeps %s, ΔE %s', (_label, _delta, first, second) => {
    // They are genuinely different tokens - the point is that they render close,
    // not that they render identically, which is what a reused token would do.
    expect(CATEGORY_TILE[first as CategoryColour]).not.toBe(
      CATEGORY_TILE[second as CategoryColour],
    );
    expect(COLOURS).toContain(first);
    expect(COLOURS).toContain(second);
  });

  it('leans on the per-category icon as the identity channel', () => {
    // The close pairs are only safe because each category draws its own glyph, so
    // the icon map landing in the same ticket as the palette is a requirement
    // rather than a coincidence.
    expect(Object.keys(CATEGORY_ICON).length).toBeGreaterThan(0);
  });
});

describe('CATEGORY_DOT', () => {
  it('is every tile without its content colour', () => {
    // The two maps are written out separately, because this file's first rule is that
    // a class is never assembled at runtime. This is what stops them drifting: a dot is
    // exactly the background half of its tile, so a seventeenth colour added to one and
    // not the other fails here rather than rendering a transparent dot somewhere.
    for (const colour of COLOURS) {
      expect(CATEGORY_TILE[colour].split(' ')[0]).toBe(CATEGORY_DOT[colour]);
    }
  });

  it('covers the same tokens as the tile', () => {
    expect(Object.keys(CATEGORY_DOT)).toEqual(Object.keys(CATEGORY_TILE));
  });

  it('carries no text colour, which is the whole reason it exists', () => {
    // daisyUI's `.status` draws its drop shadow from `currentColor` and sets `color` to a
    // translucent black for that purpose. A `text-*-content` class overrides it with a fully
    // opaque colour and the shadow becomes an opaque smudge under every dot - which is why the
    // chips and the Welcome panel take this map and not the tile.
    for (const colour of COLOURS) {
      expect(CATEGORY_DOT[colour]).not.toMatch(/text-/);
    }
  });
});

describe('categoryTileClass', () => {
  it.each(COLOURS)('maps %s to its tile', (colour) => {
    expect(categoryTileClass(colour)).toBe(CATEGORY_TILE[colour]);
  });

  it('resolves the fallback category’s own colour like any other', () => {
    // **This reverses what the suite used to assert.** `Uncategorized` carried
    // `#98A0AE`, deliberately outside the palette, and this test pinned that it
    // rendered the neutral grey. It carries `warning-content` now, a real theme
    // token, so it resolves through the map and the neutral is for unresolvable
    // categories only.
    expect(categoryTileClass('warning-content')).toBe(CATEGORY_TILE['warning-content']);
    expect(categoryTileClass('warning-content')).not.toBe(CATEGORY_TILE_NEUTRAL);
  });

  it.each([
    ['a hex, which is no longer a colour this API stores', '#57B368'],
    ['a colour word from the retired palette', 'teal'],
    ['a token that is not semantic', 'base-100'],
    ['an empty string', ''],
    ['a category that could not be resolved', undefined],
    ['a colour the API left null', null],
  ])('falls back to the neutral tile for %s', (_label, value) => {
    expect(categoryTileClass(value)).toBe(CATEGORY_TILE_NEUTRAL);
  });

  it('never returns an empty string', () => {
    // The failure this rules out is the one Tailwind makes silent: a tile with no background
    // class is transparent, builds cleanly and looks like a rendering glitch.
    expect(CATEGORY_TILE_NEUTRAL).not.toBe('');
    expect(categoryTileClass('success')).not.toBe('');
  });

  it('never returns a bare index into Object.prototype', () => {
    // Object.hasOwn is what this guards: a plain `{}[key]` lookup also finds everything on
    // Object.prototype, so a colour of "constructor" or "toString" would return a function
    // where a class string is expected.
    expect(categoryTileClass('constructor')).toBe(CATEGORY_TILE_NEUTRAL);
    expect(categoryTileClass('toString')).toBe(CATEGORY_TILE_NEUTRAL);
  });
});

describe('categoryDotClass', () => {
  it.each(COLOURS)('maps %s to its dot', (colour) => {
    expect(categoryDotClass(colour)).toBe(CATEGORY_DOT[colour]);
  });

  it.each([
    ['a hex', '#57B368'],
    ['a retired colour word', 'teal'],
    ['an empty string', ''],
    ['a category that could not be resolved', undefined],
    ['a colour the API left null', null],
  ])('falls back to the neutral dot for %s', (_label, value) => {
    expect(categoryDotClass(value)).toBe(CATEGORY_DOT_NEUTRAL);
  });

  it('never hands a status dot a content colour to smudge itself with', () => {
    // The whole reason this function exists rather than the tile one being reused. Every
    // return value has to be background-only, the neutral fallback included.
    for (const colour of [...COLOURS, 'nonsense', null]) {
      expect(categoryDotClass(colour)).not.toMatch(/text-/);
    }
    expect(CATEGORY_DOT_NEUTRAL).not.toMatch(/text-/);
  });

  it('agrees with categoryTileClass about which colour a token is', () => {
    for (const colour of COLOURS) {
      expect(categoryTileClass(colour).split(' ')[0]).toBe(categoryDotClass(colour));
    }
  });

  it('never returns a bare index into Object.prototype', () => {
    expect(categoryDotClass('constructor')).toBe(CATEGORY_DOT_NEUTRAL);
    expect(categoryDotClass('toString')).toBe(CATEGORY_DOT_NEUTRAL);
  });
});

describe('CATEGORY_FILL', () => {
  it('covers the same tokens as the dot', () => {
    expect(Object.keys(CATEGORY_FILL)).toEqual(Object.keys(CATEGORY_DOT));
  });

  it('pairs every dot class with the CSS variable naming the same colour', () => {
    // The pin that stops the three maps drifting. `bg-error` and `var(--color-error)` are the
    // same colour reached two ways, and a seventeenth colour added to one map and not the
    // others fails here rather than painting an unfilled slice in the donut.
    for (const colour of COLOURS) {
      const token = CATEGORY_DOT[colour].replace(/^bg-/, '');
      expect(CATEGORY_FILL[colour]).toBe(`var(--color-${token})`);
    }
  });

  it('is a CSS value everywhere, never a Tailwind class', () => {
    // The whole reason this map exists. `fill="bg-error"` is not invalid CSS so much as
    // meaningless: the slice simply never paints, with no error anywhere.
    for (const colour of COLOURS) {
      expect(CATEGORY_FILL[colour]).toMatch(/^var\(--color-[a-z-]+\)$/);
      expect(CATEGORY_FILL[colour]).not.toMatch(/^bg-/);
    }
  });
});

describe('categoryFillVar', () => {
  it.each(COLOURS)('maps %s to its fill', (colour) => {
    expect(categoryFillVar(colour)).toBe(CATEGORY_FILL[colour]);
  });

  it.each([
    ['a hex', '#57B368'],
    ['a retired colour word', 'teal'],
    ['an empty string', ''],
    ['a category that could not be resolved', undefined],
    ['a colour the API left null', null],
  ])('falls back to the neutral fill for %s', (_label, value) => {
    expect(categoryFillVar(value)).toBe(CATEGORY_FILL_NEUTRAL);
  });

  it('never returns an empty string, which would be an unpainted slice', () => {
    // The donut's version of the transparent-tile failure: a slice with no fill still occupies
    // its arc, so the ring would have a hole in it that nothing reports.
    expect(categoryFillVar('success')).not.toBe('');
    expect(CATEGORY_FILL_NEUTRAL).not.toBe('');
  });

  it('never returns a bare index into Object.prototype', () => {
    expect(categoryFillVar('constructor')).toBe(CATEGORY_FILL_NEUTRAL);
    expect(categoryFillVar('toString')).toBe(CATEGORY_FILL_NEUTRAL);
  });
});

describe('CATEGORY_ICON', () => {
  const ICONS = Object.keys(CATEGORY_ICON) as IconName[];

  it('covers all thirteen lucide names the contract publishes', () => {
    expect(ICONS).toHaveLength(13);
  });

  it('resolves every name to a component rather than to undefined', () => {
    // The failure this rules out is the one an index signature makes silent: a map
    // missing a key hands the caller `undefined`, which React renders as nothing at
    // all rather than throwing.
    for (const name of ICONS) {
      expect(CATEGORY_ICON[name]).toBeDefined();
    }
  });

  it('gives each category its own glyph, with no reuse', () => {
    // The close colour pairs lean on this: two categories that render nearly the
    // same colour are told apart by the icon, so a reused glyph would collapse the
    // one channel that separates them.
    expect(new Set(Object.values(CATEGORY_ICON)).size).toBe(ICONS.length);
  });

  it('uses circle-question-mark rather than the deprecated circle-help', () => {
    expect(ICONS).toContain('circle-question-mark');
    expect(ICONS).not.toContain('circle-help');
  });
});

describe('categoryIcon', () => {
  it.each(Object.keys(CATEGORY_ICON) as IconName[])('maps %s to its component', (name) => {
    expect(categoryIcon(name)).toBe(CATEGORY_ICON[name]);
  });

  it.each([
    ['an icon name from before the allowlist', 'cup'],
    ['another one', 'box'],
    ['an empty string', ''],
    ['an icon the API left null', null],
    ['an absent icon', undefined],
  ])('returns null for %s', (_label, value) => {
    // Null rather than a stand-in glyph: the caller already draws a tile, and an
    // empty tile reads as a category with no icon where a wrong glyph would read
    // as a category that is something else.
    expect(categoryIcon(value)).toBeNull();
  });

  it('never returns a bare index into Object.prototype', () => {
    expect(categoryIcon('constructor')).toBeNull();
    expect(categoryIcon('toString')).toBeNull();
  });
});
