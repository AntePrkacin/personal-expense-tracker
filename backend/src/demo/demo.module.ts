import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InsightsModule } from '../insights/insights.module';
import { DemoController } from './demo.controller';
import { DemoLeaseService } from './demo-lease.service';
import { DemoSeedService } from './demo-seed.service';

/**
 * The demo pool: restoring a pooled account to the fixture, and (from the rest
 * of PET-86) leasing one to a visitor.
 *
 * **Two imports, and the ones that are absent are the point.** `InsightsModule`
 * is here because a seeded account whose insights were never generated demos the
 * empty state, and `AuthModule` for `SessionService`, which is the one thing it
 * has always exported and the only thing needed here. `DatabaseModule` is
 * `@Global`, so `UserDatabaseService` and the central handle inject without one.
 *
 * There is deliberately no `UsersModule` and no `TemplatesModule`: provisioning
 * an account happens once, when the pool is built from the terminal, and nothing
 * on the request path creates a user, mints a login token or reads a category
 * template. That is what let `AuthModule` keep exporting `SessionService` alone
 * rather than widening to `VerificationService` and `LoginTokenService` as well.
 *
 * Both services are exported because `src/scripts/seed-showcase.ts` resolves
 * them out of the application context - the seed to fill an account, the lease
 * to enrol it into the pool. That is the whole reason the write phase moved into
 * a service: the CLI and the running backend now seed an account the same way
 * rather than two ways that have to be kept in step.
 */
@Module({
  imports: [InsightsModule, AuthModule],
  controllers: [DemoController],
  providers: [DemoSeedService, DemoLeaseService],
  exports: [DemoSeedService, DemoLeaseService],
})
export class DemoModule {}
