'use server';

import { authorizedPatch } from '@/lib/session';
import type { components } from '@/types/api';

// "Save caps" in the Allocate budget modal: the app's **eighth authenticated write**, and its first
// bulk one. Everything structural about `lib/updateCategory.ts` applies unchanged, so this comment
// records only what differs.
//
// **It takes no id and interpolates no path.** One fixed collection route, which is what
// `authorizedPatch` asks of anything wrapping it - and unlike `updateCategory`, there is no
// `encodeURIComponent` here to get wrong, because nothing caller-supplied reaches the URL.
//
// **The body carries only the rows whose cap actually changed.** `allocateForm.ts`'s
// `toAllocateBody` does the diff, in cents, so retyping `250.00` over `250` is not a change and an
// untouched modal sends nothing at all - which the modal turns into a close with no request.

/** The request body, read off the contract rather than declared. */
type UpdateCategoryCapsBody = components['schemas']['UpdateCategoryCapsDto'];

/**
 * What the modal needs to know, which is which message to show.
 *
 * **Four failures rather than `updateCategory`'s five, and the missing one is the 409.** That
 * endpoint answers 409 for renaming the fallback; this one has no conflict case at all - the
 * fallback's cap is editable, no name is in play, and `backend/test/openapi.e2e-spec.ts` pins the
 * absence so it cannot quietly appear. `PATCH /api/categories` documents 400, 401 and 404:
 *
 * - **`invalid`** is a 400, and it is reachable through more than the usual devtools route here.
 *   Every bound `allocateForm.ts` deliberately does not mirror is one: a cap over
 *   `@Max(1_000_000_000)`, a third decimal, and the two array rules - an empty payload and a
 *   repeated id. The copy has to say "check the values" rather than "try again", which for a body
 *   the DTO rejects loops forever.
 * - **`missing`** is a 404, and on this endpoint it means something stronger than it does next
 *   door: **nothing was written**. The whole payload is refused when any id names no live
 *   category, so the identical body is safe to retry once the screen has caught up - which is why
 *   this is the one arm that refreshes while keeping the modal open.
 * - **`unauthenticated`** is a 401. It deliberately does not redirect, for `createCategory`'s two
 *   reasons: a `redirect()` inside an action throws, so the modal's `await` would never resolve
 *   and Save would sit disabled forever, and it would discard a screenful of edits the user could
 *   have saved by signing in again in another tab. That matters more here than on a single-field
 *   form, because a discarded draft is every cap the user just set rather than one.
 * - **`failed`** is everything else, including the request that never completed. A retry is
 *   idempotent - the same caps applied twice are the same caps - so the advice can be plain.
 */
export type UpdateCategoryCapsResult =
  { ok: true } | { ok: false; reason: 'invalid' | 'missing' | 'unauthenticated' | 'failed' };

/**
 * Sets every changed cap in one request, all of them or none.
 *
 * **The response body is deliberately not read**, which is `createCategory`'s rule and holds for
 * the same reason: a 2xx means the caps landed, so nothing below that line may turn a saved write
 * into a reported failure. This endpoint answers the whole `CategoriesResponseDto` and
 * `authorizedPatch` discards it, which is not an oversight - the modal re-reads through
 * `router.refresh()`, and that is what makes the cards, the summary card and every other screen
 * printing a cap agree. A second source of truth parsed out of this response could not.
 *
 * **The empty payload never reaches here.** `@ArrayNotEmpty` answers 400 for it, and the modal
 * closes without calling this at all when nothing changed - so that 400 is unreachable by
 * construction rather than handled, exactly as `updateCategory`'s empty body is.
 */
export async function updateCategoryCaps(
  body: UpdateCategoryCapsBody,
): Promise<UpdateCategoryCapsResult> {
  const result = await authorizedPatch('/api/categories', body);

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
    default:
      // Every other status, plus `undefined` for the request that never completed.
      return { ok: false, reason: 'failed' };
  }
}
