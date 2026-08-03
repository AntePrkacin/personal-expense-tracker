import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { API_PREFIX } from './common/api-prefix';
import { buildOpenApiDocument } from './openapi.document';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Read config through ConfigService rather than process.env directly, so
  // values come from backend/.env (loaded by ConfigModule) as well as the shell.
  const config = app.get(ConfigService);

  // Serve every route under /api (e.g. GET /api/hello).
  app.setGlobalPrefix(API_PREFIX);

  // Interactive docs at /api/docs, from the same document `npm run api:spec`
  // writes to backend/openapi.json. `useGlobalPrefix` is what puts them under
  // /api: setGlobalPrefix does not reach the Swagger route on its own.
  SwaggerModule.setup('docs', app, buildOpenApiDocument(app), {
    useGlobalPrefix: true,
  });

  // Let the Next.js dev server call this API from the browser. Server-side
  // fetches (React Server Components) don't need CORS, but client-side ones do.
  app.enableCors({
    origin: config.get<string>('FRONTEND_URL', 'http://localhost:4200'),
  });

  // Lets DatabaseModule's onApplicationShutdown run on SIGINT/SIGTERM, so
  // database connections are flushed and closed instead of dropped.
  app.enableShutdownHooks();

  await app.listen(config.get<number>('PORT', 3000));
}
// `void` marks the floating promise as deliberately unawaited: nothing follows
// bootstrap, and a rejection here already terminates the process.
void bootstrap();
