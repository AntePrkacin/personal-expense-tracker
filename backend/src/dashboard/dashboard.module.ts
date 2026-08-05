import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { InsightsModule } from '../insights/insights.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/**
 * The dashboard read, composed rather than queried.
 *
 * Three imports, each exporting the service this feature actually calls:
 * `CategoriesModule` for the window and the per-category aggregation,
 * `TransactionsModule` for the recent-transactions shape (which itself imports
 * `CategoriesModule` for its own period filter - Nest resolves the shared
 * provider once), and `InsightsModule` for the teaser card (DSH-9).
 * `DatabaseModule` is `@Global`, so `UserDatabaseService` injects without an
 * import, and `SessionGuard` is registered globally in `AppModule` rather than
 * pulled in per feature.
 */
@Module({
  imports: [CategoriesModule, TransactionsModule, InsightsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
