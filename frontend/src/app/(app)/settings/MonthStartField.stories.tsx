import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';

import { MonthStartField } from './MonthStartField';
import { MONTH_START_HINT } from './PreferencesCard';

// **Open these rather than reading them.** Everything this control exists for is invisible under
// Jest: jsdom implements no Popover API, so the panel is permanently open in the suite and nothing
// covers opening, Escape or light dismiss; and jsdom runs no layout at all, so neither the
// `max-h-64` cap - the reason this is not a native `<select>` - nor the scroll box nor the centring
// of the chosen row can be asserted there.
//
// The two to actually check are `Fifteenth` and `TwentyEighth`: open each and confirm the panel
// opens **scrolled to the stored row** rather than at the 1st, which is `lib/pickerScroll.ts`'s job
// and the thing a stored 28 makes obvious.
//
// Firefox is worth a second look, as it is for `ColourSelect`: no CSS anchor positioning, so
// daisyUI's `@supports` fallback centres the panel over a dimmed backdrop instead of anchoring it
// under the trigger. Degraded rather than broken.

const meta: Meta<typeof MonthStartField> = {
  title: 'Screens/17 Settings/MonthStartField',
  component: MonthStartField,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof MonthStartField>;

/** Controlled, so picking a row visibly updates the trigger the way it does on the real card. */
function Controlled({ day = 1, ...rest }: { day?: number; hint?: string; disabled?: boolean }) {
  const [value, setValue] = useState(day);

  return (
    <div className="max-w-105">
      <MonthStartField
        id="story-month-start"
        label="Month starts on"
        value={value}
        onChange={setValue}
        {...rest}
      />
    </div>
  );
}

/** The default every account holds until it says otherwise, and the top of the list. */
export const Default: Story = {
  render: () => <Controlled />,
};

/** A payday anchor in the middle of the list, so the centring has somewhere to move to. */
export const Fifteenth: Story = {
  render: () => <Controlled day={15} />,
};

/**
 * The last day a period may start on, and the case that makes the scroll cap obvious.
 *
 * 28 is `UpdateProfileDto`'s own ceiling, picked so every month has the day - February is the whole
 * reason it is not 31. Opening this story should show the bottom of the list, not the top.
 */
export const TwentyEighth: Story = {
  render: () => <Controlled day={28} />,
};

/**
 * With the standing hint the Preferences card gives it.
 *
 * Worth a designer's eye: nothing in the frame warns that changing this re-buckets every figure in
 * the app, and the backend recomputes month attribution at read time, so the effect is immediate
 * and total. `docs/TODO.md` carries the copy alongside A29's other undesigned states.
 */
export const WithHint: Story = {
  render: () => <Controlled day={15} hint={MONTH_START_HINT} />,
};

/** Frozen, which is what the Settings form does to every control while its save is in flight. */
export const Disabled: Story = {
  render: () => <Controlled day={15} disabled />,
};
