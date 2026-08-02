import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { RequestLoginLinkDto } from './dto/request-login-link.dto';

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
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Screen 22, "Finish setup" (REG-4). */
  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  register(@Body() dto: RegisterDto): Promise<void> {
    return this.authService.register(dto);
  }

  /** Screen 23, "Log in" (LOG-3), and screen 24, "Resend link" (VER-2). */
  @Post('login-link')
  @HttpCode(HttpStatus.ACCEPTED)
  requestLoginLink(@Body() dto: RequestLoginLinkDto): Promise<void> {
    return this.authService.requestLoginLink(dto.email);
  }
}
