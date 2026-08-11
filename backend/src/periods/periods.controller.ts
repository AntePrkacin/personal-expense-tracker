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
import { PeriodService } from './period.service';
import { PeriodsResponseDto } from './dto/period-response.dto';

/**
 * The period select's data source: which periods this account has.
 *
 * One read, no writes. Changing the schedule is `POST /api/profile/schedule` -
 * periods are derived from pay-schedule history and are not editable as such,
 * which is why there is no `POST /api/periods` and must not be.
 *
 * Guarded like every other route (`SessionGuard` is global) and the caller's own
 * data by construction: it opens the caller's own database, so there is no id to
 * check and no cross-user case to police.
 */
@ApiTags('periods')
@ApiBearerAuth()
@Controller('periods')
export class PeriodsController {
  constructor(private readonly periods: PeriodService) {}

  @Get()
  @ApiOperation({
    summary: 'Every budgeting period you have, newest first.',
    description:
      'What the period select on the Dashboard and Categories screens is built from. Pass a `start` from here as `?period=` on `GET /transactions`, `GET /categories` or `GET /dashboard` to read that period; omit it for the current one. Periods are **not** always calendar months and not always the same length: they start on your pay day, and changing your pay day stretches one period across the gap rather than rewriting the periods before it. So build the select from this list rather than from month arithmetic - index 0 is the current period.',
  })
  @ApiOkResponse({ type: PeriodsResponseDto })
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED)
  async list(
    @CurrentUser() user: SessionPrincipal,
  ): Promise<PeriodsResponseDto> {
    // `today()` is a config read with no database behind it, so the flag costs
    // nothing. Decided by containment rather than by taking the first element:
    // the newest period *is* the current one today, and a flag that quietly
    // depended on that ordering would be wrong the day the list gained a future
    // period without anybody thinking about this line.
    const today = this.periods.today();
    const periods = await this.periods.all(user.userId);

    return {
      periods: periods.map((period) => ({
        ...period,
        current: period.start <= today && today < period.end,
      })),
    };
  }
}
