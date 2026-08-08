import { newId } from '../../common/ids';
import type { CentralDatabase } from '../database.types';
import { categoryTemplates, colourTemplates, iconTemplates } from './schema';
import type { ColourToken, IconName } from './template-tokens';

/**
 * The starting contents of the three template tables.
 *
 * **Seeded programmatically at boot rather than in the migration SQL.** Root
 * `CLAUDE.md` forbids hand-editing anything under `backend/drizzle/**` and
 * drizzle-kit generates structure only, so appending INSERTs to a generated
 * `migration.sql` is not available. `openCentralDatabase` calls `seedTemplates`
 * immediately after `migrate()`, which is already the point before any consumer
 * can query.
 *
 * **The guard is "any `category_templates` row exists", and that is not only
 * idempotence.** It is what stops a boot re-creating a template the admin
 * deliberately deleted.
 */

/** One colour a category may be painted in, as the picker offers it. */
type ColourSeed = {
  token: ColourToken;
  label: string;
  /** False keeps the token valid for a stored category but off the picker. */
  enabled?: boolean;
};

/**
 * The seventeen tokens with the word a person actually picks.
 *
 * The labels are read off the daisyUI light theme's own values rather than
 * invented - `accent-content` is `oklch(38% 0.063 188.4)`, a dark teal, hence
 * "Pine". They are the admin's to rename, which is the whole reason they are a
 * column instead of a function of the token.
 *
 * **`error-content` ships disabled rather than absent, and that is what the flag
 * is for.** It measures 1.01:1 against the dark card - the same luminance as the
 * surface - so it is the one token in the set with no usable theme and must not
 * be offered. It stays in the allowlist so that a category somehow carrying it
 * still renders, which is exactly the split between validation and presentation
 * `template-tokens.ts` describes.
 *
 * **Do not read that as "the other fifteen are fine".** `COLOUR_CONTRAST` in
 * `template-tokens.ts` carries the measured table, and only `primary` and
 * `secondary` clear 3:1 against the card in both themes; `error-content` is
 * disabled because it is invisible in dark at 1.009:1, not because it is the
 * only one below the bar. The offered set is a deliberate trade recorded on
 * PET-64, not a set that passes a check.
 *
 * `base-content/50` is offered last and is the muted one: it is the only entry
 * here that clears 3:1 in both themes while not being a saturated brand colour,
 * which is why the `Uncategorized` fallback carries it.
 */
const COLOUR_SEED: readonly ColourSeed[] = [
  { token: 'success', label: 'Emerald' },
  { token: 'secondary', label: 'Pink' },
  { token: 'info', label: 'Sky' },
  { token: 'accent', label: 'Teal' },
  { token: 'error', label: 'Rose' },
  { token: 'primary', label: 'Indigo' },
  { token: 'primary-content', label: 'Lavender' },
  { token: 'secondary-content', label: 'Blush' },
  { token: 'accent-content', label: 'Pine' },
  { token: 'success-content', label: 'Forest' },
  { token: 'info-content', label: 'Navy' },
  { token: 'warning', label: 'Amber' },
  { token: 'warning-content', label: 'Umber' },
  { token: 'neutral', label: 'Ink' },
  { token: 'neutral-content', label: 'Silver' },
  { token: 'error-content', label: 'Maroon', enabled: false },
  { token: 'base-content/50', label: 'Slate' },
];

/** One icon a category may carry, as the picker offers it. */
type IconSeed = { name: IconName; label: string };

/**
 * The thirteen lucide marks, labelled for a picker rather than for a developer.
 *
 * `circle-question-mark` is offered even though its only seeded user is the
 * `Uncategorized` fallback, which is not a template: the invariant is that
 * category's *name*, not its glyph, and a question mark is a perfectly ordinary
 * thing to want on a category of your own.
 */
const ICON_SEED: readonly IconSeed[] = [
  { name: 'shopping-basket', label: 'Basket' },
  { name: 'utensils', label: 'Utensils' },
  { name: 'car', label: 'Car' },
  { name: 'zap', label: 'Bolt' },
  { name: 'heart-pulse', label: 'Heartbeat' },
  { name: 'tv', label: 'Television' },
  { name: 'graduation-cap', label: 'Graduation cap' },
  { name: 'plane', label: 'Plane' },
  { name: 'scissors', label: 'Scissors' },
  { name: 'gift', label: 'Gift' },
  { name: 'paw-print', label: 'Paw' },
  { name: 'landmark', label: 'Bank' },
  { name: 'circle-question-mark', label: 'Question mark' },
];

/** One default category, in the order onboarding draws its chips. */
type CategorySeed = {
  name: string;
  colour: ColourToken;
  icon: IconName;
  description: string;
};

