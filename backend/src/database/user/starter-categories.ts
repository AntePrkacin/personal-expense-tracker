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
 * Its colour is `warning-content` and its icon `circle-question-mark`, from the
 * same allowlist every other category draws from. **That reverses what this file
 * used to say**: the old `#98A0AE` was the retired token layer's
 * `--color-text-tertiary`, and this file's note that it was "not from the
 * eight-color category palette" and must not be "fixed" to one stopped being
 * true when the palette became the daisyUI tokens. There is no off-palette
 * neutral to reach for any more, and `warning-content` is a real theme colour
 * that reads as muted next to the saturated ones in both themes.
 *
 * It has no template to take a description from, so its `note` is written here.
 */
export const FALLBACK_CATEGORY = {
  name: 'Uncategorized',
  color: 'warning-content',
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
