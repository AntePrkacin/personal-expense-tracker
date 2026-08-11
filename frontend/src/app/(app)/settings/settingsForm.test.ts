import type { Profile } from '@/lib/profile';

import {
  defaultPaycheckMonth,
  emailProblem,
  invalidFields,
  isNameValid,
  paycheckMonths,
  sameSettingsValues,
  scheduleChanged,
  toChangeScheduleBody,
  toSettingsFormValues,
  toUpdateProfileBody,
  type SettingsFormValues,
} from './settingsForm';

// No jsdom anywhere in this file, which is the point of the module existing: the rules and the
// diff are plain functions, so the whole of AC4's logic and the whole of the empty-diff decision
// are provable without rendering anything.

/** Frame 17's own persona, which is also the fixtures' (`marko@email.com`). */
const PROFILE: Profile = {
  fullName: 'Marko Kovač',
  email: 'marko@email.com',
  currency: 'USD',
  monthlyBudget: 2000,
  monthStartDay: 1,
};

const VALUES: SettingsFormValues = {
  fullName: 'Marko Kovač',
  email: 'marko@email.com',
  currency: 'USD',
  // The stored 2000 as the field's own display string. `toSettingsFormValues` runs it through
  // `formatAmountInput(toFixed(2))` so the prefill is something the field could have produced -
  // otherwise the first keystroke reformats it and the diff reports a change nobody made.
  monthlyBudget: '2,000.00',
  monthStartDay: 1,
};

