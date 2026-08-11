import { authorizedGet, type AuthorizedResult } from '@/lib/session';
import type { components } from '@/types/api';

// The colours and icons a category may be given, as the admin currently has them configured.
//
// **A separate module from `lib/categoryTemplates.ts` beside it, mirroring a split the backend
// argues for by name.** Both read `/api/templates/*` and it is tempting to fold them together;
// `TemplatesController` explains why not. `GET /api/templates/categories` is `@Public()`, because
// onboarding step 2 runs before an account exists, so that module calls the backend with a bare
// `fetch` and degrades to `[]`. `GET /api/templates/palette` is guarded, because the picker is
// inside the signed-in app - so this one goes through `authorizedGet` and classifies its failures.
// Two different guards and two different failure policies in one module named after the public one
// is how the next reader stops noticing the difference.
//
// **The response is passed through whole rather than projected**, which is the opposite of
// `lib/categories.ts` and for a reason that file's own comment supplies: it narrows because
// `GET /api/categories` answers a cap, a spend, a percentage and a status that an option list has
// no use for, and none of that belongs in a browser bundle. `PaletteResponseDto` is already exactly
// two label-carrying lists, so there is nothing here to leave behind and a `Pick` would only be a
// second place to restate the shape.
//
// **The failure policy stays with the caller**, the rule `lib/categories.ts` follows and
// `app/(app)/transactions/page.tsx` is the worked example of. It matters more than usual here:
// `transactions/categories/page.tsx` already applies a 401-versus-everything-else policy to the
// categories read, and that read is the content of the screen while this one only fills a picker -
// so the two want different answers, and a policy baked in here would force them to agree.

/** What `GET /api/templates/palette` answers. Read from the contract, never restated. */
export type Palette = components['schemas']['PaletteResponseDto'];

/**
 * One colour the picker offers: the `token` to send and the `label` to show beside it.
 *
 * The label is the whole reason the endpoint exists rather than the frontend deriving a word from
 * the token - "Accent Content" is not a colour anybody picks - and it is the admin's to rename,
 * which is why it is a column rather than a function.
 */
export type PaletteColour = components['schemas']['PaletteColourDto'];

/** One icon the picker offers: the lucide `name` to send and the `label` to show. */
export type PaletteIcon = components['schemas']['PaletteIconDto'];

/**
 * The picker's two lists, or why they could not be read.
 *
 * `AuthorizedResult` reused rather than a union of its own, which is `CategoryOptionsResult`'s call
 * and the same argument: the failures are exactly `authorizedGet`'s, and nothing here can add a
 * third. Note the helper's `missing` arm is unreachable for this path - the route takes no
 * parameters and answers no 404 - so a caller has nothing to do about it beyond whatever it already
 * does for `unavailable`.
 */
export type PaletteResult = AuthorizedResult<Palette>;

/** How long the palette read may take before the caller is handed a failure instead. */
const PALETTE_TIMEOUT_MS = 2_000;

/**
 * Reads what a category may be painted and marked with.
 *
 * **Both lists are rendered in the order returned rather than sorted here.** The DTO documents them
 * as "In admin order", which is `colour_templates.sort_order` and `icon_templates.sort_order` - so
 * re-sorting would be a second authority on a question the admin already answered, and the same
 * mistake `readCategoryOptions` declines to make about the backend's name ordering.
 *
 * **What comes back is `enabled` rows only, and that is presentation rather than validation.** It
 * can be a strict subset of what `POST /api/categories` accepts: `@IsIn` checks the code-side
 * allowlist and never the flag, so a category already carrying a since-disabled colour keeps
 * saving and keeps rendering. A caller must therefore not treat this list as the set of legal
 * values - only as the set worth offering.
 *
 * **No count is promised and none should be assumed.** As seeded it is 16 colours and 64 icons, and
 * the icon half was 13 until PET-65; nothing in the frontend writes either number down, which is
 * precisely what let that change land without touching this file.
 *
 * **It is the one read in the app with a timeout, and the reason is where it is awaited.**
 * `transactions/categories/page.tsx` reads it inside the `Promise.all` its two real reads already
 * share, so the page renders when the *slowest* of the three settles - and this is the only one of
 * the three whose failure the screen survives. Without a bound, a backend that hangs rather than
 * refusing holds back a card grid that was ready to draw, and holds it for as long as the socket
 * takes to die; with one, a slow palette degrades to exactly what a refused palette already
 * degrades to, which is `null` and a disabled picker saying why. The number is a ceiling rather
 * than an expectation - this endpoint reads two small central tables and answers in milliseconds -
 * so anything it fires on is already a failure by the time the user would notice.
 *
 * Do **not** copy the timeout to `readCategoriesView` or `readTransactionCount` beside it. Those
 * two are the content of the screen, so giving up on one early would replace a slow screen with an
 * error page rather than with a usable one.
 */
export async function readPalette(): Promise<PaletteResult> {
  return authorizedGet<Palette>('/api/templates/palette', { timeoutMs: PALETTE_TIMEOUT_MS });
}
