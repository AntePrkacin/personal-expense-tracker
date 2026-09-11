import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { LoginTokenService } from './../src/auth/login-token.service';
import { users } from './../src/database/central/schema';
import { APP_DB } from './../src/database/database.constants';
import type { CentralDatabase } from './../src/database/database.types';
import { DemoLeaseService } from './../src/demo/demo-lease.service';
import { TemplatesService } from './../src/templates/templates.service';

/**
 * Shared setup for the three demo suites.
 *
 * **There are three suites rather than one because the demo is configured at
 * boot and `ConfigModule.forRoot()` runs the moment `app.module.ts` is
 * imported**, capturing `process.env` as it stands then. A validated key also
 * beats `process.env` inside `ConfigService.get`, so `DEMO_ENABLED` has exactly
 * one value for the life of a module registry - and Jest gives one registry per
 * test file. Hence: enabled here, disabled next door, throttled in the third.
 *
 * `bootDemoApp` is what makes that work. It sets the variables and only then
 * imports `AppModule`, dynamically, so nothing has loaded the config before the
 * values are in place. A spec file must therefore never `import { AppModule }`
 * at the top - that is the one mistake this whole arrangement exists to prevent,
 * and it fails as a 404 from a route that looks correctly registered.
 */
export const bootDemoApp = async (
  env: Record<string, string>,
): Promise<INestApplication<App>> => {
  Object.assign(process.env, env);

  // **`require`, not `import`.** A static import is hoisted above the
  // assignment above and would load the config before the values are set, which
  // is the whole failure this helper exists to avoid. `await import()` is not an
  // option either - this suite runs on Jest's CommonJS runtime and a dynamic
  // import there needs `--experimental-vm-modules`, which it does not have. So
  // the load is deferred the one way that works, and the module registry Jest
  // gives each test file is what keeps it to one config per file.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AppModule } = require('./../src/app.module') as {
    AppModule: new () => unknown;
  };

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  app.setGlobalPrefix('api');
  await app.init();
  return app;
};

/**
 * Registers, verifies and enrols one account into the pool.
 *
 * It picks **every** category template, exactly as `seed-showcase.ts` does,
 * because the fixture write asserts the account carries precisely the categories
 * the fixture names - so an account enrolled with any other selection would fail
 * the moment it was restored.
 *
 * `enrol` stamps `seeded_at` with now, which is what keeps these suites fast: a
 * pooled account seeded today and never leased is handed over untouched, so a
 * test pays for a 2,000-row restore only where the restore is the thing under
 * test.
 */
export const enrolAccount = async (
  app: INestApplication<App>,
  email: string,
): Promise<string> => {
  const centralDb = app.get<CentralDatabase>(APP_DB);
  const templates = await app.get(TemplatesService).categories();

  await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({
      fullName: 'Marko Kovac',
      email,
      monthlyBudget: 5000,
      categories: templates.categories.map((template) => template.id),
    })
    .expect(202);

  const [user] = await centralDb
    .select()
    .from(users)
    .where(eq(users.email, email));

  const rawToken = await app.get(LoginTokenService).issue(user.id);
  await request(app.getHttpServer())
    .post('/api/auth/verify')
    .send({ token: rawToken })
    .expect(200);

  await app.get(DemoLeaseService).enrol(user.id);
  return user.id;
};

/** Which account a session token belongs to. */
export const whoami = async (
  app: INestApplication<App>,
  token: string,
): Promise<string> => {
  const response = await request(app.getHttpServer())
    .get('/api/auth/session')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  return (response.body as { email: string }).email;
};
