import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { API_PREFIX } from './common/api-prefix';
import { buildOpenApiDocument } from './openapi.document';

async function bootstrap() {
  // Typed as the Express application because `.set()` below is Express's, not
  // part of INestApplication. Everything else here is unaffected:
  // NestExpressApplication extends it.
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Read config through ConfigService rather than process.env directly, so
  // values come from backend/.env (loaded by ConfigModule) as well as the shell.
  const config = app.get(ConfigService);

  // How many reverse proxies sit in front of us. AuthModule's per-IP throttler
  // keys on req.ip, and behind a proxy that is the proxy's own address unless
  // Express is told how many hops to trust - so leaving this at 0 on a proxied
  // host collapses every caller into one bucket and turns AUTH_RATE_IP_LIMIT
  // into a global cap on the auth routes. The default is 0 rather than 1 because
  // the opposite mistake is worse: trusting X-Forwarded-For with nothing in
  // front lets a client choose its own bucket per request, defeating the limiter
  // completely. Numeric, never `true`, which trusts every hop and reopens that
  // same hole. The deployment sets it (backend/fly.toml).
  const trustedProxyHops = config.get<number>('TRUST_PROXY_HOPS', 0);
  if (trustedProxyHops > 0) {
    app.set('trust proxy', trustedProxyHops);
  }

  // Serve every route under /api (e.g. GET /api/health).
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
