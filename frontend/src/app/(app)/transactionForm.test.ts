import { formatAmountInput } from '@/lib/format';

import type { Transaction } from '@/lib/transactions';

import {
  invalidFields,
  isAmountValid,
  isCategoryChosen,
  isDateValid,
  isMerchantValid,
  toCreateTransactionBody,
  toTransactionFormValues,
  toUpdateTransactionBody,
  type TransactionFormValues,
} from './transactionForm';

// No jsdom needed, the same property `draft.test.ts` has: everything here is a plain
// function over strings.

/** Frame 09's own mock values (node 28:384), so the happy path asserts the design. */
const FILLED: TransactionFormValues = {
  amount: '24.00',
  categoryId: '0e5c1b1e-2a5f-4d3b-9f7a-1c8e6b4d2a90',
  date: '2025-10-08',
  merchant: 'Whole Foods',
  note: 'Weekly groceries',
};

/**
 * The same row as `FILLED`, as the API stores it - so the two are a round trip and frame
 * 11's prefill is asserted against frame 09's own values.
 */
const STORED: Transaction = {
  id: '0198c2a1-0000-7000-8000-0000000000b1',
  amount: 24,
  categoryId: FILLED.categoryId,
  date: '2025-10-08',
  merchant: 'Whole Foods',
  note: 'Weekly groceries',
  createdAt: '2025-10-08T09:30:00.000Z',
  updatedAt: '2025-10-08T09:30:00.000Z',
};

describe('isAmountValid', () => {
  it.each(['24.00', '0.01', '1,240.50', '.5', '1000000000'])('accepts %p', (amount) => {
    expect(isAmountValid(amount)).toBe(true);
  });

  // AC3's "missing amount" and AC4's "zero or negative" fail on one comparison, which
  // is why one message covers both.
  it.each(['', '0', '0.00', '.', 'abc', '   ', ','])('rejects %p', (amount) => {
    expect(isAmountValid(amount)).toBe(false);
  });

  it('rejects a signed string, which the field has already stripped anyway', () => {
    // Two facts, deliberately pinned together because they are easy to conflate.
    // formatAmountInput drops the sign, so state never holds one (ADD-4, A13: amounts
    // are magnitudes and the product records expenses only) - and parseAmountInput
    // does NOT strip it, so if one arrived regardless this rejects it rather than
    // silently spending 24.
    expect(formatAmountInput('-24')).toBe('24');
    expect(isAmountValid('-24')).toBe(false);
  });

  it('does not impose the DTO’s upper bound', () => {
    // @Max(1_000_000_000) is the backend's to enforce; over it comes back as `invalid`.
    expect(isAmountValid('9999999999')).toBe(true);
  });
});

describe('isCategoryChosen', () => {
  it('accepts an id', () => {
    expect(isCategoryChosen(FILLED.categoryId)).toBe(true);
  });

  it('rejects the empty string an untouched placeholder select submits', () => {
    // ui/Select renders `placeholder` as a disabled, hidden value="" option, so this
    // is the real value rather than a hypothetical one. It is also what makes AC3's
    // category clause reachable at all.
    expect(isCategoryChosen('')).toBe(false);
  });
});

describe('isDateValid', () => {
  it('accepts a real day', () => {
    expect(isDateValid('2025-10-08')).toBe(true);
    expect(isDateValid('2024-02-29')).toBe(true);
  });

  it.each(['', '2025-02-30', '2025-13-01', '2025-10-8', 'not a date'])('rejects %p', (date) => {
    expect(isDateValid(date)).toBe(false);
  });
});

describe('isMerchantValid', () => {
  it('accepts a name', () => {
    expect(isMerchantValid('Whole Foods')).toBe(true);
  });

  it.each(['', '   ', '\t\n'])('rejects %p', (merchant) => {
    expect(isMerchantValid(merchant)).toBe(false);
  });

  it('does not impose the DTO’s 200-character bound', () => {
    expect(isMerchantValid('x'.repeat(300))).toBe(true);
  });
});

