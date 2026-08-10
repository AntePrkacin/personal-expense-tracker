import type { Profile } from '@/lib/profile';

import {
  emailProblem,
  invalidFields,
  isNameValid,
  sameSettingsValues,
  toSettingsFormValues,
  toUpdateProfileBody,
  type SettingsFormValues,
} from './settingsForm';

// No jsdom anywhere in this file, which is the point of the module existing: the rules and the
// diff are plain functions, so the whole of AC4's logic and the whole of the empty-diff decision
// are provable without rendering anything.

/** Frame 17's own persona, which is also the fixtures' (`marko@email.com`). */
const PROFILE: Profile = {
  firstName: 'Marko',
  lastName: 'Kovač',
  email: 'marko@email.com',
  currency: 'USD',
  monthlyBudget: 2000,
  monthStartDay: 1,
};

const VALUES: SettingsFormValues = {
  firstName: 'Marko',
  lastName: 'Kovač',
  email: 'marko@email.com',
  currency: 'USD',
  // The stored 2000 as the field's own display string. `toSettingsFormValues` runs it through
  // `formatAmountInput(toFixed(2))` so the prefill is something the field could have produced -
  // otherwise the first keystroke reformats it and the diff reports a change nobody made.
  monthlyBudget: '2,000.00',
  monthStartDay: 1,
};

describe('toSettingsFormValues', () => {
  it('takes all six fields the page draws', () => {
    expect(toSettingsFormValues(PROFILE)).toEqual(VALUES);
  });

  it('hands back the stored strings verbatim', () => {
    // The failure this prevents is subtle and expensive. Trimming on the way *in* would make an
    // ordinary stored value differ from itself the moment the user typed a trailing space and
    // removed it, and - worse - a prefill that "tidied" anything would have the diff report a
    // change nobody made. `toCategoryFormValues` carries the same rule.
    const padded = { ...PROFILE, firstName: '  Marko  ' };

    expect(toSettingsFormValues(padded).firstName).toBe('  Marko  ');
  });

  it('round-trips an ordinary profile to an empty diff', () => {
    // The property that actually matters: prefill, touch nothing, and the form has nothing to
    // send. Asserted through both functions together, because either one alone could be right
    // while the pair disagreed.
    expect(toUpdateProfileBody(PROFILE, toSettingsFormValues(PROFILE))).toEqual({});
  });
});

describe('isNameValid', () => {
  it.each([
    ['', false],
    ['   ', false],
    ['\t\n', false],
    ['Marko', true],
    ['Ana Marija', true],
    ['Kovač', true],
  ])('answers %j with %s', (name, expected) => {
    expect(isNameValid(name)).toBe(expected);
  });

  it('accepts a name past the DTO bound, which is deliberate', () => {
    // `@MaxLength(100)` is not mirrored here, on `categoryForm.isNameValid`'s reasoning about
    // `@MaxLength(60)`: a bound restated in two places drifts. The 400 it produces surfaces as the
    // form-level `invalid` line instead, and this assertion is what stops somebody "fixing" that
    // into a length check with no way to know it still matches the backend.
    expect(isNameValid('x'.repeat(101))).toBe(true);
  });
});

describe('emailProblem', () => {
  it.each([
    ['', 'required'],
    ['   ', 'required'],
  ])('reports %j as required', (email, expected) => {
    expect(emailProblem(email)).toBe(expected);
  });

  it.each(['marko', 'marko@', '@email.com', 'marko@email', 'mar ko@email.com'])(
    'reports %j as malformed',
    (email) => {
      expect(emailProblem(email)).toBe('format');
    },
  );

  it.each(['marko@email.com', '  marko@email.com  ', 'MARKO@EMAIL.COM'])('accepts %j', (email) => {
    expect(emailProblem(email)).toBeNull();
  });
});

