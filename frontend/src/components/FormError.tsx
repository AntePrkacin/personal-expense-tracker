// The form-level error line: one message, above the footer row, announced assertively.
//
// **Extracted on the repo's own rule of three, which had quietly reached four.** The same five
// tokens - `<p role="alert" className="text-error text-sm">` - were written out in
// `app/login/LoginForm.tsx`, `app/setup/register/RegisterForm.tsx` and twice in
// `app/(app)/AddTransactionModal.tsx`, each with its own paragraph of comment explaining the
// same `role="alert"` decision, and each rewritten independently by PET-57. `lib/session.ts`
// states the rule this file is the other side of: duplicated rather than shared until a third
// consumer appears, then lifted.
//
// **It is a `components/` direct child rather than a `ui/` primitive.** `ui/` mirrors the Figma
// Components page and is complete; this has no tile there, because A29 designs no form error
// surface at all - the treatment is ours. What earns it this folder is the same thing that
// earned `AccessCard` and `EmptyState` theirs: it is shared by route segments in different
// trees, here the access screens and the `(app)` modal.
//
// **Not daisyUI's `alert`.** That is a filled banner with an icon and a border, and no frame in
// the file draws one. This is the same `text-error text-sm` line `ui/FieldShell` gives a field,
// so a form speaks one error language rather than two.

type FormErrorProps = {
  /**
   * The message, or nothing.
   *
   * Nullable so a caller passes its state straight through rather than wrapping this in a
   * ternary - which is what the four call sites each did, and one of the two things being
   * duplicated. An absent message renders no element at all, deliberately: an empty live
   * region that is always mounted is a region a screen reader has to be told about for nothing,
   * and `(app)/pages.test.tsx` depends on a closed form contributing no text to the page.
   */
  message?: string | null;
};

/**
 * One line of form-level failure copy.
 *
 * **`role="alert"`, where the field components deliberately have none.** A field's message
 * appears synchronously beside the field the user just left, so the reader is already there;
 * this one appears after a network round trip with nothing else on screen changing, so nothing
 * else would tell a screen reader the submit failed. That is the whole of the difference, and
 * it is why this is assertive rather than the polite `role="status"` a success confirmation
 * takes - `components/ResendLink.tsx` is the one file that needs both and so keeps its own
 * switch rather than calling this.
 */
export function FormError({ message }: FormErrorProps) {
  if (message === null || message === undefined || message === '') {
    return null;
  }

  return (
    <p role="alert" className="text-error text-sm">
      {message}
    </p>
  );
}
