// Tag / Status (Figma "Components", node 13:18).
//
// A status pill in five tones. The label is required rather than optional
// because status must never be carried by colour alone: every chip in the
// design spells out its state ("On track", "Near", "Full", "Over", "79% used").

export type TagTone = 'neutral' | 'green' | 'amber' | 'red' | 'indigo';

/**
 * Tone to utilities. Split into pill and dot so each line stays inside
 * Prettier's 100 columns and stays readable in a diff.
 *
 * The class strings are spelled out in full on purpose - see the note in
 * categoryColour.ts about Tailwind's scanner. utilities.test.ts
 * compiles every one of these to prove it generates CSS.
 *
 * Indigo's label is `brand-accent-pressed`, not `brand-accent`. That reads like
 * a copy-paste slip and is not: it is what the Figma variable is bound to, and
 * the lighter accent would not hold contrast on `brand-accent-soft`.
 */
export const TAG_TONES: Record<TagTone, { pill: string; dot: string }> = {
  neutral: { pill: 'bg-surface-muted text-text-secondary', dot: 'bg-text-tertiary' },
  green: { pill: 'bg-status-success-soft text-status-success-text', dot: 'bg-status-success' },
  amber: { pill: 'bg-status-warning-soft text-status-warning-text', dot: 'bg-status-warning' },
  red: { pill: 'bg-status-danger-soft text-status-danger-text', dot: 'bg-status-danger' },
  indigo: { pill: 'bg-brand-accent-soft text-brand-accent-pressed', dot: 'bg-brand-accent' },
};

type TagProps = {
  /** The status text. Required: colour alone is not an accessible signal. */
  label: string;
  tone?: TagTone;
  /** Figma's "Dot" property. On by default, matching the component defaults. */
  dot?: boolean;
};

export function Tag({ label, tone = 'neutral', dot = true }: TagProps) {
  const { pill, dot: dotFill } = TAG_TONES[tone];

  return (
    // `inline-flex`, not `flex`. Figma auto-layout hugs its contents, which is
    // inline-flex behaviour; a block-level pill would stretch to fill any
    // non-flex parent.
    //
    // Deliberately not role="status". The Figma name invites it, but that role
    // is an aria-live region, so all eight category chips plus the budget chip
    // would announce themselves on every dashboard render. A screen that
    // genuinely live-updates a chip should wrap it, not change this.
    <span
      className={`text-label-s inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${pill}`}
    >
      {dot ? (
        <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${dotFill}`} />
      ) : null}
      {label}
    </span>
  );
}
