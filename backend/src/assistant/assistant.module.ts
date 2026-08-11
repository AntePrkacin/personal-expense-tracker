import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { PeriodsModule } from '../periods/periods.module';
import { AssistantCompletionService } from './assistant-completion.service';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

/**
 * The assistant chat: a conversation held with a user over their own
 * transactions.
 *
 * **Deliberately not part of `InsightsModule`.** `docs/TODO.md` decided that
 * boundary before this ticket existed: "a persisted set generated on a schedule
 * and a conversation held with a user share a vocabulary and nothing else."
 * Nothing here generates an insight and nothing in `src/insights/` knows this
 * module exists. The check is on **imports** rather than on the word - this file
 * and a few docblocks say "insight" to explain the boundary, so a bare grep
 * reports its own documentation. `rg -n "from '.*insights" src/assistant/` and
 * its mirror are both empty; see `src/assistant/CLAUDE.md`.
 *
 * Two imports, for the composition surface: `PeriodsModule` for the current
 * period, its budget and today's date, and `CategoriesModule` for the caps and
 * the account's own fallback category name. `DatabaseModule` is `@Global` so
 * `UserDatabaseService` injects with no import, and `SessionGuard` is an
 * `APP_GUARD` so every route is guarded without saying so.
 *
 * **`ThrottlerModule` must not be registered here.** It is `@Global()`, both
 * registrations would export the same `THROTTLER_OPTIONS` token, and whichever
 * loses the resolution race is silently absent from every route that names it -
 * which is why the one registration already moved from `AuthModule` to
 * `AppModule` at PET-59. The `chat` throttler is declared there beside the other
 * three.
 *
 * Nothing is exported: no other feature composes a conversation.
 */
@Module({
  imports: [CategoriesModule, PeriodsModule],
  controllers: [AssistantController],
  providers: [AssistantService, AssistantCompletionService],
})
export class AssistantModule {}
