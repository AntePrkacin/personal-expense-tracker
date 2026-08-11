import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { trackByEmail, trackByIp, trackByUser } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SessionGuard } from './auth/session.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { InsightsModule } from './insights/insights.module';
import { PeriodsModule } from './periods/periods.module';
import { ProfileModule } from './profile/profile.module';
import { TemplatesModule } from './templates/templates.module';
import { TransactionsModule } from './transactions/transactions.module';
import { UsersModule } from './users/users.module';

const DEFAULT_EMAIL_RATE_LIMIT = 5;
const DEFAULT_IP_RATE_LIMIT = 30;
const DEFAULT_AUTH_RATE_TTL_S = 900;
const DEFAULT_SCAN_RATE_LIMIT = 10;
const DEFAULT_SCAN_RATE_TTL_S = 3600;

@Module({
  imports: [
    // Reads backend/.env at startup and makes ConfigService available everywhere
    // without re-importing this module. Copy .env.example to .env to set values.
    // Every variable has a default or is optional, so the app still boots with
    // no .env at all - see src/config/env.validation.ts.
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      // Under test, while generating the OpenAPI spec, and while seeding the
      // showcase user locally, read the environment only - never backend/.env.
      // All three boot the real AppModule and none of them has any business
      // touching Turso Cloud unless it was asked for by name. Scrubbing the
      // TURSO_* variables out of process.env is not enough on its own:
      // ConfigModule reads the file from disk and dotenv puts every deleted
      // key straight back, which is how the e2e suite once ran against live
      // Turso Cloud and created databases there. Jest sets NODE_ENV=test
      // itself; src/openapi.env.ts sets OPENAPI_EMIT and
      // src/scripts/seed-showcase.env.ts sets SEED_LOCAL, both before this
      // module is ever loaded.
      ignoreEnvFile:
        process.env.NODE_ENV === 'test' ||
        process.env.OPENAPI_EMIT === '1' ||
        process.env.SEED_LOCAL === '1',
    }),
    // In-process only, and the app's one indirect call. `TransactionsService`
    // emits that a user's numbers moved and `InsightsModule` listens, which is
    // what regenerates the insight set on every write. A direct call would be a
    // circular module dependency, since InsightsModule already imports
    // TransactionsModule for the generator - see
    // src/transactions/transaction-changed.event.ts. Registered globally rather
    // than per-module because forRoot() may only be called once.
    EventEmitterModule.forRoot(),
    DatabaseModule,
    UsersModule,
    TemplatesModule,
    // Registered here, once, rather than inside AuthModule: ThrottlerModule is
    // @Global(), so a second forRootAsync in a feature module would not scope
    // anything - both registrations export the same THROTTLER_OPTIONS token,
    // resolution order decides which survives, and the loser's throttler is
    // silently absent from every route that names it. `email` and `ip` are
    // AuthModule's own, moved here byte-identical at PET-59; `scan` is the
    // third, for POST /api/transactions/scan, keyed on the session user id
    // rather than IP because the budget it protects - the project's shared
    // Gemini quota - is per-user by construction. Every route not named
    // `scan` must carry `@SkipThrottle({ scan: true })`, and `/scan` itself
    // must skip `email` and `ip`: `ThrottlerGuard` runs every configured
    // throttler on a guarded route, so leaving either skip off would either
    // apply the scan limiter where it makes no sense or run the email
    // tracker's `no-email:<ip>` fallback (req.body is undefined on a
    // multipart request, guards running ahead of pipes) against a single
    // shared bucket.
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // v5+ takes ttl in MILLISECONDS. The *_TTL_S variables are seconds,
        // and getting this conversion wrong is silent: the window would
        // become 900ms instead of 900s and the limit would never be reached.
        const authTtl = seconds(
          config.get<number>('AUTH_RATE_TTL_S', DEFAULT_AUTH_RATE_TTL_S),
        );
        const scanTtl = seconds(
          config.get<number>('SCAN_RATE_TTL_S', DEFAULT_SCAN_RATE_TTL_S),
        );

        return {
          throttlers: [
            {
              name: 'email',
              limit: config.get<number>(
                'AUTH_RATE_LIMIT',
                DEFAULT_EMAIL_RATE_LIMIT,
              ),
              ttl: authTtl,
              getTracker: trackByEmail,
            },
            {
              name: 'ip',
              limit: config.get<number>(
                'AUTH_RATE_IP_LIMIT',
                DEFAULT_IP_RATE_LIMIT,
              ),
              ttl: authTtl,
              getTracker: trackByIp,
            },
            {
              name: 'scan',
              limit: config.get<number>(
                'SCAN_RATE_LIMIT',
                DEFAULT_SCAN_RATE_LIMIT,
              ),
              ttl: scanTtl,
              getTracker: trackByUser,
            },
          ],
        };
      },
    }),
    AuthModule,
    ProfileModule,
    // Registered here for its own `GET /api/periods` route. The four features
    // that compose `PeriodService` import it themselves, so this entry is about
    // the controller rather than about making the provider reachable.
    PeriodsModule,
    TransactionsModule,
    CategoriesModule,
    DashboardModule,
    InsightsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Registered as providers rather than via app.useGlobalPipes/Filters in
    // main.ts so the e2e suite, which boots AppModule directly, gets the same
    // validation and error shape as production.
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Same reason as the two above, plus one of its own: registering the guard
    // here makes authentication the default and `@Public()` the exception, so
    // the failure direction is fail-closed. Forgetting to mark a public route
    // 401s it loudly on the first request; forgetting `@UseGuards` on a private
    // one used to leave it open with nothing to notice. SessionGuard's
    // dependencies resolve because AuthModule exports SessionService.
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
})
export class AppModule {}
