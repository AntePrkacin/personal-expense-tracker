import type { Category } from '@/lib/categories';

// The Categories tab's shared test and story fixture.
//
// **Lifted at the fourth copy, one past the rule of three**, which is what
// `frontend/src/components/CLAUDE.md` asks for: duplicate until a third consumer appears, then
// give it one owner. It existed identically in `CategoryCard.test.tsx`, `CategoriesScreen.test.tsx`,
// `CategoriesScreen.stories.tsx` and - as of PET-39 - `CategoryCardMenu.test.tsx`, each restating
// all thirteen fields of `CategoryResponseDto`.
//
// **The cost of the copies was not the duplication, it was that nothing would have caught a stale
// one.** `npm run build` deliberately does not typecheck `*.test.tsx` (see `frontend/CLAUDE.md`), so
// a renamed or added contract field would leave three suites updated and the fourth asserting
// against a shape the app never receives, with every gate green. PET-64 already moved `color` and
// `icon` once. `npx tsc --noEmit` is what covers the suites, and one owner is what makes it a
// single-line fix rather than a four-file sweep.
//
// **Not a `.test.ts` file and not under a `__fixtures__` directory**, because a *story* consumes it
// too and Storybook has no notion of either. It is an ordinary module that nothing in the app
// imports, so it reaches no bundle.

/**
 * One category, in the shape the contract publishes.
 *
 * The defaults are frame 13's own Groceries card - `near`, $397 of $500 - so a reviewer can hold a
 * suite beside node 36:423. Override whichever fields a case is about and leave the rest; every
 * derived field is passed explicitly rather than computed, because the point of the fixture is to
 * stand in for what the **backend** sends rather than to re-derive it here.
 */
export function category(overrides: Partial<Category> = {}): Category {
  return {
    id: '0198c2a1-0000-7000-8000-0000000000a1',
    name: 'Groceries',
    color: 'success',
    icon: 'shopping-basket',
    description: null,
    isFallback: false,
    monthlyCap: 500,
    spent: 397,
    transactionCount: 24,
    percentUsed: 79.4,
    remaining: 103,
    over: null,
    status: 'near',
    ...overrides,
  };
}

/**
 * The uncapped shape, with every derived field null - which is what the contract guarantees and
 * what `status: "uncapped"` means.
 *
 * This is the **common** case rather than the edge, because a cap is optional throughout. Frame 13
 * draws it nowhere.
 *
 * **It is an ordinary category rather than the fallback, and it was the fallback until PET-38.**
 * The two were one fixture while nothing on the screen distinguished them: both drew the same card
 * and the same banner, and the only test that cared about `isFallback` was the one asserting the
 * menu omits Delete. That stopped being true when the fallback card lost its kebab and its banner
 * entirely, at which point a single fixture would have made "uncapped" and "unactionable" the same
 * case and hidden the live "Set limit" this ticket adds. `FALLBACK_CATEGORY` below is the other
 * half.
 */
export const UNCAPPED_CATEGORY: Category = category({
  id: '0198c2a1-0000-7000-8000-0000000000a2',
  name: 'Subscriptions',
  color: 'primary',
  icon: 'tv',
  monthlyCap: null,
  percentUsed: null,
  remaining: null,
  over: null,
  status: 'uncapped',
  spent: 148,
  transactionCount: 6,
});

/**
 * The seeded `Uncategorized` row: uncapped, and the one category that is not the user's to act on.
 *
 * Every account has exactly one, `DELETE` refuses to remove it and `PATCH` refuses to rename it - so
 * as of PET-38 its card draws **no kebab and no banner**, which is what this fixture exists to pin.
 * Uncapped as well as fallback, because that is how it is provisioned; a suite wanting one property
 * without the other overrides it.
 */
export const FALLBACK_CATEGORY: Category = category({
  id: '0198c2a1-0000-7000-8000-0000000000a9',
  name: 'Uncategorized',
  color: 'base-content/50',
  icon: 'circle-question-mark',
  isFallback: true,
  monthlyCap: null,
  percentUsed: null,
  remaining: null,
  over: null,
  status: 'uncapped',
  spent: 148,
  transactionCount: 6,
});

/**
 * The periods the cap-anchor question offers, newest first with the current one flagged - the shape
 * `GET /api/periods` publishes and `CategoriesScreen.stories.tsx` already drew for the header's
 * select.
 *
 * Lifted here when `CapPeriodDialog` gave every modal on this tab a `periods` prop: three story
 * files and four suites would otherwise each restate it, which is the fixture-staleness failure the
 * header of this file exists to prevent. Three entries, because a select with one option cannot be
 * reviewed.
 */
export const CATEGORY_PERIODS = [
  { start: '2025-10-01', end: '2025-11-01', label: 'October 2025', current: true },
  { start: '2025-09-01', end: '2025-10-01', label: 'September 2025', current: false },
  { start: '2025-08-01', end: '2025-09-01', label: 'August 2025', current: false },
] as const;
