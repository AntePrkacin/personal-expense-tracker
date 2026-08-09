import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionPrincipal } from '../auth/session.service';
import { ApiErrorResponse } from '../common/decorators/api-error-response.decorator';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';
import { ScanReceiptResponseDto } from './dto/scan-receipt-response.dto';
import { TransactionResponseDto } from './dto/transaction-response.dto';
import {
  TransactionDetailResponseDto,
  TransactionsResponseDto,
} from './dto/transactions-response.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { MAX_RECEIPT_FILES } from './receipt-scan.constants';
import { ReceiptScanService } from './receipt-scan.service';
import { receiptUploadOptions } from './receipt-scan.upload';
import { TransactionsService } from './transactions.service';

/**
 * The whole transaction feature, reads and writes.
 *
 * **Nothing either read returns is stored.** The period the list filters by and
 * the category progress the detail read carries are computed per request from
 * `transactions.date` against the caller's `monthStartDay`, which is what makes a
 * backdated transaction land in its own month and a changed `monthStartDay`
 * re-bucket history correctly. There is deliberately no month column to keep in
 * step.
 *
 * No `@UseGuards` and no throttler on the reads and writes below. `SessionGuard`
 * is global (see AppModule), so these routes are protected by saying nothing at
 * all; the bearer declaration is class-level so it cannot drift route by route.
 * Rate limiting is deliberately absent from them: these are authenticated reads
 * and writes over the caller's own database, where the budget an abuser would
 * burn is their own. **`scan` is the one exception** - see its own doc comment.
 *
 * **Route order is load-bearing.** `GET :id` must stay below any literal sibling
 * path, or Nest matches `:id` against the literal first. `scan` is that literal
 * sibling as of PET-59 - a POST, so it cannot actually collide with `GET :id`,
 * but it is declared above it anyway so the ordering reads as intentional rather
 * than accidental should a future `GET /transactions/scan` ever be added. The
 * failure this note guards against is a 400 from `ParseUUIDPipe` on a route that
 * looks fine.
 *
 * Several 404s below are the same status for two different resources, which is
 * why each operation says out loud which one it means.
 */
@ApiTags('transactions')
@ApiBearerAuth()
@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly transactions: TransactionsService,
    private readonly receiptScan: ReceiptScanService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List transactions.',
    description:
      'Every filter is optional. `period` defaults to `current`, so a call with no query string returns **this budgeting period only**, which is the view TRN-3 draws; pass `period=all` for history. `total` counts matches after filters - read it rather than the array length. There is no pagination: the whole filtered set comes back and the table scrolls.',
  })
  @ApiOkResponse({ type: TransactionsResponseDto })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED)
  list(
    @CurrentUser() user: SessionPrincipal,
    @Query() query: ListTransactionsQueryDto,
  ): Promise<TransactionsResponseDto> {
    return this.transactions.list(user.userId, query);
  }

  /**
   * Extracts a transaction's fields from a photo or PDF of a receipt.
   *
   * **Carries its own rate limiter**, unlike every other route in this
   * controller: the budget an abuser burns here is not their own, it is the
   * project's shared Gemini quota. `scan` is a third named throttler
   * `AppModule` registers, keyed on the session user id, and this route
   * skips the two auth throttlers that would otherwise also apply -
   * `ThrottlerGuard` runs every configured throttler on a route it guards,
   * and `email`'s tracker reads `req.body.email`, which is `undefined` on a
   * multipart request and would put every caller in one shared fallback
   * bucket.
   */
  @Post('scan')
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ email: true, ip: true })
  @UseInterceptors(
    FilesInterceptor('files', MAX_RECEIPT_FILES, receiptUploadOptions),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description:
            'At most 4 images (pages of one receipt), or exactly one PDF.',
        },
      },
    },
  })
  @ApiOperation({
    summary:
      'Extract merchant, amount, date, category and note from a receipt.',
    description:
      'Every field is null when it could not be read or failed validation against live data, with `missing` naming which of `merchant`, `amount`, `date` and `categoryId` came back that way. **503** means scanning is not configured (no `GEMINI_API_KEY`), and **504** means the extraction call timed out - both distinct from a 200 with everything missing, which means the photo was read but nothing on it was legible.',
  })
  @ApiOkResponse({ type: ScanReceiptResponseDto })
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.PAYLOAD_TOO_LARGE,
    HttpStatus.TOO_MANY_REQUESTS,
    HttpStatus.SERVICE_UNAVAILABLE,
    HttpStatus.GATEWAY_TIMEOUT,
  )
  scan(
    @CurrentUser() user: SessionPrincipal,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ): Promise<ScanReceiptResponseDto> {
    return this.receiptScan.scan(user.userId, files ?? []);
  }

  // Below `@Get()` and below any literal path a future ticket adds here. See the
  // class note.
  @Get(':id')
  @ApiOperation({
    summary: 'One transaction, with the context frame 08 draws around it.',
    description:
      "Carries two extras on **different windows**, deliberately. `category` is that category's progress for the **current** period, even when this transaction is from an earlier one - the bar answers where the category stands now. `recentInCategory` is the latest transactions in the same category from **any** month, excluding this one. **404** here always means the id in the URL. Expect `category.status` to be `uncapped` most of the time: caps are optional and the preselected fallback has none.",
  })
  @ApiOkResponse({ type: TransactionDetailResponseDto })
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.NOT_FOUND,
  )
  detail(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TransactionDetailResponseDto> {
    return this.transactions.detail(user.userId, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Record a transaction.',
    description:
      '`amount` is in major units (12.50, not 1250) and must be positive. `date` is a calendar date, `YYYY-MM-DD`, stored verbatim - backdating is supported and puts the transaction in the month that date falls in. **404** means the `categoryId` in the body names no category of yours.',
  })
  @ApiCreatedResponse({ type: TransactionResponseDto })
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.NOT_FOUND,
  )
  create(
    @CurrentUser() user: SessionPrincipal,
    @Body() dto: CreateTransactionDto,
  ): Promise<TransactionResponseDto> {
    return this.transactions.create(user.userId, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Change a transaction.',
    description:
      'Send only the fields to change: an absent field is left alone, and `note` accepts null to clear it. An empty body is a **400**, because it would record an edit that changed nothing. **404** means either the id in the URL or a `categoryId` in the body names nothing of yours.',
  })
  @ApiOkResponse({ type: TransactionResponseDto })
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.NOT_FOUND,
  )
  update(
    @CurrentUser() user: SessionPrincipal,
    // Bare, with no version pinned, for isUuid()'s reason: the job is rejecting
    // garbage before it reaches a query, not policing UUID versions.
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransactionDto,
  ): Promise<TransactionResponseDto> {
    return this.transactions.update(user.userId, id, dto);
  }

  @Delete(':id')
  // 204, so there is no body to describe and nothing for a client to parse.
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a transaction.',
    description:
      'Permanent as far as this API is concerned: the transaction stops existing through every endpoint. Deleting one twice is a **404**, and **404** here always means the id in the URL.',
  })
  @ApiNoContentResponse({ description: 'Deleted. No body.' })
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.NOT_FOUND,
  )
  remove(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.transactions.remove(user.userId, id);
  }
}
