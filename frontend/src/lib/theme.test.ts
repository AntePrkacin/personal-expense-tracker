import {
  parseThemePref,
  THEME_COLOUR,
  THEME_COOKIE,
  THEME_NAMES,
  THEME_PREFS,
  themeAttribute,
} from './theme';

describe('parseThemePref', () => {
  it.each(THEME_PREFS)('returns %s for its own stored value', (pref) => {
    expect(parseThemePref(pref)).toBe(pref);
  });

  it('accepts every registered theme name, which PET-79 is what made true', () => {
    // Before PET-79 a theme name was *not* a preference - the union was `system | light | dark`
    // and `expensa-dark` read as `system`. The two collapsed into one vocabulary, so this asserts
    // the direction the old suite asserted the opposite of.
    for (const name of THEME_NAMES) expect(parseThemePref(name)).toBe(name);
  });

  // A cookie is writable from devtools, so the parse is a validation rather than a cast - the
  // `parseDraft` rule. `system` is the fallback because it is the pre-control behaviour for
  // every browser that never touched the switch.
  it.each([
    ['an unknown word', 'sepia'],
    ['a daisyUI theme this app does not register', 'lemonade'],
    ['an empty string', ''],
    ['an absent cookie', undefined],
  ])('reads %s as system', (_label, value) => {
    expect(parseThemePref(value)).toBe('system');
  });
});

describe('themeAttribute', () => {
  it('is the identity on every registered theme, a lookup rather than branches', () => {
    // PET-79 collapsed two hand-written branches into this, so there is no mapping table to keep
    // in step with the CSS and no second place a rename has to reach.
    for (const name of THEME_NAMES) expect(themeAttribute(name)).toBe(name);
  });

  it('resolves light and dark to the STOCK themes, which is the deliberate collision', () => {
    // The one behaviour change PET-79 ships knowingly: these two cookie values meant the Expensa
    // pair under PET-74 and mean daisyUI's own themes now, so a browser holding the old cookie
    // lands on a different theme once. Nothing is migrated - there are no real users and test
    // accounts are purged. Pinned because a "fix" that mapped them back would silently make the
    // app's own pair unreachable from the picker.
    expect(themeAttribute('light')).toBe('light');
    expect(themeAttribute('dark')).toBe('dark');
    expect(themeAttribute('expensa-light')).toBe('expensa-light');
    expect(themeAttribute('expensa-dark')).toBe('expensa-dark');
  });

  // `undefined`, never a name: React omits the attribute entirely, which is the state daisyUI's
  // prefers-dark selector (`:root:not([data-theme])`) requires for the OS selection to apply.
  it('maps system to no attribute at all', () => {
    expect(themeAttribute('system')).toBeUndefined();
  });
});

describe('THEME_COLOUR', () => {
  // The browser-chrome value per theme, and the only hex outside `globals.css`. Keyed by the
  // theme list so a sixth theme fails here rather than shipping a chrome colour of `undefined`.
  it('carries one colour per registered theme', () => {
    expect(Object.keys(THEME_COLOUR).sort()).toEqual([...THEME_NAMES].sort());
    for (const name of THEME_NAMES) expect(THEME_COLOUR[name]).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('THEME_COOKIE', () => {
  // The name is one half of a contract with the root layout's read and the control's write;
  // pinned so a rename cannot drift one side silently.
  it('is the spendifico-prefixed name both sides read', () => {
    expect(THEME_COOKIE).toBe('spendifico.theme');
  });
});
