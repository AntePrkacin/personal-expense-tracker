'use server';

import { authorizedPost } from '@/lib/session';
import type { components } from '@/types/api';

// The budget-and-pay-day half of "Save changes" on the Settings page: the app's **ninth
// authenticated write**, and the first one that has a *date* attached to what it changes.
//
// Everything structural about `lib/updateProfile.ts` applies here unchanged, so this comment records
// only what differs - and the difference is the whole reason a second action exists rather than a
// wider body on the first.
//
// **`PATCH /api/profile` cannot express this write, and PET-72 is the ticket that proved it.** Both
// fields used to travel on that patch, which silently meant "and apply this to every period the
// account has ever had": raising the budget in 2026 re-priced every month of 2025. Neither is a
// property of the account, they are properties of a span of time, so a request setting one is
// incomplete without saying from when. `ChangeScheduleDto` requires `firstPaycheckDate` for exactly
// that reason, which is what makes the omission impossible rather than merely discouraged.
//
// **A POST rather than a PATCH, because it appends.** Two rows in the ordinary case - a
// `period_rules` row and a `budget_history` row - replacing nothing. It answers 200 rather than a
// POST's default 201, because it creates no resource a caller could then address: what comes back is
// the profile, exactly as `GET /api/profile` returns it.
//
// **It takes no token and no user id, and must never take either.** The credential comes off the
// httpOnly cookie inside `authorizedPost`, so a caller can only ever write to their own account.

/**
 * The request body, read off the contract rather than declared.
 *
 * **Every field is required**, unlike `UpdateProfileBody`'s all-optional diff. A schedule is a
 * complete statement: the body carries the budget *and* the pay day *and* the paycheck they start
 * from, even when only one of the first two moved. `settings/settingsForm.ts`'s
 * `toChangeScheduleBody` is what builds it, and it is the only caller.
 */
type ChangeScheduleBody = components['schemas']['ChangeScheduleDto'];

/**
 * What the Settings form needs to know, which is which message to show.
 *
 * **Three failures, one fewer than `updateProfile`'s four**, and the missing one is the 409: this
 * endpoint has no conflict case at all. Nothing here can collide with another account, and sending
 * the identical body twice converges rather than colliding - the rule insert is
 * `onConflictDoNothing` on the unique index and a duplicate budget row for one date resolves to the
 * newest, which is the same value.
 *
 * - **`invalid`** is a 400, and it is reachable two ways worth naming. `firstPaycheckDate` not
 *   falling on `monthStartDay` - which `toChangeScheduleBody` makes unreachable by assembling the
 *   date from the pay day the form holds, so it is a guard against a future caller rather than this
 *   one. And an anchor earlier than the account's first pay schedule, which the dialog's nine-month
 *   window cannot produce against a seed rule anchored a year back. The copy must say "check the
 *   values", never "try again": a body the DTO rejects is rejected again forever.
 * - **`unauthenticated`** is a 401, and it deliberately does **not** redirect, for
 *   `updateProfile`'s two reasons - a `redirect()` inside an action throws, so the form's `await`
 *   would never resolve and Save would sit disabled forever, and it would discard edits the user
 *   could still save by signing in again in another tab.
 * - **`failed`** is everything else, including the request that never completed. Gentle advice,
 *   because a retried schedule write converges.
 */
export type ChangeScheduleResult =
  { ok: true } | { ok: false; reason: 'invalid' | 'unauthenticated' | 'failed' };

/**
 * Sets the budget and pay day from a given paycheck, leaving earlier periods alone.
 *
 * **The response body is deliberately not read**, which is `updateProfile`'s rule and holds for the
 * same reason: a 2xx means the rows landed, so nothing below that line may turn a saved schedule
 * into a reported failure. The form re-reads through `router.refresh()`, which is what makes the
 * card, the sidebar footer and every period-scoped figure on the other screens agree.
 *
 * **This can be the second of two writes for one press, and it goes first.** When a save changes the
 * budget *and* the display name, `SettingsForm` sends this and the ordinary patch. There is no
 * transaction across them and there cannot be - they are different endpoints on different tables -
 * so the order is chosen for failure semantics: the schedule write is the one the user was asked a
 * question about, so it is the one that must not be skipped because an unrelated name change failed.
 */
export async function changeSchedule(body: ChangeScheduleBody): Promise<ChangeScheduleResult> {
  const result = await authorizedPost('/api/profile/schedule', body);

  if (result.ok) {
    return { ok: true };
  }

  switch (result.status) {
    case 400:
      return { ok: false, reason: 'invalid' };
    case 401:
      return { ok: false, reason: 'unauthenticated' };
    default:
      // Every other status, plus `undefined` for the request that never completed.
      return { ok: false, reason: 'failed' };
  }
}
