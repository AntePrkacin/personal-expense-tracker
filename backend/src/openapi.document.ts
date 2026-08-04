import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';

/**
 * Builds the OpenAPI document from the routes the app has actually registered.
 *
 * Shared by `main.ts`, which serves it at `/api/docs`, and `openapi.ts`, which
 * writes it to `backend/openapi.json`. One builder so the served document and
 * the committed one cannot describe different APIs.
 *
 * Call this only after `setGlobalPrefix(API_PREFIX)`: the paths are read from
 * the registered routes, so a document built too early keys every path without
 * its `/api`, and the frontend types generated from it then point at URLs that
 * 404.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Spendifico API')
    .setDescription(
      [
        'The HTTP contract of the Spendifico backend.',
        '',
        'Generated from the NestJS code at build time, committed as `backend/openapi.json`, and',
        'the only source of the frontend response types in `frontend/src/types/api.d.ts`.',
        'Do not edit either by hand: run `npm run api:sync` from the repo root.',
        '',
        'Every operation can additionally answer **500** with `ErrorResponseDto`, via the global',
        'exception filter. It is stated once here rather than per operation: it is the same',
        'non-actionable fact everywhere, and repeating it would widen every generated response type.',
      ].join('\n'),
    )
    .setVersion('0.1.0')
    // Without this the guarded operations describe no authentication at all,
    // silently: `@ApiBearerAuth()` names a scheme, and an undeclared name is
    // dropped rather than reported. The default name `bearer` is what the bare
    // decorator refers to, so the two have to stay paired.
    //
    // `addSecurity` rather than the `addBearerAuth` helper, which spreads its
    // options over a hardcoded `bearerFormat: 'JWT'` and therefore cannot be
    // talked out of publishing it. These are opaque database-backed tokens with
    // nothing for a client to parse, so that format would be a lie. The name
    // `bearer` is what a bare `@ApiBearerAuth()` refers to: keep them paired.
    .addSecurity('bearer', {
      type: 'http',
      scheme: 'bearer',
      description:
        'The raw session token returned by POST /api/auth/verify. Opaque: 256 random bits, base64url, looked up by hash server-side.',
    })
    .build();

  return SwaggerModule.createDocument(app, config);
}
