import { Module } from '@nestjs/common';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

/**
 * Central's admin-managed template data: the starter categories, and the
 * colours and icons a category may be given.
 *
 * No imports, and none missing: `DatabaseModule` is `@Global`, so `APP_DB`
 * injects without one, and `SessionGuard` is registered globally in `AppModule`.
 *
 * `TemplatesService` is exported because both `AuthService` and
 * `VerificationService` compose it - registration resolves the picked ids
 * against central before it stashes them, and verification reads the same rows
 * back to seed the user's own categories.
 */
@Module({
  controllers: [TemplatesController],
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
