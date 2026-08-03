import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Page, Section, TypeRow } from './Reference';
import { TYPE_STYLES } from './tokens';

const meta: Meta = {
  title: 'Foundations/Typography',
  tags: ['autodocs'],
};

export default meta;

/**
 * The 19 Foundations type styles, each specimen rendered with its own utility
 * class. Plus Jakarta Sans carries the wordmark, display and heading sizes;
 * Inter carries strong, label, overline, body and caption.
 */
export const AllStyles: StoryObj = {
  render: () => (
    <Page>
      <Section
        title="Typography"
        subtitle="Plus Jakarta Sans (display & amounts) + Inter (UI text) · 19 styles"
      >
        <div className="flex flex-col gap-6">
          {TYPE_STYLES.map(({ label, utility, spec }) => (
            <TypeRow key={utility} label={label} utility={utility} spec={spec} />
          ))}
        </div>
      </Section>
    </Page>
  ),
};

/**
 * The overline in the two places the design uses it. The 6% tracking is what
 * makes these read as overlines rather than as small labels.
 */
export const Overline: StoryObj = {
  render: () => (
    <Page>
      <Section title="Overline" subtitle="Inter Medium · 11 / 6%">
        <div className="flex flex-col gap-6">
          <p className="text-overline text-text-tertiary">STEP 1 OF 3</p>
          <p className="text-overline text-text-tertiary">OCTOBER SUMMARY</p>
        </div>
      </Section>
    </Page>
  ),
};
