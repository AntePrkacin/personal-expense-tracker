import { Module } from '@nestjs/common';
import { PeriodService } from './period.service';
import { PeriodsController } from './periods.controller';

/**
 * The budgeting period: which ones exist, which one is current, and what the
 * budget was during each.
 *
 * **Its own module rather than a corner of `CategoriesModule`, and that is the
 * substance of PET-72's refactor.** The period used to be resolved by a private
 * method on `CategoriesService`, exposed through two window wrappers that four
 * other features imported the whole categories feature to reach. Categories,
 * transactions, the dashboard, insights, the profile and verification all need a
 * period; only one of them has anything to do with categories.
 *
 * `PeriodService` is exported because all six compose it. Deliberately not
 * `@Global()`: `DatabaseModule` is global because every feature opens a database,
 * whereas a global here would hide which features actually depend on the period
 * and let a new one acquire that dependency without saying so in its imports.
 */
@Module({
  controllers: [PeriodsController],
  providers: [PeriodService],
  exports: [PeriodService],
})
export class PeriodsModule {}
