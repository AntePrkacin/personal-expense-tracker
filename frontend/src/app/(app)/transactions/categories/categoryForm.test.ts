import { category } from './categoryFixture';
import {
  hasChosenMarks,
  invalidFields,
  isCapValid,
  isNameValid,
  toCategoryFormValues,
  toCreateCategoryBody,
  toUpdateCategoryBody,
  type CategoryFormValues,
  type ChosenCategoryValues,
} from './categoryForm';

// No jsdom needed, the same property `(app)/transactionForm.test.ts` and `setup/draft.test.ts`
// have: everything here is a plain function over strings.

/**
 * Frame 19's own mock values (node 102:878), with its two unbuildable ones substituted.
 *
 * The frame draws "Violet" and "Repeat", and neither survives contact with the contract: there is no
 * `violet` colour token (the palette's closest labels are Indigo and Lavender), and `repeat` is a
 * real lucide name but not one of the 64 this app imports. So the frame's *category* is kept and its
 * two example labels are replaced by tokens that exist - `primary` is Indigo, and `tv` is what the
 * seeded Entertainment template carries, which is the obvious mark for Subscriptions.
 */
const FILLED: ChosenCategoryValues = {
  name: 'Subscriptions',
  monthlyCap: '250.00',
  color: 'primary',
  icon: 'tv',
  note: 'Streaming, apps & memberships',
};

/** The same form before anything is typed, with the palette's first entries preselected. */
const EMPTY: CategoryFormValues = {
  name: '',
  monthlyCap: '',
  color: 'success',
  icon: 'shopping-basket',
  note: '',
};

describe('isNameValid', () => {
  it('accepts a name', () => {
    expect(isNameValid('Subscriptions')).toBe(true);
  });

  it('rejects an empty field', () => {
    expect(isNameValid('')).toBe(false);
  });

  it('rejects a name of nothing but spaces, which the DTO would reject too', () => {
    expect(isNameValid('   ')).toBe(false);
  });

  it('does not impose the DTO’s 60-character bound', () => {
    expect(isNameValid('a'.repeat(61))).toBe(true);
  });
});

describe('isCapValid', () => {
  it('accepts a figure', () => {
    expect(isCapValid('250.00')).toBe(true);
  });

  // The whole optional-cap decision, in one assertion. A blank budget is not a missing budget: it
  // means "no limit", which is what every onboarding chip and the seeded Uncategorized already are.
  it('accepts a blank field, because a cap is optional and blank means no limit', () => {
    expect(isCapValid('')).toBe(true);
  });

  it('treats a field of nothing but spaces as blank rather than as junk', () => {
    expect(isCapValid('   ')).toBe(true);
  });

  it('rejects zero, which means “spend nothing here” rather than “no limit”', () => {
    expect(isCapValid('0')).toBe(false);
    expect(isCapValid('0.00')).toBe(false);
  });

  it('rejects a negative, which the field strips but a paste could reach', () => {
    expect(isCapValid('-5')).toBe(false);
  });

  it('rejects a lone decimal point and unparseable junk', () => {
    expect(isCapValid('.')).toBe(false);
    expect(isCapValid('abc')).toBe(false);
  });

  it('does not impose the DTO’s upper bound', () => {
    expect(isCapValid('2000000000')).toBe(true);
  });
});

describe('hasChosenMarks', () => {
  it('accepts a form whose palette has landed', () => {
    expect(hasChosenMarks(FILLED)).toBe(true);
    expect(hasChosenMarks(EMPTY)).toBe(true);
  });

  it('rejects a form with no colour yet, which is a failed or pending palette read', () => {
    expect(hasChosenMarks({ ...EMPTY, color: '' })).toBe(false);
  });

  it('rejects a form with no icon yet', () => {
    expect(hasChosenMarks({ ...EMPTY, icon: '' })).toBe(false);
  });
});

