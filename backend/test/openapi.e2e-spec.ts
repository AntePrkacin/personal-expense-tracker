import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { API_PREFIX } from './../src/common/api-prefix';
import type { ErrorResponseDto } from './../src/common/dto/error-response.dto';

/**
 * Guards the generated HTTP contract, which nothing else can.
 *
 * It reads the committed `backend/openapi.json` rather than building a
 * document in-process, and that is deliberate twice over. The schemas come
 * from `@nestjs/swagger`'s CLI plugin, a compile-time transformer wired
 * through `nest build`; under ts-jest it never runs, so a suite that built its
 * own document would see empty schemas and fail for a reason that has nothing
 * to do with the code being wrong. And the committed file is what the frontend
 * types are generated from, so it is the artifact worth asserting on. CI keeps
 * it fresh by regenerating and failing on a diff.
 *
 * The failing-request test at the bottom is the other half: it is the only
 * thing tying `AllExceptionsFilter`'s real output to the error shape the spec
 * publishes.
 */
interface SpecResponse {
  description?: string;
  content?: Record<string, { schema?: { $ref?: string } }>;
}

interface SpecOperation {
  summary?: string;
  description?: string;
  responses: Record<string, SpecResponse>;
  requestBody?: { content: Record<string, { schema: { $ref: string } }> };
  security?: Record<string, string[]>[];
}

interface SpecSchema {
  type?: string;
  properties?: Record<string, Record<string, unknown>>;
  required?: string[];
}

interface Spec {
  openapi: string;
  paths: Record<string, Record<string, SpecOperation>>;
  components: {
    schemas: Record<string, SpecSchema>;
    securitySchemes?: Record<string, Record<string, unknown>>;
  };
}

const spec = JSON.parse(
  readFileSync(join(__dirname, '..', 'openapi.json'), 'utf8'),
) as Spec;

const schema = (name: string): SpecSchema => spec.components.schemas[name];

const ERROR_REF = '#/components/schemas/ErrorResponseDto';

