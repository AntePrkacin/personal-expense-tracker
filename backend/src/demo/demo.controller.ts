import {
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { ApiErrorResponse } from '../common/decorators/api-error-response.decorator';
import { DemoLeaseService } from './demo-lease.service';
import { DemoSessionResponseDto } from './dto/demo-session.response.dto';

/**
 * What the busy answer suggests waiting, in seconds.
 *
 * A flat hint rather than a computed one. The soonest an account can actually
 * free is the earliest live lease's expiry, which would mean reading the pool
 * again purely to decorate a rejection - and the honest answer to "when" is
 * unknowable anyway, since a visitor who closes the tab frees nothing until
 * their lease elapses. Two minutes is short enough to be worth obeying and long
 * enough not to invite a tight retry loop.
 */
const BUSY_RETRY_AFTER_S = 120;

/**
 * The demo pool's one route.
 *
 * Its own controller rather than a sixth route on `AuthController`, so the whole
 * feature is one directory that can be deleted in one commit, and so the four
 * routes that file documents stay four.
 *
 * **This is the app's second session issuer**, and the first that asks for no
 * credential at all. `POST /api/auth/verify` is the other, and it at least
 * spends a token that was emailed to the address owner. This one hands a session
 * to anybody who asks, which is the entire point and also why three separate
 * things bound it: it is off unless `DEMO_ENABLED` says otherwise, it can only
 * ever name an account somebody deliberately enrolled into the pool, and it
 * carries a rate limiter of its own.
 */
@ApiTags('demo')
@Controller('demo')
@UseGuards(ThrottlerGuard)
// Every throttler this route is not named by, skipped explicitly. A bare
// `@SkipThrottle()` means `{ default: true }`, and no throttler here is called
// `default`, so it would silently skip nothing at all.
@SkipThrottle({ email: true, ip: true, scan: true, chat: true })
export class DemoController {
  constructor(
    private readonly leases: DemoLeaseService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Leases a demo account and starts a session on it.
   *
   * **200 rather than 201**, for `verify`'s reason: a session is not a
   * URL-addressable resource and there is no `Location` to give. The lease it
   * takes is not one either - nothing can address it, and nothing should be able
   * to.
   */
  @Post('session')
  // The caller has no credential and the whole purpose is to give them one, so
  // this has to stay open. It is the sixth `@Public()` route.
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lease a demo account and start a session on it.',
    description:
      'Hands the caller their own pre-seeded account out of a small pool, restoring it to the ' +
      'showcase fixture first unless it is untouched and was seeded today. No credential is ' +
      'required and none is accepted. **503** is the one ordinary rejection: every pooled ' +
      'account is leased to somebody else, and a later attempt will succeed as leases elapse. ' +
      '**404** means this deployment has the demo disabled.',
  })
  @ApiOkResponse({ type: DemoSessionResponseDto })
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    HttpStatus.TOO_MANY_REQUESTS,
    HttpStatus.SERVICE_UNAVAILABLE,
  )
  async session(
    // `passthrough: true`, so the returned object is still serialized by Nest
    // and only the one header is written by hand. Without it, taking `@Res` at
    // all would make this handler responsible for sending the whole response.
    @Res({ passthrough: true }) response: Response,
  ): Promise<DemoSessionResponseDto> {
    // **404 rather than 403 or 503, and it is checked before anything else.** A
    // deployment with the demo off has no demo, so the honest answer is that
    // this route is not here - where a 403 would confirm the feature exists and
    // a 503 would promise it is coming back. It also keeps a fresh clone and the
    // e2e suite from exposing an anonymous session minter by default, since
    // `DEMO_ENABLED` is false unless something says otherwise.
    if (this.config.get<boolean>('DEMO_ENABLED') !== true) {
      throw new NotFoundException();
    }

    let issued: { token: string; expiresAt: Date };
    try {
      issued = await this.leases.handOut();
    } catch (error) {
      // `Retry-After` belongs on a 503 and nowhere else, which is why it is set
      // here rather than on the way in: a 200 carrying it would be telling a
      // visitor who just got an account to come back later. The filter reuses
      // this same response object, so a header set before the rethrow survives
      // into the error body.
      if (error instanceof ServiceUnavailableException) {
        response.setHeader('Retry-After', String(BUSY_RETRY_AFTER_S));
      }
      throw error;
    }

    // Explicit, so the declared string type is honest rather than relying on the
    // serializer to make a Date look like one.
    return { token: issued.token, expiresAt: issued.expiresAt.toISOString() };
  }
}
