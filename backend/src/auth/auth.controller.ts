import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiErrorResponse } from '../common/decorators/api-error-response.decorator';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { RequestLoginLinkDto } from './dto/request-login-link.dto';

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
 * Passwordless entry. Both routes answer 202 with an empty body, always.
 *
 * 202 rather than 201 or 200 because that is what actually happened: the
 * request was accepted and the email is on its way. Empty rather than a
 * message because an empty body is byte-for-byte identical whatever the
 * outcome, which is the cheapest way to satisfy REG-6 and LOG-6 (A35) - and
 * screen 24 already has the submitted address to interpolate.
 *
 * Validation failures are still 400. A malformed address is a fact about the
 * input, not about whether an account exists behind it, so refusing to report
 * it would cost usability and buy nothing.
 *
 * The throttle sits on the controller rather than globally: these are the only
 * unauthenticated routes that send mail. Two independent limiters apply, one
 * per submitted address and one per caller IP (see AuthModule for why they are
 * not one composite key), and both run ahead of the directory lookup, so a
 * throttled response is identical whether or not the account exists. Note that
 * Nest's default key includes the handler, so the two routes get their own
 * buckets rather than sharing them - accepted, since a legitimate journey can
 * touch both.
 */
@ApiTags('auth')
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Screen 22, "Finish setup" (REG-4). */
  @Post('register')
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
}