describe('invalidFields', () => {
  it('finds nothing wrong with the stored profile', () => {
    expect(invalidFields(VALUES)).toEqual([]);
  });

  it('reports every problem at once, in draw order', () => {
    // Never stopping at the first, which is `categoryForm.invalidFields`'s rule: a blank form
    // shows every message rather than one at a time down four submits. Four rather than three
    // since PET-47, and the budget is last because it is drawn last.
    expect(
      invalidFields({ ...VALUES, firstName: '', lastName: '', email: '', monthlyBudget: '' }),
    ).toEqual([
      { field: 'firstName', reason: 'required' },
      { field: 'lastName', reason: 'required' },
      { field: 'email', reason: 'required' },
      { field: 'monthlyBudget', reason: 'required' },
    ]);
  });

  it('never names the two fields picked from closed lists', () => {
    // `currency` and `monthStartDay` come from pickers offering only valid values, so no
    // interaction can make either wrong. A message for them would be one nothing could reach.
    const problems = invalidFields({ ...VALUES, currency: '', monthStartDay: 99 });

    expect(problems.map((problem) => problem.field)).not.toContain('currency');
    expect(problems.map((problem) => problem.field)).not.toContain('monthStartDay');
  });

  it('distinguishes an absent address from a malformed one', () => {
    // The distinction the reason field exists for: AC4 covers both, and a person who cleared the
    // field needs different copy from one who typed `marko@`.
    expect(invalidFields({ ...VALUES, email: '' })).toEqual([
      { field: 'email', reason: 'required' },
    ]);
    expect(invalidFields({ ...VALUES, email: 'marko@' })).toEqual([
      { field: 'email', reason: 'format' },
    ]);
  });

  it('treats a whitespace-only name as absent', () => {
    expect(invalidFields({ ...VALUES, firstName: '   ' })).toEqual([
      { field: 'firstName', reason: 'required' },
    ]);
  });
});

describe("PET-47's three preference fields", () => {
  it('prefills the budget as a string the field could have produced', () => {
    // `formatAmountInput(toFixed(2))`, not `String(2000)`. A raw "2000" prefill would be rewritten
    // to "2,000.00" by the first keystroke, and the diff would then report an edit nobody made.
    expect(toSettingsFormValues({ ...PROFILE, monthlyBudget: 2000 }).monthlyBudget).toBe(
      '2,000.00',
    );
    expect(toSettingsFormValues({ ...PROFILE, monthlyBudget: 1240.5 }).monthlyBudget).toBe(
      '1,240.50',
    );
  });

  it('sends the budget as a number in major units', () => {
    // `UpdateProfileDto.monthlyBudget` is `@IsNumber({ maxDecimalPlaces: 2 })` in major units, so
    // the display string has to be parsed rather than passed through.
    const body = toUpdateProfileBody(PROFILE, { ...VALUES, monthlyBudget: '2,500.50' });

    expect(body.monthlyBudget).toBe(2500.5);
  });

  it('treats a retyped budget as unchanged, because it compares numbers', () => {
    // The field rewrites its own display value on every keystroke, so a string comparison would
    // read "2,000.00" against a stored 2000 as an edit and fire a PATCH on an untouched form.
    expect(toUpdateProfileBody(PROFILE, { ...VALUES, monthlyBudget: '2000' })).toEqual({});
    expect(toUpdateProfileBody(PROFILE, { ...VALUES, monthlyBudget: '2,000.00' })).toEqual({});
  });

  it('never sends an unparseable budget, which would serialise as null', () => {
    // `parseAmountInput('')` is `NaN` and `JSON.stringify` writes that as `null`, which the DTO
    // rejects for a field accepting no nulls. Unreachable through the UI - the form validates
    // before it diffs - and guarded because the two orderings are one refactor apart.
    expect(toUpdateProfileBody(PROFILE, { ...VALUES, monthlyBudget: '' })).toEqual({});
    expect(toUpdateProfileBody(PROFILE, { ...VALUES, monthlyBudget: 'junk' })).toEqual({});
  });

  it('sends a changed currency and month start, and omits them when they match', () => {
    expect(toUpdateProfileBody(PROFILE, { ...VALUES, currency: 'EUR' })).toEqual({
      currency: 'EUR',
    });
    expect(toUpdateProfileBody(PROFILE, { ...VALUES, monthStartDay: 15 })).toEqual({
      monthStartDay: 15,
    });
    expect(toUpdateProfileBody(PROFILE, VALUES)).toEqual({});
  });

  it('carries both cards in one body, which is what AC6 rests on', () => {
    // One "Save changes" sends one PATCH. The cards do not each write their own request; they
    // write into one `values`, and this is the function that turns it into one body.
    const body = toUpdateProfileBody(PROFILE, {
      ...VALUES,
      firstName: 'Ana',
      monthStartDay: 15,
    });

    expect(body).toEqual({ firstName: 'Ana', monthStartDay: 15 });
  });

  it('notices a preference change in sameSettingsValues', () => {
    // The resync in `SettingsForm` compares by value, so a field it did not know about would make
    // an edited form look identical to the server's and be silently reverted.
    expect(sameSettingsValues(VALUES, { ...VALUES, monthStartDay: 15 })).toBe(false);
    expect(sameSettingsValues(VALUES, { ...VALUES, currency: 'EUR' })).toBe(false);
    expect(sameSettingsValues(VALUES, { ...VALUES, monthlyBudget: '3,000.00' })).toBe(false);
    expect(sameSettingsValues(VALUES, { ...VALUES })).toBe(true);
  });
});

