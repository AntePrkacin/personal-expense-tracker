'use server';

import { authorizedPost } from '@/lib/session';
import type { components } from '@/types/api';

// "Add category" (CED-5): the first write anywhere outside transactions.
//
// **A Server Action rather than a route handler**, the split `docs/agents/api-contract.md` sets: a
// handler is for when the browser *navigates to* the call, as `app/auth/verify/route.ts` does, and
// this is a form submitting from a page it stays on. It also keeps `BACKEND_URL` and the bearer
// token server-side without opening a POST endpoint on the frontend's own origin.
//
// **In `lib/` rather than beside the route, even though it has exactly one caller today.** That is
// the opposite of what the rule of three would suggest, and `lib/createTransaction.ts` records why
// the location is not really about consumer count: `'use server'` makes *every* export of a module
// a Server Action and an action must be an async function, so this cannot live in `lib/palette.ts`
// or any module that also exports a type-only helper it needs at build time. Given it needs a file
// of its own regardless, `lib/` beside its three siblings is where the next person looks - and
// PET-38's edit action will sit next to it rather than under a route.
//
// **It takes no token and no user id, and must never take either.** The credential comes off the
// httpOnly cookie inside `authorizedPost`, so a caller can only ever write to their own account,
// which is the whole reason publishing this as an action is safe.

/** The request body, read off the contract rather than declared. */
type CreateCategoryBody = components['schemas']['CreateCategoryDto'];

/**
 * What the modal needs to know, which is which message to show.
 *
 * **A result rather than a throw**, the rule `lib/backend.ts` states and every action here
 * inherits: an unhandled rejection inside a Server Action reaches the client as an opaque digest
 * with nothing a screen can render.
 *
 * **Three failures, where `createTransaction` has four and `updateTransaction` five**, and the
 * arithmetic is the endpoint's rather than a simplification. `POST /api/categories` documents 400
 * and 401 and nothing else:
 *
 * - **`invalid`** is a 400: our predicates and the DTO disagree. Reachable through every bound
 *   `(app)/transactions/categories/categoryForm.ts` deliberately does not mirror - a name over 60
 *   characters, a note over 500, a cap over `@Max(1_000_000_000)` - and through a `color` or `icon`
 *   outside the allowlist, which the UI cannot produce but devtools can. Its copy must say "check
 *   the values", never "try again", which for an unacceptable body loops forever.
 * - **`unauthenticated`** is a 401: the session died with a half-filled form on screen. It
 *   deliberately does not redirect, for the reason below.
 * - **`failed`** is everything else, including the request that never completed.
 *
 * **There is no `categoryMissing` arm and there must not be one.** The create endpoint references
 * nothing by id - the body carries a name, a colour token, an icon name and two optionals - so
 * there is no 404 to classify. It has no 409 either: unlike `PATCH`, which answers 409 for renaming
 * `Uncategorized`, and unlike `DELETE`, which answers 409 for deleting it, nothing about creating a
 * category collides with the fallback's invariants. **Nor is a duplicate name a 409**: the
 * `categories` table carries no unique index on `name`, `color` or `icon`, so two categories called
 * "Groceries" are accepted, deliberately. A future uniqueness rule would arrive here as a fourth
 * arm.
 */
export type CreateCategoryResult =
  { ok: true } | { ok: false; reason: 'invalid' | 'unauthenticated' | 'failed' };

/**
 * Creates one category.
 *
 * **A 401 answers rather than redirecting**, the same call `createTransaction` makes and for the
 * same two reasons: a `redirect()` inside an action throws, so `await create(body)` would never
 * resolve and the modal would sit disabled forever, and it would discard everything typed on a form
 * the user could have saved by signing in again in another tab.
 *
 * **The response body is deliberately not read.** A 2xx means the category exists, so nothing below
 * that line may turn a created row into a reported failure - the rule `authorizedPost` states from
 * the other side. The modal re-reads the screen through `router.refresh()` rather than consuming
 * the created `CategoryResponseDto`, which is also why this returns a bare `{ ok: true }`: the new
 * card has to come from the same list read as every other card, or the grid and the allocation
 * summary could disagree about what exists.
 */
export async function createCategory(body: CreateCategoryBody): Promise<CreateCategoryResult> {
  const result = await authorizedPost('/api/categories', body);

  if (result.ok) {
    return { ok: true };
  }

  switch (result.status) {
    case 400:
      return { ok: false, reason: 'invalid' };
    case 401:
      return { ok: false, reason: 'unauthenticated' };
    default:
      // Every other status, plus `undefined` for the request that never completed. One message
      // covers both, because there is nothing useful to say about the difference to somebody who
      // just wants a category for their gym membership.
      return { ok: false, reason: 'failed' };
  }
}
