import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Group, Page, Section, Swatch } from './Reference';
import { COLOUR_GROUPS } from './tokens';

const meta: Meta = {
  title: 'Foundations/Colour',
  tags: ['autodocs'],
};

export default meta;

/**
 * All 36 Foundations colour tokens, grouped as Brand, Surface, Text, Border,
 * Status and Category. Each hex is read back off :root, so this is what
 * globals.css declares rather than a second transcription of the design.
 */
export const AllTokens: StoryObj = {
  render: () => (
    <Page>
      <Section
        title="Colour"
        subtitle="Design tokens read from the Figma Foundations page. Light mode only."
      >
        {COLOUR_GROUPS.map(({ group, tokens }) => (
          <Group key={group} label={group}>
            {tokens.map(({ name, label }) => (
              <Swatch key={name} token={name} label={label} />
            ))}
          </Group>
        ))}
      </Section>
    </Page>
  ),
};
