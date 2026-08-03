import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

/**
 * Transaction writes.
 *
 * No imports, and none missing: `DatabaseModule` is @Global so
 * `UserDatabaseService` injects without one, `SessionGuard` is registered
 * globally in AppModule rather than pulled in per feature, and `@CurrentUser` is
 * a plain param decorator with no provider behind it.
 */
@Module({
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
