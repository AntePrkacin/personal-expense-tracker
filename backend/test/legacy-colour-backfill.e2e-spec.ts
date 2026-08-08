import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import { rm } from 'node:fs/promises';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { LoginTokenService } from './../src/auth/login-token.service';
import { newId } from './../src/common/ids';
import { users } from './../src/database/central/schema';
import { COLOUR_TOKENS } from './../src/database/central/template-tokens';
import { APP_DB } from './../src/database/database.constants';
import type {
  CentralDatabase,
  UserDatabase,
} from './../src/database/database.types';
import { backfillLegacyColours } from './../src/database/user/legacy-colour-backfill';
import { categories } from './../src/database/user/schema';
import { UserDatabaseService } from './../src/database/user-database.service';

/**
 * PET-64's hex-to-token data migration, against a real database.
 *
 * **Against a real one specifically, because the defect it repairs is one no
 * fixture could have shown.** Every suite in this repo builds its own
 * categories, and they were all updated to tokens in the same commit that broke
 * the stored data - which is exactly why 329 unit tests, 292 e2e tests, two
 * builds and a lint run were all green while every pre-existing account rendered
 * grey tiles with no glyph. So this writes the hexes the old seed really wrote
 * and reads back what the app would really load.
 */
describe('Legacy colour backfill (e2e)', () => {
  let app: INestApplication<App>;
  let centralDb: CentralDatabase;
  let loginTokens: LoginTokenService;
  let userDatabases: UserDatabaseService;
  let userDb: UserDatabase;
  const databaseDir = process.env.DATABASE_DIR!;

  /** Exactly the ten rows the pre-PET-64 seed wrote, hexes and all. */
  const LEGACY_ROWS = [
    { name: 'Groceries', color: '#57B368' },
    { name: 'Dining out', color: '#EF6F6C' },
    { name: 'Transport', color: '#3F8EE6' },
    { name: 'Shopping', color: '#E7C24A' },
    { name: 'Housing', color: '#34B9AE' },
    { name: 'Health', color: '#CE6FB8' },
    { name: 'Entertainment', color: '#8A79F1' },
    { name: 'Bills', color: '#F29A3D' },
    { name: 'Subscriptions', color: '#3F8EE6' },
    { name: 'Other', color: '#F29A3D' },
  ];

  const rowsByName = async () => {
    const rows = await userDb
      .select({
        name: categories.name,
        color: categories.color,
        icon: categories.icon,
      })
      .from(categories);

    return new Map(rows.map((row) => [row.name, row]));
  };

  const provision = async (): Promise<string> => {
    const email = 'legacy@example.com';
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        firstName: 'Marko',
        lastName: 'Kovac',
        email,
        monthlyBudget: 2000,
        categories: [],
      })
      .expect(202);

    const [user] = await centralDb
      .select()
      .from(users)
      .where(eq(users.email, email));

    const rawToken = await loginTokens.issue(user.id);
    await request(app.getHttpServer())
      .post('/api/auth/verify')
      .send({ token: rawToken })
      .expect(200);

    return user.id;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    centralDb = app.get<CentralDatabase>(APP_DB);
    loginTokens = app.get(LoginTokenService);
    userDatabases = app.get(UserDatabaseService);

    const userId = await provision();
    userDb = await userDatabases.getUserDb(userId);

    // Wipe what provisioning seeded and write the *old* shape in its place, so
    // this database is indistinguishable from one provisioned before PET-64.
    await userDb.delete(categories);
    await userDb.insert(categories).values([
      ...LEGACY_ROWS.map((row) => ({ id: newId(), ...row })),
      // The fallback, with the grey that was never one of the eight.
      {
        id: newId(),
        name: 'Uncategorized',
        color: '#98A0AE',
        isFallback: true,
      },
      // A colour no version of this app ever seeded, reachable through
      // `POST /api/categories` while it still validated a hex.
      { id: newId(), name: 'Bespoke', color: '#123456' },
      // A tombstoned row. Every read filters these out, so nothing would ever
      // notice it kept a hex - until an offline sync resurrected it.
      {
        id: newId(),
        name: 'Deleted',
        color: '#57B368',
        deletedAt: new Date(),
      },
      // A row that somehow already carries an icon, to prove the COALESCE.
      {
        id: newId(),
        name: 'Already iconned',
        color: '#57B368',
        icon: 'plane',
      },
    ]);
  });

  afterAll(async () => {
    await app.close();
    await rm(databaseDir, { recursive: true, force: true });
  });

  it('starts from a database the frontend cannot render, which is the premise', async () => {
    const before = await rowsByName();

    // Every one of these falls through `categoryColour.ts`'s maps to the
    // neutral grey tile, because a hex is not a key in the contract's enum.
    expect(before.get('Groceries')!.color).toBe('#57B368');
    expect(before.get('Groceries')!.icon).toBeNull();
  });

  it('maps every seeded hex to the token the old frontend already painted', async () => {
    await backfillLegacyColours(userDb);
    const after = await rowsByName();

    // Not a re-design: composing the two maps PET-64 deleted
    // (`CATEGORY_COLOUR_BY_HEX` then `CATEGORY_TILE`) gives exactly these, so a
    // migrated account renders in the colours it rendered in yesterday.
    expect(after.get('Groceries')!.color).toBe('success');
    expect(after.get('Dining out')!.color).toBe('error');
    expect(after.get('Transport')!.color).toBe('info');
    expect(after.get('Shopping')!.color).toBe('warning');
    expect(after.get('Housing')!.color).toBe('accent');
    expect(after.get('Health')!.color).toBe('secondary');
    expect(after.get('Entertainment')!.color).toBe('primary');
    expect(after.get('Bills')!.color).toBe('warning');
    expect(after.get('Subscriptions')!.color).toBe('info');
  });

  it('lands every row on a colour the API would accept', async () => {
    // The property that actually matters, and the one a per-hex assertion can
    // miss: whatever came out, the contract's enum has to contain it, or the
    // frontend's `Record<CategoryColour, string>` has no key for it and the
    // tile is grey again for a different reason.
    const after = await rowsByName();

    for (const row of after.values()) {
      expect(COLOUR_TOKENS).toContain(row.color);
    }
  });

  it('gives the fallback whatever FALLBACK_CATEGORY carries today', async () => {
    // Migrated and freshly seeded `Uncategorized` rows must be the same colour,
    // which is why the map reads the constant rather than repeating a literal.
    const after = await rowsByName();

    expect(after.get('Uncategorized')!.color).toBe('base-content/50');
  });

  it('sends an unrecognised hex to the muted token rather than dropping it', async () => {
    const after = await rowsByName();

    expect(after.get('Bespoke')!.color).toBe('base-content/50');
    expect(after.get('Bespoke')!.icon).toBe('circle-question-mark');
  });

  it('converts tombstoned rows too, unlike every read in the app', async () => {
    // Deliberately reaching past a tombstone: a future offline sync would
    // otherwise resurrect a hex the frontend can no longer render.
    const after = await rowsByName();

    expect(after.get('Deleted')!.color).toBe('success');
  });

  it('backfills the missing icons by name and keeps one already set', async () => {
    const after = await rowsByName();

    expect(after.get('Groceries')!.icon).toBe('shopping-basket');
    expect(after.get('Dining out')!.icon).toBe('utensils');
    expect(after.get('Transport')!.icon).toBe('car');
    expect(after.get('Health')!.icon).toBe('heart-pulse');
    // Not overwritten with `shopping-basket`, which is what the name maps to.
    expect(after.get('Already iconned')!.icon).toBe('plane');
  });

  it('is a no-op on a second run, which is the whole idempotence story', async () => {
    // There is no marker row and no ledger: the guard is "does any row still
    // hold a hex", so the data is its own record of having been converted. A
    // second run must not, for instance, re-derive `Groceries` from a name.
    const before = await rowsByName();
    await backfillLegacyColours(userDb);
    const after = await rowsByName();

    expect([...after.entries()]).toEqual([...before.entries()]);
  });

  it('leaves a database that never held a hex completely alone', async () => {
    // The state every existing test account is in, and the arm that runs on
    // every user database open from now on.
    const fresh = await userDatabases.getUserDb(await provisionSecond());
    const read = () =>
      fresh
        .select({ name: categories.name, color: categories.color })
        .from(categories);

    const before = await read();
    await backfillLegacyColours(fresh);
    const after = await read();

    expect(after).toEqual(before);
    expect(after.every((row) => !row.color.startsWith('#'))).toBe(true);
  });

  /** A second account, provisioned normally, so it holds tokens from birth. */
  const provisionSecond = async (): Promise<string> => {
    const email = 'modern@example.com';
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        firstName: 'Marko',
        lastName: 'Kovac',
        email,
        monthlyBudget: 2000,
        categories: [],
      })
      .expect(202);

    const [user] = await centralDb
      .select()
      .from(users)
      .where(eq(users.email, email));

    const rawToken = await loginTokens.issue(user.id);
    await request(app.getHttpServer())
      .post('/api/auth/verify')
      .send({ token: rawToken })
      .expect(200);

    return user.id;
  };
});
