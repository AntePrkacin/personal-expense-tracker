import {
  category,
  FALLBACK_CATEGORY,
  UNCAPPED_CATEGORY,
} from '../transactions/categories/categoryFixture';

import { capsCaption, manageableCategories, noLimitCount, rowCaption } from './manageCategories';

// No jsdom in this file, which is why the module exists: the row filter and the caption are provable
// without opening a dialog. The modal's own suite covers what it draws from these.

describe('manageableCategories', () => {
  it('lists every category except the fallback', () => {
    const rows = manageableCategories([category(), UNCAPPED_CATEGORY, FALLBACK_CATEGORY]);

    expect(rows).toHaveLength(2);
    expect(rows.some((row) => row.isFallback)).toBe(false);
  });

  it('preserves the backend order, so the rows read as the cards do', () => {
    const first = category({ id: 'a', name: 'Bills' });
    const second = category({ id: 'b', name: 'Groceries' });

    expect(manageableCategories([first, second]).map((row) => row.name)).toEqual([
      'Bills',
      'Groceries',
    ]);
  });

  it('returns nothing for an account holding only the fallback', () => {
    // Reachable: `Uncategorized` cannot be deleted, so an account that has removed every other
    // category is exactly this. The modal draws its empty state from it.
    expect(manageableCategories([FALLBACK_CATEGORY])).toEqual([]);
  });
});

describe('noLimitCount', () => {
  it('counts the listed categories carrying no cap', () => {
    expect(noLimitCount([category(), UNCAPPED_CATEGORY])).toBe(1);
  });

  it('never counts the fallback, which ships uncapped on every account', () => {
    // The assertion that catches counting before filtering: `FALLBACK_CATEGORY` has no cap, so a
    // count taken over the raw list reads one high for every account in existence.
    expect(noLimitCount([category(), FALLBACK_CATEGORY])).toBe(0);
  });

  it('is zero when every listed category has a limit', () => {
    expect(noLimitCount([category(), category({ id: 'b' })])).toBe(0);
  });
});

describe('rowCaption', () => {
  // The formatter is injected exactly as the component injects `useMoney().formatWhole`, which is
  // what keeps this suite free of a provider.
  const euros = (amount: number) => `€${amount.toLocaleString('en-US')}`;

  it('puts the spend beside what the category was given', () => {
    expect(rowCaption({ spent: 312, monthlyCap: 300 }, euros)).toBe('€312 spent · €300 assigned');
  });

  it('says "No limit" for an uncapped category rather than dropping the second half', () => {
    // The common case, not an edge: a cap is optional throughout, and the summary island above
    // counts these - so a row with no marker leaves that count impossible to locate.
    expect(rowCaption({ spent: 63, monthlyCap: null }, euros)).toBe('€63 spent · No limit');
  });

  it('reads naturally when nothing has been spent', () => {
    expect(rowCaption({ spent: 0, monthlyCap: 250 }, euros)).toBe('€0 spent · €250 assigned');
  });

  it("draws both halves through the caller's formatter, so the currency follows the profile", () => {
    // The assertion that catches a hard-coded `$`: this module formats nothing itself.
    const marks = (amount: number) => `<${amount}>`;

    expect(rowCaption({ spent: 5, monthlyCap: 9 }, marks)).toBe('<5> spent · <9> assigned');
  });
});

describe('capsCaption', () => {
  it('drops the count sentence entirely at zero, keeping the standing one', () => {
    // The half that must survive: this sentence is the only thing telling the user where caps are
    // set, because this modal deliberately sets none inline.
    expect(capsCaption(0)).toBe('Set caps per category from Edit.');
  });

  it('pluralizes one', () => {
    expect(capsCaption(1)).toBe('1 category has no limit. Set caps per category from Edit.');
  });

  it('pluralizes more than one', () => {
    expect(capsCaption(4)).toBe('4 categories have no limit. Set caps per category from Edit.');
  });
});