describe('invalidFields', () => {
  it('is empty for a filled form', () => {
    expect(invalidFields(FILLED)).toEqual([]);
  });

  // Deliberately one message rather than two, and this is the test that says so: the cap is
  // optional, so an untouched form is wrong about its name only.
  it('names only the name for an untouched form, because a blank cap is valid', () => {
    expect(invalidFields(EMPTY)).toEqual(['name']);
  });

  it('names both fields, in the order the modal draws them, when both are wrong', () => {
    expect(invalidFields({ ...EMPTY, monthlyCap: '0' })).toEqual(['name', 'monthlyCap']);
  });

  it('names only the cap when the name is filled', () => {
    expect(invalidFields({ ...FILLED, monthlyCap: '0' })).toEqual(['monthlyCap']);
  });

  it('never names the note, the colour or the icon, none of which can carry a message', () => {
    const invalid = invalidFields({ ...EMPTY, note: '', color: '', icon: '' });

    expect(invalid).not.toContain('note');
    expect(invalid).not.toContain('color');
    expect(invalid).not.toContain('icon');
  });
});

describe('toCreateCategoryBody', () => {
  it('builds the designed category', () => {
    expect(toCreateCategoryBody(FILLED)).toEqual({
      name: 'Subscriptions',
      color: 'primary',
      icon: 'tv',
      monthlyCap: 250,
      note: 'Streaming, apps & memberships',
    });
  });

  it('parses a grouped cap, which Number() cannot', () => {
    expect(toCreateCategoryBody({ ...FILLED, monthlyCap: '1,250.50' })).toMatchObject({
      monthlyCap: 1250.5,
    });
  });

  it('trims the name once, at the boundary, keeping inner spaces', () => {
    expect(toCreateCategoryBody({ ...FILLED, name: '  Pet care  ' })).toMatchObject({
      name: 'Pet care',
    });
  });

  it('trims the note', () => {
    expect(toCreateCategoryBody({ ...FILLED, note: '  Streaming  ' })).toMatchObject({
      note: 'Streaming',
    });
  });

  // Absent rather than null or 0: absent is the only thing CreateCategoryDto reads as "no cap".
  it('omits monthlyCap entirely for a blank field rather than sending null or 0', () => {
    const body = toCreateCategoryBody({ ...FILLED, monthlyCap: '' });

    expect(body).not.toHaveProperty('monthlyCap');
    expect(Object.keys(body).sort()).toEqual(['color', 'icon', 'name', 'note']);
  });

  it('omits a note of nothing but spaces, so “no note” never becomes an empty string', () => {
    const body = toCreateCategoryBody({ ...FILLED, note: '   ' });

    expect(body).not.toHaveProperty('note');
  });

  it('sends exactly the five contract keys and nothing else', () => {
    expect(Object.keys(toCreateCategoryBody(FILLED)).sort()).toEqual([
      'color',
      'icon',
      'monthlyCap',
      'name',
      'note',
    ]);
  });

  it('sends exactly three keys for the minimal category, which is name, colour and icon', () => {
    const body = toCreateCategoryBody({ ...FILLED, monthlyCap: '', note: '' });

    expect(Object.keys(body).sort()).toEqual(['color', 'icon', 'name']);
  });
});

