import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ThemeField, THEME_OPTIONS } from './ThemeField';

// The Theme row applies its choice in two places - the `<html>` attribute for this frame, the
// cookie for the next server render - so the suite asserts both writes and the semantics around
// them, never the segmented skin's class strings. What jsdom cannot see: that the checked
// segment visually lifts (a `has-[:checked]` paint), and that arrow keys move the selection
// (jsdom implements no radio-group roving). Both are browser checks, alongside the walk's
// confirmation that the attribute really flips the painted theme.

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  // jsdom's cookie jar persists across tests in a file; expire the one this suite writes.
  document.cookie = 'spendifico.theme=; path=/; max-age=0';
});

describe('ThemeField', () => {
  it('is one radio group named Theme, holding the three designed options', () => {
    render(<ThemeField initial="system" />);

    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    for (const radio of radios) {
      expect(group).toContainElement(radio);
      // One shared name is what makes them a single tab stop with platform arrow keys - the
      // native behaviour the segmented skin must not break.
      expect(radio).toHaveAttribute('name', 'theme-pref');
    }
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
  });

  it('starts on the server-rendered preference', () => {
    render(<ThemeField initial="dark" />);

    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(screen.getByText('Always the dark palette.')).toBeInTheDocument();
  });

  it('applies an explicit choice instantly: the html attribute and the cookie, no save', async () => {
    const user = userEvent.setup();
    render(<ThemeField initial="system" />);

    await user.click(screen.getByRole('radio', { name: 'Light' }));

    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
    expect(document.documentElement).toHaveAttribute('data-theme', 'expensa-light');
    expect(document.cookie).toContain('spendifico.theme=light');
    expect(screen.getByText('Always the light palette.')).toBeInTheDocument();
  });

  it('returns to system by removing the attribute, which is what re-arms the OS selection', async () => {
    const user = userEvent.setup();
    render(<ThemeField initial="dark" />);
    await user.click(screen.getByRole('radio', { name: 'Dark' }));

    await user.click(screen.getByRole('radio', { name: 'System' }));

    // No attribute at all, never `data-theme=""`: daisyUI's prefers-dark selector is
    // `:root:not([data-theme])`, and an empty attribute still matches `[data-theme]`.
    expect(document.documentElement).not.toHaveAttribute('data-theme');
    expect(document.cookie).toContain('spendifico.theme=system');
    expect(screen.getByText('Follows your device setting.')).toBeInTheDocument();
  });

  it('keeps the hint and the option copy shipping from one constant', () => {
    render(<ThemeField initial="system" />);

    // The design source's own strings, exported so no assertion here restates a shipped one.
    for (const option of THEME_OPTIONS) {
      expect(screen.getByRole('radio', { name: option.label })).toBeInTheDocument();
    }
  });
});
