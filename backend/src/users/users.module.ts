import { Module } from '@nestjs/common';
import { UsersService } from './users.service';

// No controller: `POST /api/users` and `GET /api/users/:id` were pre-auth
// proof-of-stack routes and appear nowhere in the tech spec's API surface. The
// write is now POST /api/auth/register; the read becomes a session-scoped
// getProfile() with verification.
//
// DatabaseModule is @Global(), so APP_DB is available here without importing it.
@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
