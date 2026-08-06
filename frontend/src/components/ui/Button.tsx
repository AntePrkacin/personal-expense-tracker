import Link from 'next/link';

// Button, on daisyUI's `btn` (PET-57 replaced the Figma-token styling; the
// Figma Components tile 12:14 still names the variants and their jobs).
//
// The action control for every screen and modal: "Get started", "Continue",
// "Add transaction" (primary), "Resend link", "Regenerate" (secondary), and
// "Delete" in both confirmation dialogs (danger). The two `text` variants are
// "Back" on the access screens and "Delete transaction" on 11 and 21.

export type ButtonVariant =
  'primary' | 'secondary' | 'danger' | 'dangerSoft' | 'text' | 'textDanger';

// Complete literal class strings, because Tailwind's scanner reads this file as
// raw text and an interpolated `btn-${variant}` compiles to nothing. The colour
// modifiers are semantic, not decoration: primary is the one emphasized action
// per screen, error marks destructive actions.
//
// `dangerSoft` is PET-34's, and it is an emphasis distinction rather than a
// second red. `danger` is the solid fill both delete confirmations use, where
// Delete is the dialog's own primary action; frame 08 draws Delete in the page
// header beside Edit, where a solid fill would make the destructive action the
// loudest thing on a screen whose main job is reading. `btn-soft` is a style
// modifier and `btn-error` a colour one, which is the pairing frontend/CLAUDE.md
// records as supported - two *style* modifiers is the mistake, and the reason
// `btn-ghost btn-outline` draws no border.
const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'btn btn-primary',
  secondary: 'btn',
  danger: 'btn btn-error',
  dangerSoft: 'btn btn-soft btn-error',
  text: 'btn btn-ghost',
  textDanger: 'btn btn-ghost text-error',
};

type ButtonOwnProps = {
  /** The Figma "Label" property. Required: nothing in the design is icon-only. */
  label: string;
  variant?: ButtonVariant;
  /** A leading glyph, e.g. lucide's `<Trash2 />` on the delete text buttons. */
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

// **`TrashGlyph` used to be exported from here and is gone.** It existed so the delete
// actions could pass the designed mark rather than redrawing it, which is exactly the job
// an icon library does - `lucide-react` arrived with PET-33, so a call site passes
// `icon={<Trash2 className="size-4" aria-hidden="true" />}` and this file needs no icon
// vocabulary of its own. Keeping it would have left two different drawings of a bin one
// click apart, since the delete confirmation already uses lucide's.