describe('toSettingsFormValues', () => {
  it('takes all five fields the page draws', () => {
    expect(toSettingsFormValues(PROFILE)).toEqual(VALUES);
  });

  it('hands back the stored strings verbatim', () => {
    // The failure this prevents is subtle and expensive. Trimming on the way *in* would make an
    // ordinary stored value differ from itself the moment the user typed a trailing space and
    // removed it, and - worse - a prefill that "tidied" anything would have the diff report a
    // change nobody made. `toCategoryFormValues` carries the same rule.
    const padded = { ...PROFILE, fullName: '  Marko Kovač  ' };

    expect(toSettingsFormValues(padded).fullName).toBe('  Marko Kovač  ');
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
    // shows every message rather than one at a time down three submits. Three rather than four
    // since PET-72 collapsed the two name fields, and the budget is last because it is drawn last.
    expect(invalidFields({ ...VALUES, fullName: '', email: '', monthlyBudget: '' })).toEqual([
      { field: 'fullName', reason: 'required' },
      { field: 'email', reason: 'required' },
      { field: 'monthlyBudget', reason: 'required' },
    ]);
  });

  it('never names the two fields picked from closed lists', () => {
    // `currency` and `monthStartDay` come from pickers offering only valid values, so no
    // interaction can make either wrong. A message for them would be one nothing could reach.
    // `currency` is typed off the contract now, so an invalid code is not even
    // constructible here - which is a stronger guarantee than this case asserts.
    const problems = invalidFields({ ...VALUES, monthStartDay: 99 });

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
    expect(invalidFields({ ...VALUES, fullName: '   ' })).toEqual([
      { field: 'fullName', reason: 'required' },
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

  it('sends the budget as a number in major units, on the schedule body', () => {
    // `ChangeScheduleDto.monthlyBudget` is `@IsNumber({ maxDecimalPlaces: 2 })` in major units, so
    // the display string has to be parsed rather than passed through. It is on **that** body since
    // PET-72: the patch no longer carries a budget at all.
    const body = toChangeScheduleBody({ ...VALUES, monthlyBudget: '2,500.50' }, '2026-03');

    expect(body.monthlyBudget).toBe(2500.5);
  });

  it('treats a retyped budget as unchanged, because it compares numbers', () => {
    // The field rewrites its own display value on every keystroke, so a string comparison would
    // read "2,000.00" against a stored 2000 as an edit and fire a PATCH on an untouched form.
    expect(toUpdateProfileBody(PROFILE, { ...VALUES, monthlyBudget: '2000' })).toEqual({});
    expect(toUpdateProfileBody(PROFILE, { ...VALUES, monthlyBudget: '2,000.00' })).toEqual({});
  });

  it('never asks the paycheck question about an unparseable budget', () => {
    // `parseAmountInput('')` is `NaN`, so a blank field is not a budget change and must not open
    // the dialog - asking "from which paycheck" about a value that cannot be saved is a question
    // with no useful answer. The form validates before it gets here, so this is unreachable through
    // the UI and guarded because the two orderings are one refactor apart.
    expect(scheduleChanged(PROFILE, { ...VALUES, monthlyBudget: '' })).toBe(false);
    expect(scheduleChanged(PROFILE, { ...VALUES, monthlyBudget: 'junk' })).toBe(false);
  });

  it('sends a changed currency and omits it when it matches', () => {
    // Currency stays on the patch: it is a display preference with no date attached, unlike the two
    // fields PET-72 moved onto the schedule write.
    expect(toUpdateProfileBody(PROFILE, { ...VALUES, currency: 'EUR' })).toEqual({
      currency: 'EUR',
    });
    expect(toUpdateProfileBody(PROFILE, VALUES)).toEqual({});
  });

  it('reports a changed pay day as a schedule change rather than a patch field', () => {
    expect(scheduleChanged(PROFILE, { ...VALUES, monthStartDay: 15 })).toBe(true);
    expect(toUpdateProfileBody(PROFILE, { ...VALUES, monthStartDay: 15 })).toEqual({});
  });

  it('builds the anchor from the form pay day, not the stored one', () => {
    // A save that changes both has to anchor on the **new** day, or the backend answers 400: a
    // rule's `effectiveFrom` must fall on its own `monthStartDay`.
    expect(toChangeScheduleBody({ ...VALUES, monthStartDay: 14 }, '2026-01')).toEqual({
      monthlyBudget: 2000,
      monthStartDay: 14,
      firstPaycheckDate: '2026-01-14',
    });
  });

  it('zero-pads a single-digit pay day in the anchor', () => {
    // `YYYY-MM-DD` is what the DTO's regex requires, so a day of 1 is `-01` and never `-1`.
    expect(toChangeScheduleBody({ ...VALUES, monthStartDay: 1 }, '2026-03').firstPaycheckDate).toBe(
      '2026-03-01',
    );
  });

  it('keeps the budget and pay day out of the patch entirely', () => {
    // **This replaces PET-47's "carries both cards in one body", which is what AC6 rested on.**
    // One "Save changes" still serves both cards, but it is two writes now rather than one body:
    // the patch carries what is a property of the account, and the schedule write carries what
    // applies from a date. A `monthlyBudget` key here would be a 400.
    const body = toUpdateProfileBody(PROFILE, {
      ...VALUES,
      fullName: 'Ana Anic',
      monthlyBudget: '3,000.00',
      monthStartDay: 15,
    });

    expect(body).toEqual({ fullName: 'Ana Anic' });
  });

  it('notices a preference change in sameSettingsValues', () => {
    // The Save gate and the submit guard in `SettingsForm` both compare by value, so a field this
    // did not know about would make an edited form look clean and its press a silent no-op. (This
    // said "the resync compares by value", which stopped being true when the resync moved to
    // identity - see that docblock. The comparison it names is still real, it is the other one.)
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
    // The assertion that catches an accidental whole-profile PATCH: a body naming every field
    // would write the ones the user never opened, and the endpoint would answer 200 while doing
    // it. `Object.keys` rather than `toEqual`, so an extra `undefined` key cannot pass.
    const body = toUpdateProfileBody(PROFILE, { ...VALUES, fullName: 'Ana' });

    expect(Object.keys(body)).toEqual(['fullName']);
    expect(body.fullName).toBe('Ana');
  });

  it('trims on the way out', () => {
    const body = toUpdateProfileBody(PROFILE, { ...VALUES, fullName: '  Marko Marić  ' });

    expect(body).toEqual({ fullName: 'Marko Marić' });
  });

  it('treats a whitespace-only edit as no edit', () => {
    // The other half of the asymmetric trim: the stored value is compared untrimmed, so padding a
    // field and removing it again leaves the form clean.
    expect(toUpdateProfileBody(PROFILE, { ...VALUES, fullName: '  Marko Kovač  ' })).toEqual({});
  });

  it('normalises a stored name on the first save that touches anything', () => {
    // The accepted cost of comparing against the untrimmed stored value, and
    // `toUpdateTransactionBody`'s documented call about `merchant`: a stored `'  Marko  '` differs
    // from the trimmed value the form sends, so it tidies itself. Acceptable precisely because the
    // field is on screen with its value in it.
    const padded = { ...PROFILE, fullName: '  Marko Kovač  ' };

    expect(toUpdateProfileBody(padded, { ...VALUES, fullName: 'Marko Kovač' })).toEqual({
      fullName: 'Marko Kovač',
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
      fullName: 'Ana Marić',
      email: 'a@b.co',
    });

    expect(Object.keys(body).sort()).toEqual(['email', 'fullName']);
    expect(Object.values(body).every((value) => value !== null)).toBe(true);
  });

  it('never carries a field the endpoint stopped accepting', () => {
    // `monthlyBudget` and `monthStartDay` left `UpdateProfileDto` at PET-72, and
    // `forbidNonWhitelisted` answers 400 to either - so this is the guard against one creeping back
    // into the diff, which is the shape the field would return in.
    const body = toUpdateProfileBody(PROFILE, {
      ...VALUES,
      fullName: 'Ana',
      monthlyBudget: '9,000.00',
      monthStartDay: 20,
    });

    expect(body).not.toHaveProperty('monthlyBudget');
    expect(body).not.toHaveProperty('monthStartDay');
  });
});

// **The regression suite for the PR #84 review finding**, and the reason every case here states a pay
// day: the dialog's default used to be the current calendar month, which at any pay day above 1 is a
// paycheck in the future for every day of the month before it - so a budget change applied from the
// *next* period while the form said "Changes saved". Nothing caught it because the backend e2e suite
// provisions every account on `monthStartDay: 1`, where today is never before pay day.
describe('defaultPaycheckMonth', () => {
  describe('a budget-only change, where the pay day did not move', () => {
    it('opens on this month once the pay day has passed', () => {
      expect(defaultPaycheckMonth('2026-03-20', 15, 15)).toBe('2026-03');
    });

    it('opens on this month on the pay day itself', () => {
      // The boundary: `mostRecentAnchor`'s own rule is "at or before", so today being pay day means
      // the current period opened today.
      expect(defaultPaycheckMonth('2026-03-15', 15, 15)).toBe('2026-03');
    });

    it('opens on last month while the pay day is still to come', () => {
      // **The defect.** On 11 March a person paid on the 15th is spending February's paycheck, so a
      // change taking effect now applies from February. The old version answered `2026-03`, five days
      // away, and the current period kept the old budget.
      expect(defaultPaycheckMonth('2026-03-11', 15, 15)).toBe('2026-02');
    });

    it('crosses a year boundary backwards', () => {
      expect(defaultPaycheckMonth('2026-01-05', 28, 28)).toBe('2025-12');
    });

    it('is unaffected on a pay day of 1, which is why no suite noticed', () => {
      // Every day of the month is at or after the 1st, so this arm is the one the fixtures exercise
      // and the one that was always right.
      expect(defaultPaycheckMonth('2026-03-01', 1, 1)).toBe('2026-03');
      expect(defaultPaycheckMonth('2026-03-31', 1, 1)).toBe('2026-03');
    });
  });

  describe('a pay-day change, where the first new-schedule paycheck is what is wanted', () => {
    it('opens on this month while the new pay day is still to come', () => {
      expect(defaultPaycheckMonth('2026-03-11', 1, 25)).toBe('2026-03');
    });

    it('opens on this month when the new pay day is today', () => {
      expect(defaultPaycheckMonth('2026-03-25', 1, 25)).toBe('2026-03');
    });

    it('opens on next month once the new pay day has passed', () => {
      // Never the most recent occurrence: that is a paycheck which never arrived under the new
      // schedule, and anchoring there removes a boundary inside the period the user is already
      // living in - re-shaping a span with transactions in it, by default.
      expect(defaultPaycheckMonth('2026-03-20', 1, 15)).toBe('2026-04');
    });

    it('crosses a year boundary forwards', () => {
      expect(defaultPaycheckMonth('2026-12-20', 1, 5)).toBe('2027-01');
    });
  });

  it('always answers a month the dialog actually offers', () => {
    // The default and the option list are built from one arithmetic, so a default outside the window
    // would render as a `<select>` with no matching option and an empty box. Every case above is at
    // most one month either side of today's, and this is the proof rather than the claim.
    const cases: [string, number, number][] = [
      ['2026-03-11', 15, 15],
      ['2026-03-20', 15, 15],
      ['2026-01-05', 28, 28],
      ['2026-12-20', 1, 5],
      ['2026-03-20', 1, 15],
    ];

    for (const [today, stored, next] of cases) {
      const offered = paycheckMonths(today).map((month) => month.value);
      expect(offered).toContain(defaultPaycheckMonth(today, stored, next));
    }
  });
});

describe('paycheckMonths', () => {
  it('offers the four months before this one, this one, and the four after', () => {
    expect(paycheckMonths('2026-03-20').map((month) => month.value)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
    ]);
  });

  it('names each month in `en-US` against UTC', () => {
    // A local zone would render the 1st of a month as the previous one for anybody west of Greenwich,
    // which is the same call `lib/format.ts` makes about its own month names.
    const months = paycheckMonths('2026-01-15');

    expect(months[4]!.label).toBe('January 2026');
    expect(months[0]!.label).toBe('September 2025');
  });
});
