import type { Allocation } from '@/lib/categories';

import {
  allocatableCategories,
  applyCap,
  assignedCents,
  capCents,
  ceilingCents,
  invalidRows,
  isDirty,
  MAX_CAP_ROWS,
  overCents,
  toAllocateBody,
  toAllocateDraft,
  toAllocateLedger,
  toAllocateTotals,
  type AllocateDraft,
  type AllocateLedger,
} from './allocateForm';
import { category, FALLBACK_CATEGORY, UNCAPPED_CATEGORY } from './categoryFixture';

// The modal's arithmetic, driven directly. No jsdom, no React - `categoryForm.test.ts`'s precedent,
// and the reason every rule worth a reviewer's attention lives in a pure module.

const allocation = (overrides: Partial<Allocation> = {}): Allocation => ({
  monthlyBudget: 2000,
  allocated: 1150,
  unallocated: 850,
  ...overrides,
});

/** A draft from bare caps, for the cases that are about the arithmetic rather than the mapping. */
const draftOf = (...caps: string[]): AllocateDraft =>
  caps.map((cap, index) => ({
    id: `id-${index}`,
    name: `Row ${index}`,
    color: 'success' as const,
    icon: null,
    cap,
    spent: 0,
  }));

const ledger = (budget: number, reserved = 0): AllocateLedger => ({
  budgetCents: budget * 100,
  reservedCents: reserved * 100,
});

describe('allocatableCategories', () => {
  it('excludes the fallback and keeps the backend order', () => {
    const rows = allocatableCategories([
      category({ name: 'Groceries' }),
      FALLBACK_CATEGORY,
      UNCAPPED_CATEGORY,
    ]);

    expect(rows.map((row) => row.name)).toEqual(['Groceries', 'Subscriptions']);
  });
});

describe('toAllocateLedger', () => {
  it('reserves nothing when the fallback is uncapped', () => {
    // The provisioned state, and the common one.
    const categories = [category({ monthlyCap: 500 }), FALLBACK_CATEGORY];

    expect(toAllocateLedger(allocation({ allocated: 500 }), categories)).toEqual({
      budgetCents: 200000,
      reservedCents: 0,
    });
  });

  it('reserves the fallback’s cap when it has one', () => {
    // Reachable through the API even though this UI cannot set it, which is the
    // whole reason the figure is derived rather than assumed to be zero.
    const categories = [category({ monthlyCap: 500 }), { ...FALLBACK_CATEGORY, monthlyCap: 60 }];

    expect(toAllocateLedger(allocation({ allocated: 560 }), categories)).toEqual({
      budgetCents: 200000,
      reservedCents: 6000,
    });
  });

  it('reserves nothing when the response carries no fallback row at all', () => {
    expect(
      toAllocateLedger(allocation({ allocated: 500 }), [category({ monthlyCap: 500 })]),
    ).toEqual({ budgetCents: 200000, reservedCents: 0 });
  });

  it('is exact for figures a float would drift on', () => {
    // 2000.5 * 100 is 200049.99999999997 and 4.02 * 100 is 401.99999999999994,
    // so this fails outright if the conversion ever truncates instead of rounding.
    const categories = [category({ monthlyCap: 4.02 }), { ...FALLBACK_CATEGORY, monthlyCap: 0.01 }];

    expect(
      toAllocateLedger(allocation({ monthlyBudget: 2000.5, allocated: 4.03 }), categories),
    ).toEqual({ budgetCents: 200050, reservedCents: 1 });
  });
});

describe('toAllocateDraft', () => {
  it('prefills a cap as a string the field could have produced', () => {
    const [row] = toAllocateDraft([category({ monthlyCap: 1250.5 })]);

    expect(row.cap).toBe('1,250.50');
  });

  it('prefills an uncapped category blank', () => {
    const [row] = toAllocateDraft([UNCAPPED_CATEGORY]);

    expect(row.cap).toBe('');
  });

  it('carries the colour, icon and spend the row draws', () => {
    const [row] = toAllocateDraft([category()]);

    expect(row).toMatchObject({
      name: 'Groceries',
      color: 'success',
      icon: 'shopping-basket',
      spent: 397,
    });
  });
});

describe('capCents', () => {
  it.each([
    ['', null],
    ['   ', null],
    ['1,250.50', 125050],
    ['0', 0],
    // A lone point is a real intermediate state `formatAmountInput` preserves, and
    // it names no amount - so it contributes nothing, the same answer as blank.
    ['.', null],
  ])('reads %p as %p', (cap, expected) => {
    expect(capCents(cap)).toBe(expected);
  });
});

describe('overCents', () => {
  const row = (cap: string, spent: number) => draftOf(cap).map((r) => ({ ...r, spent }))[0];

  it('reports the excess against the drafted cap, not the stored one', () => {
    // The caption has to move as the user types, which is the whole reason this reads the draft.
    expect(overCents(row('300', 312))).toBe(1200);
  });

  it('reports nothing when the spend is within the cap', () => {
    expect(overCents(row('500', 397))).toBeNull();
  });

  it('reports nothing at exactly the cap', () => {
    expect(overCents(row('300', 300))).toBeNull();
  });

  it('reports nothing for an uncapped or unparseable row', () => {
    expect(overCents(row('', 397))).toBeNull();
    expect(overCents(row('.', 397))).toBeNull();
  });

  it('compares in cents rather than floats', () => {
    // 312.07 - 300.01 in floats is 12.059999999999945.
    expect(overCents(row('300.01', 312.07))).toBe(1206);
  });
});

