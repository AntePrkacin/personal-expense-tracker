import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { LogoLockup } from './LogoLockup';

// The brand lockup, and **the review surface for the one thing no gate can check.** Every size here
// is derived from the trimmed artwork - the tile's 1/6 corner arc, the `$`'s 0.7810 glyph/tile
// ratio, the wordmark's 0.6146 cap/tile ratio against Crimson Pro's measured 0.5800 cap/em - and
// jsdom runs no layout, so whether those land is a browser question by construction.
//
// What to eyeball, in order:
//
//  1. **`Lg` against the artwork.** `docs/explainers/assets/logo/SPENDIFICO_LOGO.trimmed.svg` is
//     what this is a text reconstruction of, and `lg` is the one size that keeps its proportions.
//  2. **`Md` and `Sm` are deliberately not artwork-faithful.** "PENDIFICO" is 4.98 times its own
//     font-size wide, so the artwork's ratio needs 238px where the sidebar's `w-64` column leaves
//     216px. Those two reduce the wordmark and keep the `$` exact. Expect a smaller wordmark
//     relative to the tile, and check it still reads as the same mark.
//  3. **`OnDark`**, which is the tone for a `neutral` ground and currently has no caller.
//  4. **The `$` should not look like a substitution.** Crimson Pro is a webfont; with no network
//     the display face falls back to `ui-serif` and the mark will look wrong in a way that is the
//     harness rather than the design. `frontend/CLAUDE.md` flags that trap for every glyph check.

const meta: Meta<typeof LogoLockup> = {
  title: 'Components/LogoLockup',
  component: LogoLockup,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof LogoLockup>;

/** The access screens' size, and the only one at the artwork's own proportions. 249.7px wide. */
export const Lg: Story = { args: { size: 'lg' } };

/** The sidebar's, with the wordmark reduced to fit a 216px column. 197.5px wide. */
export const Md: Story = { args: { size: 'md' } };

/** The mobile drawer bar's, reduced likewise. 171.6px wide. */
export const Sm: Story = { args: { size: 'sm' } };

/**
 * The three sizes together, which is the comparison the individual stories cannot show.
 *
 * The tile shrinks 38 -> 36 -> 32 while the wordmark drops further, so this is where a reader can
 * see that `md` and `sm` are the same mark rather than a different one.
 */
export const EverySize: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <LogoLockup size="lg" />
      <LogoLockup size="md" />
      <LogoLockup size="sm" />
    </div>
  ),
};

/** The `neutral`-ground tone, drawn on one so the wordmark's colour is actually legible. */
export const OnDark: Story = {
  render: () => (
    <div className="bg-neutral rounded-box p-6">
      <LogoLockup tone="onDark" />
    </div>
  ),
};
