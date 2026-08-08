import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { asc, eq } from 'drizzle-orm';
import { rm } from 'node:fs/promises';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { categoryTemplateIds } from './category-templates';
import { LoginTokenService } from './../src/auth/login-token.service';
import type { CategoriesResponseDto } from './../src/categories/dto/categories-response.dto';
import type { CategoryResponseDto } from './../src/categories/dto/category-response.dto';
import type { ErrorResponseDto } from './../src/common/dto/error-response.dto';
import {
  monthWindow,
  previousMonthWindow,
  todayIn,
} from './../src/common/month-window';
import { users } from './../src/database/central/schema';
import { APP_DB } from './../src/database/database.constants';
import type { CentralDatabase } from './../src/database/database.types';
import { UserDatabaseService } from './../src/database/user-database.service';
import { categories, transactions } from './../src/database/user/schema';
import { MAILER } from './../src/mail/mailer';
import { MemoryMailer } from './memory-mailer';

/**
 * The category endpoints, against real databases.
 *
 * What only an e2e can prove here: that the grouped LEFT JOIN really returns a
 * category with no transactions (rather than dropping it, which putting the date
 * predicates in the WHERE clause would do), that the partial unique index lets
 * ordinary categories coexist while admitting one fallback, that a delete moves
 * transactions instead of removing them, and that the period boundary actually
 * excludes last month's spend.
 *
 * Dates are derived from the live window rather than hard-coded, so the suite
 * does not start failing on the 1st of next month.
 */
