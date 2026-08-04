import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

/**
 * Category CRUD, month stats and the allocation summary.
 *
 * No imports, and none missing: `DatabaseModule` is @Global so
 * `UserDatabaseService` injects without one, `ConfigModule` is registered with
 * `isGlobal: true` so `ConfigService` does too, `SessionGuard` is registered
 * globally in AppModule, and `@CurrentUser` is a plain param decorator with no
 * provider behind it.
 *
 * `CategoriesService` is exported because PET-20's dashboard composes it rather
 * than running a fourth copy of the same month aggregation.
 */
@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