describe('invalidFields', () => {
  it('is empty for a filled form', () => {
    expect(invalidFields(FILLED)).toEqual([]);
  });

  // AC3: an empty form shows four messages at once rather than stopping at the first.
  it('names all four required fields when the form is empty, in ADD-2 order', () => {
    expect(invalidFields({ amount: '', categoryId: '', date: '', merchant: '', note: '' })).toEqual(
      ['amount', 'categoryId', 'date', 'merchant'],
    );
  });

  it('names only the fields that are actually wrong', () => {
    expect(invalidFields({ ...FILLED, merchant: '  ' })).toEqual(['merchant']);
    expect(invalidFields({ ...FILLED, amount: '0' })).toEqual(['amount']);
  });

  it('never names the note, which is the one optional field', () => {
    // ADD-5 and A12: "Note (optional)" is the only field marked optional.
    expect(invalidFields({ ...FILLED, note: '' })).toEqual([]);
  });
});

describe('toCreateTransactionBody', () => {
  it('builds the designed transaction', () => {
    expect(toCreateTransactionBody(FILLED)).toEqual({
      amount: 24,
      date: '2025-10-08',
      merchant: 'Whole Foods',
      categoryId: FILLED.categoryId,
      note: 'Weekly groceries',
    });
  });

  it('parses a grouped amount, which Number() cannot', () => {
    // Number('1,240.50') is NaN. This is the whole reason parseAmountInput exists in
    // the path rather than a cast.
    expect(toCreateTransactionBody({ ...FILLED, amount: '1,240.50' }).amount).toBe(1240.5);
  });

  it('sends a positive magnitude, which is what the DTO requires', () => {
    // @IsPositive() plus ADD-4: entered positive, rendered negative everywhere else.
    expect(toCreateTransactionBody({ ...FILLED, amount: '24.00' }).amount).toBeGreaterThan(0);
  });

  it('passes the date through verbatim, including a backdated one', () => {
    // Backdating is ordinary and supported per the DTO. Nothing in the path constructs
    // a Date, which is what stops the day moving across a timezone.
    expect(toCreateTransactionBody({ ...FILLED, date: '2025-09-30' }).date).toBe('2025-09-30');
    expect(toCreateTransactionBody({ ...FILLED, date: '2024-02-29' }).date).toBe('2024-02-29');
  });

  it('trims the merchant once, at the boundary', () => {
    expect(toCreateTransactionBody({ ...FILLED, merchant: '  Whole Foods  ' }).merchant).toBe(
      'Whole Foods',
    );
  });

  it('trims the note', () => {
    expect(toCreateTransactionBody({ ...FILLED, note: '  Weekly groceries  ' }).note).toBe(
      'Weekly groceries',
    );
  });

  // AC6, and the assertion that matters most in this file. `note: ''` would pass every
  // DTO check and be *stored*, breaking TransactionResponseDto's promise that note is
  // "null when the transaction has no note, never absent".
  it.each(['', '   ', '\n'])('omits the note entirely when it is %p', (note) => {
    const body = toCreateTransactionBody({ ...FILLED, note });

    expect('note' in body).toBe(false);
    expect(body.note).toBeUndefined();
  });

  // forbidNonWhitelisted means any extra property is a 400 rather than being ignored,
  // so the key set is part of the contract. This fails the moment somebody adds a field
  // to the form and threads it through without checking the DTO - including DET-8's
  // time, paymentMethod, status and account, which the backend rejects on purpose.
  it('sends exactly the five contract keys and nothing else', () => {
    expect(Object.keys(toCreateTransactionBody(FILLED)).sort()).toEqual([
      'amount',
      'categoryId',
      'date',
      'merchant',
      'note',
    ]);
  });

  it('sends exactly four keys when the note is blank', () => {
    expect(Object.keys(toCreateTransactionBody({ ...FILLED, note: '' })).sort()).toEqual([
      'amount',
      'categoryId',
      'date',
      'merchant',
    ]);
  });
});

