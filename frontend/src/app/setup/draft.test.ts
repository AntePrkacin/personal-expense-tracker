import {
  DEFAULT_CURRENCY,
  EMPTY_DRAFT,
  isBudgetValid,
  isNameValid,
  parseDraft,
  SETUP_DRAFT_KEY,
  serializeDraft,
  type SetupDraft,
  toRegisterBody,
} from './draft';

// No jsdom is needed here, which is the point of keeping draft.ts free of React:
// every assertion below is over plain data.

/**
 * An expected draft, spelled out only where it differs from empty.
 *
 * Six fields now, and most of these cases are about one of them, so the literal
 * would be four lines of noise per assertion.
 */
function expected(partial: Partial<SetupDraft>): SetupDraft {
  return { ...EMPTY_DRAFT, categories: [], ...partial };
}

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
  it('defaults the currency, leaves the budget blank and picks no categories', () => {
    // USD because A6 gives the design only one option. A blank budget because a
    // pre-filled one would be a number nobody chose, and AC3 has to be reachable.
    //
    // No categories preselected even though frame 03 draws seven chips selected:
    // that mock illustrates the selected state, and the product decision is that
    // the user picks. Pinned here rather than in the screen, because this is where
    // a default would have to live for step 3 to submit what step 2 displayed.
    expect(EMPTY_DRAFT).toEqual({
      currency: 'USD',
      budget: '',
      categories: [],
      firstName: '',
      lastName: '',
      email: '',
    });
    expect(DEFAULT_CURRENCY).toBe('USD');
  });

  it('carries exactly the six fields onboarding collects before an account exists', () => {
    // A seventh field would be data nothing submits. These six are the whole of
    // RegisterDto bar monthStartDay, which onboarding never asks for.
    expect(Object.keys(EMPTY_DRAFT).sort()).toEqual([
      'budget',
      'categories',
      'currency',
      'email',
      'firstName',
      'lastName',
    ]);
  });
});

describe('parseDraft', () => {
  it('reads a draft it wrote', () => {
    const draft: SetupDraft = {
      currency: 'USD',
      budget: '2,000',
      categories: ['Groceries', 'Transport'],
      firstName: 'Marko',
      lastName: 'Kovač',
      email: 'marko@email.com',
    };
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
    expect(parseDraft('{"currency":null,"budget":"2,000"}')).toEqual(
      expected({ currency: DEFAULT_CURRENCY, budget: '2,000' }),
    );
  });

  it.each([
    ['a European paste', '2.000,50', '2.00'],
    ['exponent notation', '1e5', '15'],
    ['surrounding whitespace', '  12  ', '12'],
    ['a stored sign', '-500', '500'],
    ['junk', 'abc', ''],
    ['an already-canonical value', '2,000', '2,000'],
  ])('canonicalises %s on the way out', (_label, stored, expected) => {
    // Regression guard. Returning the stored string verbatim let a value that no
    // field could have produced render into a controlled input and pass
    // isBudgetValid: '2.000,50' read back as 2.0005, four decimals, which
    // RegisterDto's @IsNumber({ maxDecimalPlaces: 2 }) rejects - so the screen
    // showed a plausible number and handed step 3 a guaranteed 400.
    expect(parseDraft(JSON.stringify({ currency: 'USD', budget: stored })).budget).toBe(expected);
  });

  it('leaves nothing it returns that the backend would reject on decimals', () => {
    // The property behind the case above, stated once rather than per input.
    for (const stored of ['2.000,50', '1.239999', '0.005']) {
      const { budget } = parseDraft(JSON.stringify({ budget: stored }));
      const fraction = budget.split('.')[1] ?? '';
      expect(fraction.length).toBeLessThanOrEqual(2);
    }
  });

  it('ignores keys it does not recognise', () => {
    // Forward compatibility, and it cut both ways: a payload written before
    // `categories` existed still loads, and one written by a later version that
    // adds a fourth field does not break this one.
    expect(parseDraft('{"currency":"USD","budget":"2,000","monthStartDay":5}')).toEqual(
      expected({ currency: 'USD', budget: '2,000' }),
    );
  });
});

describe('parseDraft, the register fields', () => {
  it.each([
    ['a field that was never written', '{}', ''],
    ['a value that is not a string', '{"firstName":5}', ''],
    ['a name as typed', '{"firstName":"Marko"}', 'Marko'],
    ['whitespace exactly as typed', '{"firstName":"Marko "}', 'Marko '],
  ])('reads %s', (_label, raw, value) => {
    // Untrimmed on purpose, unlike the budget. Trimming here would delete the space
    // the moment somebody typed one between two words, and the boundary that needs a
    // trimmed value is toRegisterBody.
    expect(parseDraft(raw).firstName).toBe(value);
  });

  it('reads all three independently', () => {
    expect(parseDraft('{"lastName":"Kovač","email":"marko@email.com"}')).toEqual(
      expected({ lastName: 'Kovač', email: 'marko@email.com' }),
    );
  });
});

