import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { INSIGHT_GENERATOR } from './insight-generator';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';
import { RuleBasedInsightGenerator } from './rule-based-insight.generator';

/**
 * Insight set storage, the read, and asynchronous generation.
 *
 * Two imports, for the generator's composition surface: `CategoriesModule` for
 * the windows, per-category stats and budget, `TransactionsModule` for the
 * period's transactions and the cross-month history. `DatabaseModule` is
 * `@Global` so `UserDatabaseService` injects without one, and `SessionGuard` is
 * registered globally in `AppModule`.
 *
 * **The generator is bound behind `INSIGHT_GENERATOR`, not by class.** That is
 * the LLM-ready seam: swapping `RuleBasedInsightGenerator` for a future
 * `LlmInsightGenerator` is this one line, with storage, the read and the
 * frontend untouched.
 *
 * `InsightsService` is exported because the dashboard composes it for the teaser
 * (DSH-9), the same reason `CategoriesModule` and `TransactionsModule` export
 * theirs.
 */
@Module({
  imports: [CategoriesModule, TransactionsModule],
  controllers: [InsightsController],
  providers: [
    InsightsService,
    { provide: INSIGHT_GENERATOR, useClass: RuleBasedInsightGenerator },
  ],
  exports: [InsightsService],
})
export class InsightsModule {}
