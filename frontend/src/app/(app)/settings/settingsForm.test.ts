import type { Profile } from '@/lib/profile';

import {
  emailProblem,
  invalidFields,
  isNameValid,
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
};

describe('toSettingsFormValues', () => {
  it('takes the three fields the card draws', () => {
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

  it('reports all three at once, in draw order', () => {
    // Never stopping at the first, which is `categoryForm.invalidFields`'s rule: a blank form
    // shows three messages rather than one at a time down three submits.
    expect(invalidFields({ firstName: '', lastName: '', email: '' })).toEqual([
      { field: 'firstName', reason: 'required' },
      { field: 'lastName', reason: 'required' },
      { field: 'email', reason: 'required' },
    ]);
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
