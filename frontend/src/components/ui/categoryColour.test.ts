import {
  CATEGORY_COLOUR_BY_HEX,
  CATEGORY_DOT,
  CATEGORY_DOT_NEUTRAL,
  CATEGORY_FILL,
  CATEGORY_FILL_NEUTRAL,
  CATEGORY_TILE,
  CATEGORY_TILE_NEUTRAL,
  categoryDotClass,
  categoryFillVar,
  categoryTileClass,
  type CategoryColour,
} from './categoryColour';

// The first test beside this file, and it is here for the lookup rather than for the map:
// `CATEGORY_TILE` is daisyUI classes, which nothing compiles against in a test run, so what
// is worth pinning is that a hex a category is *stored* under resolves to the tile its
// colour word owns - a wrong digit there is invisible, the tile just renders the fallback
// grey, which is a real colour in this design and so looks like a category with no colour
// rather than a bug.

describe('CATEGORY_COLOUR_BY_HEX', () => {
  it('covers all eight colours exactly once', () => {
    expect(Object.keys(CATEGORY_COLOUR_BY_HEX)).toHaveLength(8);
    expect(new Set(Object.values(CATEGORY_COLOUR_BY_HEX)).size).toBe(8);
  });

  it('is keyed uppercase, because the API accepts either case', () => {
    // CreateCategoryDto matches /^#[0-9A-Fa-f]{6}$/, so a lowercase hex is a legal stored
    // value and the lookup normalises rather than trusting the seed's casing.
    for (const hex of Object.keys(CATEGORY_COLOUR_BY_HEX)) {
      expect(hex).toBe(hex.toUpperCase());
    }
  });
});

describe('CATEGORY_TILE', () => {
  it('pairs every background with its content colour', () => {
    // The pairing is the point of PET-57's conversion: a glyph drawn on the tile with
    // currentColor has to pick up the content colour, not assume white.
    for (const colour of Object.keys(CATEGORY_TILE) as CategoryColour[]) {
      const classes = CATEGORY_TILE[colour].split(' ');

      expect(classes.some((c) => c.startsWith('bg-'))).toBe(true);
      expect(classes.some((c) => c.startsWith('text-') && c.endsWith('-content'))).toBe(true);
    }
  });

  it('lets orange and yellow collide on warning, deliberately', () => {
    // PET-57 accepted the collision because category colours are decoration, not
    // semantics. Pinned so it cannot be "fixed" by inventing a ninth theme colour.
    expect(CATEGORY_TILE.orange).toBe(CATEGORY_TILE.yellow);
  });
});

describe('CATEGORY_DOT', () => {
  it('is every tile without its content colour', () => {
    // The two maps are written out separately, because this file's first rule is that a class
    // is never assembled at runtime. This is what stops them drifting: a dot is exactly the
    // background half of its tile, so adding a ninth colour to one and not the other fails
    // here rather than rendering a transparent dot somewhere.
    for (const colour of Object.keys(CATEGORY_TILE) as CategoryColour[]) {
      expect(CATEGORY_TILE[colour].split(' ')[0]).toBe(CATEGORY_DOT[colour]);
    }
  });

  it('covers the same eight colours as the tile', () => {
    expect(Object.keys(CATEGORY_DOT)).toEqual(Object.keys(CATEGORY_TILE));
  });

  it('carries no text colour, which is the whole reason it exists', () => {
    // daisyUI's `.status` draws its drop shadow from `currentColor` and sets `color` to a
    // translucent black for that purpose. A `text-*-content` class overrides it with a fully
    // opaque colour and the shadow becomes an opaque smudge under every dot - which is why the
    // chips and the Welcome panel take this map and not the tile.
    for (const colour of Object.keys(CATEGORY_DOT) as CategoryColour[]) {
      expect(CATEGORY_DOT[colour]).not.toMatch(/text-/);
    }
  });
});

