import {
  hasChosenMarks,
  invalidFields,
  isCapValid,
  isNameValid,
  toCreateCategoryBody,
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
