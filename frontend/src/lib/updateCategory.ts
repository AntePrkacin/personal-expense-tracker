'use server';

import { authorizedPatch } from '@/lib/session';
import type { components } from '@/types/api';

// "Save changes" in the Edit category modal (CED-6): the app's **seventh authenticated write**, and
// the one that finishes the set - creating, editing and deleting a category are all built now.
//
// Everything structural about `lib/createCategory.ts` and `lib/updateTransaction.ts` applies here
// unchanged, so this comment records only what differs. A Server Action rather than a route handler,
// because the modal submits from a page it stays on. In `lib/` rather than beside the route, because
// `'use server'` makes *every* export of a module an action and an action must be an async function,
// so no module that also exports a type could host it - which is the reason `lib/createCategory.ts`
// predicted "PET-38's edit action will sit next to it rather than under a route", and here it is.
//
// **It takes the body the caller built rather than a whole category**, exactly as
// `updateTransaction` does, and for a related reason: the modal diffs the form against the row it
// opened on, so an unchanged Save sends nothing at all. Unlike that one, this function reads nothing
// out of the body - `PATCH /api/categories/:id` answers 404 for one thing only, so there is no
// ambiguous status to narrow.
//
// **It takes no token and no user id, and must never take either.** The credential comes off the
// httpOnly cookie inside `authorizedPatch`, so a caller can only ever write to their own account.

/** The request body, read off the contract rather than declared. Every field is optional. */
type UpdateCategoryBody = components['schemas']['UpdateCategoryDto'];

/**
 * What the modal needs to know, which is which message to show.
 *
 * **A result rather than a throw**, the rule `lib/backend.ts` states and every action here inherits:
 * an unhandled rejection inside a Server Action reaches the client as an opaque digest with nothing
 * a screen can render.
 *
 * **Five failures**, which is `updateTransaction`'s count reached by a different route -
 * that one splits an ambiguous 404 in two, and this one has a 409 the create does not.
 * `PATCH /api/categories/:id` documents 400, 401, 404 and 409:
 *
 * - **`invalid`** is a 400: our predicates and the DTO disagree. Reachable through every bound
 *   `categoryForm.ts` deliberately does not mirror - a name over 60 characters, a note over 500, a
 *   cap over `@Max(1_000_000_000)` - through a `color` or `icon` outside the allowlist, which the UI
 *   cannot produce but devtools can, and through a malformed id, which `ParseUUIDPipe` rejects. The
 *   id folds in here for `updateTransaction`'s reason: a bad id is not something the person holding
 *   the modal can act on, and the copy for a rejected value is the more useful of the two. It must
 *   say "check the values", never "try again", which for a body the DTO rejects loops forever.
 * - **`missing`** is a 404, and it means one thing: the category is gone. Unlike the transaction
 *   patch, whose body can reference a *second* resource by id, this body references nothing - it
 *   carries a name, a cap, a colour token, an icon name and a note - so there is no second reading
 *   to hedge against and the copy can say so plainly. Reached by editing a card another tab deleted,
 *   or one a `router.refresh()` has not caught up with.
 * - **`fallback`** is a 409, and it means exactly one thing: a rename of `Uncategorized`, whose name
 *   the backend fixes while leaving its cap, colour, icon and note editable. **The UI cannot reach
 *   it**, because `CategoryCard` renders no kebab and no banner on that card at all, so there is no
 *   way to open this modal for it. It is classified anyway, for the reason `lib/deleteCategory.ts`
 *   gives about its own 409: a hidden control is not an enforcement - a stale tab, a re-provisioning,
 *   a devtools-driven call - and the honest message for it is not "please try again", which would
 *   loop forever.
 * - **`unauthenticated`** is a 401: the session died with a half-edited form on screen. It
 *   deliberately does **not** redirect, for `createCategory`'s two reasons - a `redirect()` inside an
 *   action throws, so the modal's `await` would never resolve and Save would sit disabled forever,
 *   and it would discard every edit on a form the user could have saved by signing in again in
 *   another tab.
 * - **`failed`** is everything else, including the request that never completed. Gentler advice than
 *   the create's, for `updateTransaction`'s reason: a retried edit is idempotent, where a retried
 *   create makes a duplicate.
 *
 * `reason` strings rather than raw statuses, matching every action beside it, so no component ever
 * restates HTTP.
 */
export type UpdateCategoryResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'invalid' | 'missing' | 'fallback' | 'unauthenticated' | 'failed';
    };

/**
 * Changes one category, sending only the fields that changed.
 *
 * **The empty body never reaches here.** `PATCH /api/categories/:id` answers 400 for a body with no
 * keys, and `EditCategoryModal` closes without calling this at all when nothing changed - so that
 * 400 is unreachable by construction rather than handled, exactly as it is next door. Recorded
 * because the alternative reads like a missing case.
 *
 * **The response body is deliberately not read**, which is `createCategory`'s rule and holds for the
 * same reason: a 2xx means the change landed, so nothing below that line may turn a saved row into a
 * reported failure. The modal re-reads the screen through `router.refresh()`, which is what makes
 * the card, the summary and every other screen printing the name agree - a second source of truth
 * parsed out of this response could not.
 */
export async function updateCategory(
  id: string,
  body: UpdateCategoryBody,
): Promise<UpdateCategoryResult> {
  const result = await authorizedPatch(`/api/categories/${encodeURIComponent(id)}`, body);

  if (result.ok) {
    return { ok: true };
  }

  switch (result.status) {
    case 400:
      return { ok: false, reason: 'invalid' };
    case 401:
      return { ok: false, reason: 'unauthenticated' };
    case 404:
      return { ok: false, reason: 'missing' };
    case 409:
      return { ok: false, reason: 'fallback' };
    default:
      // Every other status, plus `undefined` for the request that never completed.
      return { ok: false, reason: 'failed' };
  }
}
