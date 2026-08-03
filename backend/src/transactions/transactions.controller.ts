import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { TransactionResponseDto } from './dto/transaction-response.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransactionsService } from './transactions.service';

/**
 * The write half of the transaction feature. Reads - the list, the month
 * windows, the aggregates every screen is built from - belong to PET-28 and the
 * dashboard tickets, and none of them is stored: they are computed from these
 * rows on every read.
 *
 * No `@UseGuards` and no throttler. `SessionGuard` is global (see AppModule), so
 * these routes are protected by saying nothing at all; the bearer declaration is
 * class-level so it cannot drift route by route. Rate limiting is deliberately
 * absent: these are authenticated writes to the caller's own database, where the
 * budget an abuser would burn is their own.
 *
 * Both 404s below are the same status for two different resources, which is why
 * each operation says out loud which one it means.
 */
@ApiTags('transactions')
@ApiBearerAuth()
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

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