describe('toCategoryFormValues', () => {
  // The prefill AC1 asks for, and the inverse of `toCreateCategoryBody` above.
  it('prefills every field from the stored row', () => {
    expect(
      toCategoryFormValues(
        category({
          name: 'Subscriptions',
          monthlyCap: 250,
          color: 'primary',
          icon: 'tv',
          note: 'Streaming, apps & memberships',
        }),
      ),
    ).toEqual({
      name: 'Subscriptions',
      monthlyCap: '250.00',
      color: 'primary',
      icon: 'tv',
      note: 'Streaming, apps & memberships',
    });
  });

  it('formats the cap as a value the field could itself have produced', () => {
    // `String(1250.5)` is "1250.5", which the currency field would never emit - so the first
    // keystroke would reformat it under the caret and look like a glitch. Round-tripping through
    // `formatAmountInput` is what makes the prefilled value indistinguishable from a typed one.
    expect(toCategoryFormValues(category({ monthlyCap: 1250.5 })).monthlyCap).toBe('1,250.50');
  });

  it('prefills a blank budget for an uncapped category', () => {
    // Blank is the same "no limit" `isCapValid` accepts, so an uncapped category opens on a form
    // that is already valid and stays uncapped if the field is not touched.
    expect(toCategoryFormValues(category({ monthlyCap: null })).monthlyCap).toBe('');
  });

  it('prefills a blank note for a category with none', () => {
    // A controlled input's value cannot be `undefined` without React warning about it. The
    // distinction comes back at the boundary below.
    expect(toCategoryFormValues(category({ note: null })).note).toBe('');
  });

  it('does not trim the name, so the diff reports no change the user did not make', () => {
    expect(toCategoryFormValues(category({ name: '  Groceries  ' })).name).toBe('  Groceries  ');
  });

  it('produces values the form treats as valid, for every shape a stored row can take', () => {
    for (const stored of [
      category(),
      category({ monthlyCap: null }),
      category({ note: 'Weekly shop' }),
    ]) {
      expect(invalidFields(toCategoryFormValues(stored))).toEqual([]);
    }
  });
});

