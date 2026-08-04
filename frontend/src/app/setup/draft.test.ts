import {
  DEFAULT_CURRENCY,
  EMPTY_DRAFT,
  isBudgetValid,
  parseDraft,
  SETUP_DRAFT_KEY,
  serializeDraft,
  type SetupDraft,
} from './draft';

// No jsdom is needed here, which is the point of keeping draft.ts free of React:
// every assertion below is over plain data.

describe('SETUP_DRAFT_KEY', () => {
  it('is the namespaced key, pinned as a literal', () => {
    // Asserted verbatim rather than imported-and-compared, so a rename shows up
    // as a diff in a test somebody has to read. Same call Sidebar.test.tsx makes
    // about the wordmark. sessionStorage is a flat per-origin bucket, so the
    // namespace is what stops a collision with anything else this origin stores.
    expect(SETUP_DRAFT_KEY).toBe('spendifico.setup.draft');
  });
});

describe('EMPTY_DRAFT', () => {
  it('defaults the currency and leaves the budget blank', () => {
    // USD because A6 gives the design only one option. A blank budget because a
    // pre-filled one would be a number nobody chose, and AC3 has to be reachable.
    expect(EMPTY_DRAFT).toEqual({ currency: 'USD', budget: '' });
    expect(DEFAULT_CURRENCY).toBe('USD');
  });

  it('carries no categories field yet', () => {
    // PET-10 adds it. Pinned so this file records the omission as deliberate
    // rather than forgotten: nothing can know step 2's shape yet.
    expect(Object.keys(EMPTY_DRAFT).sort()).toEqual(['budget', 'currency']);
  });
});

describe('parseDraft', () => {
  it('reads a draft it wrote', () => {
    const draft: SetupDraft = { currency: 'USD', budget: '2,000' };
    expect(parseDraft(serializeDraft(draft))).toEqual(draft);
  });

  it('answers the empty draft for an empty slot', () => {
    expect(parseDraft(null)).toEqual(EMPTY_DRAFT);
  });

  it.each([
    ['not json at all', 'not json'],
    ['the literal null', 'null'],
    ['an array', '[]'],
    ['a number', '3'],
    ['a string', '"2,000"'],
    ['a truncated object', '{"currency":'],
  ])('answers the empty draft for %s', (_label, raw) => {
    // Total by design. sessionStorage is writable from that tab's devtools
    // console and outlives a deploy that changes this shape, so every one of
    // these is reachable - and a throw inside the provider's mount effect would
    // white-screen the whole flow, which is far worse than a lost draft.
    expect(parseDraft(raw)).toEqual(EMPTY_DRAFT);
  });

  it('coerces a field whose stored type is wrong', () => {
    expect(parseDraft('{"currency":5,"budget":[]}')).toEqual(EMPTY_DRAFT);
  });

  it('falls back per field rather than discarding the whole draft', () => {
    // A budget worth keeping is kept even though the currency is unusable.
    expect(parseDraft('{"currency":null,"budget":"2,000"}')).toEqual({
      currency: DEFAULT_CURRENCY,
      budget: '2,000',
    });
  });

  it('ignores keys it does not recognise', () => {
    // The forward-compatibility property PET-10 depends on: it adds a field, and
    // a payload written before that change still loads instead of being dropped.
    // Equally, a payload written *after* a rollback does not break this version.
    expect(parseDraft('{"currency":"USD","budget":"2,000","categories":["Groceries"]}')).toEqual({
      currency: 'USD',
      budget: '2,000',
    });
  });
});

describe('isBudgetValid', () => {
  it.each(['2,000', '0.01', '.5', '1', '123,456.78'])('accepts %s', (budget) => {
    expect(isBudgetValid(budget)).toBe(true);
  });

  it.each([
    ['an untouched field', ''],
    ['a bare zero', '0'],
    ['zero with cents', '0.00'],
    ['a lone decimal point', '.'],
    ['a lone separator', ','],
    ['junk', 'abc'],
  ])('rejects %s', (_label, budget) => {
    // A5 and BUD-6: required and greater than zero. Everything here fails on the
    // same `> 0` comparison, because parseAmountInput answers NaN rather than 0
    // for a field holding no number - which is what keeps "untouched" and
    // "deliberately zero" from collapsing into one answer.
    expect(isBudgetValid(budget)).toBe(false);
  });

  it('has no upper bound', () => {
    // A5 designs none. The backend's own cap is its business to enforce, and a
    // second limit here would be a number nobody decided.
    expect(isBudgetValid('999,999,999,999')).toBe(true);
  });
});
