import { authorizedGet, type AuthorizedResult } from '@/lib/session';
import type { components } from '@/types/api';

// The category list, narrowed to what a picker needs.
//
// The Add transaction modal's Category select is the first thing in the app to read
// categories at all (ADD-2). `GET /api/categories` serves the whole Categories screen,
// so it answers far more than a select can use - a colour, an icon, a note, a cap, the
// month's spend, a percentage, a status - plus an `allocation` block about the budget.
// None of that belongs in a browser bundle for the sake of an option list, so this
// module is the narrowing.
//
// **It goes through `authorizedGet` and adds nothing to it.** That helper is the one
// place the session cookie becomes a bearer token, and `frontend/CLAUDE.md` says
// outright not to inline a fourth copy of it. So the cookie read, the header, the
// `cache: 'no-store'` and the 401-versus-everything-else classification are all
// inherited, and what is left here is a projection.
//
// **This one deliberately does not redirect**, which is the difference between it and
// `lib/transactions.ts` beside it. That module is read by a Server Component, where a
// `redirect()` is the right answer to a dead session. This one is read by a route
// handler answering a `fetch()` from the open modal, and a redirect there would hand
// the modal an HTML login page with a 200 on it - so the failure has to stay data. The
// handler turns it into a status and the modal into a message.
//
// Note `app/setup/draft.ts` has an unrelated private `readCategories`, over the ten
// *starter category names* onboarding offers. That one is a filter of a hard-coded list
// and touches no network; this one is the account's real categories. They share four
// letters and nothing else.

/** What `GET /api/categories` answers. Read from the contract, never restated. */
type CategoriesResponse = components['schemas']['CategoriesResponseDto'];

/**
 * One option in the Category select.
 *
 * `Pick` off the contract rather than a fresh shape, so the two fields keep the
 * backend's own types and a rename upstream is a typecheck away from being visible
 * here - the rule `docs/agents/api-contract.md` sets for every caller.
 *
 * **`isFallback` is deliberately not carried.** It exists so a form can preselect
 * "Uncategorized", which the contract's own doc says the transaction form does - and
 * this form does not, because a preselected category makes AC3's "missing category"
 * unreachable by construction. The select opens on a `Select…` placeholder instead.
 * Whoever implements PET-32's Edit modal, or reverses that decision, adds the field
 * back here.
 *
 * **PET-32 declined it, and the reason is that an edit form has nothing to preselect.**
 * Its select is prefilled with the row's own `categoryId`, which is a real category by
 * construction - so a flag naming the fallback would have arrived with no reader, which is
 * the same objection that kept `onDeleted` off `useDeleteTransaction().open` until a caller
 * existed. Both modals now share this projection unchanged.
 */
export type CategoryOption = Pick<components['schemas']['CategoryResponseDto'], 'id' | 'name'>;

/**
 * One category as the transactions table needs it (TRN-5).
 *
 * **A second projection rather than a widened `CategoryOption`**, and the difference is the
 * whole reason this file exists. The narrowing above is justified by keeping the cap, the
 * month's spend and the colour out of a browser bundle that only draws an option list -
 * widening it would put the colour into the Add transaction modal too, which has no use for
 * it. The table has the opposite need and the opposite delivery: it renders on the server,
 * and a row carries only a `categoryId`, so the name and the colour have to be joined onto
 * it from here.
 *
 * **`icon` joined the projection at PET-64, and `CategoryOption` deliberately did not.** The
 * table's tile drew `<ShoppingBag />` for every category - Figma's placeholder mark - and now
 * draws the category's own glyph, which is the identity channel the deliberately close colour
 * pairs in `ui/categoryColour.ts` lean on. The modal's `<select>` draws no tile and no glyph,
 * so widening the narrow projection too would put a field into a bundle with nothing to do
 * with it, which is exactly the trade this file exists to keep making.
 *
 * Still `Pick` off the contract rather than a fresh shape, for the reason above it: a rename
 * upstream is a typecheck away from being visible.
 */
export type CategoryLabel = Pick<
  components['schemas']['CategoryResponseDto'],
  'id' | 'name' | 'color' | 'icon'
>;

/**
 * The select's options, or why they could not be read.
 *
 * `AuthorizedResult` reused rather than a result type of its own: the two failures are
 * exactly `authorizedGet`'s two, and nothing here can add a third. Inventing a parallel
 * union would only mean mapping one onto the other for no new information.
 */