describe('toUpdateProfileBody', () => {
  it('sends nothing when nothing changed', () => {
    // The caller reads this as "close without asking": `PATCH /api/profile` answers 400 to a body
    // with no keys, so the request must not be made at all.
    const body = toUpdateProfileBody(PROFILE, VALUES);

    expect(body).toEqual({});
    expect(Object.keys(body)).toHaveLength(0);
  });

  it('sends exactly the one field that changed', () => {
    // The assertion that catches an accidental whole-profile PATCH: a body naming all six fields
    // would write the five the user never opened, and the endpoint would answer 200 while doing
    // it. `Object.keys` rather than `toEqual`, so an extra `undefined` key cannot pass.
    const body = toUpdateProfileBody(PROFILE, { ...VALUES, firstName: 'Ana' });

    expect(Object.keys(body)).toEqual(['firstName']);
    expect(body.firstName).toBe('Ana');
  });

  it('trims on the way out', () => {
    const body = toUpdateProfileBody(PROFILE, { ...VALUES, lastName: '  Marić  ' });

    expect(body).toEqual({ lastName: 'Marić' });
  });

  it('treats a whitespace-only edit as no edit', () => {
    // The other half of the asymmetric trim: the stored value is compared untrimmed, so padding a
    // field and removing it again leaves the form clean.
    expect(toUpdateProfileBody(PROFILE, { ...VALUES, firstName: '  Marko  ' })).toEqual({});
  });

  it('normalises a stored name on the first save that touches anything', () => {
    // The accepted cost of comparing against the untrimmed stored value, and
    // `toUpdateTransactionBody`'s documented call about `merchant`: a stored `'  Marko  '` differs
    // from the trimmed value the form sends, so it tidies itself. Acceptable precisely because the
    // field is on screen with its value in it.
    const padded = { ...PROFILE, firstName: '  Marko  ' };

    expect(toUpdateProfileBody(padded, { ...VALUES, lastName: 'Marić' })).toEqual({
      firstName: 'Marko',
      lastName: 'Marić',
    });
  });

  it('ignores a change of case in the address', () => {
    // The backend normalises with `trim().toLowerCase()` and the stored value already came back
    // normalised, so retyping the same address in capitals is not a change - and sending it would
    // be a 200 that moved nothing while looking like a save.
    expect(toUpdateProfileBody(PROFILE, { ...VALUES, email: 'MARKO@EMAIL.COM' })).toEqual({});
  });

  it('sends a real address change with the casing the user typed', () => {
    // Not lowercased here: the backend's `normalizeEmail` stays the single authority on what "the
    // same address" means, and a second normaliser is one that can drift from the first.
    const body = toUpdateProfileBody(PROFILE, { ...VALUES, email: 'Marko.Kovac@Email.com' });

    expect(body).toEqual({ email: 'Marko.Kovac@Email.com' });
  });

  it('never sends null for any field', () => {
    // `UpdateProfileDto` accepts no nulls at all - every column behind it is NOT NULL and every
    // field carries `@ValidateIf(provided)` rather than `@IsOptional()`, so an explicit null is a
    // 400 rather than a skipped field. This is the exact mirror of `toUpdateCategoryBody`, whose
    // blank cap *must* send null, which is why it is worth an assertion rather than a comment.
    const body = toUpdateProfileBody(PROFILE, {
      ...VALUES,
      firstName: 'Ana',
      lastName: 'Marić',
      email: 'a@b.co',
    });

    expect(Object.keys(body).sort()).toEqual(['email', 'firstName', 'lastName']);
    expect(Object.values(body).every((value) => value !== null)).toBe(true);
  });

  it('reads only the three fields the card draws', () => {
    // The three preference fields are PET-47's, and until then this function must not touch them:
    // a body carrying `currency` or `monthlyBudget` would write values no control on screen can
    // set.
    const body = toUpdateProfileBody(PROFILE, { ...VALUES, firstName: 'Ana' });

    expect(body).not.toHaveProperty('currency');
    expect(body).not.toHaveProperty('monthlyBudget');
    expect(body).not.toHaveProperty('monthStartDay');
  });
});
