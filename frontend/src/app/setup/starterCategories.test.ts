import { CATEGORY_TILE } from '@/components/ui/categoryColour';

import { STARTER_CATEGORIES, STARTER_CATEGORY_NAMES } from './starterCategories';

// No jsdom needed: this module is data.
//
// The compile-time half of this contract lives in the module itself - `satisfies`
// rejects a name the API does not accept, and `EveryStarterCategoryIsOffered` fails
// the build if the API accepts one this file does not offer. What is left for a test
// is what the typechecker cannot see: the order, and the colour each name is paired
// with.

describe('STARTER_CATEGORIES', () => {
  it('offers the ten chips in the order frame 03 draws them', () => {
    // Written out as literals rather than derived from the module, because this is
    // the assertion that has to be able to disagree with it. The order is part of
    // the contract with both the backend (which seeds in this order) and the
    // design (CAT-2), and a re-ordered array is a diff nothing else would catch.
    expect(STARTER_CATEGORY_NAMES).toEqual([
      'Groceries',
      'Dining out',
      'Transport',
      'Shopping',
      'Housing',
      'Health',
      'Entertainment',
      'Bills',
      'Subscriptions',
      'Other',
    ]);
  });

  it('pairs every chip with a real Foundations category colour', () => {
    // The colours are the one half of this file the generated contract cannot
    // check, because the API publishes names only. A colour key with no entry in
    // CATEGORY_TILE would render a chip with no dot fill at all: a transparent
    // 11px hole, no build error, no other failing test.
    for (const { name, colour } of STARTER_CATEGORIES) {
      expect(Object.keys(CATEGORY_TILE)).toContain(colour);
      expect(name).not.toHaveLength(0);
    }
  });

  it('reuses two colours, because the palette has eight for ten chips', () => {
    // Deliberate, and pinned so it cannot be "fixed" by inventing two more
    // colours. Subscriptions reuses Transport's blue and Other reuses Bills'
    // orange, which is what the design does. The consequence worth knowing is
    // that colour alone cannot identify a chip.
    const used = STARTER_CATEGORIES.map((category) => category.colour);

    expect(new Set(used).size).toBe(8);
    expect(used.filter((colour) => colour === 'blue')).toHaveLength(2);
    expect(used.filter((colour) => colour === 'orange')).toHaveLength(2);
  });

  it('names each chip once', () => {
    // `@ArrayUnique` on the DTO makes a duplicated name a 400, and a duplicate
    // here would produce two chips that toggle each other.
    expect(new Set(STARTER_CATEGORY_NAMES).size).toBe(STARTER_CATEGORY_NAMES.length);
  });
});
