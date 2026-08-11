import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionPrincipal } from '../auth/session.service';
import { ApiErrorResponse } from '../common/decorators/api-error-response.decorator';
import { abortOnClientDisconnect } from '../common/request-abort';
import { AssistantService } from './assistant.service';
import {
  AssistantConversationResponseDto,
  AssistantSessionCountResponseDto,
  AssistantSessionsResponseDto,
} from './dto/assistant-sessions-response.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { SendMessageResponseDto } from './dto/send-message-response.dto';

/**
 * The assistant chat: one write and two reads.
 *
 * No `@UseGuards(SessionGuard)` anywhere - it is global (see `AppModule`). The
 * `ThrottlerGuard` goes on the **method** rather than the class, unlike
 * `AuthController` where all four routes want limiting: a class-level guard here
 * would spend chat budget on every History page load. `/scan`'s method-level
 * placement is the precedent.
 */
@ApiTags('assistant')
@ApiBearerAuth()
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  /**
   * **The one throttled route, and it names all three throttlers it skips.**
   * `ThrottlerGuard` runs every configured throttler on a route it guards, so
   * leaving `email` off would run that tracker's `no-email:<ip>` fallback - it
   * reads `req.body.email`, which is `undefined` here - and put every caller in
   * one shared bucket. A bare `@SkipThrottle()` means `{ default: true }` and no
   * throttler here is named `default`, so it would silently skip nothing.
   *
   * `chat` is a **fourth** named throttler rather than a share of `scan`. Both
   * protect the same Gemini quota, but the budgets differ by an order of
   * magnitude in opposite directions: a scan is one photo per logged expense, a
   * conversation is ten to thirty turns in five minutes. A shared bucket either
   * starves the chat or opens the scan cap - and a burst of chat turns would
   * silently disable receipt scanning mid-form, with no message that could
   * explain it.
   *
   * **`@Res({ passthrough: true })`**, so Nest still serialises the return value:
   * the response object is needed only to hear the connection drop, not to write
   * to. See `abortOnClientDisconnect` for the Express trap in that.
   */
  @Post('messages')
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ email: true, ip: true, scan: true })
  @ApiOperation({
    summary: 'Ask the assistant a question about your spending.',
    description:
      'Creates a conversation when `sessionId` is omitted and continues one when it is present, answering **201** with the stored question, the reply and the session both belong to. **Nothing is persisted unless the reply arrives**, so a failed, timed-out or cancelled turn stores neither the question nor an answer. `truncation` is non-null only when the account has more transactions than fit one prompt, and says how many of how many were sent and how far back the assistant could see. **503** means the assistant is not configured on this deployment, **504** that the model call did not finish in time - retrying the identical question is the right next move there, which is why it is distinct from the 503.',
  })
  @ApiCreatedResponse({ type: SendMessageResponseDto })
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.NOT_FOUND,
    HttpStatus.TOO_MANY_REQUESTS,
    HttpStatus.SERVICE_UNAVAILABLE,
    HttpStatus.GATEWAY_TIMEOUT,
  )
  send(
    @CurrentUser() user: SessionPrincipal,
    @Body() dto: SendMessageDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SendMessageResponseDto> {
    return this.assistant.send(
      user.userId,
      dto,
      abortOnClientDisconnect(request, response),
    );
  }

  @Get('sessions')
  @ApiOperation({
    summary: 'Your conversations, newest activity first.',
    description:
      'A wrapper object rather than a bare array, so a future field has somewhere to go. Carries no messages; read one conversation for those.',
  })
  @ApiOkResponse({ type: AssistantSessionsResponseDto })
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED)
  sessions(
    @CurrentUser() user: SessionPrincipal,
  ): Promise<AssistantSessionsResponseDto> {
    return this.assistant.sessions(user.userId);
  }

  /**
   * How many conversations there are, for the tab bar's badge (PET-76).
   *
   * **The ordering rule the comment below anticipated is now load-bearing rather
   * than decorative.** `sessions/count` and `sessions/:id` have the same segment
   * count, so Nest matches whichever is declared first - and declared after,
   * every request for this route would be handled by `conversation()` instead.
   * It would not even fail quietly: `ParseUUIDPipe` answers **400** for the
   * literal `count`, so the symptom would be a badge that never renders and a
   * 400 in the log naming a validation rule nobody violated. Add any further
   * literal `sessions/*` route above `sessions/:id` too.
   */
  @Get('sessions/count')
  @ApiOperation({
    summary: 'How many conversations you have.',
    description:
      'The same figure `GET /assistant/sessions` publishes as `total`, over the same predicate, without the rows. Exists so a screen that wants only the number does not read the list to get it.',
  })
  @ApiOkResponse({ type: AssistantSessionCountResponseDto })
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED)
  sessionCount(
    @CurrentUser() user: SessionPrincipal,
  ): Promise<AssistantSessionCountResponseDto> {
    return this.assistant.sessionCount(user.userId);
  }

  /**
   * Declared below the literal `sessions` and `sessions/count` above. The first
   * of those costs nothing (the paths differ in segment count); the second does
   * not, and its own comment carries why.
   */
  @Get('sessions/:id')
  @ApiOperation({
    summary: 'One conversation with its messages, for resuming it.',
    description:
      "Messages come back in render order, oldest first. **404** means the conversation does not exist - unambiguously, since this route names exactly one resource. Cross-user isolation is structural: another account's id simply does not exist in your database.",
  })
  @ApiOkResponse({ type: AssistantConversationResponseDto })
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.NOT_FOUND,
  )
  conversation(
    @CurrentUser() user: SessionPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AssistantConversationResponseDto> {
    return this.assistant.conversation(user.userId, id);
  }
}
