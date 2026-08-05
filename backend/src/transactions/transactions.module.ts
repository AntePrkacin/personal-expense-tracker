import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

/**
 * Transaction writes and reads.
 *
 * **One import, and it is the reads' whole reason for existing here.**
 * `CategoriesModule` exports `CategoriesService`, which owns the app's only month
 * aggregation: the list read gets its `period` windows from it and the detail read
 * gets one category's month stats. Computing either here instead would put a
 * second copy of the same arithmetic behind a second screen.
 *
 * Nothing else needs importing: `DatabaseModule` is @Global so
 * `UserDatabaseService` injects without one, `SessionGuard` is registered
 * globally in AppModule rather than pulled in per feature, and `@CurrentUser` is
 * a plain param decorator with no provider behind it.
 */
@Module({
  imports: [CategoriesModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  // Exported because PET-20's dashboard composes it for the recent-
  // transactions card, the same reason CategoriesModule exports
  // CategoriesService: a fourth place computing month spend is precisely what
  // backend/CLAUDE.md's money note already calls a bug.
  exports: [TransactionsService],
})
export class TransactionsModule {}
