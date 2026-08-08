import { Logger } from '@nestjs/common';
import { like, sql } from 'drizzle-orm';
import type { ColourToken, IconName } from '../central/template-tokens';
import type { UserDatabase } from '../database.types';
import { categories } from './schema';
import { FALLBACK_CATEGORY } from './starter-categories';

/**
 * Rewrites the hex colours PET-64 stopped understanding into daisyUI tokens.
 *
 * **This is the data migration PET-64 shipped without, and the reason it is code
 * rather than SQL under `drizzle/user/`.** That ticket changed what
 * `categories.color` *means* - `#57B368` became `success` - and changed nothing
 * about the column, so `drizzle-kit generate` reports no changes and has nothing
 * to hang the rewrite off. Root `CLAUDE.md` forbids hand-writing a
 * `migration.sql` to carry it. The same constraint produced the same answer for
 * the template seed: run it programmatically, guarded, at the point the database
 * is opened. `UserDatabaseService.openUserDb` calls this straight after
 * `migrate()`, which is the user-scope equivalent of where `seedTemplates` sits.
 *
 * **What it costs to skip is invisible and permanent.** A category row is
 * written once, at verification, and nothing rewrites it - so an account
 * provisioned before PET-64 keeps its hexes forever. `categoryColour.ts` now
 * keys its maps on the contract's enum, and a hex is not in it, so every one of
 * those categories falls through to `CATEGORY_TILE_NEUTRAL`: a grey tile with no
 * glyph, on every screen, with the build, the lint, all 1910 frontend tests and
 * both e2e suites green, because every one of them constructs its own fixtures.
 * It was found by opening the app.
 *
 * **The mapping is not a re-design, it is what the old frontend was already
 * painting.** Pre-PET-64 `CATEGORY_COLOUR_BY_HEX` turned each seeded hex into
 * one of eight colour words and `CATEGORY_TILE` turned that word into a daisyUI
 * class - `#57B368` to `green` to `bg-success`. Composing those two maps is what
 * is written out below, so a migrated account renders in exactly the colours it
 * rendered in yesterday. Nothing here is a judgement call, which is the property
 * that makes an unattended rewrite of live data safe.
 *
 * Note `orange` and `yellow` both landed on `warning` in that second map, so
 * `#F29A3D` and `#E7C24A` converge here too. That is a loss the *old* code
 * already had - the two were painted identically - rather than one this
 * introduces.
 */

const HEX_TO_TOKEN: Record<string, ColourToken> = {
  // The eight Figma category colours, via the colour word each used to resolve
  // to. The trailing comment is that word.
  '#EF6F6C': 'error', // coral
  '#F29A3D': 'warning', // orange
  '#E7C24A': 'warning', // yellow
  '#57B368': 'success', // green
  '#34B9AE': 'accent', // teal
  '#3F8EE6': 'info', // blue
  '#8A79F1': 'primary', // violet
  '#CE6FB8': 'secondary', // pink

  // The fallback's own grey, the retired token layer's `--color-text-tertiary`.
  // It maps to whatever `FALLBACK_CATEGORY` carries today rather than to a
  // literal, so the two cannot drift - a migrated `Uncategorized` and a freshly
  // seeded one must be the same colour.
  '#98A0AE': FALLBACK_CATEGORY.color,
};

/**
 * A glyph for a pre-PET-64 category, by the name the old seed gave it.
 *
 * `categories.icon` was never written before PET-64 - the old starter list
 * carried no icons at all - so every one of these rows is `NULL` and every tile
 * would draw the placeholder mark. This is a **best-effort cosmetic backfill**
 * and is deliberately allowed to miss: the names are user-editable, so a renamed
 * category simply falls through to `circle-question-mark`, which is a perfectly
 * honest answer to "we do not know what this is".
 *
 * The old ten names, not the new twelve. `Transport`, `Shopping`, `Housing`,
 * `Health`, `Bills`, `Subscriptions` and `Other` no longer exist as templates,
 * which is exactly why they have to be listed here rather than looked up.
 */
const NAME_TO_ICON: Record<string, IconName> = {
  Groceries: 'shopping-basket',
  'Dining out': 'utensils',
  Transport: 'car',
  Shopping: 'shopping-basket',
  Housing: 'landmark',
  Health: 'heart-pulse',
  Entertainment: 'tv',
  Bills: 'zap',
  Subscriptions: 'tv',
  Other: 'circle-question-mark',
  Uncategorized: 'circle-question-mark',
};

/** What an unrecognised hex becomes. */
const UNKNOWN_COLOUR: ColourToken = FALLBACK_CATEGORY.color;

/** What an unrecognised name becomes. */
const UNKNOWN_ICON: IconName = 'circle-question-mark';

const logger = new Logger('LegacyColourBackfill');

/**
 * Converts every hex-valued `categories.color` in one user database, once.
 *
 * **Guarded on "does any row still hold a hex", which is the whole idempotence
 * story.** After the first run the guard matches nothing and this is one cheap
 * predicate on a table that holds at most a few dozen rows - the same shape and
 * the same cost as the template seed's own guard. There is no marker row and no
 * migration ledger to keep in step, because the data is its own marker.
 *
 * **One `UPDATE`, so it cannot half-apply.** A per-hex loop would read better
 * and would leave a database with some rows converted and some not if it failed
 * between two statements. That state is survivable - the guard would match again
 * on the next open and finish the job - but a single statement makes it
 * unreachable, and `docs/guides/database.md` warns that the embedded driver
 * refuses overlapping transactions, so wrapping a loop is not available here
 * anyway.
 *
 * `icon` is written with a `COALESCE` so a row that somehow already has one
 * keeps it; only the nulls are filled.
 *
 * It deliberately **does** rewrite tombstoned categories along with the rest,
 * rather than filtering `deleted_at` the way every read in this app does: a
 * future offline sync would otherwise resurrect a hex the frontend can no longer
 * render. This is one of the few places where reaching past a tombstone is
 * right, the same call `CategoriesService`'s delete reassignment already makes.
 *
 * `updated_at` moves on every row it touches, through the `$onUpdateFn` drizzle
 * applies itself. That is accepted rather than worked around: the row genuinely
 * changed, and nothing in the app reads a category's `updated_at`.
 */
export async function backfillLegacyColours(
  userDb: UserDatabase,
): Promise<void> {
  // The whole table is at most a few dozen rows, so selecting the matches costs
  // no more than counting them and gives the log a real number.
  const pending = await userDb
    .select({ id: categories.id })
    .from(categories)
    .where(like(categories.color, '#%'));

  if (pending.length === 0) {
    return;
  }

  const colourCases = Object.entries(HEX_TO_TOKEN).map(
    ([hex, token]) =>
      sql`when upper(${categories.color}) = ${hex} then ${token}`,
  );
  const iconCases = Object.entries(NAME_TO_ICON).map(
    ([name, icon]) => sql`when ${categories.name} = ${name} then ${icon}`,
  );

  await userDb
    .update(categories)
    .set({
      color: sql`case ${sql.join(colourCases, sql` `)} else ${UNKNOWN_COLOUR} end`,
      icon: sql`coalesce(${categories.icon}, case ${sql.join(iconCases, sql` `)} else ${UNKNOWN_ICON} end)`,
    })
    .where(like(categories.color, '#%'));

  logger.log(
    `Converted ${pending.length} category colour(s) from hex to daisyUI tokens`,
  );
}