describe('categoryTileClass', () => {
  it.each(Object.entries(CATEGORY_COLOUR_BY_HEX))('maps %s to its tile', (hex, colour) => {
    expect(categoryTileClass(hex)).toBe(CATEGORY_TILE[colour as CategoryColour]);
  });

  it('accepts a lowercase hex', () => {
    expect(categoryTileClass('#57b368')).toBe(CATEGORY_TILE.green);
  });

  it("gives the fallback category's own grey to #98A0AE", () => {
    // The one hex outside the palette that a real account actually holds: FALLBACK_CATEGORY
    // in the backend's starter-categories.ts. So this is the designed answer for
    // "Uncategorized" rather than a fallback being hit by accident.
    expect(categoryTileClass('#98A0AE')).toBe(CATEGORY_TILE_NEUTRAL);
  });

  it.each([
    ['an unknown but well-formed hex', '#123456'],
    ['something that is not a hex', 'green'],
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
    expect(categoryTileClass('#000000')).not.toBe('');
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
  // The half of the pair PET-34 and PET-23 both needed. The two existing CATEGORY_DOT call
  // sites index it by colour word; a screen rendering an API category has a hex, and the
  // hex-keyed path used to return the tile - whose text-*-content half is what must not reach
  // a `status`.

  it.each(Object.entries(CATEGORY_COLOUR_BY_HEX))('maps %s to its dot', (hex, colour) => {
    expect(categoryDotClass(hex)).toBe(CATEGORY_DOT[colour as CategoryColour]);
  });

  it('accepts a lowercase hex', () => {
    expect(categoryDotClass('#57b368')).toBe(CATEGORY_DOT.green);
  });

  it.each([
    ['an unknown but well-formed hex', '#123456'],
    ["the fallback category's own grey", '#98A0AE'],
    ['something that is not a hex', 'green'],
    ['an empty string', ''],
    ['a category that could not be resolved', undefined],
    ['a colour the API left null', null],
  ])('falls back to the neutral dot for %s', (_label, value) => {
    expect(categoryDotClass(value)).toBe(CATEGORY_DOT_NEUTRAL);
  });

  it('never hands a status dot a content colour to smudge itself with', () => {
    // The whole reason this function exists rather than the tile one being reused. Every
    // return value has to be background-only, the neutral fallback included - a text-*-content
    // half turns daisyUI's currentColor drop shadow into an opaque smudge under every dot.
    for (const hex of [...Object.keys(CATEGORY_COLOUR_BY_HEX), '#123456', null]) {
      expect(categoryDotClass(hex)).not.toMatch(/text-/);
    }
    expect(CATEGORY_DOT_NEUTRAL).not.toMatch(/text-/);
  });

  it('agrees with categoryTileClass about which colour a hex is', () => {
    // Two lookups over one map; this is what stops them drifting.
    for (const hex of Object.keys(CATEGORY_COLOUR_BY_HEX)) {
      expect(categoryTileClass(hex).split(' ')[0]).toBe(categoryDotClass(hex));
    }
  });

  it('never returns a bare index into Object.prototype', () => {
    expect(categoryDotClass('constructor')).toBe(CATEGORY_DOT_NEUTRAL);
    expect(categoryDotClass('toString')).toBe(CATEGORY_DOT_NEUTRAL);
  });
});

describe('CATEGORY_FILL', () => {
  it('covers the same eight colours as the dot', () => {
    expect(Object.keys(CATEGORY_FILL)).toEqual(Object.keys(CATEGORY_DOT));
  });

  it('pairs every dot class with the CSS variable naming the same colour', () => {
    // The pin that stops the three maps drifting. `bg-error` and `var(--color-error)` are the
    // same colour reached two ways, and a ninth colour added to one map and not the others fails
    // here rather than painting an unfilled slice in the donut.
    for (const colour of Object.keys(CATEGORY_DOT) as CategoryColour[]) {
      const token = CATEGORY_DOT[colour].replace(/^bg-/, '');
      expect(CATEGORY_FILL[colour]).toBe(`var(--color-${token})`);
    }
  });

  it('is a CSS value everywhere, never a Tailwind class', () => {
    // The whole reason this map exists. `fill="bg-error"` is not invalid CSS so much as
    // meaningless: the slice simply never paints, with no error anywhere.
    for (const colour of Object.keys(CATEGORY_FILL) as CategoryColour[]) {
      expect(CATEGORY_FILL[colour]).toMatch(/^var\(--color-[a-z-]+\)$/);
      expect(CATEGORY_FILL[colour]).not.toMatch(/^bg-/);
    }
  });

  it('lets orange and yellow collide, exactly as the other two maps do', () => {
    expect(CATEGORY_FILL.orange).toBe(CATEGORY_FILL.yellow);
  });
});

describe('categoryFillVar', () => {
  it.each(Object.entries(CATEGORY_COLOUR_BY_HEX))('maps %s to its fill', (hex, colour) => {
    expect(categoryFillVar(hex)).toBe(CATEGORY_FILL[colour as CategoryColour]);
  });

  it('accepts a lowercase hex', () => {
    expect(categoryFillVar('#57b368')).toBe(CATEGORY_FILL.green);
  });

  it.each([
    ['the fallback category own grey', '#98A0AE'],
    ['an unknown but well-formed hex', '#123456'],
    ['something that is not a hex', 'green'],
    ['an empty string', ''],
    ['a category that could not be resolved', undefined],
    ['a colour the API left null', null],
  ])('falls back to the neutral fill for %s', (_label, value) => {
    expect(categoryFillVar(value)).toBe(CATEGORY_FILL_NEUTRAL);
  });

  it('never returns an empty string, which would be an unpainted slice', () => {
    // The donut's version of the transparent-tile failure: a slice with no fill still occupies
    // its arc, so the ring would have a hole in it that nothing reports.
    expect(categoryFillVar('#000000')).not.toBe('');
    expect(CATEGORY_FILL_NEUTRAL).not.toBe('');
  });

  it('never returns a bare index into Object.prototype', () => {
    expect(categoryFillVar('constructor')).toBe(CATEGORY_FILL_NEUTRAL);
    expect(categoryFillVar('toString')).toBe(CATEGORY_FILL_NEUTRAL);
  });
});
