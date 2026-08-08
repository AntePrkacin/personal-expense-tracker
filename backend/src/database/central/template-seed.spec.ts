import { queryChain } from '../../../test/query-chain';
import type { CentralDatabase } from '../database.types';
import { categoryTemplates, colourTemplates, iconTemplates } from './schema';
import { SEEDED_CATEGORY_TEMPLATE_COUNT, seedTemplates } from './template-seed';
import { COLOUR_TOKENS, ICON_NAMES } from './template-tokens';

/**
 * What the boot seed writes, and - more importantly - when it declines to.
 *
 * The guard is the part worth a suite of its own: it is not only idempotence,
 * it is what stops a restart re-creating a template an admin deliberately
 * deleted, and nothing else in the app would notice if it stopped holding.
 */
describe('seedTemplates', () => {
  /** Rows handed to `.values()`, keyed by the table they were inserted into. */
  type Inserted = Map<unknown, Record<string, unknown>[]>;

  const build = (existingCategoryTemplates: unknown[]) => {
    const inserted: Inserted = new Map();

    const insert = jest.fn((table: unknown) => ({
      values: (rows: Record<string, unknown>[]) => {
        inserted.set(table, rows);
        return Promise.resolve(undefined);
      },
    }));

    const db = {
      select: jest.fn(() => queryChain(existingCategoryTemplates)),
      // The real transaction hands the callback a scoped client; here the
      // insert recorder is the whole of what it needs.
      transaction: jest.fn(
        async (run: (tx: { insert: typeof insert }) => Promise<void>) => {
          await run({ insert });
        },
      ),
    } as unknown as CentralDatabase;

    return { db, inserted, insert };
  };

  it('writes all three tables on an empty central database', async () => {
    const { db, inserted } = build([]);

    await seedTemplates(db);

    expect(inserted.get(colourTemplates)).toHaveLength(COLOUR_TOKENS.length);
    expect(inserted.get(iconTemplates)).toHaveLength(ICON_NAMES.length);
    expect(inserted.get(categoryTemplates)).toHaveLength(
      SEEDED_CATEGORY_TEMPLATE_COUNT,
    );
  });

  it('writes nothing at all when a category template already exists', async () => {
    // Not merely idempotence: an admin who deleted every template has made a
    // choice, and a boot that undid it would be a bug with no workaround.
    const { db, inserted, insert } = build([{ id: 'existing' }]);

    await seedTemplates(db);

    expect(insert).not.toHaveBeenCalled();
    expect(inserted.size).toBe(0);
  });

  it('points every category at a colour and an icon it actually wrote', async () => {
    // The join in `TemplatesService` is an inner one, so a category template
    // whose colour id matches nothing simply vanishes from the offered list -
    // silently, and only for that one chip.
    const { db, inserted } = build([]);

    await seedTemplates(db);

    const colourIds = new Set(
      inserted.get(colourTemplates)!.map((row) => row.id),
    );
    const iconIds = new Set(inserted.get(iconTemplates)!.map((row) => row.id));

    for (const category of inserted.get(categoryTemplates)!) {
      expect(colourIds.has(category.colourId)).toBe(true);
      expect(iconIds.has(category.iconId)).toBe(true);
    }
  });

  it('only writes tokens and names the allowlists carry', async () => {
    // The tables are unconstrained by design - `@IsIn` is the enforcement - so
    // this is what stops the seed itself writing a token no class can be built
    // from, which Tailwind would compile to nothing with no error anywhere.
    const { db, inserted } = build([]);

    await seedTemplates(db);

    for (const colour of inserted.get(colourTemplates)!) {
      expect(COLOUR_TOKENS).toContain(colour.token);
    }
    for (const icon of inserted.get(iconTemplates)!) {
      expect(ICON_NAMES).toContain(icon.name);
    }
  });

  it('leaves error-content in the allowlist but off the picker', async () => {
    // It measures 1.01:1 against the dark card, the same luminance as the
    // surface. Disabled rather than absent, so a category somehow carrying it
    // still renders - which is the whole split between the flag and the enum.
    const { db, inserted } = build([]);

    await seedTemplates(db);

    const errorContent = inserted
      .get(colourTemplates)!
      .find((row) => row.token === 'error-content');

    expect(errorContent).toBeDefined();
    expect(errorContent!.enabled).toBe(false);
  });

  it('names every category in sentence case', async () => {
    // The rule matters more now than it did: an admin will type straight into
    // this table, and the seed is the precedent everything after it copies.
    const { db, inserted } = build([]);

    await seedTemplates(db);

    for (const category of inserted.get(categoryTemplates)!) {
      const name = category.name as string;
      const [first, ...rest] = name.split(' ');

      expect(first[0]).toBe(first[0].toUpperCase());
      // Every later word lower, bar the ampersand in "Family & pets".
      for (const word of rest.filter((w) => w !== '&')) {
        expect(word).toBe(word.toLowerCase());
      }
    }
  });

  it('offers no Uncategorized template, because that row is the fallback', async () => {
    // It must never appear as a pickable chip, and its name is a system
    // invariant the API answers 409 for. `FALLBACK_CATEGORY` stays a constant.
    const { db, inserted } = build([]);

    await seedTemplates(db);

    expect(
      inserted.get(categoryTemplates)!.map((row) => row.name),
    ).not.toContain('Uncategorized');
  });

  it('gives every category a description, since it becomes the user’s note', async () => {
    const { db, inserted } = build([]);

    await seedTemplates(db);

    for (const category of inserted.get(categoryTemplates)!) {
      expect(String(category.description).length).toBeGreaterThan(0);
    }
  });
});
