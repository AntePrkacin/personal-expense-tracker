// Button (Figma "Components", node 12:14).
//
// The action control for every screen and modal: "Get started", "Continue",
// "Add transaction", "Save changes" (primary), "Resend link", "Regenerate",
// "Manage" (secondary), and "Delete" in both confirmation dialogs (danger).
//
// The Components tile draws exactly three variants at exactly one size. The two
// `text` variants below have no tile: they are traced from the frames that use
// them, "Back" on 01/02/03/22/23 (node 42:724) and "Delete transaction" on 11
// and 21 (node 29:528). Diff the first three against the tile; diff the last two
// against those frames.

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'text' | 'textDanger';

/**
 * Variant to utilities, padding included.
 *
 * Padding is per variant rather than in the base string because the two text
 * variants have none horizontally - "Back" is a bare text node in Figma, and
 * "Delete transaction" carries only py 6 - while the three filled variants all
 * sit at px 20 / py 13.
 *
 * The class strings are spelled out in full on purpose: Tailwind's scanner reads
 * this file as raw text, so `bg-${variant}` would be found by nobody and compile
 * to nothing, with no build error. utilities.test.ts compiles every one of these
 * to prove it generates CSS.
 *
 * Primary's label is bound to `text-on-accent` and danger's to `text-on-dark`.
 * Both resolve to #FFFFFF, so this reads like an inconsistency and is not: it is
 * which Figma variable each one points at, and the two could diverge.
 */
export const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-accent text-text-on-accent px-5 py-3.25',
  secondary: 'bg-surface-card border-border-strong text-text-primary border px-5 py-3.25',
  danger: 'bg-status-danger text-text-on-dark px-5 py-3.25',
  text: 'text-text-tertiary py-1.5',
  textDanger: 'text-status-danger-text py-1.5',
};

/**
 * The trash glyph on "Delete transaction" / "Delete category", traced from the
 * Figma export (node 29:529) and re-pointed at `currentColor` so it inherits the
 * variant's text colour instead of hard-coding the red.
 *
 * The body rect is inset by 0.75 from the designed 9.5x10.5 box, and its radius
 * dropped by the same amount. Figma aligns a frame's stroke inside its box and
 * CSS draws a border inside too, but an SVG stroke is centred on its path, so
 * the designed geometry only survives if the path is pulled in by half the
 * 1.5 stroke width. Without it the glyph reads 1.5 too wide and its corners too
 * round.
 */
function TrashGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0" fill="none" aria-hidden="true">
      <rect x="6" y="1.6" width="4" height="1.7" rx="1" fill="currentColor" />
      <rect x="2" y="3.5" width="12" height="1.7" rx="1" fill="currentColor" />
      <rect x="4" y="6.25" width="8" height="9" rx="0.75" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

type ButtonProps = {
  /** The Figma "Label" property. Required: nothing in the design is icon-only. */
  label: string;
  variant?: ButtonVariant;
  /**
   * Defaults to `button`, not `submit`.
   *
   * HTML defaults a bare <button> to `submit`, so a "Cancel" inside a modal form
   * would post it. Opting in is the safer direction; the forms that want a
   * submit say so.
   */
  type?: 'button' | 'submit' | 'reset';
  /**
   * For in-flight actions: "Regenerate" reads "Generating..." while insights run
   * (15, assumption A26).
   *
   * Note that frame 15 draws that button identically to a resting secondary one -
   * no dimming, no spinner - so the `disabled:opacity-60` in the base string is
   * ours, not the design's. A control that looks enabled while it is not is a
   * defect, and the designer still owes an answer here.
   */
  disabled?: boolean;
  /** A leading glyph, e.g. `<TrashGlyph />` on the delete text buttons. */
  icon?: React.ReactNode;
  onClick?: () => void;
};

export function Button({
  label,
  variant = 'primary',
  type = 'button',
  disabled,
  icon,
  onClick,
}: ButtonProps) {
  return (
    // No 'use client'. This has no state, and a client component that imports it
    // pulls it into the client bundle on its own. Only a Server Component trying
    // to pass `onClick` would break, which is a caller error either way.
    //
    // The focus-visible outline is not in the design - no focus state is drawn
    // for buttons anywhere in the file - but a keyboard user needs one, and an
    // outline is the right tool because, unlike a border or a ring, it never
    // affects layout.
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`text-strong-m focus-visible:outline-brand-accent inline-flex items-center justify-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${BUTTON_VARIANTS[variant]}`}
    >
      {icon}
      {label}
    </button>
  );
}

// Exported so the delete actions can pass the designed glyph rather than
// redrawing it. It lives here, beside the only variant that uses it, instead of
// in an icon module that does not exist yet.
export { TrashGlyph };
