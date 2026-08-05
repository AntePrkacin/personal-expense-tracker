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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionPrincipal } from '../auth/session.service';
import { ApiErrorResponse } from '../common/decorators/api-error-response.decorator';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';
import { TransactionResponseDto } from './dto/transaction-response.dto';
import {
  TransactionDetailResponseDto,
  TransactionsResponseDto,
} from './dto/transactions-response.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
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
 * No `@UseGuards` and no throttler. `SessionGuard` is global (see AppModule), so
 * these routes are protected by saying nothing at all; the bearer declaration is
 * class-level so it cannot drift route by route. Rate limiting is deliberately
 * absent: these are authenticated reads and writes over the caller's own
 * database, where the budget an abuser would burn is their own.
 *
 * **Route order is load-bearing.** `GET :id` must stay below any literal sibling
 * path, or Nest matches `:id` against the literal first. There is no literal
 * sibling today - PET-20's dashboard lives on its own path - so this is a note
 * rather than a constraint, and it is written down because the failure is a 400
 * from `ParseUUIDPipe` on a route that looks fine.
 *
 * Several 404s below are the same status for two different resources, which is
 * why each operation says out loud which one it means.
 */
@ApiTags('transactions')
@ApiBearerAuth()
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

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