describe('assignedCents', () => {
  it('counts the rows the modal does not draw', () => {
    // Without `reservedCents` this would read 50000 and the ledger would disagree
    // with the backend's own `allocated`.
    expect(assignedCents(draftOf('300', '200'), ledger(2000, 60))).toBe(56000);
  });
});

describe('toAllocateTotals', () => {
  it('reports the budget, the assignment and the remainder', () => {
    expect(toAllocateTotals(draftOf('300', '200'), ledger(2000))).toEqual({
      budgetWhole: 2000,
      assignedWhole: 500,
      unassignedWhole: 1500,
    });
  });

  it('prints a column that adds up when the figures carry cents', () => {
    // The defect a review of PET-70 found: rounding all three independently gave
    // 2001 / 1000 / 1000, i.e. two rows summing to $2,000 under a stated $2,001,
    // in a column drawn with a rule above the total. Both budget and cap are
    // legal - `@IsNumber({ maxDecimalPlaces: 2 })` on each.
    const totals = toAllocateTotals(draftOf('1,000.25'), ledger(2000.5));

    expect(totals).toEqual({ budgetWhole: 2001, assignedWhole: 1000, unassignedWhole: 1001 });
    expect(totals.assignedWhole + totals.unassignedWhole).toBe(totals.budgetWhole);
  });

  it('adds up on a whole budget with fractional caps too', () => {
    // The half of that case reachable without a fractional budget, which is what
    // makes it ordinary rather than exotic: caps summing to $1,000.50.
    const totals = toAllocateTotals(draftOf('500.25', '500.25'), ledger(2000));

    expect(totals.assignedWhole + totals.unassignedWhole).toBe(totals.budgetWhole);
  });

  it('never reports a negative remainder', () => {
    // Only reachable through the stale ledger - a budget lowered elsewhere while
    // this modal sat open - which is a valid server state by A43.
    expect(toAllocateTotals(draftOf('9,000'), ledger(2000)).unassignedWhole).toBe(0);
  });

  it('counts the reserved cap against the remainder', () => {
    expect(toAllocateTotals(draftOf('300'), ledger(2000, 60))).toEqual({
      budgetWhole: 2000,
      assignedWhole: 360,
      unassignedWhole: 1640,
    });
  });
});

describe('ceilingCents', () => {
  it('excludes its own row', () => {
    // Budget 2000, the other row holds 300, so this row may hold 1700 - not the
    // 1500 it would be if its own current cap counted against it.
    expect(ceilingCents(draftOf('500', '300'), 0, ledger(2000))).toBe(170000);
  });

  it('subtracts the reserved cap too', () => {
    expect(ceilingCents(draftOf('500', '300'), 0, ledger(2000, 60))).toBe(164000);
  });

  it('never goes negative', () => {
    // Not reachable while the banner only renders above zero unassigned, but the
    // clamp must not be the thing standing between that and a negative ceiling.
    expect(ceilingCents(draftOf('100', '9000'), 0, ledger(2000))).toBe(0);
  });
});

