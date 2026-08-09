import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { ReceiptExtractionService } from './receipt-extraction.service';
import { ReceiptScanService } from './receipt-scan.service';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

/**
 * Transaction writes and reads.
 *
 * **One import, and it is the reads' whole reason for existing here.**
 * `CategoriesModule` exports `CategoriesService`, which owns the app's only month
 * aggregation: the list read gets its `period` windows from it and the detail read
 * gets one category's month stats. Computing either here instead would put a
 * second copy of the same arithmetic behind a second screen.
 *
 * Nothing else needs importing: `DatabaseModule` is @Global so
 * `UserDatabaseService` injects without one, `SessionGuard` is registered
 * globally in AppModule rather than pulled in per feature, and `@CurrentUser` is
 * a plain param decorator with no provider behind it. `ThrottlerModule` is
 * @Global too, registered once in `AppModule` with the `scan` throttler
 * `POST /transactions/scan` needs (PET-59), so this module needs no import
 * for that either.
 *
 * `ReceiptScanService` and `ReceiptExtractionService` are the receipt-scanning
 * feature: the former reads this user's categories and merchant history and
 * validates the model's answer against them, the latter is the one call site
 * that talks to Gemini. Split so a spec can mock the SDK wholesale without
 * touching the database reads.
 */
@Module({
  imports: [CategoriesModule],
  controllers: [TransactionsController],
  providers: [
    TransactionsService,
    ReceiptScanService,
    ReceiptExtractionService,
  ],
  // Exported because PET-20's dashboard composes it for the recent-
  // transactions card, the same reason CategoriesModule exports
  // CategoriesService: a fourth place computing month spend is precisely what
  // backend/CLAUDE.md's money note already calls a bug.
  exports: [TransactionsService],
})
export class TransactionsModule {}
