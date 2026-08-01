import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { rm } from 'node:fs/promises';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import type { ErrorResponseBody } from './../src/common/filters/all-exceptions.filter';
import type { UserResponse } from './../src/users/users.service';

/** `expect.any` is typed `any`; naming it keeps the typed literals below clean. */
const anyString = expect.any(String) as string;
const uuidV7 = expect.stringMatching(
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
) as string;

/**
 * Exercises the two-database stack for real: every request here creates or
 * reads an actual central database plus a per-user database, under the temp
 * DATABASE_DIR that setup-e2e.ts installs (local mode, no cloud credentials).
 */
describe('UsersController (e2e)', () => {
  let app: INestApplication<App>;
  const databaseDir = process.env.DATABASE_DIR!;

  // supertest types response bodies as `any`; name the shape at the boundary.
  const userBody = (response: request.Response) =>
    response.body as UserResponse;
  const errorBody = (response: request.Response) =>
    response.body as ErrorResponseBody;

  // A fresh address per test, so an earlier 201 cannot make a later one a 409.
  let emailCounter = 0;
  const nextEmail = () => `Person${++emailCounter}@Example.COM`;

  const validBody = (email: string) => ({
    firstName: 'Marko',
    lastName: 'Kovac',
    email,
    monthlyBudget: 2000.5,
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirror the global 'api' prefix configured in main.ts.
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await rm(databaseDir, { recursive: true, force: true });
  });

  it('creates a user, lowercasing the email and storing the profile', async () => {
    const email = nextEmail();
    const response = await request(app.getHttpServer())
      .post('/api/users')
      .send(validBody(email))
      .expect(201);

    expect(userBody(response)).toEqual({
      id: uuidV7,
      email: email.toLowerCase(),
      firstName: 'Marko',
      lastName: 'Kovac',
      currency: 'USD',
      monthlyBudget: 2000.5,
      monthStartDay: 1,
      createdAt: anyString,
    });
  });

  it('reads the same user back, merging both databases', async () => {
    const email = nextEmail();
    const created = await request(app.getHttpServer())
      .post('/api/users')
      .send({ ...validBody(email), currency: 'EUR', monthStartDay: 15 })
      .expect(201);

    const fetched = await request(app.getHttpServer())
      .get(`/api/users/${userBody(created).id}`)
      .expect(200);

    expect(userBody(fetched)).toEqual(userBody(created));
    expect(userBody(fetched).currency).toBe('EUR');
    expect(userBody(fetched).monthStartDay).toBe(15);
  });

  it('returns 409 for a duplicate email, case-insensitively', async () => {
    const email = nextEmail();
    await request(app.getHttpServer())
      .post('/api/users')
      .send(validBody(email))
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/api/users')
      .send(validBody(email.toUpperCase()))
      .expect(409);

    expect(errorBody(response).message).toBe('Email already registered');
  });

  it('returns 404 with the uniform error shape for an unknown user', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/users/019fbd57-ca52-7509-bc0d-fee63ffc5294')
      .expect(404);

    expect(errorBody(response)).toEqual({
      statusCode: 404,
      message: 'User not found',
      error: 'Not Found',
      timestamp: anyString,
      path: '/api/users/019fbd57-ca52-7509-bc0d-fee63ffc5294',
    });
  });

  it('returns 400 for an invalid email', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/users')
      .send({ ...validBody('not-an-email'), email: 'not-an-email' })
      .expect(400);

    expect(errorBody(response).message).toEqual(
      expect.arrayContaining([expect.stringContaining('email')]),
    );
  });

  it('returns 400 for an unknown extra field (forbidNonWhitelisted)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/users')
      .send({ ...validBody(nextEmail()), isAdmin: true })
      .expect(400);

    expect(errorBody(response).message).toEqual(
      expect.arrayContaining([expect.stringContaining('isAdmin')]),
    );
  });

  it('returns 400 for a malformed uuid', async () => {
    await request(app.getHttpServer()).get('/api/users/not-a-uuid').expect(400);
  });
});
