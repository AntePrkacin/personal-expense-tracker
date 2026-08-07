import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SessionGuard } from './auth/session.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { InsightsModule } from './insights/insights.module';
import { ProfileModule } from './profile/profile.module';
import { TransactionsModule } from './transactions/transactions.module';
import { UsersModule } from './users/users.module';

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
    DatabaseModule,
    UsersModule,
    AuthModule,
    ProfileModule,
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
