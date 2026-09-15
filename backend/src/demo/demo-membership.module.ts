import { Module } from '@nestjs/common';
import { DemoMembershipService } from './demo-membership.service';
import { DemoTierThrottlerGuard } from './demo-tier-throttler.guard';

/**
 * Pool membership, and the throttler that acts on it.
 *
 * **A module of its own rather than part of `DemoModule`, and the reason is the
 * import graph.** Its consumers are `AssistantModule` and `TransactionsModule`,
 * the two features that spend the Gemini quota; `DemoModule` imports
 * `InsightsModule`, which imports `TransactionsModule`, so importing the whole
 * demo feature from a Gemini route would close a cycle. This one imports
 * nothing - `DatabaseModule` is `@Global`, so `APP_DB` injects without an entry,
 * and `ThrottlerModule` is `@Global` too, so the guard resolves the same options
 * and storage `AppModule` registered.
 *
 * Keep it that way: an import here is an import into both of those features.
 */
@Module({
  providers: [DemoMembershipService, DemoTierThrottlerGuard],
  exports: [DemoMembershipService, DemoTierThrottlerGuard],
})
export class DemoMembershipModule {}
