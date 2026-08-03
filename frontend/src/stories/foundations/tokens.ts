// Token *names* for the Foundations reference stories, grouped the way the
// Figma page groups them.
//
// Deliberately no hex values here: the stories read each value back off :root
// at runtime with getComputedStyle, so what they display is whatever
// globals.css actually declares and cannot drift from it. globals.css stays the
// single source of truth; this file only decides what is shown and in what
// order.

export type TokenGroup = { group: string; tokens: { name: string; label: string }[] };

const token = (name: string, label: string) => ({ name, label });

export const COLOUR_GROUPS: TokenGroup[] = [
  {
    group: 'Brand',
    tokens: [
      token('brand-accent', 'Accent'),
      token('brand-accent-pressed', 'Accent Pressed'),
      token('brand-accent-soft', 'Accent Soft'),
    ],
  },
  {
    group: 'Surface',
    tokens: [
      token('surface-canvas', 'Canvas'),
      token('surface-card', 'Card'),
      token('surface-ink', 'Ink'),
      token('surface-ink-raised', 'Ink Raised'),
      token('surface-ink-elevated', 'Ink Elevated'),
      token('surface-muted', 'Muted'),
    ],
  },
  {
    group: 'Text',
    tokens: [
      token('text-primary', 'Primary'),
      token('text-secondary', 'Secondary'),
      token('text-tertiary', 'Tertiary'),
      token('text-on-dark', 'On Dark'),
      token('text-on-dark-muted', 'On Dark Muted'),
      token('text-on-dark-subtle', 'On Dark Subtle'),
      token('text-on-accent', 'On Accent'),
    ],
  },
  {
    group: 'Border',
    tokens: [
      token('border-default', 'Default'),
      token('border-strong', 'Strong'),
      token('border-subtle', 'Subtle'),
    ],
  },
  {
    group: 'Status',
    tokens: [
      token('status-success', 'Success'),
      token('status-success-text', 'Success Text'),
      token('status-success-soft', 'Success Soft'),
      token('status-warning', 'Warning'),
      token('status-warning-text', 'Warning Text'),
      token('status-warning-soft', 'Warning Soft'),
      token('status-danger', 'Danger'),
      token('status-danger-text', 'Danger Text'),
      token('status-danger-soft', 'Danger Soft'),
    ],
  },
  {
    group: 'Category',
    tokens: [
      token('category-1-coral', '1 Coral'),
      token('category-2-orange', '2 Orange'),
      token('category-3-yellow', '3 Yellow'),
      token('category-4-green', '4 Green'),
      token('category-5-teal', '5 Teal'),
      token('category-6-blue', '6 Blue'),
      token('category-7-violet', '7 Violet'),
      token('category-8-pink', '8 Pink'),
    ],
  },
];

// The Figma style name, its utility class, and the spec as the Figma page
// records it. The specimen is rendered with the utility itself, so the sample
// and the spec label cannot disagree without it being visible.
export const TYPE_STYLES: { label: string; utility: string; spec: string }[] = [
  {
    label: 'Display/XXL',
    utility: 'text-display-xxl',
    spec: 'Plus Jakarta Sans ExtraBold · 64 / -3%',
  },
  {
    label: 'Display/XL',
    utility: 'text-display-xl',
    spec: 'Plus Jakarta Sans ExtraBold · 44 / -2.5%',
  },
  { label: 'Display/L', utility: 'text-display-l', spec: 'Plus Jakarta Sans Bold · 32 / -2%' },
  { label: 'Display/M', utility: 'text-display-m', spec: 'Plus Jakarta Sans Bold · 26 / -2%' },
  { label: 'Display/S', utility: 'text-display-s', spec: 'Plus Jakarta Sans Bold · 22 / -1.5%' },
  { label: 'Heading/L', utility: 'text-heading-l', spec: 'Plus Jakarta Sans Bold · 18' },
  { label: 'Heading/M', utility: 'text-heading-m', spec: 'Plus Jakarta Sans SemiBold · 16' },
  { label: 'Brand/Wordmark', utility: 'text-wordmark', spec: 'Plus Jakarta Sans Bold · 19' },
  { label: 'Strong/L', utility: 'text-strong-l', spec: 'Inter Semi Bold · 15' },
  { label: 'Strong/M', utility: 'text-strong-m', spec: 'Inter Semi Bold · 14' },
  { label: 'Strong/S', utility: 'text-strong-s', spec: 'Inter Semi Bold · 13' },
  { label: 'Label/L', utility: 'text-label-l', spec: 'Inter Medium · 14' },
  { label: 'Label/M', utility: 'text-label-m', spec: 'Inter Medium · 13' },
  { label: 'Label/S', utility: 'text-label-s', spec: 'Inter Medium · 12' },
  { label: 'Overline', utility: 'text-overline', spec: 'Inter Medium · 11 / 6%' },
  { label: 'Body/L', utility: 'text-body-l', spec: 'Inter Regular · 15 / 155%' },
  { label: 'Body/M', utility: 'text-body-m', spec: 'Inter Regular · 14' },
  { label: 'Body/S', utility: 'text-body-s', spec: 'Inter Regular · 13' },
  { label: 'Caption', utility: 'text-caption', spec: 'Inter Regular · 11.5' },
];

// The Figma Space scale against the Tailwind utility that produces it. `bar` is
// the width utility used to draw the swatch, so each row demonstrates the
// mapping rather than asserting it: if Space/16 did not equal p-4, the 16px bar
// would visibly be the wrong length.
export const SPACING_SCALE: { label: string; px: number; utility: string; bar: string }[] = [
  { label: 'Space/2', px: 2, utility: 'p-0.5 · gap-0.5', bar: 'w-0.5' },
  { label: 'Space/4', px: 4, utility: 'p-1 · gap-1', bar: 'w-1' },
  { label: 'Space/8', px: 8, utility: 'p-2 · gap-2', bar: 'w-2' },
  { label: 'Space/12', px: 12, utility: 'p-3 · gap-3', bar: 'w-3' },
  { label: 'Space/16', px: 16, utility: 'p-4 · gap-4', bar: 'w-4' },
  { label: 'Space/20', px: 20, utility: 'p-5 · gap-5', bar: 'w-5' },
  { label: 'Space/24', px: 24, utility: 'p-6 · gap-6', bar: 'w-6' },
  { label: 'Space/32', px: 32, utility: 'p-8 · gap-8', bar: 'w-8' },
  { label: 'Space/40', px: 40, utility: 'p-10 · gap-10', bar: 'w-10' },
  { label: 'Space/48', px: 48, utility: 'p-12 · gap-12', bar: 'w-12' },
  { label: 'Space/64', px: 64, utility: 'p-16 · gap-16', bar: 'w-16' },
];

// Radius/Full is Tailwind's built-in rounded-full rather than a token: the
// compiler hardcodes it to calc(infinity * 1px) and ignores any --radius-full
// declaration.
export const RADIUS_SCALE: { label: string; utility: string; value: string }[] = [
  { label: 'Radius/SM', utility: 'rounded-sm', value: '8 px' },
  { label: 'Radius/MD', utility: 'rounded-md', value: '12 px' },
  { label: 'Radius/LG', utility: 'rounded-lg', value: '16 px' },
  { label: 'Radius/XL', utility: 'rounded-xl', value: '20 px' },
  { label: 'Radius/Full', utility: 'rounded-full', value: '999 (pill)' },
];
