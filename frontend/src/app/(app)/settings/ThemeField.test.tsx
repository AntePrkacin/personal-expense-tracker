import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { THEME_COLOUR, THEME_NAMES, themeAttribute } from '@/lib/theme';

import { ThemeField, THEME_OPTIONS } from './ThemeField';

// The Theme control applies its choice in three places - the `<html>` attribute for this frame,
// the `theme-color` meta tags for the browser chrome, and the cookie for the next server render -
// so the suite asserts all three writes and the semantics around them, never the tiles' class
// strings.
//
// **What jsdom cannot see**, all of it on the browser-check list: that a checked tile visually
// lifts (a `has-[:checked]` paint), that arrow keys move the selection (jsdom implements no
// radio-group roving), and - the one that matters most here - that each tile's own `data-theme`
// really repaints its eight swatches in that theme's colours. jsdom applies no stylesheet, so
// every swatch is colourless under Jest and only the attribute is assertable; the walk is what
// confirms six tiles show six different palettes.

/** The pair `layout.tsx` renders from `viewport.themeColor`, which jsdom does not build for us. */
function mountThemeColourPair() {
  for (const scheme of ['light', 'dark']) {
    const tag = document.createElement('meta');
    tag.setAttribute('name', 'theme-color');
    tag.setAttribute('media', `(prefers-color-scheme: ${scheme})`);
    tag.setAttribute('content', THEME_COLOUR[scheme === 'dark' ? 'expensa-dark' : 'expensa-light']);
    document.head.appendChild(tag);
  }
}

const themeColours = () =>
  [...document.querySelectorAll('meta[name="theme-color"]')].map((tag) =>
    tag.getAttribute('content'),
  );

beforeEach(mountThemeColourPair);

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((tag) => tag.remove());
  // jsdom's cookie jar persists across tests in a file; expire the one this suite writes.
  document.cookie = 'spendifico.theme=; path=/; max-age=0';
});

describe('ThemeField', () => {
  it('is one radio group named Theme, holding one tile per registered theme plus Automatic', () => {
    render(<ThemeField initial="system" />);

    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    const radios = screen.getAllByRole('radio');
    // Derived from the theme list rather than written out, so registering a sixth theme fails
    // here instead of quietly shipping a picker that cannot reach it.
    expect(radios).toHaveLength(THEME_NAMES.length + 1);
    for (const radio of radios) {
      expect(group).toContainElement(radio);
      // One shared name is what makes them a single tab stop with platform arrow keys - the
      // native behaviour the tiles must not break.
      expect(radio).toHaveAttribute('name', 'theme-pref');
    }
    expect(screen.getByRole('radio', { name: 'Automatic' })).toBeChecked();
  });

  it('offers every registered theme, and every option names a real one', () => {
    render(<ThemeField initial="system" />);

    // Two directions, because they fail differently: a registered theme missing from the picker
    // is unreachable, and an option naming an unregistered theme pins nothing and silently
    // follows the page - the defect `app/DecorativePanel.tsx` shipped once.
    const offered = THEME_OPTIONS.map((option) => option.pref);
    for (const name of THEME_NAMES) expect(offered).toContain(name);
    for (const pref of offered) {
      if (pref === 'system') continue;
      expect(THEME_NAMES).toContain(pref);
    }
  });

  it('gives each tile its own data-theme, and Automatic none at all', () => {
    render(<ThemeField initial="system" />);

    for (const option of THEME_OPTIONS) {
      const tile = screen.getByRole('radio', { name: option.label }).closest('label');
      if (option.pref === 'system') {
        // No attribute, so the tile inherits whatever the page is painted as - which is what the
        // Automatic arm is offering. Never `data-theme=""`, which still matches `[data-theme]`.
        expect(tile).not.toHaveAttribute('data-theme');
      } else {
        expect(tile).toHaveAttribute('data-theme', option.pref);
      }
    }
  });

  it('starts on the server-rendered preference', () => {
    render(<ThemeField initial="abyss" />);

    expect(screen.getByRole('radio', { name: 'Abyss' })).toBeChecked();
    expect(screen.getByText('A deep green-black palette.')).toBeInTheDocument();
  });

  it('applies an explicit choice instantly: attribute, chrome colour and cookie, no save', async () => {
    const user = userEvent.setup();
    render(<ThemeField initial="system" />);

    await user.click(screen.getByRole('radio', { name: 'Abyss' }));

    expect(screen.getByRole('radio', { name: 'Abyss' })).toBeChecked();
    expect(document.documentElement).toHaveAttribute('data-theme', 'abyss');
    expect(document.cookie).toContain('spendifico.theme=abyss');
    // Both tags carry the picked theme's colour, so neither can win by media over the pick.
    expect(themeColours()).toEqual([THEME_COLOUR.abyss, THEME_COLOUR.abyss]);
  });

  it('distinguishes the app pair from the stock pair, which shared a cookie value before', async () => {
    const user = userEvent.setup();
    render(<ThemeField initial="system" />);

    // PET-74's cookie value `light` meant `expensa-light`; it means the stock theme now, and the
    // app's own is named. A regression here is silent, because both are registered and both
    // paint - the wrong one, on every reload.
    await user.click(screen.getByRole('radio', { name: 'Light' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(document.cookie).toContain('spendifico.theme=light');

    await user.click(screen.getByRole('radio', { name: 'Spendifico Light' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'expensa-light');
    expect(document.cookie).toContain('spendifico.theme=expensa-light');
  });

  it('returns to Automatic by removing the attribute and restoring the chrome pair', async () => {
    const user = userEvent.setup();
    render(<ThemeField initial="dark" />);
    await user.click(screen.getByRole('radio', { name: 'Dark' }));

    await user.click(screen.getByRole('radio', { name: 'Automatic' }));

    // No attribute at all, never `data-theme=""`: daisyUI's prefers-dark selector is
    // `:root:not([data-theme])`, and an empty attribute still matches `[data-theme]`.
    expect(document.documentElement).not.toHaveAttribute('data-theme');
    expect(document.cookie).toContain('spendifico.theme=system');
    // The pair comes back keyed on media rather than to one value, which is the whole difference
    // between the Automatic arm and an explicit pick.
    expect(themeColours()).toEqual([THEME_COLOUR['expensa-light'], THEME_COLOUR['expensa-dark']]);
    expect(screen.getByText(THEME_OPTIONS[0].hint)).toBeInTheDocument();
  });

  it('maps every preference onto a registered attribute, or none for Automatic', () => {
    // `themeAttribute` is a lookup rather than two branches as of PET-79, so this is the proof
    // that the collapse did not drop an arm.
    expect(themeAttribute('system')).toBeUndefined();
    for (const name of THEME_NAMES) expect(themeAttribute(name)).toBe(name);
  });

  it('keeps the label and hint copy shipping from one constant', () => {
    render(<ThemeField initial="system" />);

    for (const option of THEME_OPTIONS) {
      expect(screen.getByRole('radio', { name: option.label })).toBeInTheDocument();
    }
  });

  it('names the product Spendifico and never Expensa in what a user reads', () => {
    render(<ThemeField initial="system" />);

    // The rule six other suites already pin, and this control is where it nearly broke: the
    // theme *names* are `expensa-*` because PET-74 took its values from that design system, and
    // the first draft of this file leaked those into the tile labels.
    for (const option of THEME_OPTIONS) {
      expect(option.label).not.toMatch(/Expensa/i);
      expect(option.hint).not.toMatch(/Expensa/i);
    }
  });
});