export type CategoryOptionsResult = AuthorizedResult<CategoryOption[]>;

export type CategoryLabelsResult = AuthorizedResult<CategoryLabel[]>;

/**
 * The one request, shared by all three exports.
 *
 * There is still exactly one `authorizedGet('/api/categories')` in this app, which is the
 * property the module comment above is about, and PET-36 did not add a second. What differs
 * between the exports is only which fields survive - and for `readCategoriesView`, that the
 * answer is "all of them", for the reason that function records.
 */
async function readCategories(period?: string): Promise<AuthorizedResult<CategoriesResponse>> {
  // The absent key is the current period, which is `lib/periods.ts`'s rule: one view has one URL, and
  // the URL meaning "now" is the one with nothing in it. The two narrowed projections below never pass
  // one - a picker's options and a table's labels are the same whichever period is on screen, and a
  // period would make the request uncacheable for nothing.
  const query = period === undefined ? '' : `?period=${period}`;

  return authorizedGet<CategoriesResponse>(`/api/categories${query}`);
}

/**
 * Reads the account's categories as select options.
 *
 * **The backend's order is preserved rather than re-sorted.** `CategoriesResponseDto`
 * documents the list as "Live categories, ordered by name", so sorting again here would
 * be a second authority on the same question - and a locale-aware sort in the browser
 * would disagree with SQLite's byte order on exactly the names that matter, the ones
 * with diacritics.
 */
export async function readCategoryOptions(): Promise<CategoryOptionsResult> {
  const result = await readCategories();

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    data: result.data.categories.map(({ id, name }) => ({ id, name })),
  };
}

/**
 * Reads the account's categories as the table's name-and-colour lookup.
 *
 * Same preserved order, same inherited failure classification, and the same deliberate
 * absence of a `redirect()` - the module comment gives that reason in full, and it holds
 * here even though this projection's only caller today *is* a Server Component that
 * redirects. The policy belongs at the call site rather than in the read, because the two
 * callers of this file answer a dead session differently and one of them cannot be handed
 * an HTML login page with a 200 on it.
 */
export async function readCategoryLabels(): Promise<CategoryLabelsResult> {
  const result = await readCategories();

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    data: result.data.categories.map(({ id, name, color, icon }) => ({
      id,
      name,
      color,
      icon,
    })),
  };
}

/**
 * One category with everything the Categories tab draws (PET-36, CTG-3, CTG-4).
 *
 * The whole DTO rather than a `Pick`, and that is the point rather than laziness: this screen
 * is the one the endpoint was shaped for, so a projection here would list every field the
 * response has and go stale the moment a fourteenth appeared.
 */
export type Category = components['schemas']['CategoryResponseDto'];

/** The budget against the sum of the caps, straight off the contract. */
export type Allocation = components['schemas']['AllocationResponseDto'];

export type CategoriesViewResult = AuthorizedResult<CategoriesResponse>;

/**
 * Reads the account's categories whole, for the Categories tab.
 *
 * **This is the third export over the one request, and it is the only one that narrows
 * nothing** - which cuts directly against the argument the module comment above makes, so it
 * is worth saying why it does not undermine it. That argument is not "projections are tidy",
 * it is that a cap and a month's spend must not reach a browser bundle drawing neither: the
 * Add transaction modal's `<select>` renders an option list, and shipping it eight numbers per
 * category to do that is waste with a privacy edge on it. The Categories tab draws **every one
 * of those fields**. The cap is on the card, the spend is on the card, the percentage is the
 * bar, the status is the chip, the count is the footer, the colour and icon are the tile. So
 * the narrowing has nothing left to remove here, and a `Pick` listing the whole DTO would be a
 * maintenance cost buying a guarantee that was already satisfied.
 *
 * **`allocation` is the half no existing projection could have carried**, which is the second
 * reason this is a new export rather than a widened one. It is not a field on a category at
 * all - it is the monthly budget beside the sum of every live cap - so neither
 * `CategoryOption` nor `CategoryLabel` had anywhere to put it, and widening either would have
 * pushed a budget figure into a modal and a table that have no use for one.
 *
 * Same inherited failure classification and the same deliberate absence of a `redirect()` as
 * the two above it; the module comment gives that reason in full and it is unchanged here. The
 * call site applies the policy, which for this screen is `/transactions`'s own: 401 to the
 * access flow, anything else thrown to the error boundary.
 */
export async function readCategoriesView(period?: string): Promise<CategoriesViewResult> {
  return readCategories(period);
}
