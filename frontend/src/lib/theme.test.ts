import { parseThemePref, THEME_COOKIE, THEME_PREFS, themeAttribute } from './theme';

describe('parseThemePref', () => {
  it.each(THEME_PREFS)('returns %s for its own stored value', (pref) => {
    expect(parseThemePref(pref)).toBe(pref);
  });

  // A cookie is writable from devtools, so the parse is a validation rather than a cast - the
  // `parseDraft` rule. `system` is the fallback because it is the pre-control behaviour for
  // every browser that never touched the switch.
  it.each([
    ['an unknown word', 'sepia'],
    ['a registered theme name rather than a pref', 'expensa-dark'],
    ['an empty string', ''],
    ['an absent cookie', undefined],
  ])('reads %s as system', (_label, value) => {
    expect(parseThemePref(value)).toBe('system');
  });
});

describe('themeAttribute', () => {
  it('pins the registered theme names for the two explicit choices', () => {
    expect(themeAttribute('light')).toBe('expensa-light');
    expect(themeAttribute('dark')).toBe('expensa-dark');
  });

  // `undefined`, never a name: React omits the attribute entirely, which is the state daisyUI's
  // prefers-dark selector (`:root:not([data-theme])`) requires for the OS selection to apply.
  it('maps system to no attribute at all', () => {
    expect(themeAttribute('system')).toBeUndefined();
  });
});

describe('THEME_COOKIE', () => {
  // The name is one half of a contract with the root layout's read and the control's write;
  // pinned so a rename cannot drift one side silently.
  it('is the spendifico-prefixed name both sides read', () => {
    expect(THEME_COOKIE).toBe('spendifico.theme');
  });
});
