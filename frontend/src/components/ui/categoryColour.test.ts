import {
  CATEGORY_COLOUR_BY_HEX,
  CATEGORY_TILE,
  CATEGORY_TILE_NEUTRAL,
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