describe('Category endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let centralDb: CentralDatabase;
  let loginTokens: LoginTokenService;
  let userDatabases: UserDatabaseService;
  const databaseDir = process.env.DATABASE_DIR!;

  let bearer: string;
  let userId: string;
  let otherBearer: string;

  // Registration leaves monthStartDay at its default of 1, so the period is the
  // calendar month.
  const window = monthWindow(1, todayIn('Europe/Zagreb'));
  const lastMonth = previousMonthWindow(1, todayIn('Europe/Zagreb'));

  const errorBody = (response: request.Response) =>
    response.body as ErrorResponseDto;

  const listBody = (response: request.Response) =>
    response.body as CategoriesResponseDto;

  const categoryBody = (response: request.Response) =>
    response.body as CategoryResponseDto;

  let emailCounter = 0;
  const nextEmail = () => `Categoriser${++emailCounter}@Example.COM`;

  const list = (token = bearer) =>
    request(app.getHttpServer())
      .get('/api/categories')
      .set('Authorization', `Bearer ${token}`);

  const create = (payload: object, token = bearer) =>
    request(app.getHttpServer())
      .post('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

  const patch = (id: string, payload: object, token = bearer) =>
    request(app.getHttpServer())
      .patch(`/api/categories/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

  const remove = (id: string, token = bearer) =>
    request(app.getHttpServer())
      .delete(`/api/categories/${id}`)
      .set('Authorization', `Bearer ${token}`);

  /** Adds a spend to a category, inside the current period unless told otherwise. */
  const spend = (categoryId: string, amount: number, date = window.start) =>
    request(app.getHttpServer())
      .post('/api/transactions')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ merchant: 'Konzum', categoryId, amount, date })
      .expect(201);

  /** A fresh capped category, so band tests do not interfere with each other. */
  const cappedCategory = async (monthlyCap: number, name: string) =>
    categoryBody(
      await create({
        name,
        // A daisyUI token, not a hex, and an icon because PET-64 made it
        // required - a name from `ICON_NAMES`, so `cup` and `box` are gone.
        color: 'success',
        icon: 'shopping-basket',
        monthlyCap,
      }).expect(201),
    );

  const named = (response: request.Response, name: string) =>
    listBody(response).categories.find((row) => row.name === name)!;

  // Resolved in beforeAll: RegisterDto.categories takes category template
  // ids, and those are minted by the boot seed into this run's own database.
  let pickedCategoryIds: string[] = [];

  const provision = async () => {
    const email = nextEmail();
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        firstName: 'Marko',
        lastName: 'Kovac',
        email,
        currency: 'eur',
        monthlyBudget: 2000,
        categories: pickedCategoryIds,
      })
      .expect(202);
    await mailer.waitFor(email.toLowerCase(), 1);

    const [user] = await centralDb
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()));

    const rawToken = await loginTokens.issue(user.id);
    const response = await request(app.getHttpServer())
      .post('/api/auth/verify')
      .send({ token: rawToken })
      .expect(200);

    return { id: user.id, token: (response.body as { token: string }).token };
  };

  let mailer: MemoryMailer;

  beforeAll(async () => {
    mailer = new MemoryMailer();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MAILER)
      .useValue(mailer)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    pickedCategoryIds = await categoryTemplateIds(app, [
      'Transportation',
      'Groceries',
    ]);

    centralDb = app.get<CentralDatabase>(APP_DB);
    loginTokens = app.get(LoginTokenService);
    userDatabases = app.get(UserDatabaseService);

    const primary = await provision();
    userId = primary.id;
    bearer = primary.token;
    otherBearer = (await provision()).token;
  });

  afterAll(async () => {
    await app.close();
    await rm(databaseDir, { recursive: true, force: true });
  });

  describe('GET /api/categories', () => {
    it('refuses a request with no bearer', async () => {
      await request(app.getHttpServer()).get('/api/categories').expect(401);
    });

    it('returns the seeded set including the fallback, ordered by name', async () => {
      const response = await list().expect(200);
      const names = listBody(response).categories.map((row) => row.name);

      expect(names).toEqual(['Groceries', 'Transportation', 'Uncategorized']);
    });

    it('marks exactly one category as the fallback', async () => {
      const response = await list().expect(200);
      const fallbacks = listBody(response).categories.filter(
        (row) => row.isFallback,
      );

      expect(fallbacks).toHaveLength(1);
      expect(fallbacks[0].name).toBe('Uncategorized');
    });

    it('reports a seeded category as uncapped, with real spend', async () => {
      // AC1's fifth status. Every onboarding chip arrives without a cap, so
      // this is the ordinary shape rather than an exotic one.
      const before = named(await list().expect(200), 'Groceries');
      await spend(before.id, 25);

      const after = named(await list().expect(200), 'Groceries');
      expect(after).toMatchObject({
        status: 'uncapped',
        monthlyCap: null,
        percentUsed: null,
        remaining: null,
        over: null,
        spent: 25,
        transactionCount: 1,
      });
    });

    it('keeps a category with no transactions at zero rather than dropping it', async () => {
      // The date predicates live in the JOIN condition for exactly this reason:
      // in the WHERE clause they would filter out the category row itself.
      const transport = named(await list().expect(200), 'Transportation');

      expect(transport).toMatchObject({ spent: 0, transactionCount: 0 });
    });

    it('counts only transactions inside the current period', async () => {
      const category = await cappedCategory(400, 'Period check');
      await spend(category.id, 10, window.start);
      await spend(category.id, 999, lastMonth.start);

      const row = named(await list().expect(200), 'Period check');
      expect(row).toMatchObject({ spent: 10, transactionCount: 1 });
    });
  });

  describe('status bands', () => {
    it('is on_track below three quarters of the cap', async () => {
      const category = await cappedCategory(400, 'Band on track');
      await spend(category.id, 100);

      expect(named(await list().expect(200), 'Band on track')).toMatchObject({
        status: 'on_track',
        percentUsed: 25,
        remaining: 300,
        over: null,
      });
    });

    it('is near from exactly three quarters', async () => {
      const category = await cappedCategory(400, 'Band near');
      await spend(category.id, 300);

      expect(named(await list().expect(200), 'Band near')).toMatchObject({
        status: 'near',
        percentUsed: 75,
        remaining: 100,
      });
    });

    it('is still near at 99.5%, which the documented thresholds leave out', async () => {
      // The whole reason the band is decided on cents: 99.5% is in none of the
      // four written bands, and rounding it for display must not change that.
      const category = await cappedCategory(400, 'Band ninety nine');
      await spend(category.id, 398);

      expect(named(await list().expect(200), 'Band ninety nine')).toMatchObject(
        {
          status: 'near',
          percentUsed: 99.5,
          remaining: 2,
        },
      );
    });

    it('is full at exactly the cap, with a remaining of zero and no over', async () => {
      const category = await cappedCategory(400, 'Band full');
      await spend(category.id, 400);

      expect(named(await list().expect(200), 'Band full')).toMatchObject({
        status: 'full',
        percentUsed: 100,
        remaining: 0,
        over: null,
      });
    });

    it('is over above the cap, reporting the excess instead of a remainder', async () => {
      const category = await cappedCategory(400, 'Band over');
      await spend(category.id, 500);

      expect(named(await list().expect(200), 'Band over')).toMatchObject({
        status: 'over',
        percentUsed: 125,
        remaining: null,
        over: 100,
      });
    });
  });

  describe('allocation summary', () => {
    it('sums real caps and reports the remainder, ignoring uncapped categories', async () => {
      const fresh = await provision();
      const response = await request(app.getHttpServer())
        .get('/api/categories')
        .set('Authorization', `Bearer ${fresh.token}`)
        .expect(200);

      // Three seeded categories, none of them capped.
      expect(listBody(response).allocation).toEqual({
        monthlyBudget: 2000,
        allocated: 0,
        unallocated: 2000,
      });
    });

    it('goes negative when caps exceed the budget, unclamped', async () => {
      // A43: nothing prevents over-allocation and no state is designed for it,
      // so the magnitude is returned rather than clamped away.
      const fresh = await provision();
      await request(app.getHttpServer())
        .post('/api/categories')
        .set('Authorization', `Bearer ${fresh.token}`)
        .send({
          name: 'Huge',
          color: 'success',
          icon: 'shopping-basket',
          monthlyCap: 2500,
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/api/categories')
        .set('Authorization', `Bearer ${fresh.token}`)
        .expect(200);

      expect(listBody(response).allocation).toEqual({
        monthlyBudget: 2000,
        allocated: 2500,
        unallocated: -500,
      });
    });
  });

  describe('POST /api/categories', () => {
    it('creates a capped category and stores the cap as integer cents', async () => {
      const created = categoryBody(
        await create({
          name: 'Coffee',
          color: 'error',
          monthlyCap: 40.55,
          icon: 'utensils',
          note: 'Too much',
        }).expect(201),
      );

      expect(created).toMatchObject({
        name: 'Coffee',
        color: 'error',
        monthlyCap: 40.55,
        icon: 'utensils',
        note: 'Too much',
        isFallback: false,
        spent: 0,
        transactionCount: 0,
        status: 'on_track',
      });

      const userDb = await userDatabases.getUserDb(userId);
      const [row] = await userDb
        .select()
        .from(categories)
        .where(eq(categories.id, created.id));
      expect(row.monthlyCapCents).toBe(4055);
    });

    it('creates an uncapped category when the cap is omitted', async () => {
      // AC3 as amended: users are not forced to budget per category.
      const created = categoryBody(
        await create({
          name: 'No limit',
          color: 'accent',
          icon: 'zap',
        }).expect(201),
      );

      expect(created).toMatchObject({
        monthlyCap: null,
        status: 'uncapped',
        percentUsed: null,
      });
    });

    it('rejects a cap of zero, which is not the same as no cap', async () => {
      await create({
        name: 'Zero',
        color: 'accent',
        icon: 'zap',
        monthlyCap: 0,
      }).expect(400);
    });

    it('rejects a negative cap', async () => {
      await create({
        name: 'Neg',
        color: 'accent',
        icon: 'zap',
        monthlyCap: -5,
      }).expect(400);
    });

    it('rejects a missing name, and a hex where a colour token belongs', async () => {
      await create({ color: 'accent', icon: 'zap' }).expect(400);

      // **`#RRGGBB` is the malformed example now, and that is a reversal**: it
      // was the only accepted format until PET-64, and the negative case used
      // to be the word `teal` - which is a plausible token shape rather than a
      // rejected one, so keeping it would have stopped proving anything.
      await create({
        name: 'Bad colour',
        color: '#34B9AE',
        icon: 'zap',
      }).expect(400);
    });

    it('rejects an icon that is not a lucide name', async () => {
      // `cup` and `box` were the fixtures here before the allowlist, and
      // neither is a lucide name - so both were values the API accepted and no
      // frontend could ever render.
      await create({ name: 'Bad icon', color: 'accent', icon: 'cup' }).expect(
        400,
      );
    });

    it('rejects a category with no icon at all', async () => {
      // Required as of PET-64. Narrowing is free now and expensive later.
      await create({ name: 'Iconless', color: 'accent' }).expect(400);
    });

    it('refuses to mint a second fallback', async () => {
      // isFallback is not in the DTO at all, so forbidNonWhitelisted answers 400
      // long before the partial unique index would have to.
      await create({
        name: 'Impostor',
        color: 'accent',
        icon: 'zap',
        isFallback: true,
      }).expect(400);
    });
  });

  describe('PATCH /api/categories/:id', () => {
    it('applies a sparse change and leaves absent fields alone', async () => {
      const category = await cappedCategory(400, 'Patch me');
      const updated = categoryBody(
        await patch(category.id, { name: 'Patched' }).expect(200),
      );

      expect(updated).toMatchObject({ name: 'Patched', monthlyCap: 400 });
    });

    it('clears a cap back to null, making the category uncapped', async () => {
      const category = await cappedCategory(400, 'Uncap me');
      const updated = categoryBody(
        await patch(category.id, { monthlyCap: null }).expect(200),
      );

      expect(updated).toMatchObject({
        monthlyCap: null,
        status: 'uncapped',
        percentUsed: null,
      });
    });

    it('rejects an empty body before touching the database', async () => {
      const category = await cappedCategory(400, 'Empty patch');
      const response = await patch(category.id, {}).expect(400);

      expect(errorBody(response).message).toMatch(/at least one field/i);
    });

    it('refuses to rename the fallback, with a 409', async () => {
      const fallback = named(await list().expect(200), 'Uncategorized');
      const response = await patch(fallback.id, { name: 'Misc' }).expect(409);

      expect(errorBody(response).message).toMatch(/cannot be renamed/i);
    });

    it('still lets every other field on the fallback change', async () => {
      const fallback = named(await list().expect(200), 'Uncategorized');
      const updated = categoryBody(
        await patch(fallback.id, {
          monthlyCap: 50,
          color: 'primary',
          icon: 'gift',
        }).expect(200),
      );

      expect(updated).toMatchObject({
        name: 'Uncategorized',
        monthlyCap: 50,
        color: 'primary',
        icon: 'gift',
        isFallback: true,
      });

      // Put it back, so later tests see the seeded shape - which is
      // FALLBACK_CATEGORY's own token and glyph, not a hex any more.
      await patch(fallback.id, {
        monthlyCap: null,
        color: 'warning-content',
        icon: 'circle-question-mark',
      }).expect(200);
    });

    it('404s on another account’s category id', async () => {
      const category = await cappedCategory(400, 'Not yours');
      await patch(category.id, { name: 'Stolen' }, otherBearer).expect(404);
    });
  });

  describe('DELETE /api/categories/:id', () => {
    it('moves the transactions to the fallback rather than deleting them', async () => {
      const category = await cappedCategory(400, 'Doomed');
      await spend(category.id, 30);
      await spend(category.id, 12);

      await remove(category.id).expect(204);

      const fallback = named(await list().expect(200), 'Uncategorized');
      const userDb = await userDatabases.getUserDb(userId);
      const moved = await userDb
        .select()
        .from(transactions)
        .where(eq(transactions.categoryId, fallback.id));

      expect(moved).toHaveLength(2);
      expect(moved.every((row) => row.deletedAt === null)).toBe(true);
    });

    it('tombstones the category rather than removing the row', async () => {
      const category = await cappedCategory(400, 'Tombstoned');
      await remove(category.id).expect(204);

      const userDb = await userDatabases.getUserDb(userId);
      const [row] = await userDb
        .select()
        .from(categories)
        .where(eq(categories.id, category.id));

      expect(row.deletedAt).toBeInstanceOf(Date);
      expect(
        listBody(await list().expect(200)).categories.map((c) => c.name),
      ).not.toContain('Tombstoned');
    });

    it('reassigns tombstoned transactions too, so sync sees no dangling id', async () => {
      const category = await cappedCategory(400, 'With a ghost');
      const live = await spend(category.id, 10);
      const ghost = await spend(category.id, 20);

      await request(app.getHttpServer())
        .delete(`/api/transactions/${(ghost.body as { id: string }).id}`)
        .set('Authorization', `Bearer ${bearer}`)
        .expect(204);

      await remove(category.id).expect(204);

      const fallback = named(await list().expect(200), 'Uncategorized');
      const userDb = await userDatabases.getUserDb(userId);
      const [ghostRow] = await userDb
        .select()
        .from(transactions)
        .where(eq(transactions.id, (ghost.body as { id: string }).id));
      const [liveRow] = await userDb
        .select()
        .from(transactions)
        .where(eq(transactions.id, (live.body as { id: string }).id));

      expect(ghostRow.categoryId).toBe(fallback.id);
      expect(ghostRow.deletedAt).toBeInstanceOf(Date);
      expect(liveRow.categoryId).toBe(fallback.id);
    });

    it('deletes a category with no transactions without a special case', async () => {
      const category = await cappedCategory(400, 'Untouched');
      await remove(category.id).expect(204);
    });

    it('refuses to delete the fallback, with a 409', async () => {
      const fallback = named(await list().expect(200), 'Uncategorized');
      const response = await remove(fallback.id).expect(409);

      expect(errorBody(response).message).toMatch(/cannot be deleted/i);
    });

    it('404s on an unknown id and on an already deleted one', async () => {
      const category = await cappedCategory(400, 'Twice');
      await remove(category.id).expect(204);
      await remove(category.id).expect(404);
      await remove('00000000-0000-7000-8000-000000000000').expect(404);
    });

    it('404s on another account’s category id', async () => {
      const category = await cappedCategory(400, 'Also not yours');
      await remove(category.id, otherBearer).expect(404);

      // And it is still there for its real owner.
      const userDb = await userDatabases.getUserDb(userId);
      const [row] = await userDb
        .select()
        .from(categories)
        .where(eq(categories.id, category.id));
      expect(row.deletedAt).toBeNull();
    });

    it('leaves the other account untouched throughout', async () => {
      const response = await list(otherBearer).expect(200);
      const userDb = await userDatabases.getUserDb(userId);
      const mine = await userDb
        .select()
        .from(categories)
        .orderBy(asc(categories.name));

      // The second account still has exactly what provisioning gave it.
      expect(listBody(response).categories.map((row) => row.name)).toEqual([
        'Groceries',
        'Transportation',
        'Uncategorized',
      ]);
      expect(mine.length).toBeGreaterThan(3);
    });
  });
});