/**
 * The twelve chips onboarding offers, with the colour, icon and description an
 * admin will later manage.
 *
 * **Twelve, not thirteen**: `docs/explainers/category-colors-icons-description-preview.html`
 * is the sign-off artifact and draws thirteen rows, the last of which is
 * `Uncategorized` - the fallback, which is seeded for everybody, offered to
 * nobody and therefore not a template. A full pick provisions thirteen category
 * rows: these twelve plus that one.
 *
 * **The colour assignments are the ones drawn, and three pairs are deliberately
 * close.** Measured in OKLab against a ~0.10 floor: Personal care / Gifts 0.029,
 * Education / Travel 0.037, Groceries / Utilities 0.060. They are kept rather
 * than re-picked, because breaking Education / Travel would force one onto a
 * near-black tile - `primary-content`, `secondary-content` and `neutral-content`
 * are all near-white, so only one pale tile is possible - and that is a large
 * visual change to fix something invisible in a channel that carries nothing.
 * The per-category icon is the identity channel, which is why it lands with the
 * palette rather than after it. `frontend/src/components/ui/categoryColour.ts`
 * carries the same note and its suite pins the three pairs.
 *
 * **Names are sentence case**, which is the rule `category_templates` records.
 */
const CATEGORY_SEED: readonly CategorySeed[] = [
  {
    name: 'Groceries',
    colour: 'success',
    icon: 'shopping-basket',
    description:
      'Food, beverages, and household essentials bought to consume at home.',
  },
  {
    name: 'Dining out',
    colour: 'secondary',
    icon: 'utensils',
    description: 'Restaurants, coffee shops, takeout, delivery, and fast food.',
  },
  {
    name: 'Transportation',
    colour: 'info',
    icon: 'car',
    description:
      'Gas, public transit, rideshares, parking, and vehicle maintenance.',
  },
  {
    name: 'Utilities',
    colour: 'accent',
    icon: 'zap',
    description:
      'Essential home services like electricity, water, internet, and phone plans.',
  },
  {
    name: 'Healthcare',
    colour: 'error',
    icon: 'heart-pulse',
    description: 'Doctor visits, pharmacy, dental, therapy, and medical bills.',
  },
  {
    name: 'Entertainment',
    colour: 'primary',
    icon: 'tv',
    description:
      'Movies, concerts, gaming, hobbies, and streaming subscriptions.',
  },
  {
    name: 'Education',
    colour: 'primary-content',
    icon: 'graduation-cap',
    description: 'Tuition, courses, books, and school supplies.',
  },
  {
    name: 'Travel',
    colour: 'secondary-content',
    icon: 'plane',
    description: 'Flights, hotels, rental cars, and vacation expenses.',
  },
  {
    name: 'Personal care',
    colour: 'accent-content',
    icon: 'scissors',
    description: 'Haircuts, gym memberships, cosmetics, and hygiene products.',
  },
  {
    name: 'Gifts',
    colour: 'success-content',
    icon: 'gift',
    description:
      'Presents for birthdays and holidays, as well as charity and donations.',
  },
  {
    name: 'Family & pets',
    colour: 'info-content',
    icon: 'paw-print',
    description:
      'Childcare, baby supplies, pet care, vet bills, and family activities.',
  },
  {
    name: 'Loans & debt',
    colour: 'warning',
    icon: 'landmark',
    description:
      'Mortgage payments, car loans, credit card payments, and student loans.',
  },
];

/** How many categories a user who picks everything ends up with. */
export const SEEDED_CATEGORY_TEMPLATE_COUNT = CATEGORY_SEED.length;

/**
 * Fills the three template tables, once, on a central database that has none.
 *
 * Called from `openCentralDatabase` straight after `migrate()`, so the tables
 * are populated before Nest finishes booting and before any consumer can query
 * them.
 *
 * One `db.transaction()` rather than three loose inserts: half a seed would
 * leave category templates pointing at colours that were never written, and the
 * next boot's guard would see rows and skip the repair. Safe here specifically
 * because nothing else is on this connection yet - the embedded driver refuses
 * *overlapping* transactions, and Nest has not resolved a single consumer.
 */
export async function seedTemplates(db: CentralDatabase): Promise<void> {
  const [existing] = await db
    .select({ id: categoryTemplates.id })
    .from(categoryTemplates)
    .limit(1);

  // Deliberately not "no *enabled* rows" and not a per-row upsert: an admin who
  // deletes or disables every template has made a choice, and a boot that undid
  // it would be a bug with no way to work around it.
  if (existing) {
    return;
  }

  const colours = COLOUR_SEED.map((colour, index) => ({
    id: newId(),
    token: colour.token,
    label: colour.label,
    sortOrder: index,
    enabled: colour.enabled ?? true,
  }));

  const icons = ICON_SEED.map((icon, index) => ({
    id: newId(),
    name: icon.name,
    label: icon.label,
    sortOrder: index,
  }));

  const colourIdByToken = new Map(colours.map((row) => [row.token, row.id]));
  const iconIdByName = new Map(icons.map((row) => [row.name, row.id]));

  const categories = CATEGORY_SEED.map((category, index) => ({
    id: newId(),
    name: category.name,
    // Non-null by construction: both seeds are typed against the same closed
    // sets, so a missing key is a compile error long before it is a lookup miss.
    colourId: colourIdByToken.get(category.colour)!,
    iconId: iconIdByName.get(category.icon)!,
    description: category.description,
    sortOrder: index,
  }));

  await db.transaction(async (tx) => {
    await tx.insert(colourTemplates).values(colours);
    await tx.insert(iconTemplates).values(icons);
    await tx.insert(categoryTemplates).values(categories);
  });
}
