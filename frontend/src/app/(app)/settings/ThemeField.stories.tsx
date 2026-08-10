import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { ThemeField } from './ThemeField';

// The Theme row from the Claude Design system's Settings screen (`ThemeSegmented`), isolated the
// way `MonthStartField`'s stories isolate its picker: the diff target is the design source
// rather than a Figma frame, because no frame draws this control - frame 17 predates it and the
// design system is the authority the product owner chose. Clicking a segment in Storybook really
// applies the theme to the preview iframe and really writes the cookie, which is the honest
// version of the control rather than a defanged one; the segment order, the per-selection hint
// line and the lifted pill are what to eyeball here.

const meta: Meta<typeof ThemeField> = {
  title: 'Screens/17 Settings/ThemeField',
  component: ThemeField,
  tags: ['autodocs'],
  // Padded rather than fullscreen: a row, not a screen. The card around it belongs to
  // `SettingsScreen`'s stories.
  parameters: { layout: 'padded' },
  args: { initial: 'system' },
};

export default meta;
type Story = StoryObj<typeof ThemeField>;

/** The default state every browser starts in: no cookie, following the OS. */
export const System: Story = {};

/** An explicit light pin, the hint line swapped with it. */
export const Light: Story = { args: { initial: 'light' } };

/** An explicit dark pin. */
export const Dark: Story = { args: { initial: 'dark' } };
