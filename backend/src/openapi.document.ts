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
    .setTitle('Expensa API')
    .setDescription(
      [
        'The HTTP contract of the Expensa backend.',
        '',
        'Generated from the NestJS code at build time, committed as `backend/openapi.json`, and',
        'the only source of the frontend response types in `frontend/src/types/api.d.ts`.',
        'Do not edit either by hand: run `npm run api:sync` from the repo root.',
      ].join('\n'),
    )
    .setVersion('0.1.0')
    .build();

  return SwaggerModule.createDocument(app, config);
}
