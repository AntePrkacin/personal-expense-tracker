'use server';

import { authorizedPatch } from '@/lib/session';
import type { components } from '@/types/api';

// "Save changes" on the Settings page (SET-5): the app's **eighth authenticated write**, and the
// first one outside transactions and categories. It is what empties `frontend/CLAUDE.md`'s
// "Every **profile** write is still unbuilt" clause.
//
// Everything structural about `lib/updateCategory.ts` applies here unchanged, so this comment
// records only what differs. A Server Action rather than a route handler, because the form submits
// from a page it stays on. In `lib/` rather than beside the route, because `'use server'` makes
// *every* export of a module an action and an action must be an async function, so no module that
// also exports a type could host it.
//
// **It takes one argument, not two, and that is the visible shape of the endpoint's own rule.**
// `PATCH /api/profile` carries no id anywhere in its path or its signature: the resource is always
// the session's own, so cross-user access is structural rather than policed. `updateCategory` and
// `updateTransaction` both lead with an id and this deliberately does not.
//
// **It takes no token and no user id, and must never take either.** The credential comes off the
// httpOnly cookie inside `authorizedPatch`, so a caller can only ever write to their own account.

/**
 * The request body, read off the contract rather than declared. Every field is optional, and
 * **none of them accepts `null`** - `UpdateProfileDto` carries `@ValidateIf((_, v) => v !== undefined)`
 * on all six and `@IsOptional()` on none, because every column behind it is NOT NULL. The diff that
 * builds this body is `settings/settingsForm.ts`'s, and it never emits one.
 */
type UpdateProfileBody = components['schemas']['UpdateProfileDto'];

/**
 * What the Settings form needs to know, which is which message to show.
 *
 * **A result rather than a throw**, the rule `lib/backend.ts` states and every action here inherits:
 * an unhandled rejection inside a Server Action reaches the client as an opaque digest with nothing
 * a screen can render.
 *
 * **Four failures**, one fewer than either category patch, because `PATCH /api/profile` documents
 * 400, 401 and 409 and deliberately no 404:
 *
 * - **`invalid`** is a 400: our predicates and the DTO disagree. Reachable two ways by
 *   construction. A name past `@MaxLength(100)`, which `settingsForm.ts` deliberately does not
 *   mirror, on `categoryForm.isNameValid`'s reasoning about `@MaxLength(60)`. And an address
 *   `lib/email.ts` accepts and validator.js's `@IsEmail()` refuses, which that module documents as
 *   the accepted price of not shipping a validation dependency for one field. The copy must say
 *   "check the values", never "try again", which for a body the DTO rejects loops forever.
 * - **`taken`** is a 409, and it is **the first 409 in this app the UI can actually reach**.
 *   `updateCategory`'s `fallback` and `deleteCategory`'s are both classified-but-unreachable,
 *   sitting behind a control that is not drawn; this one is the ordinary case of two accounts
 *   wanting one address. So its copy names the cause rather than hedging - an authenticated form
 *   cannot tell a typo from a taken address unless it is told, which is why the backend discloses
 *   it here while the public auth routes answer identical 202s to defeat enumeration
 *   (`backend/CLAUDE.md`, Profile and preferences). The copy must not imply the holder can be
 *   identified.
 * - **`unauthenticated`** is a 401: the session died with a half-edited form on screen. It
 *   deliberately does **not** redirect, for `createCategory`'s two reasons - a `redirect()` inside
 *   an action throws, so the form's `await` would never resolve and Save would sit disabled
 *   forever, and it would discard edits the user could still save by signing in again in another
 *   tab.
 * - **`failed`** is everything else, including the request that never completed. Gentle advice,
 *   because a retried patch is idempotent.
 *
 * **There is no `missing` arm, and that is a decision rather than an omission.** The endpoint takes
 * no id, so there is no resource to fail to find; a profile row that is absent is a broken
 * invariant the backend answers 500 for, deliberately not a 404, because a documented 404 would
 * invite a "create your profile" flow with nothing behind it.
 *
 * `reason` strings rather than raw statuses, matching every action beside it, so no component ever
 * restates HTTP.
 */
export type UpdateProfileResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'invalid' | 'taken' | 'unauthenticated' | 'failed';
    };

/**
 * Changes the signed-in user's profile, sending only the fields that changed.
 *
 * **The empty body never reaches here.** `PATCH /api/profile` answers 400 for a body with no keys -
 * `UpdateTransactionDto`'s reasoning, since a bare UPDATE would bump `updated_at` through
 * `$onUpdateFn` - and `SettingsForm` returns without calling this at all when the diff is empty. So
 * that 400 is unreachable by construction rather than handled. Recorded because the alternative
 * reads like a missing case.
 *
 * **A body carrying only the address the account already has is a 200, not that 400**, and the
 * caller does not have to know it: `settingsForm.ts` compares the address case-insensitively and
 * contributes no key when it matches, so the request is not made either way.
 *
 * **The response body is deliberately not read**, which is `createCategory`'s rule and holds for
 * the same reason: a 2xx means the change landed, so nothing below that line may turn a saved row
 * into a reported failure. The form re-reads through `router.refresh()`, which is what makes the
 * card and the sidebar footer agree - and the footer is AC5, so a second source of truth parsed out
 * of this response is precisely what must not exist.
 */
export async function updateProfile(body: UpdateProfileBody): Promise<UpdateProfileResult> {
  const result = await authorizedPatch('/api/profile', body);

  if (result.ok) {
    return { ok: true };
  }

  switch (result.status) {
    case 400:
      return { ok: false, reason: 'invalid' };
    case 401:
      return { ok: false, reason: 'unauthenticated' };
    case 409:
      return { ok: false, reason: 'taken' };
    default:
      // Every other status, plus `undefined` for the request that never completed.
      return { ok: false, reason: 'failed' };
  }
}