describe('openapi.json', () => {
  it('keys every path with the global prefix', () => {
    expect(Object.keys(spec.paths).sort()).toEqual([
      `/${API_PREFIX}/auth/login-link`,
      `/${API_PREFIX}/auth/register`,
      `/${API_PREFIX}/auth/session`,
      `/${API_PREFIX}/auth/verify`,
      `/${API_PREFIX}/hello`,
      `/${API_PREFIX}/profile`,
      `/${API_PREFIX}/transactions`,
      `/${API_PREFIX}/transactions/{id}`,
    ]);
  });

  it('gives GET /api/hello a real response schema', () => {
    const ok = spec.paths[`/${API_PREFIX}/hello`].get.responses['200'];

    expect(ok.content?.['application/json'].schema?.$ref).toBe(
      '#/components/schemas/HelloResponseDto',
    );
    // The plugin silently produces `{}` here when a response type is an
    // interface, or lives outside a .dto.ts file. Both look fine until read.
    expect(schema('HelloResponseDto').properties?.message).toEqual({
      type: 'string',
    });
    expect(schema('HelloResponseDto').required).toEqual(['message']);
  });

  it('documents no 500 anywhere, on hello least of all', () => {
    // The resolved policy: every operation can answer 500 through the global
    // filter, so the document says it once in its description instead of
    // widening every generated response union with the same dead fact. Hello was
    // the arbitrary outlier that made the inconsistency visible.
    expect(
      Object.keys(spec.paths[`/${API_PREFIX}/hello`].get.responses),
    ).toEqual(['200']);
    const declared = Object.values(spec.paths)
      .flatMap((path) => Object.values(path))
      .flatMap((operation) => Object.keys(operation.responses));
    expect(declared).not.toContain('500');
  });

  describe.each(['register', 'login-link'])('POST /api/auth/%s', (route) => {
    const operation = () => spec.paths[`/${API_PREFIX}/auth/${route}`].post;

    it('documents a bodiless 202', () => {
      const accepted = operation().responses['202'];

      // Not an oversight in the spec, and the description has to say so or the
      // first reader to find it will "fix" it: an empty body is what makes the
      // response identical whether or not the account exists (REG-6, LOG-6).
      expect(accepted.content).toBeUndefined();
      expect(accepted.description).toMatch(/identical/i);
    });

    it('documents 400 and 429 with the shared error shape', () => {
      // 429 comes from the throttler guard, which no decorator on the handler
      // hints at - it is the easiest status in this file to forget.
      for (const status of ['400', '429']) {
        expect(
          operation().responses[status].content?.['application/json'].schema
            ?.$ref,
        ).toBe(ERROR_REF);
      }
    });

    it('declares no other responses', () => {
      expect(Object.keys(operation().responses).sort()).toEqual([
        '202',
        '400',
        '429',
      ]);
    });
  });

  describe('POST /api/auth/verify', () => {
    const operation = () => spec.paths[`/${API_PREFIX}/auth/verify`].post;

    it('returns a session token and its expiry', () => {
      expect(
        operation().responses['200'].content?.['application/json'].schema?.$ref,
      ).toBe('#/components/schemas/VerifyResponseDto');
      // The silent-`{}` trap again: this is the only thing that would notice
      // VerifyResponseDto becoming an interface or moving out of a .dto.ts file.
      expect(schema('VerifyResponseDto').properties?.token).toMatchObject({
        type: 'string',
      });
      expect(schema('VerifyResponseDto').required).toEqual([
        'token',
        'expiresAt',
      ]);
    });

    it('documents both rejections with the shared error shape', () => {
      // 409 is the interesting one: it is what lets the frontend say "open the
      // most recent email" instead of sending the user back to request another.
      for (const status of ['400', '401', '409', '429']) {
        expect(
          operation().responses[status].content?.['application/json'].schema
            ?.$ref,
        ).toBe(ERROR_REF);
      }
      expect(operation().description).toMatch(/409/);
    });

    it('declares no other responses', () => {
      expect(Object.keys(operation().responses).sort()).toEqual([
        '200',
        '400',
        '401',
        '409',
        '429',
      ]);
    });

    it('needs no bearer of its own', () => {
      // The emailed token IS the credential here, and it arrives in the body.
      expect(operation().security).toBeUndefined();
    });
  });

  describe('GET /api/auth/session', () => {
    const operation = () => spec.paths[`/${API_PREFIX}/auth/session`].get;

    it('answers the three fields central can answer', () => {
      expect(
        operation().responses['200'].content?.['application/json'].schema?.$ref,
      ).toBe('#/components/schemas/SessionResponseDto');
      expect(schema('SessionResponseDto').required).toEqual([
        'userId',
        'email',
        'expiresAt',
      ]);
    });

    it('declares only 200 and 401', () => {
      // No 429 on purpose: both throttlers are skipped, because the frontend
      // calls this on navigation and one NAT shares one IP bucket.
      expect(Object.keys(operation().responses).sort()).toEqual(['200', '401']);
      expect(
        operation().responses['401'].content?.['application/json'].schema?.$ref,
      ).toBe(ERROR_REF);
    });

    it('publishes the bearer requirement, and an honest scheme for it', () => {
      // Two halves that fail silently apart: `@ApiBearerAuth()` names a scheme
      // and `addSecurity` declares it. Miss either and the operation looks
      // public in both the spec and the generated frontend types.
      expect(operation().security).toEqual([{ bearer: [] }]);
      expect(spec.components.securitySchemes?.bearer).toMatchObject({
        type: 'http',
        scheme: 'bearer',
      });
      // Not JWT: these are opaque database-backed tokens, and Nest's
      // addBearerAuth helper would have claimed otherwise.
      expect(spec.components.securitySchemes?.bearer).not.toHaveProperty(
        'bearerFormat',
      );
    });
  });

  describe('the transaction write endpoints', () => {
    const collection = () => spec.paths[`/${API_PREFIX}/transactions`];
    const item = () => spec.paths[`/${API_PREFIX}/transactions/{id}`];

    it('declares exactly the three writes, and no reads yet', () => {
      // Reads are PET-28's. If a GET appears here before that ticket, something
      // was added without its aggregates being thought through.
      expect(Object.keys(collection())).toEqual(['post']);
      expect(Object.keys(item()).sort()).toEqual(['delete', 'patch']);
    });

    it.each([
      ['create', () => collection().post, ['201', '400', '401', '404']],
      ['update', () => item().patch, ['200', '400', '401', '404']],
      ['delete', () => item().delete, ['204', '400', '401', '404']],
    ])('documents %s with exactly its own statuses', (_name, op, codes) => {
      expect(Object.keys(op().responses).sort()).toEqual(codes);

      // 400 is reachable on all three: the two with a body validate it, and
      // delete still has a ParseUUIDPipe on the id.
      for (const status of ['400', '401', '404']) {
        expect(
          op().responses[status].content?.['application/json'].schema?.$ref,
        ).toBe(ERROR_REF);
      }
    });

    it('requires the bearer on every one of them', () => {
      // Class-level `@ApiBearerAuth()`, so this is really pinning that the
      // decorator has not been lost from the controller as a whole.
      for (const op of [collection().post, item().patch, item().delete]) {
        expect(op.security).toEqual([{ bearer: [] }]);
      }
    });

    it('returns the transaction from create and update, and nothing from delete', () => {
      const ref = '#/components/schemas/TransactionResponseDto';

      expect(
        collection().post.responses['201'].content?.['application/json'].schema
          ?.$ref,
      ).toBe(ref);
      expect(
        item().patch.responses['200'].content?.['application/json'].schema
          ?.$ref,
      ).toBe(ref);
      // 204 means 204: no body to describe.
      expect(item().delete.responses['204'].content).toBeUndefined();
    });

    it('says which resource each 404 names', () => {
      // Two different resources behind one status - the transaction in the URL
      // and the categoryId in the body - so the prose has to disambiguate.
      expect(collection().post.description).toMatch(/categoryId/);
      expect(item().patch.description).toMatch(/categoryId/);
      expect(item().delete.description).toMatch(/id in the URL/);
    });

    it('spells the amount bound out rather than letting @IsPositive lie', () => {
      // The trap this pins: the plugin renders @IsPositive() as `minimum: 1`,
      // which is right for an integer and wrong for money - it would forbid
      // every amount under a unit. Both DTOs carry the explicit override.
      for (const name of ['CreateTransactionDto', 'UpdateTransactionDto']) {
        const amount = schema(name).properties!.amount;

        expect(amount).toMatchObject({
          type: 'number',
          minimum: 0,
          exclusiveMinimum: true,
          maximum: 1_000_000_000,
        });
        expect(amount).not.toMatchObject({ minimum: 1 });
      }
    });

    it('publishes the date as a pattern-constrained calendar date', () => {
      // The pattern only survives because the regex is an inline literal in the
      // DTO; hoisting it to a named const drops it from here silently.
      for (const name of ['CreateTransactionDto', 'UpdateTransactionDto']) {
        expect(schema(name).properties!.date).toMatchObject({
          type: 'string',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          format: 'date',
        });
      }
    });

    it('makes create require the four real fields and update require none', () => {
      expect(schema('CreateTransactionDto').required!.slice().sort()).toEqual([
        'amount',
        'categoryId',
        'date',
        'merchant',
      ]);
      // PATCH semantics: every field optional, or an absent one would be a 400
      // instead of "leave it alone".
      expect(schema('UpdateTransactionDto').required).toBeUndefined();
    });

    it('publishes note as nullable on update, where null means clear', () => {
      expect(schema('UpdateTransactionDto').properties!.note).toMatchObject({
        type: 'string',
        nullable: true,
      });
    });

    it('always answers all eight response fields', () => {
      // Including note: null rather than an absent key, so a client never has to
      // tell "no note" from "field missing".
      expect(schema('TransactionResponseDto').required).toEqual([
        'id',
        'merchant',
        'categoryId',
        'amount',
        'date',
        'note',
        'createdAt',
        'updatedAt',
      ]);
      expect(schema('TransactionResponseDto').properties!.note).toMatchObject({
        nullable: true,
      });
      // Major units on the way out, matching the way in.
      expect(
        schema('TransactionResponseDto').properties!.amount.description,
      ).toMatch(/major units/i);
    });
  });

  describe('the profile endpoints', () => {
    const path = () => spec.paths[`/${API_PREFIX}/profile`];

    it('declares exactly a read and an update, on the collection itself', () => {
      // No `/profile/{id}`, and there must never be one: the resource is always
      // the session's own.
      expect(Object.keys(path()).sort()).toEqual(['get', 'patch']);
    });

    it.each([
      ['read', () => path().get, ['200', '401']],
      ['update', () => path().patch, ['200', '400', '401', '409']],
    ])('documents the %s with exactly its own statuses', (_name, op, codes) => {
      expect(Object.keys(op().responses).sort()).toEqual(codes);

      for (const status of codes.filter((code) => code !== '200')) {
        expect(
          op().responses[status].content?.['application/json'].schema?.$ref,
        ).toBe(ERROR_REF);
      }
    });

    it('documents no 404 on either operation', () => {
      // A verified session implies a profile row, so its absence is a broken
      // invariant answered by the generic 500 - not a state a client could act
      // on. A documented 404 would invite a "create profile" flow that has
      // nothing behind it.
      for (const op of [path().get, path().patch]) {
        expect(Object.keys(op.responses)).not.toContain('404');
      }
      // Nor a 429: neither route carries a throttler.
      for (const op of [path().get, path().patch]) {
        expect(Object.keys(op.responses)).not.toContain('429');
      }
    });

    it('requires the bearer on both', () => {
      // Class-level `@ApiBearerAuth()`, so this pins that the decorator has not
      // been lost from the controller as a whole.
      for (const op of [path().get, path().patch]) {
        expect(op.security).toEqual([{ bearer: [] }]);
      }
    });

    it('returns the same six-field profile from both', () => {
      const ref = '#/components/schemas/ProfileResponseDto';

      for (const op of [path().get, path().patch]) {
        expect(
          op.responses['200'].content?.['application/json'].schema?.$ref,
        ).toBe(ref);
      }

      // All six always present - a client never has to tell "unset" from
      // "absent", and every column behind them is NOT NULL anyway.
      expect(schema('ProfileResponseDto').required!.slice().sort()).toEqual([
        'currency',
        'email',
        'firstName',
        'lastName',
        'monthStartDay',
        'monthlyBudget',
      ]);
      // Major units on the way out, matching the way in.
      expect(
        schema('ProfileResponseDto').properties!.monthlyBudget.description,
      ).toMatch(/major units/i);
      expect(
        schema('ProfileResponseDto').properties!.monthStartDay,
      ).toMatchObject({ type: 'integer' });
    });

    it('makes every update field optional and none of them nullable', () => {
      // PATCH semantics: an absent field means "leave it alone". Unlike the
      // transaction update there is no nullable field at all, because there is
      // no nullable column to clear.
      expect(schema('UpdateProfileDto').required).toBeUndefined();

      for (const property of Object.values(
        schema('UpdateProfileDto').properties!,
      )) {
        expect(property).not.toMatchObject({ nullable: true });
      }
    });

    it('publishes the update email as an email and the budget as money', () => {
      expect(schema('UpdateProfileDto').properties!.email).toMatchObject({
        type: 'string',
        format: 'email',
      });

      // The @IsPositive() trap, now on a third DTO: the plugin renders it as
      // `minimum: 1`, which is right for an integer and wrong for money - it
      // would forbid every budget under a unit.
      const budget = schema('UpdateProfileDto').properties!.monthlyBudget;
      expect(budget).toMatchObject({
        type: 'number',
        minimum: 0,
        exclusiveMinimum: true,
        maximum: 1_000_000_000,
      });
      expect(budget).not.toMatchObject({ minimum: 1 });
    });

    it('says what the 409 means and that null is not accepted', () => {
      const description = path().patch.description!;

      expect(description).toMatch(/409/);
      expect(description).toMatch(/null/);
      expect(description).toMatch(/major units/i);
    });
  });

  it("carries VerifyLoginLinkDto's bound on the token", () => {
    // The bound is what keeps a megabyte body from ever reaching a hash
    // function, so it belongs in the published contract rather than only in the
    // validator.
    expect(schema('VerifyLoginLinkDto').properties?.token).toMatchObject({
      type: 'string',
      maxLength: 128,
    });
    expect(schema('VerifyLoginLinkDto').required).toEqual(['token']);
  });

  it("carries RegisterDto's validation constraints", () => {
    const properties = schema('RegisterDto').properties!;

    expect(properties.firstName).toMatchObject({ maxLength: 100 });
    expect(properties.lastName).toMatchObject({ maxLength: 100 });
    expect(properties.email).toMatchObject({ format: 'email' });
    // Major units, not the cents the column stores. The description is the
    // JSDoc on the DTO, lifted by the plugin's `introspectComments`.
    expect(properties.monthlyBudget.description).toMatch(/major units/i);

    expect(schema('RegisterDto').required).toEqual(
      expect.arrayContaining([
        'firstName',
        'lastName',
        'email',
        'monthlyBudget',
        'categories',
      ]),
    );
    expect(schema('RegisterDto').required).not.toContain('currency');
    expect(schema('RegisterDto').required).not.toContain('monthStartDay');
  });

  describe.each(['RegisterDto', 'UpdateProfileDto'])(
    'the preference fields %s shares with the other',
    (name) => {
      it('constrains currency rather than publishing a bare string', () => {
        // @IsISO4217CurrencyCode() derives nothing, so without the explicit
        // metadata this is `{ type: 'string' }` and the generated frontend type
        // accepts any text at all. Case-insensitive because the DTO uppercases
        // before validating.
        expect(schema(name).properties!.currency).toMatchObject({
          type: 'string',
          pattern: '^[A-Za-z]{3}$',
        });
        expect(schema(name).properties!.currency.description).toMatch(
          /ISO 4217/,
        );
      });

      it('publishes monthStartDay as an integer, not any number', () => {
        // The plugin renders every TS `number` as `type: 'number'`, which would
        // publish 3.5 as a valid day while @IsInt() rejects it. The explicit
        // type and the derived bounds coexist.
        expect(schema(name).properties!.monthStartDay).toMatchObject({
          type: 'integer',
          minimum: 1,
          maximum: 28,
        });
      });
    },
  );

  it('describes message as either a string or an array of them', () => {
    // The one field the plugin cannot derive, so the only one that breaks by
    // someone removing a hand-written decorator.
    expect(schema('ErrorResponseDto').properties?.message).toMatchObject({
      oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    });
  });
});

describe('the published error shape (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('matches ErrorResponseDto exactly on a real failure', async () => {
    const response = await request(app.getHttpServer())
      .post(`/${API_PREFIX}/auth/register`)
      .send({ email: 'not-an-email' })
      .expect(400);

    // Exactly the declared keys, no more and no fewer. ErrorResponseDto is
    // still a hand-mirror of what AllExceptionsFilter builds; this is what
    // stops the two drifting apart in either direction.
    expect(Object.keys(response.body as ErrorResponseDto).sort()).toEqual(
      schema('ErrorResponseDto').required!.slice().sort(),
    );
    expect(Array.isArray((response.body as ErrorResponseDto).message)).toBe(
      true,
    );
  });
});
