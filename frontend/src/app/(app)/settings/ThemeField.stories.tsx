import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { ThemeField } from './ThemeField';

// The Theme control from the Claude Design system's Settings screen, isolated the way
// `MonthStartField`'s stories isolate its picker: the diff target is the design source rather than
// a Figma frame, because no frame draws this control - frame 17 predates it and the design system
// is the authority the product owner chose. PET-74 shipped it as a three-way segmented row and
// PET-79 replaced that with one tile per registered theme, so **the design source is a diff target
// for the card around it and no longer for the control itself**: five themes do not fit a
// segmented row, and a picker that cannot preview what it offers is the thing the tiles fix.
//
// **This is the review surface for the whole point of the change.** Each tile carries its own
// `data-theme`, so its eight swatches paint that theme's real values - which means the six tiles
// should read as six visibly different palettes, side by side, in one screenshot. That is
// unassertable under Jest (jsdom applies no stylesheet, so every swatch is colourless there), so
// what to eyeball here is exactly that: six distinct palettes, the Automatic tile matching
// whatever the preview is currently painted as, and no two tiles that look like the same theme.
//
// Clicking a tile in Storybook really applies the theme to the preview iframe and really writes
// the cookie, which is the honest version of the control rather than a defanged one. Note the
// chrome-colour write is a no-op here: Storybook's iframe carries no `theme-color` meta pair for
// it to find, so that third write is a browser check on the real app.

const meta: Meta<typeof ThemeField> = {
  title: 'Screens/17 Settings/ThemeField',
  component: ThemeField,
  tags: ['autodocs'],
  // Padded rather than fullscreen: a control, not a screen. The card around it belongs to
  // `SettingsScreen`'s stories.
  parameters: { layout: 'padded' },
  args: { initial: 'system' },
};

export default meta;
type Story = StoryObj<typeof ThemeField>;

/** The default state every browser starts in: no cookie, following the OS. */
export const Automatic: Story = {};

/**
 * The app's own light palette, pinned explicitly.
 *
 * Worth opening beside `Light` below, because those two are the pair PET-79 made distinguishable:
 * the cookie value `light` meant this theme before and means the stock one now.
 */
export const SpendificoLight: Story = { args: { initial: 'expensa-light' } };

/** The app's own dark palette, pinned explicitly. */
export const SpendificoDark: Story = { args: { initial: 'expensa-dark' } };

/** daisyUI's stock light theme, behind two token overrides. */
export const Light: Story = { args: { initial: 'light' } };

/** daisyUI's stock dark theme, behind the same two. */
export const Dark: Story = { args: { initial: 'dark' } };

/**
 * daisyUI's `abyss`, behind three overrides and the most-changed of the five.
 *
 * The one to look hardest at: its `info-content` is the single token any cover of that theme makes
 * worse against the card, so its swatch row is where a too-dark tile would show.
 */
export const Abyss: Story = { args: { initial: 'abyss' } };
