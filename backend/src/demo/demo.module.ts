import { Module } from '@nestjs/common';
import { InsightsModule } from '../insights/insights.module';
import { DemoSeedService } from './demo-seed.service';

/**
 * The demo pool: restoring a pooled account to the fixture, and (from the rest
 * of PET-86) leasing one to a visitor.
 *
 * **One import, and the ones that are absent are the point.** `InsightsModule`
 * is here because a seeded account whose insights were never generated demos the
 * empty state. `DatabaseModule` is `@Global`, so `UserDatabaseService` injects
 * without one. And there is deliberately no `AuthModule`, `UsersModule` or
 * `TemplatesModule`: provisioning an account happens once, when the pool is
 * built from the terminal, and nothing on the request path creates a user,
 * mints a login token or reads a category template. That is what let
 * `AuthModule` keep exporting `SessionService` alone.
 *
 * `DemoSeedService` is exported because `src/scripts/seed-showcase.ts` resolves
 * it out of the application context, which is the whole reason the write phase
 * moved into a service: the CLI and the running backend now seed an account the
 * same way rather than two ways that have to be kept in step.
 */
@Module({
  imports: [InsightsModule],
  providers: [DemoSeedService],
  exports: [DemoSeedService],
})
export class DemoModule {}
