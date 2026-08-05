import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionPrincipal } from '../auth/session.service';
import { ApiErrorResponse } from '../common/decorators/api-error-response.decorator';
import { InsightSetResponseDto } from './dto/insight-set-response.dto';
import { InsightsService } from './insights.service';

/**
 * The AI Insights screen in one read.
 *
 * Singular `/insights`, no id: exactly one meaningful set per user, resolved from
 * the session, the same reasoning that makes `/dashboard` and `/profile`
 * singular. No `@UseGuards` and no throttler - `SessionGuard` is global (see
 * AppModule). No 404: `empty` is a first-class state a never-generated account
 * returns, not a missing resource, so every authenticated caller gets a 200.
 */
@ApiTags('insights')
@ApiBearerAuth()
@Controller('insights')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get()
  @ApiOperation({
    summary: 'Your latest insight set, with the state to render it in.',
    description:
      'One call serves the whole screen in all three states. `state` is `empty` before anything has generated, `generating` while a run is in flight (render skeletons), or `ready` when a set is available. The content fields always carry the most recent **ready** set, independent of `state`, so a regenerate shows skeletons while the dashboard teaser keeps its last-good content. A failed run is invisible: the previous ready set stays returned.',
  })
  @ApiOkResponse({ type: InsightSetResponseDto })
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED)
  get(@CurrentUser() user: SessionPrincipal): Promise<InsightSetResponseDto> {
    return this.insights.getSet(user.userId);
  }

  @Post('generate')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Start generating a fresh insight set.',
    description:
      'Asynchronous: this returns **202** as soon as the run is registered, and the set is produced in the background. Poll `GET /api/insights` and render skeletons while `state` is `generating`; the new set replaces the old one when it finishes. A **409** means a run is already in flight - regenerate is disabled until it ends. An account with no transactions produces no set and stays in the empty state.',
  })
  @ApiAcceptedResponse()
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, HttpStatus.CONFLICT)
  generate(@CurrentUser() user: SessionPrincipal): Promise<void> {
    return this.insights.generate(user.userId);
  }
}
