import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import { rm } from 'node:fs/promises';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { LoginTokenService } from './../src/auth/login-token.service';
import {
  categoryTemplates,
  colourTemplates,
  users,
} from './../src/database/central/schema';
import {
  COLOUR_TOKENS,
  ICON_NAMES,
} from './../src/database/central/template-tokens';
import { APP_DB } from './../src/database/database.constants';
import type { CentralDatabase } from './../src/database/database.types';
import type { CategoryTemplatesResponseDto } from './../src/templates/dto/category-templates-response.dto';
import type { PaletteResponseDto } from './../src/templates/dto/palette-response.dto';

/**
 * The two template reads, and the boot seed behind them.
 *
 * The seed is only observable through these endpoints - nothing else in the app
 * reads those tables directly - so this suite is where "the app booted with a
 * usable set of chips" is actually asserted. `DATABASE_DIR` is a temp directory
 * per run (see setup-e2e.ts), so every run exercises a genuinely fresh seed.
 */
describe('Template endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let centralDb: CentralDatabase;
  let loginTokens: LoginTokenService;
  let bearer: string;
  const databaseDir = process.env.DATABASE_DIR!;

  const getCategories = () =>
    request(app.getHttpServer()).get('/api/templates/categories');

  const getPalette = (token?: string) => {
    const call = request(app.getHttpServer()).get('/api/templates/palette');
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  };

  /** Registers and verifies, so the guarded read has a real session to use. */
  const provision = async (): Promise<string> => {
    const email = 'templates@example.com';
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        firstName: 'Marko',
        lastName: 'Kovac',
        email,
        monthlyBudget: 2000,
        // Empty rather than a picked set: this suite is about the templates
        // being *offered*, and an empty selection is legal (A4).
        categories: [],
      })
      .expect(202);

    const [user] = await centralDb
      .select()
      .from(users)
      .where(eq(users.email, email));

    const rawToken = await loginTokens.issue(user.id);
    const response = await request(app.getHttpServer())
      .post('/api/auth/verify')
      .send({ token: rawToken })
      .expect(200);

    return (response.body as { token: string }).token;
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
    bearer = await provision();
  });

  afterAll(async () => {
    await app.close();
    await rm(databaseDir, { recursive: true, force: true });
  });

  describe('GET /api/templates/categories', () => {
    it('needs no session at all, which is the point of it', async () => {
      // The fifth `@Public()` route. Onboarding step 2 runs before an account
      // exists, so a guard here would make the chips unreachable.
      await getCategories().expect(200);
    });

    it('answers a seeded set rather than an empty list', async () => {
      const body = (await getCategories().expect(200))
        .body as CategoryTemplatesResponseDto;

      expect(body.categories.length).toBeGreaterThan(0);
    });

    it('resolves each chip to a token and an icon the code ships', async () => {
      // The inner joins are what this covers: a category template pointing at a
      // tombstoned colour vanishes from the list silently, and a token outside
      // the allowlist would compile to no Tailwind class at all.
      const body = (await getCategories().expect(200))
        .body as CategoryTemplatesResponseDto;

      for (const template of body.categories) {
        expect(COLOUR_TOKENS).toContain(template.color as never);
        expect(ICON_NAMES).toContain(template.icon as never);
        expect(template.description.length).toBeGreaterThan(0);
      }
    });

    it('offers no Uncategorized chip', async () => {
      const body = (await getCategories().expect(200))
        .body as CategoryTemplatesResponseDto;

      expect(body.categories.map((c) => c.name)).not.toContain('Uncategorized');
    });

    it('hides a disabled template without deleting anything', async () => {
      const before = (await getCategories().expect(200))
        .body as CategoryTemplatesResponseDto;
      const target = before.categories[before.categories.length - 1];

      await centralDb
        .update(categoryTemplates)
        .set({ enabled: false })
        .where(eq(categoryTemplates.id, target.id));

      const after = (await getCategories().expect(200))
        .body as CategoryTemplatesResponseDto;

      expect(after.categories.map((c) => c.id)).not.toContain(target.id);
      expect(after.categories).toHaveLength(before.categories.length - 1);

      // Put it back, so the suites' shared expectation of the seeded set holds.
      await centralDb
        .update(categoryTemplates)
        .set({ enabled: true })
        .where(eq(categoryTemplates.id, target.id));
    });
  });

  describe('GET /api/templates/palette', () => {
    it('is guarded, unlike the categories read beside it', async () => {
      await getPalette().expect(401);
    });

    it('offers the enabled colours and icons, labelled', async () => {
      const { colors, icons } = (await getPalette(bearer).expect(200))
        .body as PaletteResponseDto;

      expect(colors.length).toBeGreaterThan(0);
      expect(icons.length).toBeGreaterThan(0);

      for (const colour of colors) {
        expect(COLOUR_TOKENS).toContain(colour.token as never);
        expect(colour.label.length).toBeGreaterThan(0);
      }
      for (const icon of icons) {
        expect(ICON_NAMES).toContain(icon.name as never);
        expect(icon.label.length).toBeGreaterThan(0);
      }
    });

    it('omits a disabled colour while the API still accepts it', async () => {
      // `error-content` ships disabled: 1.01:1 against the dark card, the same
      // luminance as the surface. It stays in the allowlist so a category
      // carrying it still saves, which is the split between the flag and the
      // enum, and this pins both halves of it.
      const { colors } = (await getPalette(bearer).expect(200))
        .body as PaletteResponseDto;

      expect(colors.map((c) => c.token)).not.toContain('error-content');
      expect(COLOUR_TOKENS).toContain('error-content');

      const [row] = await centralDb
        .select()
        .from(colourTemplates)
        .where(eq(colourTemplates.token, 'error-content'));
      expect(row.deletedAt).toBeNull();
    });

    it('offers the muted token the fallback category carries', async () => {
      // `base-content/50` is the seventeenth entry and the only one that is
      // neither a saturated brand colour nor near-invisible in one theme -
      // `COLOUR_CONTRAST` in template-tokens.ts carries the measured table.
      const body = (await getPalette(bearer).expect(200))
        .body as PaletteResponseDto;

      expect(body.colors.map((colour) => colour.token)).toContain(
        'base-content/50',
      );
    });
  });

  describe('a template whose colour was tombstoned', () => {
    // The distinction between `resolve()` and `exists()`, end to end. Both reads
    // that serve a *screen* inner-join the colour, so such a template stops
    // being offered - correct, since a chip with no colour cannot be drawn. What
    // must not happen is registration reusing that query as its membership
    // check and answering 400 over an id it had just handed out, which is what
    // it did until the review of PET-64.
    const TOKEN = 'neutral-content';
    let orphanedId: string;

    beforeAll(async () => {
      const [colour] = await centralDb
        .select()
        .from(colourTemplates)
        .where(eq(colourTemplates.token, TOKEN));

      const [template] = await centralDb
        .select()
        .from(categoryTemplates)
        .where(eq(categoryTemplates.colourId, colour.id));

      // No seeded template uses this token, so give one to it first: the point
      // is a *live* template that has lost its colour, not an absent one.
      if (!template) {
        const [first] = await centralDb.select().from(categoryTemplates);
        await centralDb
          .update(categoryTemplates)
          .set({ colourId: colour.id })
          .where(eq(categoryTemplates.id, first.id));
        orphanedId = first.id;
      } else {
        orphanedId = template.id;
      }

      await centralDb
        .update(colourTemplates)
        .set({ deletedAt: new Date() })
        .where(eq(colourTemplates.id, colour.id));
    });

    afterAll(async () => {
      await centralDb
        .update(colourTemplates)
        .set({ deletedAt: null })
        .where(eq(colourTemplates.token, TOKEN));
    });

    it('stops being offered, because a chip with no colour cannot be drawn', async () => {
      const body = (await getCategories().expect(200))
        .body as CategoryTemplatesResponseDto;

      expect(body.categories.map((row) => row.id)).not.toContain(orphanedId);
    });

    it('is still accepted by registration rather than 400ing as unknown', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          firstName: 'Marko',
          lastName: 'Kovac',
          email: 'orphaned-colour@example.com',
          monthlyBudget: 2000,
          categories: [orphanedId],
        })
        .expect(202);
    });

    it('still 400s an id that is genuinely not a template', async () => {
      // The other half: widening the check must not have widened it to
      // everything. A well-formed UUID that names nothing is still rejected.
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          firstName: 'Marko',
          lastName: 'Kovac',
          email: 'unknown-template@example.com',
          monthlyBudget: 2000,
          categories: ['0198f2b0-0000-7000-8000-0000000000ff'],
        })
        .expect(400);
    });
  });
});
