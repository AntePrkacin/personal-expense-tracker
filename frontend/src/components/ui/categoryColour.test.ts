import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CATEGORY_COLOUR_BY_HEX,
  CATEGORY_TILE,
  CATEGORY_TILE_NEUTRAL,
  categoryTileClass,
  type CategoryColour,
} from './categoryColour';

// The first test beside this file, and it is here for the lookup rather than for the map:
// `CATEGORY_TILE` is already compiled through Tailwind by `utilities.test.ts`, but nothing
// checked that the hexes a category is *stored* under are the hexes this file keys on. A
// wrong digit there is invisible - the tile just renders the fallback grey, which is a real
// colour in this design and so looks like a category with no colour rather than a bug.

const GLOBALS = readFileSync(join(__dirname, '../../app/globals.css'), 'utf8');

describe('CATEGORY_COLOUR_BY_HEX', () => {
  it('covers all eight colours exactly once', () => {
    expect(Object.keys(CATEGORY_COLOUR_BY_HEX)).toHaveLength(8);
    expect(new Set(Object.values(CATEGORY_COLOUR_BY_HEX)).size).toBe(8);
  });

  it.each(Object.entries(CATEGORY_COLOUR_BY_HEX))(
    '%s is the hex globals.css gives that colour',
    (hex, colour) => {
      // The token name is derived from the class the tile map already holds, so this reads
      // the stylesheet rather than restating eight hexes a third time. `globals.test.ts`
      // pins those values against the design; this pins that a stored colour finds them.
      const token = CATEGORY_TILE[colour].replace('bg-', '--color-');

      expect(GLOBALS).toContain(`${token}: ${hex.toLowerCase()};`);
    },
  );

  it('is keyed uppercase, because the API accepts either case', () => {
    // CreateCategoryDto matches /^#[0-9A-Fa-f]{6}$/, so a lowercase hex is a legal stored
    // value and the lookup normalises rather than trusting the seed's casing.
    for (const hex of Object.keys(CATEGORY_COLOUR_BY_HEX)) {
      expect(hex).toBe(hex.toUpperCase());
    }
  });
});

describe('categoryTileClass', () => {
  it.each(Object.entries(CATEGORY_COLOUR_BY_HEX))('maps %s to its tile', (hex, colour) => {
    expect(categoryTileClass(hex)).toBe(CATEGORY_TILE[colour as CategoryColour]);
  });

  it('accepts a lowercase hex', () => {
    expect(categoryTileClass('#57b368')).toBe('bg-category-4-green');
  });

  it("gives the fallback category's own grey to #98A0AE", () => {
    // The one hex outside the palette that a real account actually holds: FALLBACK_CATEGORY
    // in the backend's starter-categories.ts, which is --color-text-tertiary. So this is the
    // designed answer for "Uncategorized" rather than a fallback being hit by accident.
    expect(categoryTileClass('#98A0AE')).toBe(CATEGORY_TILE_NEUTRAL);
    expect(GLOBALS).toContain('--color-text-tertiary: #98a0ae;');
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
});
