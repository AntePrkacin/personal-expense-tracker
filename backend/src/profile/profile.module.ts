import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

/**
 * Profile reads and updates.
 *
 * One import, and it is the only real one: `UsersModule` exports `UsersService`,
 * which owns the central `users` row the email lives in. `DatabaseModule` is
 * @Global so `UserDatabaseService` injects without one, and `SessionGuard` is
 * registered globally in AppModule rather than pulled in per feature.
 */
@Module({
  imports: [UsersModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
