import { newId } from '../../common/ids';
import type { UserDatabase } from '../database.types';
import { categories } from './schema';

/**
 * The ten starter chips offered during onboarding, in the order frame 03 shows
 * them (CAT-2). The order is part of the contract: the frontend renders them as
 * given rather than sorting.
 *
 * Colors are the real ones, read per chip from the design's own variable
 * bindings (Figma frame 03, node 43:705) rather than eyeballed from a render,
 * then checked against one. The comment on each line is the variable it came
 * from, so a change in Figma is traceable to a change here.
 *
 * Note the palette has only **eight** colors for ten chips, so two repeat:
 * Subscriptions reuses Transport's blue and Other reuses Bills' orange. That is
 * what the design does, not an error here - do not "fix" it by inventing two
 * more colors. It does mean color alone cannot identify a category, which
 * constrains any later legend or chart that tries to use it as a key.
 *
 * A7 records a known conflict in the designs - this set contains Bills and
 * Subscriptions, which never appear again, while later screens show Health and
 * Other. Each screen follows its own mock until the designer resolves it, so
 * all ten are offered here. The two duplicated colors sit exactly on that seam.
 */
export const STARTER_CATEGORIES = [
  { name: 'Groceries', color: '#57B368' }, // Category/4 Green
  { name: 'Dining out', color: '#EF6F6C' }, // Category/1 Coral
  { name: 'Transport', color: '#3F8EE6' }, // Category/6 Blue
  { name: 'Shopping', color: '#E7C24A' }, // Category/3 Yellow
  { name: 'Housing', color: '#34B9AE' }, // Category/5 Teal
  { name: 'Health', color: '#CE6FB8' }, // Category/8 Pink
  { name: 'Entertainment', color: '#8A79F1' }, // Category/7 Violet
  { name: 'Bills', color: '#F29A3D' }, // Category/2 Orange
  { name: 'Subscriptions', color: '#3F8EE6' }, // Category/6 Blue, reused
  { name: 'Other', color: '#F29A3D' }, // Category/2 Orange, reused
] as const;

export type StarterCategoryName = (typeof STARTER_CATEGORIES)[number]['name'];

/**
 * Just the names, which is what a registration submits and what `@IsIn`
 * validates against. Derived rather than repeated, so the two cannot drift.
 */
export const STARTER_CATEGORY_NAMES: StarterCategoryName[] =
  STARTER_CATEGORIES.map((category) => category.name);

/**
 * Creates the starter categories the user picked during onboarding, in the
 * canonical order above rather than the order they were submitted in.
 *
 * Called from verification, not from registration: the user database does not
 * exist until the email owner clicks their link. Selecting none is a valid
 * choice (A4 enforces no minimum), and inserts nothing.
 */
export async function seedStarterCategories(
  userDb: UserDatabase,
  names: readonly string[],
): Promise<void> {
  const selected = new Set(names);
  const rows = STARTER_CATEGORIES.filter((category) =>
    selected.has(category.name),
  ).map((category) => ({
    id: newId(),
    name: category.name,
    color: category.color,
  }));

  if (rows.length === 0) {
    return;
  }

  await userDb.insert(categories).values(rows);
}