describe('toUpdateCategoryBody', () => {
  const STORED = category({
    name: 'Subscriptions',
    monthlyCap: 250,
    color: 'primary',
    icon: 'tv',
    note: 'Streaming, apps & memberships',
  });

  const PREFILLED = toCategoryFormValues(STORED);

  it('sends nothing at all when nothing changed', () => {
    // The caller must close rather than send this: the endpoint answers 400 for a body with no
    // keys, which is a correct answer to a question the user did not ask.
    expect(toUpdateCategoryBody(STORED, PREFILLED)).toEqual({});
  });

  it('sends only the field that changed', () => {
    expect(toUpdateCategoryBody(STORED, { ...PREFILLED, name: 'Streaming' })).toEqual({
      name: 'Streaming',
    });
  });

  it('trims the name once, here', () => {
    expect(toUpdateCategoryBody(STORED, { ...PREFILLED, name: '  Streaming  ' })).toEqual({
      name: 'Streaming',
    });
  });

  it('reports no change for a name that differs only in whitespace it already had', () => {
    const stored = category({ name: 'Streaming' });

    expect(
      toUpdateCategoryBody(stored, { ...toCategoryFormValues(stored), name: ' Streaming ' }),
    ).toEqual({});
  });

  it('parses the cap rather than sending the display string', () => {
    // `Number('1,250.50')` is NaN, which `JSON.stringify` writes as null - the one value that
    // would silently clear the cap it meant to raise.
    expect(toUpdateCategoryBody(STORED, { ...PREFILLED, monthlyCap: '1,250.50' })).toEqual({
      monthlyCap: 1250.5,
    });
  });

  it('sends null for a blank budget, which is the only way to uncap a category', () => {
    expect(toUpdateCategoryBody(STORED, { ...PREFILLED, monthlyCap: '' })).toEqual({
      monthlyCap: null,
    });
  });

  it('treats a budget of nothing but spaces as blank', () => {
    expect(toUpdateCategoryBody(STORED, { ...PREFILLED, monthlyCap: '   ' })).toEqual({
      monthlyCap: null,
    });
  });

  it('reports no change when an uncapped category is left uncapped', () => {
    // The mirror of the case above, and the one that would send `monthlyCap: null` on every save
    // if the comparison were written against `''` rather than against the stored value.
    const stored = category({ monthlyCap: null });

    expect(toUpdateCategoryBody(stored, toCategoryFormValues(stored))).toEqual({});
  });

  it('sends a cap for a category that had none', () => {
    const stored = category({ monthlyCap: null });

    expect(
      toUpdateCategoryBody(stored, { ...toCategoryFormValues(stored), monthlyCap: '250.00' }),
    ).toEqual({ monthlyCap: 250 });
  });

  it('sends a changed colour and a changed icon as the contract unions', () => {
    expect(toUpdateCategoryBody(STORED, { ...PREFILLED, color: 'accent', icon: 'music' })).toEqual({
      color: 'accent',
      icon: 'music',
    });
  });

  it('skips an unchosen colour or icon rather than sending an empty string', () => {
    // `''` cannot occur from a prefill, since a stored row's marks are real tokens - so this is
    // the guard that lets the function take `CategoryFormValues` instead of demanding the
    // narrowed type `toCreateCategoryBody` needs.
    expect(toUpdateCategoryBody(STORED, { ...PREFILLED, color: '', icon: '' })).toEqual({});
  });

  it('sends null for a cleared note, and the note itself for a changed one', () => {
    expect(toUpdateCategoryBody(STORED, { ...PREFILLED, note: '' })).toEqual({ note: null });
    expect(toUpdateCategoryBody(STORED, { ...PREFILLED, note: 'Monthly' })).toEqual({
      note: 'Monthly',
    });
  });

  it('reports no change when a stored note carries surrounding whitespace', () => {
    // **The defect a code review caught.** The field is hidden behind `SHOWS_NOTE`, so the user can
    // neither see nor touch it - and comparing a trimmed value against an untrimmed stored one made
    // it differ from itself, so a rename quietly carried a rewritten note along with it.
    const stored = category({ note: '  weekly shop  ' });

    expect(toUpdateCategoryBody(stored, toCategoryFormValues(stored))).toEqual({});
  });

  it('does not delete a stored note that is nothing but spaces', () => {
    // The sharper half of the same bug: the trim made it `''`, which this function turns into
    // `null`, so a save that never mentioned the note removed it.
    const stored = category({ note: '   ' });

    expect(toUpdateCategoryBody(stored, toCategoryFormValues(stored))).toEqual({});
  });

  it('still clears a real note when the field is emptied', () => {
    // The control for the two above: trimming both sides must not cost the one thing the
    // comparison is for.
    const stored = category({ note: 'Weekly shop' });

    expect(toUpdateCategoryBody(stored, { ...toCategoryFormValues(stored), note: '' })).toEqual({
      note: null,
    });
  });

  it('sends nothing at all for an untouched form whose stored note has whitespace', () => {
    // The caller closes without a request when the body is empty, so this is what stopped Save on
    // an untouched form from firing a PATCH the endpoint would have accepted.
    const stored = category({ name: 'Groceries', monthlyCap: 500, note: ' a note ' });

    expect(Object.keys(toUpdateCategoryBody(stored, toCategoryFormValues(stored)))).toEqual([]);
  });

  it('normalises a stored name’s whitespace, which is deliberate and not the note rule', () => {
    // `toUpdateTransactionBody` makes the same call about `merchant`, for the reason that still
    // holds: the alternative is never being able to trim it. It is safe here and not for `note`
    // because the Name field is on screen with its value in it.
    const stored = category({ name: '  Groceries  ' });

    expect(toUpdateCategoryBody(stored, toCategoryFormValues(stored))).toEqual({
      name: 'Groceries',
    });
  });

  it('reports no change for a blank note over a stored null', () => {
    // The comparison is against `original.note ?? ''`, which is what keeps the hidden Note field
    // from contributing a key to every patch.
    const stored = category({ note: null });

    expect(toUpdateCategoryBody(stored, toCategoryFormValues(stored))).toEqual({});
  });

  it('sends every field when every field changed, and nothing else', () => {
    expect(
      Object.keys(
        toUpdateCategoryBody(STORED, {
          name: 'Streaming',
          monthlyCap: '300.00',
          color: 'accent',
          icon: 'music',
          note: 'Monthly',
        }),
      ).sort(),
    ).toEqual(['color', 'icon', 'monthlyCap', 'name', 'note']);
  });
});
