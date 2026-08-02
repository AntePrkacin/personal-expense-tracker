// MUST stay first. It scrubs the environment before app.module.ts is loaded,
// and app.module.ts reads its configuration the moment it is imported. See the
// comment in openapi.env.ts.
import { SCRATCH_DATABASE_DIR } from './openapi.env';

import { NestFactory } from '@nestjs/core';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { API_PREFIX } from './common/api-prefix';
import { buildOpenApiDocument } from './openapi.document';

/** Next to package.json, not inside dist/: this file is committed. */
const OUTPUT_PATH = join(__dirname, '..', 'openapi.json');

/**
 * Writes `backend/openapi.json` from the running app's own routes.
 *
 * Run it through `npm run api:spec`, never with ts-node. The schemas come from
 * `@nestjs/swagger`'s CLI plugin, which is a compile-time transformer wired
 * through `nest build`, so executing the TypeScript directly produces a spec
 * that is structurally valid and completely empty - the worst kind of failure,
 * because it looks like it worked.
 *
 * The app is created but never listened on, and closed before exit.
 */
async function emit(): Promise<void> {
  // Two nested finallys, not one: the scratch directory exists before the app
  // does (openapi.env.ts created it at import time), so it must be removed
  // even when NestFactory.create itself throws - which is also the one case
  // where there is no app to close.
  try {
    const app = await NestFactory.create(AppModule, { logger: false });

    try {
      app.setGlobalPrefix(API_PREFIX);

      const document = buildOpenApiDocument(app);
      writeFileSync(OUTPUT_PATH, `${JSON.stringify(document, null, 2)}\n`);
    } finally {
      await app.close();
    }
  } finally {
    rmSync(SCRATCH_DATABASE_DIR, { recursive: true, force: true });
  }

  console.log(`Wrote ${OUTPUT_PATH}`);
}

void emit();
