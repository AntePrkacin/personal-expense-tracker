import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
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
      // Under test, read the environment only, never backend/.env. Jest sets
      // NODE_ENV=test itself. Without this the e2e suite runs against whatever
      // is in a developer's .env: test/setup-e2e.ts deletes the TURSO_*
      // variables, but ConfigModule reads the file from disk and puts them
      // straight back, so a filled-in .env silently pointed the tests at real
      // Turso Cloud and created databases there.
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
    DatabaseModule,
    UsersModule,
    AuthModule,
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
  ],
})
export class AppModule {}
