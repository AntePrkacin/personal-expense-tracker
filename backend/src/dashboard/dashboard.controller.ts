import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionPrincipal } from '../auth/session.service';
import { ApiErrorResponse } from '../common/decorators/api-error-response.decorator';
import { PeriodQueryDto } from '../common/dto/period-query.dto';
import { DashboardResponseDto } from './dto/dashboard-response.dto';
import { DashboardService } from './dashboard.service';

/**
 * The whole Dashboard screen in one read.
 *
 * Singular `/dashboard`, no id: there is exactly one per user, the same
 * reasoning that makes `/profile` singular. No `@UseGuards` and no throttler -
 * `SessionGuard` is global (see AppModule) and this is an authenticated read of
 * the caller's own data. No 404 either: a verified session implies a profile
 * row, and its absence is the broken invariant `PeriodService` already throws a
 * plain `Error` for, answered by the generic 500.
 *
 * `?period=` is a **400** for a date that starts none of the caller's periods,
 * which is the one client error this endpoint has.
 */
@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiOperation({
    summary: 'Every figure the dashboard draws, for one period.',
    description:
      'The current period unless `?period=` names another, and `period` in the response says which. `remaining` and the weekly buckets can imply overspending; nothing here is clamped. `monthlyBudget` is the budget in force for the period being read, so navigating back does not re-price old periods with today’s budget. `daysLeft` is 0 for a finished period. `insight` is the latest insight set’s headline and body regardless of the period asked for, or null when none has been generated. An account with no transactions in the period returns zeroes, an empty weekly series, no categories and no top category rather than failing.',
  })
  @ApiOkResponse({ type: DashboardResponseDto })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED)
  get(
    @CurrentUser() user: SessionPrincipal,
    @Query() query: PeriodQueryDto,
  ): Promise<DashboardResponseDto> {
    return this.dashboard.get(user.userId, query.period);
  }
}
