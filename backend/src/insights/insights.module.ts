import { Module } from '@nestjs/common';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';

/**
 * Insight set storage and the read.
 *
 * No imports, and none missing: `DatabaseModule` is `@Global` so
 * `UserDatabaseService` injects without one, and `SessionGuard` is registered
 * globally in `AppModule`.
 *
 * `InsightsService` is exported because the dashboard composes it for the teaser
 * (DSH-9) and PET-40's generation writes through it, the same reason
 * `CategoriesModule` and `TransactionsModule` export theirs.
 */
@Module({
  controllers: [InsightsController],
  providers: [InsightsService],
  exports: [InsightsService],
})
export class InsightsModule {}
