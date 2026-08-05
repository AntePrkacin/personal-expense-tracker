import { formatAmountInput } from '@/lib/format';

import {
  invalidFields,
  isAmountValid,
  isCategoryChosen,
  isDateValid,
  isMerchantValid,
  toCreateTransactionBody,
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
