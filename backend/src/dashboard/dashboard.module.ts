import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { PeriodsModule } from '../periods/periods.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/**
 * The dashboard read, composed rather than queried.
 *
 * Three imports, each exporting the service this feature actually calls:
 * `PeriodsModule` for the period being reported and the budget in force during
 * it, `CategoriesModule` for the per-category aggregation, and
 * `TransactionsModule` for the recent-transactions shape (both of which import
 * `PeriodsModule` themselves - Nest resolves the shared provider once).
 * `DatabaseModule` is `@Global`, so `UserDatabaseService` injects without an
 * import, and `SessionGuard` is registered globally in `AppModule` rather than
 * pulled in per feature.
 *
 * **`InsightsModule` was a fourth until PET-73 and is deliberately gone.** It was
 * here for `DashboardResponseDto.insight`, the teaser card's summary, and that
 * field is removed: the insight cards moved onto this screen and read
 * `GET /api/insights` directly, because the dashboard summary is a snapshot with
 * no way to update itself and the poll behind those cards exists precisely to not
 * be one. That reverses PET-25's "one call serves the whole screen" argument, and
 * `docs/TODO.md` records the reversal rather than deleting the argument.
 */
@Module({
  imports: [CategoriesModule, PeriodsModule, TransactionsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