describe('toTransactionFormValues', () => {
  it('prefills every field from the stored row (AC1)', () => {
    expect(toTransactionFormValues(STORED)).toEqual(FILLED);
  });

  it('is the inverse of toCreateTransactionBody for the designed row', () => {
    // The round trip stated as its own assertion: whatever the create sent is what the edit
    // form comes back showing, which is the whole of EDT-1.
    const body = toCreateTransactionBody(toTransactionFormValues(STORED));

    expect(body).toMatchObject({
      amount: STORED.amount,
      categoryId: STORED.categoryId,
      date: STORED.date,
      merchant: STORED.merchant,
      note: STORED.note,
    });
  });

  it('shows a whole amount with its cents, as frame 11 draws it', () => {
    // The reason `toFixed(2)` is in there: `String(24)` is `'24'`, and node 29:196 draws
    // `24.00`. This is the assertion that fails if somebody simplifies it away.
    expect(toTransactionFormValues({ ...STORED, amount: 24 }).amount).toBe('24.00');
  });

  it('groups thousands and keeps a single trailing cent digit', () => {
    expect(toTransactionFormValues({ ...STORED, amount: 1240.5 }).amount).toBe('1,240.50');
  });

  it.each([
    [0.05, '0.05'],
    [0.5, '0.50'],
    [1000, '1,000.00'],
    [1234567.89, '1,234,567.89'],
  ])('renders %p as %p', (amount, expected) => {
    expect(toTransactionFormValues({ ...STORED, amount }).amount).toBe(expected);
  });

  it('turns a null note into an empty string, which a controlled input can hold', () => {
    expect(toTransactionFormValues({ ...STORED, note: null }).note).toBe('');
  });

  it('passes a backdated date through verbatim, with no Date anywhere in the path', () => {
    expect(toTransactionFormValues({ ...STORED, date: '2025-09-30' }).date).toBe('2025-09-30');
  });

  it('does not trim the merchant, so the diff cannot report a change nobody made', () => {
    expect(toTransactionFormValues({ ...STORED, merchant: ' Whole Foods ' }).merchant).toBe(
      ' Whole Foods ',
    );
  });

  it('produces exactly the five form fields', () => {
    // Notably not `id`, `createdAt` or `updatedAt`: the form holds what the user can edit,
    // and `forbidNonWhitelisted` makes any of those three a 400 if one leaked into a body.
    expect(Object.keys(toTransactionFormValues(STORED)).sort()).toEqual([
      'amount',
      'categoryId',
      'date',
      'merchant',
      'note',
    ]);
  });

  it('round-trips a value the amount field could have produced', () => {
    // Idempotence, the property `BudgetForm` depends on, applied to the prefill: the value
    // this hands the field must be one the field would leave alone.
    const prefilled = toTransactionFormValues(STORED).amount;

    expect(formatAmountInput(prefilled)).toBe(prefilled);
  });
});

