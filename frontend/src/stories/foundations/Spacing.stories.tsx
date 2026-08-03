import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Page, ScaleRow, Section } from './Reference';
import { SPACING_SCALE } from './tokens';

const meta: Meta = {
  title: 'Foundations/Spacing',
  tags: ['autodocs'],
};

export default meta;

/**
 * The Figma Space scale against the Tailwind utility that produces each step.
 *
 * The scale is not redeclared in the theme on purpose: Tailwind's --spacing
 * namespace also drives w-*, h-*, size-*, inset-* and translate-*, so
 * overriding it would silently delete every sizing key not listed. Each bar
 * here is drawn with the real width utility, so the mapping is demonstrated
 * rather than asserted.
 */
export const Scale: StoryObj = {
  render: () => (
    <Page>
      <Section title="Spacing" subtitle="4px base scale — used for padding, gaps and layout.">
        <div className="flex flex-col gap-5">
          {SPACING_SCALE.map(({ label, px, utility, bar }) => (
            <ScaleRow key={label} label={label} bar={bar} utility={utility} value={`${px} px`} />
          ))}
        </div>
      </Section>
    </Page>
  ),
};
