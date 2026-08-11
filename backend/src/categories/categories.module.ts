import { Module } from '@nestjs/common';
import { PeriodsModule } from '../periods/periods.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

/**
 * Category CRUD, per-period stats and the allocation summary.
 *
 * **One import, `PeriodsModule`, and it is new as of PET-72.** This module had
 * none at all, because it resolved the budgeting period itself. It no longer
 * does: `PeriodService` owns that, and this feature asks it which window to
 * aggregate over and what the budget was then.
 *
 * Nothing else is missing: `DatabaseModule` is @Global so `UserDatabaseService`
 * injects without one, `ConfigModule` is registered with `isGlobal: true` so
 * `ConfigService` does too, `SessionGuard` is registered globally in AppModule,
 * and `@CurrentUser` is a plain param decorator with no provider behind it.
 *
 * `CategoriesService` is exported because PET-20's dashboard composes it rather
 * than running a second copy of the same aggregation.
 */
@Module({
  imports: [PeriodsModule],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