describe('toUpdateTransactionBody', () => {
  it('sends nothing at all when nothing changed', () => {
    // The empty body is a legitimate answer meaning "no change", and the caller must close
    // without submitting it - the endpoint answers 400 `Provide at least one field to
    // update.` for a body with no keys. `EditTransactionModal` pins the closing half.
    expect(toUpdateTransactionBody(STORED, toTransactionFormValues(STORED))).toEqual({});
  });

  it('sends only the field that changed', () => {
    const values = { ...toTransactionFormValues(STORED), amount: '31.50' };

    expect(toUpdateTransactionBody(STORED, values)).toEqual({ amount: 31.5 });
  });

  it('parses a grouped amount, which Number() cannot', () => {
    const values = { ...toTransactionFormValues(STORED), amount: '1,240.50' };

    expect(toUpdateTransactionBody(STORED, values)).toEqual({ amount: 1240.5 });
  });

  it('does not send an amount that only looks different as a string', () => {
    // `'24.00'` and `'24'` are the same number, and the comparison is numeric for exactly
    // this case: retyping a value must not count as an edit.
    const values = { ...toTransactionFormValues(STORED), amount: '24' };

    expect(toUpdateTransactionBody(STORED, values)).toEqual({});
  });

  it('sends a changed category', () => {
    const categoryId = '0198c2a1-0000-7000-8000-0000000000a2';
    const values = { ...toTransactionFormValues(STORED), categoryId };

    expect(toUpdateTransactionBody(STORED, values)).toEqual({ categoryId });
  });

  it('sends a changed date verbatim, including one that moves the row out of the period', () => {
    // The row then leaves a `period=current` list, which `docs/TODO.md` records for a
    // backdated create and now for an edit. Verified here rather than prevented: bounding the
    // date field would contradict the DTO, which supports backdating on purpose.
    const values = { ...toTransactionFormValues(STORED), date: '2025-09-30' };

    expect(toUpdateTransactionBody(STORED, values)).toEqual({ date: '2025-09-30' });
  });

  it('trims a changed merchant once, at the boundary', () => {
    const values = { ...toTransactionFormValues(STORED), merchant: '  Trader Joe  ' };

    expect(toUpdateTransactionBody(STORED, values)).toEqual({ merchant: 'Trader Joe' });
  });

  it('normalises a stored merchant that carried whitespace', () => {
    // A change the user did not type, and the preferred half of the trade: the alternative is
    // that stray whitespace on a row can never be cleaned up by editing anything else.
    const stored = { ...STORED, merchant: ' Whole Foods ' };
    const values = toTransactionFormValues(stored);

    expect(toUpdateTransactionBody(stored, values)).toEqual({ merchant: 'Whole Foods' });
  });

  it('clears a note with null, which is the only way to clear one', () => {
    const values = { ...toTransactionFormValues(STORED), note: '' };

    expect(toUpdateTransactionBody(STORED, values)).toEqual({ note: null });
  });

  it.each(['   ', '\t\n'])('treats a note of %p as cleared', (note) => {
    const values = { ...toTransactionFormValues(STORED), note };

    expect(toUpdateTransactionBody(STORED, values)).toEqual({ note: null });
  });

  it('leaves a blank note alone when the row never had one', () => {
    // The third arm of the tri-state, and the one a truthiness test would get wrong: absent
    // means "do not touch", and there is nothing here to touch.
    const stored = { ...STORED, note: null };
    const values = toTransactionFormValues(stored);

    expect(toUpdateTransactionBody(stored, values)).toEqual({});
    expect('note' in toUpdateTransactionBody(stored, values)).toBe(false);
  });

  it('sends a note added to a row that had none', () => {
    const stored = { ...STORED, note: null };
    const values = { ...toTransactionFormValues(stored), note: 'Weekly groceries' };

    expect(toUpdateTransactionBody(stored, values)).toEqual({ note: 'Weekly groceries' });
  });

  it('trims a changed note', () => {
    const values = { ...toTransactionFormValues(STORED), note: '  Weekly shop  ' };

    expect(toUpdateTransactionBody(STORED, values)).toEqual({ note: 'Weekly shop' });
  });

  it('sends every field when every field changed', () => {
    const body = toUpdateTransactionBody(STORED, {
      amount: '31.50',
      categoryId: '0198c2a1-0000-7000-8000-0000000000a2',
      date: '2025-10-09',
      merchant: 'Trader Joe',
      note: 'Weekly shop',
    });

    expect(body).toEqual({
      amount: 31.5,
      categoryId: '0198c2a1-0000-7000-8000-0000000000a2',
      date: '2025-10-09',
      merchant: 'Trader Joe',
      note: 'Weekly shop',
    });
  });

  it('contributes no key for an unchanged field, rather than a key set to undefined', () => {
    // What `lib/updateTransaction.ts` reads with `'categoryId' in body` to narrow the
    // ambiguous 404, and what `forbidNonWhitelisted` cares about. A key set to `undefined`
    // would survive `Object.keys` and break the first of those.
    const values = { ...toTransactionFormValues(STORED), amount: '31.50' };

    expect(Object.keys(toUpdateTransactionBody(STORED, values))).toEqual(['amount']);
  });

  it('never sends a key the DTO does not have', () => {
    const body = toUpdateTransactionBody(STORED, {
      amount: '31.50',
      categoryId: '0198c2a1-0000-7000-8000-0000000000a2',
      date: '2025-10-09',
      merchant: 'Trader Joe',
      note: 'Weekly shop',
    });

    expect(Object.keys(body).sort()).toEqual(['amount', 'categoryId', 'date', 'merchant', 'note']);
  });
});
