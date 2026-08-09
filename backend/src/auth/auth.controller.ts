import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Public } from './public.decorator';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiErrorResponse } from '../common/decorators/api-error-response.decorator';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { RegisterDto } from './dto/register.dto';
import { RequestLoginLinkDto } from './dto/request-login-link.dto';
import { SessionResponseDto } from './dto/session-response.dto';
import { VerifyLoginLinkDto } from './dto/verify-login-link.dto';
import { VerifyResponseDto } from './dto/verify-response.dto';
import type { SessionPrincipal } from './session.service';
import { VerificationService } from './verification.service';

/**
 * The 202 both routes answer with. Bodiless on purpose, and the description
 * says why: the next person to read the spec would otherwise "fix" the empty
 * body into something helpful and hand back an account-enumeration oracle.
 */
const ACCEPTED_RESPONSE = {
  status: HttpStatus.ACCEPTED,
  description:
    'Accepted. The body is always empty and the response is byte-for-byte identical whether or not an account exists for the submitted address - that is the enumeration defense (REG-6, LOG-6), not an unfinished response.',
} as const;

/**
 * Passwordless entry, end to end: ask for a link, spend one, ask who you are.
 *
 * The two issuing routes answer 202 with an empty body, always. 202 rather than
 * 201 or 200 because that is what actually happened: the request was accepted
 * and the email is on its way. Empty rather than a message because an empty body
 * is byte-for-byte identical whatever the outcome, which is the cheapest way to
 * satisfy REG-6 and LOG-6 (A35) - and screen 24 already has the submitted
 * address to interpolate.
 *
 * Validation failures are still 400. A malformed address is a fact about the
 * input, not about whether an account exists behind it, so refusing to report
 * it would cost usability and buy nothing.
 *
 * `verify` and `session` are the other half, and they are allowed to answer
 * distinguishably: their caller holds a credential that was emailed to the
 * address owner, so there is nothing left to conceal. Verify therefore separates
 * "replaced by a newer link" (409) from every other dead token (401), and the
 * guard on session says plainly that the bearer was missing or dead.
 *
 * **Which limiter covers which route**, since the controller-level
 * `ThrottlerGuard` would otherwise apply both to all four:
 *
 * - register, login-link: both limiters. These are the only routes that send
 *   mail, one keyed on the submitted address and one on the caller's IP (see
 *   AuthModule for why they are not one composite key). Both run ahead of the
 *   directory lookup, so a throttled response is identical whether or not the
 *   account exists.
 * - verify: per-IP only. It has no address to key on, and the email tracker's
 *   fallback would put every verify in the whole deployment into one
 *   `no-email:<ip>` bucket that a single legitimate journey (verify, hit 409,
 *   resend, verify again) could exhaust. The per-IP limiter stays because verify
 *   is unauthenticated and probe-shaped.
 * - session: neither. It is a one-indexed-read whoami the frontend calls on
 *   navigation, and 30 per window would break a NAT'd classroom's ordinary
 *   browsing. The guard's 401 is the defense, and 256-bit tokens make probing
 *   pointless.
 *
 * Note that Nest's default key includes the handler, so each route gets its own
 * buckets rather than sharing them - accepted, since a legitimate journey can
 * touch several.
 *
 * **Class-level `@SkipThrottle({ scan: true })`** because `ThrottlerModule`
 * registers a third named throttler, `scan`, for `POST
 * /api/transactions/scan` (see `AppModule`) - `ThrottlerGuard` runs every
 * configured throttler on a route it guards, so without this skip every route
 * here would also count against that budget for no reason.
 */
@ApiTags('auth')
@Controller('auth')
@UseGuards(ThrottlerGuard)
@SkipThrottle({ scan: true })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly verification: VerificationService,
  ) {}

  /** Screen 22, "Finish setup" (REG-4). */
  @Post('register')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Create an account and send its login link.',
    description:
      'An address that already exists is sent a link instead of being duplicated. If that account was never verified, these onboarding values overwrite the stashed ones.',
  })
  @ApiResponse(ACCEPTED_RESPONSE)
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, HttpStatus.TOO_MANY_REQUESTS)
  register(@Body() dto: RegisterDto): Promise<void> {
    return this.authService.register(dto);
  }

  /** Screen 23, "Log in" (LOG-3), and screen 24, "Resend link" (VER-2). */
  @Post('login-link')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Send a login link to an existing account.',
    description:
      'An unknown address creates nothing and is sent nothing; only the response is identical. Every login link therefore belongs to a real user.',
  })
  @ApiResponse(ACCEPTED_RESPONSE)
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, HttpStatus.TOO_MANY_REQUESTS)
  requestLoginLink(@Body() dto: RequestLoginLinkDto): Promise<void> {
    return this.authService.requestLoginLink(dto.email);
  }

  /** Screen 25, the landing point of the emailed link (VER-1). */
  @Post('verify')
  // The credential is in the body, not a session: this is how a caller who has
  // none gets one, so it has to stay open.
  @Public()
  // 200, not 201: a session is not a URL-addressable resource, and there is no
  // Location to give.
  @HttpCode(HttpStatus.OK)
  // Named, and it has to be: a bare @SkipThrottle() means `{ default: true }`,
  // no throttler here is called `default`, and it would therefore skip nothing
  // at all - silently.
  @SkipThrottle({ email: true })
  @ApiOperation({
    summary: 'Spend a login link and start a session.',
    description:
      'First verification of an account also provisions its database, writes the profile the registration form described, and seeds the picked starter categories; a returning user just gets a session. **409** is the one actionable rejection: the link was replaced by a newer one, so the most recent email is the one to open. Every other dead token - unknown, expired, already spent, or belonging to a deleted account - is a 401.',
  })
  @ApiOkResponse({ type: VerifyResponseDto })
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.CONFLICT,
    HttpStatus.TOO_MANY_REQUESTS,
  )
  async verify(@Body() dto: VerifyLoginLinkDto): Promise<VerifyResponseDto> {
    const { token, expiresAt } = await this.verification.verify(dto.token);

    // Explicit, so the declared string type is honest rather than relying on
    // the serializer to make a Date look like one.
    return { token, expiresAt: expiresAt.toISOString() };
  }

  /** Who the bearer belongs to. The frontend calls this on navigation. */
  @Get('session')
  // No @UseGuards: SessionGuard is global now, and this route simply declines
  // to be @Public().
  @SkipThrottle({ email: true, ip: true })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'The identity behind a session token.',
    description:
      'The central directory holds an email and a database pointer, so that is all this answers. Names, currency and budget live in the profile, which is its own endpoint.',
  })
  @ApiOkResponse({ type: SessionResponseDto })
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED)
  getSession(@CurrentUser() user: SessionPrincipal): SessionResponseDto {
    return {
      userId: user.userId,
      email: user.email,
      expiresAt: user.expiresAt.toISOString(),
    };
  }
}
