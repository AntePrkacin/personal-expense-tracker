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

/** A query or path parameter, as the document describes it. */
interface SpecParameter {
  name: string;
  in: string;
  required?: boolean;
  schema?: Record<string, unknown>;
}

interface SpecOperation {
  summary?: string;
  description?: string;
  parameters?: SpecParameter[];
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
      `/${API_PREFIX}/assistant/messages`,
      `/${API_PREFIX}/assistant/sessions`,
      // Sorts before `{id}` here and is declared before it in the controller too - which is a
      // coincidence of alphabet rather than the reason. `AssistantController` carries why the
      // declaration order is load-bearing (PET-76).
      `/${API_PREFIX}/assistant/sessions/count`,
      `/${API_PREFIX}/assistant/sessions/{id}`,
      `/${API_PREFIX}/auth/login-link`,
      `/${API_PREFIX}/auth/register`,
      `/${API_PREFIX}/auth/session`,
      `/${API_PREFIX}/auth/verify`,
      `/${API_PREFIX}/categories`,
      `/${API_PREFIX}/categories/{id}`,
      `/${API_PREFIX}/dashboard`,
      `/${API_PREFIX}/health`,
      `/${API_PREFIX}/insights`,
      `/${API_PREFIX}/insights/generate`,
      `/${API_PREFIX}/periods`,
      `/${API_PREFIX}/profile`,
      `/${API_PREFIX}/profile/schedule`,
      `/${API_PREFIX}/templates/categories`,
      `/${API_PREFIX}/templates/palette`,
      `/${API_PREFIX}/transactions`,
      `/${API_PREFIX}/transactions/scan`,
      `/${API_PREFIX}/transactions/{id}`,
    ]);
  });

  it('gives GET /api/health a real response schema', () => {
    const ok = spec.paths[`/${API_PREFIX}/health`].get.responses['200'];

    expect(ok.content?.['application/json'].schema?.$ref).toBe(
      '#/components/schemas/HealthResponseDto',
    );
    // The plugin silently produces `{}` here when a response type is an
    // interface, or lives outside a .dto.ts file. Both look fine until read.
    expect(schema('HealthResponseDto').properties?.status).toEqual({
      type: 'string',
    });
    expect(schema('HealthResponseDto').required).toEqual(['status']);
  });

  it('documents no 500 anywhere, on health least of all', () => {
    // The resolved policy: every operation can answer 500 through the global
    // filter, so the document says it once in its description instead of
    // widening every generated response union with the same dead fact. Hello
    // (this route's predecessor) was the arbitrary outlier that made the
    // inconsistency visible.
    expect(
      Object.keys(spec.paths[`/${API_PREFIX}/health`].get.responses),
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

  describe('the transaction endpoints', () => {
    const collection = () => spec.paths[`/${API_PREFIX}/transactions`];
    const item = () => spec.paths[`/${API_PREFIX}/transactions/{id}`];

    it('declares the two reads and the three writes, and nothing else', () => {
      // This assertion used to read "and no reads yet", which is what caught
      // PET-28 landing them - the point of pinning the operation set is that a
      // sixth one cannot appear here without somebody updating this line.
      expect(Object.keys(collection()).sort()).toEqual(['get', 'post']);
      expect(Object.keys(item()).sort()).toEqual(['delete', 'get', 'patch']);
    });

    it.each([
      ['list', () => collection().get, ['200', '400', '401']],
      ['detail', () => item().get, ['200', '400', '401', '404']],
      ['create', () => collection().post, ['201', '400', '401', '404']],
      ['update', () => item().patch, ['200', '400', '401', '404']],
      ['delete', () => item().delete, ['204', '400', '401', '404']],
    ])('documents %s with exactly its own statuses', (_name, op, codes) => {
      expect(Object.keys(op().responses).sort()).toEqual(codes);

      // Every declared error status points at the one error shape. Derived from
      // `codes` rather than hardcoded, because the list is the one operation with
      // no 404: `categoryId` there is a filter, so an id naming nothing simply
      // matches nothing. 400 is reachable on all five - the three with a body or
      // a query string validate it, and delete still has a ParseUUIDPipe.
      for (const status of codes.filter((code) => code.startsWith('4'))) {
        expect(
          op().responses[status].content?.['application/json'].schema?.$ref,
        ).toBe(ERROR_REF);
      }
    });

    it('requires the bearer on every one of them', () => {
      // Class-level `@ApiBearerAuth()`, so this is really pinning that the
      // decorator has not been lost from the controller as a whole.
      for (const op of [
        collection().get,
        collection().post,
        item().get,
        item().patch,
        item().delete,
      ]) {
        expect(op.security).toEqual([{ bearer: [] }]);
      }
    });

    it('publishes the list filters as real enums, not as widened strings', () => {
      // The failure this pins is silent and total: a widened `type: string`
      // generates a frontend type accepting any text at all, and no build fails.
      // Every enum in this spec is declared with an explicit `enum:` for that
      // reason rather than left to the swagger plugin.
      const byName = Object.fromEntries(
        collection().get.parameters!.map((p) => [p.name, p.schema]),
      );

      expect(Object.keys(byName).sort()).toEqual([
        'categoryId',
        'period',
        'search',
        'sort',
      ]);
      // **`period` is the one filter that is deliberately not an enum**, and this
      // is where that is recorded. PET-72 widened it to accept a period `start`
      // alongthe three named values, and no enum can express "these three
      // literals or any date" - so it publishes a `pattern` instead, which is the
      // same defence against a widened bare string.
      expect(byName.period).toMatchObject({
        pattern: '^(current|previous|all|\\d{4}-\\d{2}-\\d{2})$',
        default: 'current',
      });
      expect(byName.period).not.toHaveProperty('enum');
      // Four values as of PET-67, and `sort` stays a single flat enum rather
      // than splitting into a field plus a direction: a product of two enums
      // publishes no list for the frontend's own exhaustiveness proof to be
      // stated against. See `TRANSACTION_SORTS`.
      expect(byName.sort).toMatchObject({
        enum: ['date_desc', 'date_asc', 'amount_desc', 'amount_asc'],
        default: 'date_desc',
      });
      // Every one optional: an absent filter is absent, not a wildcard.
      for (const parameter of collection().get.parameters!) {
        expect(parameter.required).toBe(false);
      }
    });

    it('returns the composed shapes from both reads, never a bare {}', () => {
      expect(
        collection().get.responses['200'].content?.['application/json'].schema
          ?.$ref,
      ).toBe('#/components/schemas/TransactionsResponseDto');
      expect(
        item().get.responses['200'].content?.['application/json'].schema?.$ref,
      ).toBe('#/components/schemas/TransactionDetailResponseDto');

      // The detail read embeds PET-35's category DTO rather than restating its
      // fields. If this ever stops referencing it, the two screens have started
      // describing the same category two ways.
      //
      // Read through `allOf`, which is not incidental: a `$ref` carrying a
      // sibling `description` is illegal in OpenAPI 3.0, so the generator wraps
      // it, and `openapi-typescript` unwraps it back to a plain
      // `components["schemas"]["CategoryResponseDto"]`. Asserting the bare `$ref`
      // form would fail the moment somebody documents the field.
      const category = schema('TransactionDetailResponseDto').properties!
        .category as { $ref?: string; allOf?: { $ref?: string }[] };

      expect(category.$ref ?? category.allOf?.[0]?.$ref).toBe(
        '#/components/schemas/CategoryResponseDto',
      );
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

  describe('the scan endpoint (PET-59)', () => {
    const op = () => spec.paths[`/${API_PREFIX}/transactions/scan`].post;

    it('requires the bearer, like every other transaction operation', () => {
      expect(op().security).toEqual([{ bearer: [] }]);
    });

    it('declares multipart/form-data, not JSON', () => {
      // The plugin cannot infer a file field, so this is described by hand
      // with @ApiConsumes/@ApiBody - pinned because nothing else would catch
      // it silently reverting to the default application/json.
      expect(op().requestBody?.content).toHaveProperty('multipart/form-data');
      expect(op().requestBody?.content).not.toHaveProperty('application/json');
    });

    it('documents exactly its own statuses, the keyless 503 and timeout 504 included', () => {
      expect(Object.keys(op().responses).sort()).toEqual([
        '200',
        '400',
        '401',
        '413',
        '429',
        '503',
        '504',
      ]);

      for (const status of ['400', '401', '413', '429', '503', '504']) {
        expect(
          op().responses[status].content?.['application/json'].schema?.$ref,
        ).toBe(ERROR_REF);
      }
    });

    it('returns the extraction shape, with missing as a real enum', () => {
      expect(
        op().responses['200'].content?.['application/json'].schema?.$ref,
      ).toBe('#/components/schemas/ScanReceiptResponseDto');

      const missing = schema('ScanReceiptResponseDto').properties!.missing as {
        items?: { enum?: string[] };
      };
      expect(missing.items?.enum?.sort()).toEqual([
        'amount',
        'categoryId',
        'date',
        'merchant',
      ]);
    });

    it('marks every extracted field nullable, since an unreadable receipt is a real 200', () => {
      for (const name of ['merchant', 'amount', 'date', 'categoryId', 'note']) {
        expect(
          schema('ScanReceiptResponseDto').properties![name],
        ).toMatchObject({ nullable: true });
      }
    });
  });

  describe('the category endpoints', () => {
    const collection = () => spec.paths[`/${API_PREFIX}/categories`];
    const item = () => spec.paths[`/${API_PREFIX}/categories/{id}`];

    it('declares three collection operations and two on the item', () => {
      // This assertion did not exist until PET-70 added the third collection
      // operation, which is exactly the gap it now closes: a sixth one cannot
      // appear without somebody updating this line. There is deliberately no
      // `GET /categories/{id}` - nothing in the design reads one on its own.
      expect(Object.keys(collection()).sort()).toEqual([
        'get',
        'patch',
        'post',
      ]);
      expect(Object.keys(item()).sort()).toEqual(['delete', 'patch']);
    });

    // Each row is already in sorted order, so a status added to an operation
    // shows up here as a mismatch rather than being absorbed.
    it.each([
      // The list's 400 is PET-72's `?period=`: a date starting none of the
      // caller's periods is rejected rather than answered with the one around it.
      ['list', () => collection().get, ['200', '400', '401']],
      ['create', () => collection().post, ['201', '400', '401']],
      ['bulk caps', () => collection().patch, ['200', '400', '401', '404']],
      ['update', () => item().patch, ['200', '400', '401', '404', '409']],
      ['delete', () => item().delete, ['204', '401', '404', '409']],
    ])('documents %s with exactly its own statuses', (_name, op, codes) => {
      expect(Object.keys(op().responses).sort()).toEqual(codes);

      for (const status of codes.filter((code) => code.startsWith('4'))) {
        expect(
          op().responses[status].content?.['application/json'].schema?.$ref,
        ).toBe(ERROR_REF);
      }
    });

    it('declares no 409 on the bulk write, unlike the two item writes', () => {
      // The fallback's cap is editable and no rename is in play, so this is the
      // one categories write with no conflict case. Pinned separately from the
      // status table above because it is the assertion somebody would break by
      // adding a budget ceiling server-side - which A43 and PET-38's own test
      // say must not happen.
      expect(collection().patch.responses['409']).toBeUndefined();
      expect(item().patch.responses['409']).toBeDefined();
      expect(item().delete.responses['409']).toBeDefined();
    });

    it('requires the bearer on every one of them', () => {
      for (const op of [
        collection().get,
        collection().post,
        collection().patch,
        item().patch,
        item().delete,
      ]) {
        expect(op.security).toEqual([{ bearer: [] }]);
      }
    });

    it('answers the whole screen from the bulk write, not a bare {}', () => {
      // The same shape `GET /categories` returns, deliberately: a cap moving
      // changes every card's status and the allocation header with it.
      expect(
        collection().patch.responses['200'].content?.['application/json'].schema
          ?.$ref,
      ).toBe('#/components/schemas/CategoriesResponseDto');
    });

    it('publishes the bulk body as a wrapper object of nested entries', () => {
      // A wrapper rather than a bare array because `ValidationPipe` skips a body
      // whose reflected metatype is `Array`, which would leave every decorator
      // below unrun. A bare array also cannot carry `@ApiProperty`, so if this
      // ever stops being a `$ref` the validation has probably gone with it.
      expect(
        collection().patch.requestBody?.content['application/json'].schema
          ?.$ref,
      ).toBe('#/components/schemas/UpdateCategoryCapsDto');

      const entries = schema('UpdateCategoryCapsDto').properties!
        .categories as {
        type?: string;
        description?: string;
        minItems?: number;
        maxItems?: number;
        uniqueItems?: boolean;
        items?: { $ref?: string };
      };

      expect(entries).toMatchObject({
        type: 'array',
        // Both spelled into `@ApiProperty`: the plugin publishes neither
        // `@ArrayNotEmpty` nor `@ArrayMaxSize` on its own.
        minItems: 1,
        maxItems: 100,
        // This one the plugin does derive, from `@ArrayUnique`. It is weaker
        // than the real rule, which is uniqueness by `id` rather than by whole
        // entry, which is why the description states the id rule in prose.
        uniqueItems: true,
      });
      expect(entries.items?.$ref).toBe('#/components/schemas/CategoryCapDto');
      // On the field rather than the operation, because it is what `uniqueItems`
      // fails to express: uniqueness there is by whole entry, and the real rule
      // is by `id` alone.
      expect(entries.description).toMatch(/repeated `id`/i);
    });

    it('makes every cap entry carry both an id and a nullable cap', () => {
      // `monthlyCap` in `required` **and** nullable is the whole shape: this
      // endpoint has no leave-alone case, so an omitted cap is a 400, while
      // `null` is the supported way to clear one. Turning the `@ValidateIf` into
      // an `@IsOptional` would drop it out of `required` here.
      expect(schema('CategoryCapDto').required!.slice().sort()).toEqual([
        'id',
        'monthlyCap',
      ]);
      expect(schema('CategoryCapDto').properties!.id).toMatchObject({
        type: 'string',
        format: 'uuid',
      });

      const cap = schema('CategoryCapDto').properties!.monthlyCap;

      expect(cap).toMatchObject({
        type: 'number',
        nullable: true,
        minimum: 0,
        exclusiveMinimum: true,
        maximum: 1_000_000_000,
      });
      // The same @IsPositive trap the transaction amounts carry: rendered as
      // `minimum: 1` it would forbid every cap under a unit.
      expect(cap).not.toMatchObject({ minimum: 1 });
    });

    it('says the bulk write is all-or-nothing and lets caps exceed the budget', () => {
      // Both are properties a client cannot see from the shape. The first is
      // what makes retrying the identical payload safe; the second is why there
      // is no 409 above.
      const description = collection().patch.description!;

      expect(description).toMatch(/all or nothing/i);
      expect(description).toMatch(/negative/i);
    });
  });

  describe('the profile endpoints', () => {
    const path = () => spec.paths[`/${API_PREFIX}/profile`];
    const schedulePath = () => spec.paths[`/${API_PREFIX}/profile/schedule`];

    it('declares exactly a read and an update, on the collection itself', () => {
      // No `/profile/{id}`, and there must never be one: the resource is always
      // the session's own. `schedule` is a literal sub-path, not an id.
      expect(Object.keys(path()).sort()).toEqual(['get', 'patch']);
      expect(Object.keys(schedulePath()).sort()).toEqual(['post']);
    });

    it('answers the schedule write with 200, not a POST’s default 201', () => {
      // It appends rows but creates no addressable resource, and what it returns
      // is the profile. Without `@HttpCode(HttpStatus.OK)` the runtime would send
      // 201 while this document promised 200, and the generated client would read
      // its success arm off a status the server never sends.
      expect(Object.keys(schedulePath().post.responses).sort()).toEqual([
        '200',
        '400',
        '401',
      ]);
    });

    it('requires all three schedule fields, so a budget cannot be undated', () => {
      // The whole reason the endpoint exists: `firstPaycheckDate` being required
      // is what makes "set the budget for all of time" impossible to express.
      expect(schema('ChangeScheduleDto').required!.slice().sort()).toEqual([
        'firstPaycheckDate',
        'monthStartDay',
        'monthlyBudget',
      ]);
      expect(
        schema('ChangeScheduleDto').properties!.firstPaycheckDate,
      ).toMatchObject({ format: 'date' });
      expect(
        schema('ChangeScheduleDto').properties!.monthStartDay,
      ).toMatchObject({ type: 'integer', maximum: 28 });
    });

    it('keeps the budget and pay day off the ordinary update', () => {
      // Both were fields of this DTO before PET-72, and accepting them meant
      // silently rewriting every period the account had. `forbidNonWhitelisted`
      // rejects them now, and this is what would notice one creeping back.
      expect(
        Object.keys(schema('UpdateProfileDto').properties!).sort(),
      ).toEqual(['currency', 'email', 'fullName']);
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

    it('returns the same five-field profile from all three', () => {
      const ref = '#/components/schemas/ProfileResponseDto';

      // Three operations now: PET-72 split the budget and pay-day write onto
      // `POST /profile/schedule`, and all three answer the same representation.
      for (const op of [path().get, path().patch, schedulePath().post]) {
        expect(
          op.responses['200'].content?.['application/json'].schema?.$ref,
        ).toBe(ref);
      }

      // All five always present - a client never has to tell "unset" from
      // "absent". Two of them are resolved from history rather than selected from
      // a column, which the response shape deliberately does not reveal.
      expect(schema('ProfileResponseDto').required!.slice().sort()).toEqual([
        'currency',
        'email',
        'fullName',
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

    it('publishes the update email as an email', () => {
      expect(schema('UpdateProfileDto').properties!.email).toMatchObject({
        type: 'string',
        format: 'email',
      });
    });

    it('publishes the schedule budget as money, not as an integer', () => {
      // The @IsPositive() trap, following the field onto its new endpoint: the
      // plugin renders it as `minimum: 1`, which is right for an integer and wrong
      // for money - it would forbid every budget under a unit.
      const budget = schema('ChangeScheduleDto').properties!.monthlyBudget;
      expect(budget).toMatchObject({
        type: 'number',
        minimum: 0,
        exclusiveMinimum: true,
        maximum: 1_000_000_000,
      });
      expect(budget).not.toMatchObject({ minimum: 1 });
    });

    it('says what the 409 means, that null is not accepted, and where the budget went', () => {
      const description = path().patch.description!;

      expect(description).toMatch(/409/);
      expect(description).toMatch(/null/);
      // The redirection is the part a client cannot infer from the shape: the
      // field is simply absent, which reads as an oversight without this.
      expect(description).toMatch(/profile\/schedule/);
    });

    it('says the schedule write is from a date, and that it leaves history alone', () => {
      const description = schedulePath().post.description!;

      expect(description).toMatch(/firstPaycheckDate/);
      expect(description).toMatch(/earlier period/i);
      // The two properties a client has to know to build the modal's copy.
      expect(description).toMatch(/stretched/i);
      expect(description).toMatch(/past/i);
    });
  });

  describe('the dashboard endpoint', () => {
    const path = () => spec.paths[`/${API_PREFIX}/dashboard`];

    it('declares exactly a read, on the collection itself', () => {
      // Singular /dashboard, no id: the resource is always the session's own.
      expect(Object.keys(path()).sort()).toEqual(['get']);
    });

    it('documents 200, 400 and 401 - the 400 is the period query', () => {
      // 400 arrived with PET-72's `?period=`: a date that starts none of the
      // caller's periods is rejected rather than answered with the period around
      // it. There is still no id to reject, so there is still no 404.
      expect(Object.keys(path().get.responses).sort()).toEqual([
        '200',
        '400',
        '401',
      ]);
      expect(
        path().get.responses['401'].content?.['application/json'].schema?.$ref,
      ).toBe(ERROR_REF);
    });

    it('requires the bearer', () => {
      expect(path().get.security).toEqual([{ bearer: [] }]);
    });

    it('returns DashboardResponseDto, never a bare {}', () => {
      expect(
        path().get.responses['200'].content?.['application/json'].schema?.$ref,
      ).toBe('#/components/schemas/DashboardResponseDto');

      // All eleven fields, including the nullable one: nullable is not optional
      // in this codebase's convention (TransactionResponseDto.note is the
      // precedent), so a null topCategory is still a present key rather than an
      // absent one. `period` is PET-72's, and says which period every other
      // figure here is for. **`insight` was a twelfth until PET-73 removed it** -
      // see the assertion below, which is the inverse of the one it replaces.
      expect(schema('DashboardResponseDto').required!.slice().sort()).toEqual([
        'averagePerDay',
        'categories',
        'daysLeft',
        'monthlyBudget',
        'period',
        'recentTransactions',
        'remaining',
        'spent',
        'topCategory',
        'transactionCount',
        'weeklyBuckets',
      ]);
    });

    it('publishes no insight field at all, because the teaser card is gone', () => {
      // The inverse of the assertion this replaces, and it is worth keeping in
      // that shape rather than deleting: PET-25 widened `insight` from a string
      // to a nullable `$ref`, and PET-73 removed it - the insight cards moved
      // onto this screen and read `GET /api/insights` directly, so a field on a
      // snapshot that cannot update itself would publish a set nothing reads.
      expect(schema('DashboardResponseDto').properties).not.toHaveProperty(
        'insight',
      );
    });

    it('publishes topCategory as a nullable reference, not a bare object', () => {
      const topCategory = schema('DashboardResponseDto').properties!
        .topCategory as { $ref?: string; allOf?: { $ref?: string }[] };

      expect(topCategory.$ref ?? topCategory.allOf?.[0]?.$ref).toBe(
        '#/components/schemas/TopCategoryDto',
      );
      expect(topCategory.nullable).toBe(true);
    });

    it('embeds TransactionResponseDto for the recent-transactions card, not a fresh shape', () => {
      const recent = schema('DashboardResponseDto').properties!
        .recentTransactions as { items?: { $ref?: string } };

      expect(recent.items?.$ref).toBe(
        '#/components/schemas/TransactionResponseDto',
      );
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

    expect(properties.fullName).toMatchObject({ maxLength: 100 });
    expect(properties.email).toMatchObject({ format: 'email' });
    // Major units, not the cents the column stores. The description is the
    // JSDoc on the DTO, lifted by the plugin's `introspectComments`.
    expect(properties.monthlyBudget.description).toMatch(/major units/i);

    expect(schema('RegisterDto').required).toEqual(
      expect.arrayContaining([
        'fullName',
        'email',
        'monthlyBudget',
        'categories',
      ]),
    );
    expect(schema('RegisterDto').required).not.toContain('currency');
    expect(schema('RegisterDto').required).not.toContain('monthStartDay');
  });

  describe.each(['RegisterDto', 'UpdateProfileDto'])(
    'the currency field %s shares with the other',
    (name) => {
      it('publishes currency as a real enum rather than a bare string', () => {
        // **An enum since PET-72, where it was a hand-written `pattern` before.**
        // The old pin asserted `^[A-Za-z]{3}$`, which described the *shape* of an
        // ISO 4217 code and accepted all 180 of them - including the zero- and
        // three-decimal currencies `src/common/money.ts` would scale wrongly by a
        // factor of a hundred or ten. The allowlist is the fix, and publishing it
        // as an enum is what lets the frontend's picker be typed off the contract
        // instead of restating a list.
        const currency = schema(name).properties!.currency;
        expect(currency).toMatchObject({ type: 'string' });
        expect(currency.enum).toContain('EUR');
        expect(currency.enum).toContain('USD');
        // The exponent rule, asserted by its consequences rather than restated:
        // these are real ISO 4217 codes and must not be offered.
        expect(currency.enum).not.toContain('JPY');
        expect(currency.enum).not.toContain('KWD');
        expect(currency).not.toHaveProperty('pattern');
      });
    },
  );

  describe.each(['RegisterDto', 'ChangeScheduleDto'])(
    'the pay day %s publishes',
    (name) => {
      it('publishes monthStartDay as an integer, not any number', () => {
        // The plugin renders every TS `number` as `type: 'number'`, which would
        // publish 3.5 as a valid day while @IsInt() rejects it. The explicit
        // type and the derived bounds coexist.
        //
        // Paired with `ChangeScheduleDto` rather than `UpdateProfileDto` since
        // PET-72: the pay day left the ordinary update, because changing it
        // reshapes every period after it and so needs a date to apply from.
        expect(schema(name).properties!.monthStartDay).toMatchObject({
          type: 'integer',
          minimum: 1,
          maximum: 28,
        });
      });
    },
  );

  describe('the category colour and icon enums', () => {
    // **The single most load-bearing thing in this file, as of PET-64.**
    // `frontend/src/components/ui/categoryColour.ts` keys three `Record`s by
    // the union these enums generate, and that record is its own exhaustiveness
    // proof only while the union is literal. Widen either field to a bare
    // `string` - by dropping the explicit `enum:`, or by skipping `api:sync` -
    // and `Record<CategoryColour, string>` degrades to `Record<string, string>`,
    // which accepts any subset of keys. The build stays green and every tile
    // renders grey.

    const COLOUR_TOKENS = [
      'primary',
      'primary-content',
      'secondary',
      'secondary-content',
      'accent',
      'accent-content',
      'neutral',
      'neutral-content',
      'info',
      'info-content',
      'success',
      'success-content',
      'warning',
      'warning-content',
      'error',
      'error-content',
      // The seventeenth, and the only one that is not a plain semantic token.
      // It is here because the other sixteen cannot supply a muted colour that
      // is visible in both themes - `COLOUR_CONTRAST` in template-tokens.ts
      // carries the measured table - and the `Uncategorized` fallback needs one.
      'base-content/50',
    ];

    const ICON_NAMES = [
      // PET-64: one per seeded category, then the fallback's.
      'shopping-basket',
      'utensils',
      'car',
      'zap',
      'heart-pulse',
      'tv',
      'graduation-cap',
      'plane',
      'scissors',
      'gift',
      'paw-print',
      'landmark',
      'circle-question-mark',
      // PET-65: offered to a user's own categories. Order matters as much as
      // membership here, because `toEqual` on an array is order-sensitive and
      // `icon_templates.sort_order` is assigned from it.
      'coffee',
      'beer',
      'pizza',
      'ice-cream-cone',
      'fuel',
      'bus',
      'panda',
      'bike',
      'square-parking',
      'house',
      'bird',
      'waves-horizontal',
      'wifi',
      'smartphone',
      'trash-2',
      'wrench',
      'sofa',
      'pill',
      'stethoscope',
      'dumbbell',
      'eye',
      'tag',
      'shirt',
      'package',
      'gem',
      'scale',
      'credit-card',
      'piggy-bank',
      'shopping-cart',
      'percent',
      'receipt',
      'trending-up',
      'shield',
      'gamepad-2',
      'music',
      'film',
      'ticket',
      'book',
      'camera',
      'palette',
      'briefcase',
      'pencil',
      'fish',
      'baby',
      'users',
      'rabbit',
      'sailboat',
      'tree-palm',
      'key-round',
      'tent',
      'heart',
    ];

    // Written out here rather than imported from template-tokens.ts on purpose.
    // Importing would make this assert the constant against itself, which is
    // the failure `SIDEBAR_HREFS`' own note describes: the point is that the
    // *published contract* carries these seventeen and these sixty-four, so a
    // deliberate change has to be made in two places and an accidental one
    // fails here.
    //
    // PET-65 is the worked example of that working. Adding fifty-one icons
    // failed here first, with a diff naming all fifty-one, which is exactly the
    // second place the paragraph above promises. Copy the list rather than
    // reaching for an import when this fails: the duplication is the check.

    it.each([
      'CreateCategoryDto',
      'UpdateCategoryDto',
      'CategoryResponseDto',
      'TopCategoryDto',
      'DashboardCategoryDto',
    ])('publishes %s.color as the token enum, with no pattern', (name) => {
      const color = schema(name).properties!.color;

      expect(color.enum).toEqual(COLOUR_TOKENS);
      // The hex regex is gone, and its absence is the assertion: a leftover
      // `pattern` beside the enum would reject every value the enum allows.
      expect(color.pattern).toBeUndefined();
    });

    it.each(['CreateCategoryDto', 'UpdateCategoryDto', 'CategoryResponseDto'])(
      'publishes %s.icon as the lucide enum',
      (name) => {
        expect(schema(name).properties!.icon.enum).toEqual(ICON_NAMES);
      },
    );

    it('requires an icon on create and does not let a patch clear one', () => {
      // Narrowed together: `cup` and `box` were accepted before this and
      // neither is a lucide name, so both were values no frontend could draw.
      expect(schema('CreateCategoryDto').required).toContain('icon');
      expect(schema('UpdateCategoryDto').properties!.icon.nullable).toBeFalsy();
    });
  });

  describe('the template endpoints', () => {
    const categories = () => spec.paths[`/${API_PREFIX}/templates/categories`];
    const palette = () => spec.paths[`/${API_PREFIX}/templates/palette`];

    it('declares a read on each and nothing else', () => {
      expect(Object.keys(categories()).sort()).toEqual(['get']);
      expect(Object.keys(palette()).sort()).toEqual(['get']);
    });

    it('leaves the categories read unsecured and guards the palette', () => {
      // The fifth `@Public()` route, and the only one that is not part of
      // getting a credential: onboarding step 2 draws its chips before an
      // account exists. `security` is absent rather than empty on a public
      // route, which is how the other four read too.
      expect(categories().get.security).toBeUndefined();
      expect(palette().get.security).toEqual([{ bearer: [] }]);
    });

    it('documents a 401 on the guarded one only', () => {
      expect(Object.keys(categories().get.responses).sort()).toEqual(['200']);
      expect(Object.keys(palette().get.responses).sort()).toEqual([
        '200',
        '401',
      ]);
    });

    it('returns composed shapes, never a bare {}', () => {
      expect(
        categories().get.responses['200'].content?.['application/json'].schema
          ?.$ref,
      ).toBe('#/components/schemas/CategoryTemplatesResponseDto');
      expect(
        palette().get.responses['200'].content?.['application/json'].schema
          ?.$ref,
      ).toBe('#/components/schemas/PaletteResponseDto');
    });

    it('gives a category template an id, a name, both tokens and a description', () => {
      expect(
        Object.keys(schema('CategoryTemplateDto').properties!).sort(),
      ).toEqual(['color', 'description', 'icon', 'id', 'name']);
      // The name is the one field with no enum, because it is the one field an
      // admin authors freely.
      expect(
        schema('CategoryTemplateDto').properties!.name.enum,
      ).toBeUndefined();
    });

    it('publishes RegisterDto.categories as uuids rather than a name enum', () => {
      // It carried a real `enum` of the ten starter names until PET-64, which
      // is what `app/setup/starterCategories.ts` read its union out of. The
      // offered list is admin data now, so there is no union to publish and the
      // frontend fetches the list instead.
      const categories = schema('RegisterDto').properties!.categories as {
        type?: string;
        items?: Record<string, unknown>;
      };

      expect(categories.type).toBe('array');
      expect(categories.items).toMatchObject({ format: 'uuid' });
      expect(categories.items?.enum).toBeUndefined();
    });
  });

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
