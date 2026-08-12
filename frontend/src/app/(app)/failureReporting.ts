// Where a write's failure gets reported: inline beside the form, or in the toast region.
//
// **The rule is per reason, not per call site**, and that is only possible because every write in
// this app already publishes a named failure taxonomy - three to five arms each, and
// `frontend/CLAUDE.md` explains why each count is what it is. PET-77's AC4 draws the line at "a
// reason no form field can carry", which those names already answer:
//
// - **Inline** is a reason the user can act on in the form in front of them. `invalid` is a body
//   they can fix, `categoryMissing` asks them to pick another, `missing` and `fallback` ask them to
//   close and see the current list, `taken` names the address that is in use, and every scan arm
//   that says "use photos, or a single PDF" is an instruction rather than a report. These keep the
//   `components/FormError.tsx` line they have always had - which is why that component survives
//   this ticket rather than being replaced by it.
// - **A toast** is a reason they cannot act on where they are. There is exactly one: `failed`.
//   Something broke, trying again is the whole of the advice, and it is equally true whether the
//   surface that produced it is still on screen.
//
// **`unauthenticated` was on that list for one commit, and a review took it off.** It looks like the
// same shape - the user cannot fix a dead session from a modal either - and it is not, because of
// what a toast *is*: an 8-second message whose dismiss control this app documents as inert while a
// modal is open. So a session that expired mid-edit announced itself once, over a dialog that stayed
// open with the edits intact and Save re-enabled, and then vanished; the next press produced another
// disappearing toast and the user never learned to log in. That was six surfaces - both transaction
// dialogs, both category modals, the Allocate modal and the chat. `SettingsForm` is the proof it was
// wrong: it kept `unauthenticated` inline all along, deliberately, because that arm is the one
// carrying a "Log in again" link, and it was the only screen where an expired session still said so
// afterwards. A notice a user must act on has to outlive a timer.
//
// **A `string` parameter rather than a union, and that is honest rather than lazy.** There is no
// single reason type to accept: twelve modules publish twelve unions, and what they share is two
// member *names*. Narrowing to a made-up union would mean asserting that every caller's arm is one
// of ours, which is the move `categoryForm.ts` refuses to make about colour tokens. Each call site
// still switches on its own union, so its own compiler check is untouched.
//
// Lifted into one module at the first consumer rather than the third, which is
// `(app)/useCategoryOptions.ts`'s exception to the rule of three and for the same reason: what is
// here is a decision, not markup, and twelve hand-written copies of a decision is how one of them
// quietly stops matching. `docs/plans/2026-08-11_PET-77_toast-notifications.md` carries the
// argument in full.

/**
 * The arms that leave the form and become a notification.
 *
 * Exported so a suite can state the rule rather than restate the strings, and so the list is
 * greppable from the twelve call sites that obey it.
 */
export const TOASTED_FAILURE_REASONS: readonly string[] = ['failed'];

/**
 * Whether this failure belongs in the toast region rather than beside the form.
 *
 * Read it at the call site as the question it is: "can the user do anything about this *here*?"
 */
export function isToastedFailure(reason: string): boolean {
  return TOASTED_FAILURE_REASONS.includes(reason);
}
