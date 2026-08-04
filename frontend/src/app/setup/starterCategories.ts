import { type CategoryColour } from '@/components/ui/categoryColour';
import type { components } from '@/types/api';

// The ten starter chips onboarding offers on screen 03 (CAT-2), paired with the
// Foundations colour each one's dot carries.
//
// **The names are not this file's to invent.** The backend validates them with
// `@IsIn(STARTER_CATEGORY_NAMES)` and seeds the picked ones at verification, and
// the swagger plugin publishes that as a real `enum`, so the generated contract
// already carries the ten as a literal union. `StarterCategoryName` reads it out
// of there rather than restating it, which is the rule docs/agents/api-contract.md
// sets for every caller: the backend is the source of truth and nothing repeats
// it. This is the frontend's first consumer of that file, and a type-only one -
// nothing here fetches, and no request or response shape changes, so `api:sync`
// is not involved.
//
// The colours cannot come from the same place, because the backend publishes names
// only. They are the real ones, read per chip from the design's own variable
// bindings (node 43:705) rather than eyeballed from a render, and expressed as
// `CategoryColour` keys so no hex value enters the frontend at all.

/**
 * One of the ten names the API accepts, read out of the generated contract.
 *
 * Exported because it is what `SetupDraft.categories` is typed as, which is what
 * lets PET-11 hand the draft's array straight to the register body with no cast.
 */
export type StarterCategoryName = components['schemas']['RegisterDto']['categories'][number];

export type StarterCategory = { name: StarterCategoryName; colour: CategoryColour };

/**
 * The ten chips, in the order frame 03 draws them.
 *
 * **The order is part of the contract**, which is what the backend's own
 * `starter-categories.ts` says about it: the frontend renders them as given rather
 * than sorting. It is also the order a selection is stored in, so that two equal
 * selections are equal strings - see `readCategories` in `draft.ts`.
 *
 * Note the palette has eight colours for ten chips, so **two repeat**:
 * Subscriptions reuses Transport's blue and Other reuses Bills' orange. That is
 * what the design does, not a slip here - do not "fix" it by inventing two more
 * colours. It does mean colour alone cannot identify a chip, which is one of the
 * reasons the dot is `aria-hidden` and the name is always spelled out.
 *
 * A7 records a known conflict in the designs: this set contains Bills and
 * Subscriptions, which never appear again, while the later category screens show
 * Health and Other as active. Each screen follows its own mock until the designer
 * resolves it, so all ten are offered here.
 *
 * `as const satisfies` rather than a type annotation: the annotation would widen
 * every `name` to the union and this file would stop being able to prove it offers
 * all ten.
 */
export const STARTER_CATEGORIES = [
  { name: 'Groceries', colour: 'green' },
  { name: 'Dining out', colour: 'coral' },
  { name: 'Transport', colour: 'blue' },
  { name: 'Shopping', colour: 'yellow' },
  { name: 'Housing', colour: 'teal' },
  { name: 'Health', colour: 'pink' },
  { name: 'Entertainment', colour: 'violet' },
  { name: 'Bills', colour: 'orange' },
  { name: 'Subscriptions', colour: 'blue' },
  { name: 'Other', colour: 'orange' },
] as const satisfies readonly StarterCategory[];

/** Just the names, derived rather than repeated, so the two cannot drift. */
export const STARTER_CATEGORY_NAMES: readonly StarterCategoryName[] = STARTER_CATEGORIES.map(
  (category) => category.name,
);

/**
 * A compile-time proof that every name the contract accepts is offered as a chip.
 *
 * `AssertNever` fails to instantiate when its argument is anything but `never`, so
 * a name added to the backend's list and absent from the array above breaks
 * `npm run build` - the typecheck gate - rather than shipping a chip nobody can
 * pick. The reverse direction needs no guard: `satisfies` already rejects a name
 * the contract does not accept.
 *
 * Exported so it is not an unused local. There is nothing to call and nothing to
 * read; the declaration itself is the assertion.
 */
type AssertNever<T extends never> = T;

export type EveryStarterCategoryIsOffered = AssertNever<
  Exclude<StarterCategoryName, (typeof STARTER_CATEGORIES)[number]['name']>
>;