describe('parseDraft, the picked categories', () => {
  it.each([
    ['a field that was never written', '{}', []],
    ['an explicit empty selection', '{"categories":[]}', []],
    ['a value that is not an array', '{"categories":"Groceries"}', []],
    ['an object where an array belongs', '{"categories":{"0":"Groceries"}}', []],
    ['names that are not on the list', '{"categories":["Rent","Groceries"]}', ['Groceries']],
    ['non-strings mixed in', '{"categories":[5,null,"Bills"]}', ['Bills']],
    ['a duplicated name', '{"categories":["Bills","Bills"]}', ['Bills']],
    [
      'click order rather than designed order',
      '{"categories":["Other","Groceries","Health"]}',
      ['Groceries', 'Health', 'Other'],
    ],
  ])('reads %s', (_label, raw, expected) => {
    // Total and canonicalising, for the reason the budget is: sessionStorage is
    // writable from that tab's devtools console, and RegisterDto carries @IsIn,
    // @ArrayUnique and @ArrayMaxSize - so an unknown name, a duplicate or a
    // non-string is a guaranteed 400 on a screen with no error state designed for
    // it. Every one of these has to degrade to something the picker could have
    // produced instead.
    expect(parseDraft(raw).categories).toEqual(expected);
  });

  it.each([
    ['an empty slot', null],
    ['unparseable json', 'not json'],
    ['json that is not an object', '[]'],
  ])('hands %s its own array rather than the shared default', (_label, raw) => {
    // Every one of these takes an early return, and each used to return EMPTY_DRAFT
    // itself. That was harmless while both fields were strings; `categories` is an
    // array, so a caller doing the ordinary thing - `.sort()` or `.push()` while
    // building the register body - would have mutated the module's own default and
    // every later fallback would carry the leftovers. Asserted by identity, because
    // an equality check passes either way.
    const first = parseDraft(raw);
    const second = parseDraft(raw);

    expect(first.categories).not.toBe(EMPTY_DRAFT.categories);
    expect(first.categories).not.toBe(second.categories);

    first.categories.push('Groceries');

    expect(EMPTY_DRAFT.categories).toEqual([]);
    expect(second.categories).toEqual([]);
  });

  it('keeps an empty selection empty rather than filling it in', () => {
    // The direction that matters for AC3. A4 enforces no minimum, so deselecting
    // every chip is a choice - and a default applied here would silently undo it
    // on the way back from step 1.
    expect(parseDraft('{"categories":[]}').categories).toEqual([]);
    expect(EMPTY_DRAFT.categories).toEqual([]);
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

describe('isNameValid', () => {
  it.each(['Marko', 'Kovač', 'de la Cruz', 'X'])('accepts %s', (name) => {
    expect(isNameValid(name)).toBe(true);
  });

  it.each([
    ['an untouched field', ''],
    ['spaces only', '   '],
    ['a tab', '\t'],
  ])('rejects %s', (_label, name) => {
    // REG-2 makes both names required, and the DTO's @IsNotEmpty() runs after its
    // own trim, so a field holding only spaces is a 400 rather than a name.
    expect(isNameValid(name)).toBe(false);
  });

  it('has no upper bound, unlike the DTO', () => {
    // @MaxLength(100) is not mirrored here. No maxlength is drawn in the frame, and
    // a 101-character name lands on the form-level message instead of an inline one
    // - the trade docs/TODO.md records.
    expect(isNameValid('a'.repeat(200))).toBe(true);
  });
});

// `isEmailValid`'s cases moved to src/lib/email.test.ts with the rule itself, when
// PET-12 gave 23 Log in an email field outside `/setup`. They are unchanged there.

describe('toRegisterBody', () => {
  const draft: SetupDraft = {
    currency: 'USD',
    budget: '2,000.50',
    categories: ['Groceries', 'Transport'],
    firstName: 'Marko',
    lastName: 'Kovač',
    email: 'marko@email.com',
  };

  it('converts the budget to the major units the DTO takes', () => {
    // The one boundary where the display string stops being a string. draft.ts holds
    // '2,000.50' because no number can represent '2000.' mid-type; RegisterDto takes
    // 2000.5 and stores it as cents.
    expect(toRegisterBody(draft).monthlyBudget).toBe(2000.5);
  });

  it('carries every value the two earlier steps collected', () => {
    // AC4 in one assertion: the request is the whole draft, not just this screen's
    // half of it.
    expect(toRegisterBody(draft)).toEqual({
      firstName: 'Marko',
      lastName: 'Kovač',
      email: 'marko@email.com',
      currency: 'USD',
      monthlyBudget: 2000.5,
      categories: ['Groceries', 'Transport'],
    });
  });

  it('trims the three text fields', () => {
    const body = toRegisterBody({
      ...draft,
      firstName: ' Marko ',
      lastName: ' Kovač ',
      email: '  marko@email.com  ',
    });

    expect(body.firstName).toBe('Marko');
    expect(body.lastName).toBe('Kovač');
    expect(body.email).toBe('marko@email.com');
  });

  it('does not lowercase the email', () => {
    // RegisterDto carries @Transform(normalizeEmail), so normalisation has an owner.
    // Doing it here as well would be a second authority that can drift from it.
    expect(toRegisterBody({ ...draft, email: 'Marko@Email.com' }).email).toBe('Marko@Email.com');
  });

  it('omits monthStartDay rather than defaulting it', () => {
    // Onboarding never asks for it and the backend applies its own default, so a
    // value here would be one nobody chose.
    expect('monthStartDay' in toRegisterBody(draft)).toBe(false);
  });

  it('keeps an empty selection empty', () => {
    // A4 enforces no minimum, and the DTO requires the key while allowing it to be
    // empty - so this has to be [] rather than absent.
    expect(toRegisterBody({ ...draft, categories: [] }).categories).toEqual([]);
  });
});
