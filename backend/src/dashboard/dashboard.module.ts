import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { InsightsModule } from '../insights/insights.module';
import { PeriodsModule } from '../periods/periods.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/**
 * The dashboard read, composed rather than queried.
 *
 * Four imports, each exporting the service this feature actually calls:
 * `PeriodsModule` for the period being reported and the budget in force during
 * it, `CategoriesModule` for the per-category aggregation, `TransactionsModule`
 * for the recent-transactions shape (both of which import `PeriodsModule`
 * themselves - Nest resolves the shared provider once), and `InsightsModule` for
 * the teaser card (DSH-9). `DatabaseModule` is `@Global`, so `UserDatabaseService`
 * injects without an import, and `SessionGuard` is registered globally in
 * `AppModule` rather than pulled in per feature.
 */
@Module({
  imports: [
    CategoriesModule,
    PeriodsModule,
    TransactionsModule,
    InsightsModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
