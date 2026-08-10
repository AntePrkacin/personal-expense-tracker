import { Module } from '@nestjs/common';
import { PeriodsModule } from '../periods/periods.module';
import { UsersModule } from '../users/users.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

/**
 * Profile reads and updates, and the pay-schedule write.
 *
 * Two imports. `UsersModule` exports `UsersService`, which owns the central
 * `users` row the email lives in. `PeriodsModule` is new as of PET-72 and is
 * needed by both directions: the read resolves `monthlyBudget` and
 * `monthStartDay` out of history rather than selecting them, and the schedule
 * write needs the rule in force before it can work out which boundary a change
 * removes. `DatabaseModule` is @Global so `UserDatabaseService` injects without
 * one, and `SessionGuard` is registered globally in AppModule rather than pulled
 * in per feature.
 */
@Module({
  imports: [PeriodsModule, UsersModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
