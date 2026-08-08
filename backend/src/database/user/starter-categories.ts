import { newId } from '../../common/ids';
import type { ResolvedCategoryTemplate } from '../../templates/templates.service';
import type { UserDatabase } from '../database.types';
import { categories } from './schema';

/**
 * The fallback category, seeded for everybody and offered to nobody.
 *
 * **Deliberately not a `category_templates` row**, which is the same decision it
 * has always carried, restated against the new mechanism: that table is the
 * onboarding chip list, and this must never appear there. It is also deliberately
 * not one of the offered categories renamed - one row cannot be both a user's
 * free choice and a system invariant, and its name is what the API answers 409
 * for. A code constant is exactly right for a value that is not the admin's to
 * edit.
 *
 * Its colour is `base-content/50` and its icon `circle-question-mark`, from the
 * same allowlist every other category draws from. **That reverses what this file
 * used to say**: the old `#98A0AE` was the retired token layer's
 * `--color-text-tertiary`, and this file's note that it was "not from the
 * eight-color category palette" and must not be "fixed" to one stopped being
 * true when the palette became the daisyUI tokens.
 *
 * **It also reverses what PET-64 first shipped, which was `warning-content`, and
 * that correction is the point of this paragraph.** The claim written here and
 * in `backend/CLAUDE.md` was that it "reads as muted in both themes" and was
 * "visible against the card in both themes". Nobody measured it. It is
 * **1.713:1 against the dark card** - below the 1.16:1-rejected `base-300` in
 * spirit and nowhere near the 3:1 non-text bar this repo enforces by name
 * elsewhere.
 *
 * That matters more for this row than for any other, and PET-23 had already
 * worked out why: the backend's orphan fold routes spend whose category was
 * tombstoned onto this one, so it can hold the **largest donut slice on the
 * screen**, and its slice and its legend dot are bare colour with no glyph to
 * carry them. PET-23 measured `base-content/50` at 3.401:1 and 4.769:1 for
 * exactly this row and exactly this reason; PET-64 took it away without noticing
 * it was a measurement rather than a default, and this puts it back.
 *
 * `COLOUR_CONTRAST` in `central/template-tokens.ts` is why it is not simply
 * another semantic token: only `primary` and `secondary` clear 3:1 in both
 * themes, and both are saturated brand colours already carried by templates.
 * There is no muted semantic token that works, which is what the seventeenth
 * entry in the allowlist exists for.
 *
 * It has no template to take a description from, so its `note` is written here.
 */
export const FALLBACK_CATEGORY = {
  name: 'Uncategorized',
  color: 'base-content/50',
  icon: 'circle-question-mark',
  note: "Any transaction that doesn't have its own category.",
} as const;

/**
 * Creates the fallback category plus whichever starter categories the user
 * picked during onboarding.
 *
 * Called from verification, not from registration: the user database does not
 * exist until the email owner clicks their link.
 *
 * **The templates are resolved by the caller, in central, and copied here.**
 * That copy is the whole design: a category row belongs to one person from the
 * moment it is written, so an admin later editing a template does not - and must
 * not - reach back into it. Only new provisions pick up new wording.
 *
 * **The template's `description` becomes the user's `note`.** No new user-scope
 * column, which is what keeps this whole change free of a user-scope migration:
 * `note` already exists, is nullable, is editable through both category DTOs and
 * is returned by `CategoryResponseDto`, so a second free-text column would need
 * a stated difference and has none. The visible consequence is that `note` is no
 * longer empty on a fresh account - and that it surfaces on no screen yet
 * (CED-4, A42), so do not read a blank screen as a failed seed.
 *
 * **The fallback is inserted whether or not anything was picked.** Selecting no
 * chips is a valid choice (A4 enforces no minimum) and used to leave the table
 * empty; it no longer can, because every database needs the reassignment target
 * that deleting a category depends on. Note what that means for the caller's
 * skip condition: after provisioning, `categories` is never empty.
 *
 * @param picked the resolved templates, already ordered and already checked for
 * existence by `TemplatesService.resolve`. Order is `sort_order`, so a seeded
 * account's categories are in the canonical order rather than the click order.
 */
export async function seedStarterCategories(
  userDb: UserDatabase,
  picked: readonly ResolvedCategoryTemplate[],
): Promise<void> {
  // One INSERT, so the whole seed stays atomic and the caller's "any row exists"
  // skip condition keeps meaning "a previous attempt finished".
  await userDb.insert(categories).values([
    {
      id: newId(),
      name: FALLBACK_CATEGORY.name,
      color: FALLBACK_CATEGORY.color,
      icon: FALLBACK_CATEGORY.icon,
      note: FALLBACK_CATEGORY.note,
      isFallback: true,
    },
    ...picked.map((template) => ({
      id: newId(),
      name: template.name,
      color: template.color,
      icon: template.icon,
      note: template.description,
    })),
  ]);
}
