import Link from 'next/link';

// Button, on daisyUI's `btn` (PET-57 replaced the Figma-token styling; the
// Figma Components tile 12:14 still names the variants and their jobs).
//
// The action control for every screen and modal: "Get started", "Continue",
// "Add transaction" (primary), "Resend link", "Regenerate" (secondary), and
// "Delete" in both confirmation dialogs (danger). The two `text` variants are
// "Back" on the access screens and "Delete transaction" on 11 and 21.

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'text' | 'textDanger';

// Complete literal class strings, because Tailwind's scanner reads this file as
// raw text and an interpolated `btn-${variant}` compiles to nothing. The colour
// modifiers are semantic, not decoration: primary is the one emphasized action
// per screen, error marks destructive actions.
const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'btn btn-primary',
  secondary: 'btn',
  danger: 'btn btn-error',
  text: 'btn btn-ghost',
  textDanger: 'btn btn-ghost text-error',
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

type ButtonOwnProps = {
  /** The Figma "Label" property. Required: nothing in the design is icon-only. */
  label: string;
  variant?: ButtonVariant;
  /** A leading glyph, e.g. `<TrashGlyph />` on the delete text buttons. */
  icon?: React.ReactNode;
};

/**
 * An exclusive union: a Button either navigates or acts, never both.
 *
 * The `never`s are what make it exclusive, and they are load-bearing rather than
 * pedantic. An anchor has no `type` and no `disabled` - author styles cannot
 * disable a link, so `<Button href disabled>` would render something that looks
 * dimmed and still navigates - and a link that also ran a handler would need
 * 'use client' and has no counterpart anywhere in the design. Spelling the
 * conflict into the type makes `npm run build`, which is this repo's typecheck
 * gate, reject it rather than leaving it for review.
 */
type ButtonProps = ButtonOwnProps &
  (
    | {
        /**
         * Where a navigating action goes, e.g. "Get started" on 01 Welcome
         * (WEL-2). Figma draws these with its own Button component, so they are
         * this component's job rather than a second link-shaped one.
         */
        href: string;
        type?: never;
        disabled?: never;
        onClick?: never;
      }
    | {
        href?: never;
        /**
         * Defaults to `button`, not `submit`.
         *
         * HTML defaults a bare <button> to `submit`, so a "Cancel" inside a modal
         * form would post it. Opting in is the safer direction; the forms that
         * want a submit say so.
         */
        type?: 'button' | 'submit' | 'reset';
        /**
         * For in-flight actions: "Regenerate" reads "Generating..." while
         * insights run (15, assumption A26). daisyUI's own disabled treatment
         * carries the dimming the design never drew.
         */
        disabled?: boolean;
        onClick?: () => void;
      }
  );

export function Button({ label, variant = 'primary', icon, ...rest }: ButtonProps) {
  // No 'use client'. This has no state, and a client component that imports it
  // pulls it into the client bundle on its own. Only a Server Component trying
  // to pass `onClick` would break, which is a caller error either way.
  const className = BUTTON_VARIANTS[variant];

  // next/link rather than a bare <a>, matching the sidebar: it is what gives
  // client-side navigation and prefetching. A wrapped <button> would be the
  // alternative and is invalid HTML - <button> inside <a> is nested interactive
  // content - so the element itself has to change.
  if (rest.href !== undefined) {
    return (
      <Link href={rest.href} className={className}>
        {icon}
        {label}
      </Link>
    );
  }

  const { type = 'button', disabled, onClick } = rest;

  return (
    <button type={type} disabled={disabled} onClick={onClick} className={className}>
      {icon}
      {label}
    </button>
  );
}

// Exported so the delete actions can pass the designed glyph rather than
// redrawing it. It lives here, beside the only variant that uses it, instead of
// in an icon module that does not exist yet.
export { TrashGlyph };
