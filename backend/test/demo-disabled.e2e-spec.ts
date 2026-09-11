import type { INestApplication } from '@nestjs/common';
import { rm } from 'node:fs/promises';
import request from 'supertest';
import type { App } from 'supertest/types';
import { bootDemoApp } from './demo-pool';

/**
 * The default posture, which is the one that matters most: nothing about a
 * fresh clone, CI or a deployment that never asked for a demo should publish a
 * route handing sessions to anonymous callers.
 *
 * Its own file because `DEMO_ENABLED` is fixed for the life of a module
 * registry - see `demo-pool.ts`.
 */
describe('Demo endpoint, disabled (e2e)', () => {
  let app: INestApplication<App>;
  const databaseDir = process.env.DATABASE_DIR!;

  beforeAll(async () => {
    // Nothing is set. `DEMO_ENABLED` defaults to false in the Joi schema, so
    // this is genuinely the out-of-the-box configuration rather than an
    // explicit opt-out.
    app = await bootDemoApp({});
  });

  afterAll(async () => {
    await app.close();
    await rm(databaseDir, { recursive: true, force: true });
  });

  it('answers 404, so a deployment without a demo does not advertise one', async () => {
    await request(app.getHttpServer()).post('/api/demo/session').expect(404);
  });
});
