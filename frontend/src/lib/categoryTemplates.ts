import type { components } from '@/types/api';

// The starter chips onboarding step 2 draws (CAT-2), read from the API.
//
// **This is the app's first unauthenticated read, and that is the whole reason it
// is here rather than in `lib/session.ts`.** Every other read goes through
// `authorizedGet`, which lifts the session cookie into a bearer token; step 2
// runs before an account exists, so there is no cookie to lift and no session to
// classify a 401 against. `GET /api/templates/categories` is `@Public()` for
// exactly that reason - the fifth and only public route that is not part of
// getting a credential.
//
// **The list used to be a constant, and losing that costs something worth
// naming.** `app/setup/starterCategories.ts` read a literal union out of
// `RegisterDto.categories` and carried an `AssertNever<Exclude<...>>` alias that
// failed `npm run build` if the backend ever accepted a name this screen did not
// offer. The chips are admin-managed data now, so there is no union to publish
// and no compile-time proof to keep: the screen renders whatever central holds.
// What replaces the guarantee is that the ids come from the same endpoint the
// registration validates them against, so the two cannot disagree by
// construction.
//
// **And onboarding became network-dependent, on a screen A29 designs no error
// state for.** Step 2 could not fail before. It can now, before the user has an
// account. `docs/TODO.md` records the copy that owes a designer's sign-off.

/** One chip. Read from the contract, never restated. */
export type CategoryTemplate = components['schemas']['CategoryTemplateDto'];

type CategoryTemplatesResponse = components['schemas']['CategoryTemplatesResponseDto'];

/**
 * The chips, or an empty list if they could not be read.
 *
 * **It degrades rather than throwing, which is the opposite of what
 * `lib/transactions.ts` does, and the difference is what the user loses.** That
 * read is the whole content of its screen, so an error boundary a reload retries
 * is better than a blank table. This one is a *selection* on a step whose
 * Continue is unconditional (A4 enforces no minimum): with no chips the user
 * picks nothing, continues, and lands on an account with just the fallback -
 * which is a state the backend already supports and the flow already handles.
 * Replacing the whole onboarding flow with an error page, on the one screen with
 * no session to recover, is the worse trade.
 *
 * `cache: 'no-store'` because an admin's edit has to show on the next load; the
 * list is small and the request is one per visit to step 2.
 */
export async function readCategoryTemplates(): Promise<CategoryTemplate[]> {
  try {
    const response = await fetch(`${process.env.BACKEND_URL}/api/templates/categories`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      return [];
    }

    const body = (await response.json()) as CategoryTemplatesResponse;

    // The shape is guaranteed by the contract, not by this check - what it
    // guards is a 200 carrying something else entirely, which is what a proxy
    // or a login page in front of the backend would produce.
    return Array.isArray(body?.categories) ? body.categories : [];
  } catch {
    // Backend unreachable, DNS, a dropped connection, or a body that will not
    // parse. See the note above for why none of those replaces the screen.
    return [];
  }
}
