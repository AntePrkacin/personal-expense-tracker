import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Page, RadiusTile, Section } from './Reference';
import { RADIUS_SCALE } from './tokens';

const meta: Meta = {
  title: 'Foundations/Radius',
  tags: ['autodocs'],
};

export default meta;

/**
 * The radius scale. SM through XL are theme tokens; Radius/Full is Tailwind's
 * built-in rounded-full, which the compiler hardcodes to calc(infinity * 1px)
 * and which ignores any --radius-full declaration.
 */
export const Scale: StoryObj = {
  render: () => (
    <Page>
      <Section title="Radius" subtitle="Corner radii for cards, inputs, buttons and pills.">
        <div className="flex flex-wrap gap-7">
          {RADIUS_SCALE.map(({ label, utility, value }) => (
            <RadiusTile key={label} label={label} utility={utility} value={value} />
          ))}
        </div>
      </Section>
    </Page>
  ),
};
