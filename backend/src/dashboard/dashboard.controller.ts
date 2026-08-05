import { Controller, Get, HttpStatus } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionPrincipal } from '../auth/session.service';
import { ApiErrorResponse } from '../common/decorators/api-error-response.decorator';
import { DashboardResponseDto } from './dto/dashboard-response.dto';
import { DashboardService } from './dashboard.service';

/**
 * The whole Dashboard screen in one read.
 *
 * Singular `/dashboard`, no id: there is exactly one per user, the same
 * reasoning that makes `/profile` singular. No `@UseGuards` and no throttler -
 * `SessionGuard` is global (see AppModule) and this is an authenticated read of
 * the caller's own data. No 404 either: a verified session implies a profile
 * row, and its absence is the broken invariant `CategoriesService` already
 * throws a plain `Error` for, answered by the generic 500.
 */
@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiOperation({
    summary: 'Every figure the dashboard draws, for the current period.',
    description:
      '`remaining` and the weekly buckets can imply overspending; nothing here is clamped. `insight` is always null until PET-41 ships the insights table. An account with no transactions this period returns zeroes, an empty weekly series, no categories and no top category rather than failing.',
  })
  @ApiOkResponse({ type: DashboardResponseDto })
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED)
  get(@CurrentUser() user: SessionPrincipal): Promise<DashboardResponseDto> {
    return this.dashboard.get(user.userId);
  }
}