describe('applyCap', () => {
  const twoRows = () => draftOf('500', '300');

  it('leaves a value at or under the ceiling alone', () => {
    const result = applyCap(twoRows(), 0, '1,700', ledger(2000));

    expect(result.draft[0].cap).toBe('1,700');
    expect(result.snappedToCents).toBeNull();
  });

  it('snaps a value past the ceiling down to it, and reports the ceiling', () => {
    const result = applyCap(twoRows(), 0, '4,000', ledger(2000));

    expect(result.draft[0].cap).toBe('1,700.00');
    expect(result.snappedToCents).toBe(170000);
  });

  it('snaps to a value the field could itself have produced', () => {
    // 349.99 rather than 349.99000000001 or an ungrouped 1700 - which is what
    // keeps the next keystroke behaving like the tenth.
    const result = applyCap(draftOf('0', '1,650.51'), 0, '4,000', ledger(2000));

    expect(result.draft[0].cap).toBe('349.49');
    expect(capCents(result.draft[0].cap)).toBe(result.snappedToCents);
  });

  it('does not report a second snap for a value already at the ceiling', () => {
    // Idempotence, and it is what stops the footer message re-firing on every
    // further keystroke.
    const snapped = applyCap(twoRows(), 0, '4,000', ledger(2000));
    const again = applyCap(snapped.draft, 0, snapped.draft[0].cap, ledger(2000));

    expect(again.snappedToCents).toBeNull();
    expect(again.draft[0].cap).toBe('1,700.00');
  });

  it('clears the field rather than writing 0 when nothing is left to assign', () => {
    // Found in a browser, not by a gate. Snapping to the ceiling literally writes a cap of `0`,
    // which `isCapValid` and the DTO both reject - so the app would plant an invalid value the user
    // never typed and then blame them for it. Blank is valid and true: there is nothing left to give
    // this row.
    const full = draftOf('2,000', '');
    const result = applyCap(full, 1, '50', ledger(2000));

    expect(result.draft[1].cap).toBe('');
    expect(result.snappedToCents).toBe(0);
    // And the draft stays saveable, which is the whole point.
    expect(invalidRows(result.draft)).toEqual([]);
  });

  it('leaves a cleared field cleared rather than snapping it', () => {
    const result = applyCap(twoRows(), 0, '', ledger(2000));

    expect(result.draft[0].cap).toBe('');
    expect(result.snappedToCents).toBeNull();
  });

  it('frees the cleared row’s budget for every other row', () => {
    const cleared = applyCap(twoRows(), 1, '', ledger(2000)).draft;

    expect(ceilingCents(cleared, 0, ledger(2000))).toBe(200000);
  });

  it('never lowers a row other than the one being written', () => {
    // The invariant the whole design rests on: a clamp applied across the draft,
    // or on mount, would rewrite caps the user never touched. Every other row
    // must come back byte-identical.
    const before = draftOf('500', '300', '');
    const after = applyCap(before, 0, '9,999', ledger(2000)).draft;

    expect(after[1]).toEqual(before[1]);
    expect(after[2]).toEqual(before[2]);
  });

  it('leaves every cap alone when the ledger is merely replayed', () => {
    // Standing in for "opening the modal changes nothing": each row re-written
    // with its own current value must snap nowhere.
    const before = draftOf('500', '300', '150');

    for (let index = 0; index < before.length; index += 1) {
      const result = applyCap(before, index, before[index].cap, ledger(2000));
      expect(result.snappedToCents).toBeNull();
      expect(result.draft).toEqual(before);
    }
  });
});

describe('invalidRows', () => {
  it('reports every offending row at once', () => {
    const draft = draftOf('500', '0', '.', '');

    expect(invalidRows(draft)).toEqual(['id-1', 'id-2']);
  });

  it('treats a blank field as valid, because uncapped is a real choice', () => {
    expect(invalidRows(draftOf('', ''))).toEqual([]);
  });
});

describe('toAllocateBody', () => {
  it('sends only the rows whose cap changed', () => {
    const original = draftOf('500', '300');
    const draft = applyCap(original, 1, '250', ledger(2000)).draft;

    expect(toAllocateBody(original, draft)).toEqual({
      categories: [{ id: 'id-1', monthlyCap: 250 }],
    });
  });

  it('does not treat a reformatting as a change', () => {
    // '250' and '250.00' are the same cap. A string comparison would report an
    // edit the user did not make.
    const original = draftOf('250');
    const draft = draftOf('250.00');

    expect(toAllocateBody(original, draft).categories).toEqual([]);
  });

  it('sends null for a cleared cap', () => {
    const original = draftOf('500');
    const draft = draftOf('');

    expect(toAllocateBody(original, draft)).toEqual({
      categories: [{ id: 'id-0', monthlyCap: null }],
    });
  });

  it('sends major units, not cents', () => {
    const original = draftOf('500');
    const draft = draftOf('1,250.50');

    expect(toAllocateBody(original, draft).categories[0].monthlyCap).toBe(1250.5);
  });

  it('carries exactly an id and a cap per entry', () => {
    // `forbidNonWhitelisted` answers 400 for an unknown nested key, so an extra
    // field here is a rejected save rather than a dropped one.
    const original = draftOf('500');
    const draft = draftOf('600');

    expect(Object.keys(toAllocateBody(original, draft).categories[0]).sort()).toEqual([
      'id',
      'monthlyCap',
    ]);
  });
});

describe('MAX_CAP_ROWS', () => {
  it('matches the DTO bound the modal is refusing on behalf of', () => {
    // Restated from `UpdateCategoryCapsDto`'s `MAX_CAPS_PER_REQUEST` because
    // `maxItems` reaches no generated type. This case is the only thing standing
    // between the two, so read it as the reminder to change both.
    expect(MAX_CAP_ROWS).toBe(100);
  });

  it('is a bound the diff can exceed, which is why the modal checks it', () => {
    const caps = Array.from({ length: MAX_CAP_ROWS + 1 }, () => '100');
    const changed = Array.from({ length: MAX_CAP_ROWS + 1 }, () => '200');

    expect(toAllocateBody(draftOf(...caps), draftOf(...changed)).categories).toHaveLength(
      MAX_CAP_ROWS + 1,
    );
  });
});

describe('isDirty', () => {
  it('is false for an untouched draft, including a reformatted one', () => {
    expect(isDirty(draftOf('250'), draftOf('250'))).toBe(false);
    expect(isDirty(draftOf('250'), draftOf('250.00'))).toBe(false);
  });

  it('is true once a cap really changed', () => {
    expect(isDirty(draftOf('250'), draftOf('300'))).toBe(true);
    expect(isDirty(draftOf('250'), draftOf(''))).toBe(true);
  });
});
