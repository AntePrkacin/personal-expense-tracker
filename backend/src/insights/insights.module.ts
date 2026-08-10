import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { PeriodsModule } from '../periods/periods.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { INSIGHT_GENERATOR } from './insight-generator';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';
import { RuleBasedInsightGenerator } from './rule-based-insight.generator';
import { TransactionChangedListener } from './transaction-changed.listener';

/**
 * Insight set storage, the read, and asynchronous generation.
 *
 * Three imports, for the generator's composition surface: `PeriodsModule` for the
 * current and previous periods, `CategoriesModule` for the per-category stats and
 * the budget, `TransactionsModule` for the period's transactions and the
 * cross-period history. `DatabaseModule` is `@Global` so `UserDatabaseService`
 * injects without one, and `SessionGuard` is registered globally in `AppModule`.
 *
 * **The generator is bound behind `INSIGHT_GENERATOR`, not by class.** That is
 * the LLM-ready seam: swapping `RuleBasedInsightGenerator` for a future
 * `LlmInsightGenerator` is this one line, with storage, the read and the
 * frontend untouched.
 *
 * `InsightsService` is exported because the dashboard composes it for the teaser
 * (DSH-9), the same reason `CategoriesModule` and `TransactionsModule` export
 * theirs.
 *
 * **`TransactionChangedListener` is what regenerates on a write, and the
 * direction of the dependency is the whole point.** It listens here rather than
 * `TransactionsModule` calling `InsightsService`, because the import above
 * already runs the other way and a direct call would close the loop into a
 * circular module dependency. Nothing is exported for it: the emitter is the
 * only coupling.
 */
@Module({
  imports: [CategoriesModule, PeriodsModule, TransactionsModule],
  controllers: [InsightsController],
  providers: [
    InsightsService,
    TransactionChangedListener,
    { provide: INSIGHT_GENERATOR, useClass: RuleBasedInsightGenerator },
  ],
  exports: [InsightsService],
})
export class InsightsModule {}
