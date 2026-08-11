import type { Allocation } from '@/lib/categories';

import {
  category,
  FALLBACK_CATEGORY,
  UNCAPPED_CATEGORY,
} from '../transactions/categories/categoryFixture';

import { categoryCountLabel, toCategoriesSummary } from './categoriesSummary';

// No jsdom anywhere in this file, which is the point of the module existing: the fallback rule and
// the pass-through are provable without rendering a card.
//
// **The fixture is imported across route folders, and as of PET-48 the filter is not duplicated
// either** - it moved to `lib/fallbackCategory.ts` when the Manage modal became its third consumer,
// which is the trigger `categoriesSummary.ts`'s own docblock had set. Read the paragraph this
// replaces as closed rather than reversed: it argued that forty characters a reader can verify at a
// glance are not worth pointing a settings module at another route's source, and that is still why
// the shared copy lives in `lib/` rather than in `transactions/categories/`. `categoryFixture.ts` is a thirteen-field
// mirror of `CategoryResponseDto`, and its own docblock names the failure a second copy causes:
// `npm run build` does not typecheck `*.test.ts`, so a contract field added upstream leaves one
// copy asserting against a shape the app never receives, with every gate green. One owner is the
// whole point of that file, and it imports nothing from the route it sits in.

const allocation = (overrides: Partial<Allocation> = {}): Allocation => ({
  monthlyBudget: 2000,
  allocated: 1800,
  unallocated: 200,
  ...overrides,
});

describe('toCategoriesSummary', () => {
  it('counts the categories the user manages and passes both figures through (AC1)', () => {
    const summary = toCategoriesSummary(
      [category(), UNCAPPED_CATEGORY, FALLBACK_CATEGORY],
      allocation(),
    );

    expect(summary).toEqual({ count: 2, allocated: 1800, monthlyBudget: 2000 });
  });

  it('excludes the fallback, which is the one category the UI cannot act on', () => {
    const withFallback = toCategoriesSummary([category(), FALLBACK_CATEGORY], allocation());
    const without = toCategoriesSummary([category()], allocation());

    expect(withFallback.count).toBe(1);
    expect(without.count).toBe(1);
  });

  it('counts an uncapped category, which contributes nothing to the allocated figure', () => {
    const summary = toCategoriesSummary([category(), UNCAPPED_CATEGORY], allocation());

    expect(summary.count).toBe(2);
  });

  it('reports 0 for an account whose only category is the fallback', () => {
    const summary = toCategoriesSummary([FALLBACK_CATEGORY], allocation({ allocated: 0 }));

    expect(summary.count).toBe(0);
    expect(summary.allocated).toBe(0);
  });

  // **The regression that matters, and the reason this function takes the whole `Allocation`.**
  // `allocation.allocated` is the sum of every live cap computed backend-side, and it is the same
  // field the Categories tab's summary card and the Allocate modal read. A `reduce` over
  // `monthlyCap` here would produce 500 from these rows and quietly disagree with both.
  it('does not re-sum the caps, so it cannot disagree with the Categories tab', () => {
    const summary = toCategoriesSummary(
      [category({ monthlyCap: 500 })],
      allocation({ allocated: 1800 }),
    );

    expect(summary.allocated).toBe(1800);
  });

  // A43: nothing prevents the caps exceeding the budget, and the API returns the figure unclamped
  // rather than hiding the excess. The card draws whatever it is handed.
  it('passes an over-allocated budget through unclamped', () => {
    const summary = toCategoriesSummary(
      [category()],
      allocation({ monthlyBudget: 2000, allocated: 2400, unallocated: -400 }),
    );

    expect(summary).toEqual({ count: 1, allocated: 2400, monthlyBudget: 2000 });
  });

  it('keeps cents rather than rounding, which the formatter at the call site owns', () => {
    const summary = toCategoriesSummary(
      [category()],
      allocation({ monthlyBudget: 2000.5, allocated: 1800.25 }),
    );

    expect(summary.monthlyBudget).toBe(2000.5);
    expect(summary.allocated).toBe(1800.25);
  });
});

describe('categoryCountLabel (AC2)', () => {
  it('is singular at one', () => {
    expect(categoryCountLabel(1)).toBe('1 category');
  });

  it('is plural at zero, which an account holding only the fallback reaches', () => {
    expect(categoryCountLabel(0)).toBe('0 categories');
  });

  it('is plural above one', () => {
    expect(categoryCountLabel(2)).toBe('2 categories');
    expect(categoryCountLabel(8)).toBe('8 categories');
  });
});
