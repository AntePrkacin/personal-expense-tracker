import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionService, type SessionPrincipal } from './session.service';

/** An authenticated request, once this guard has let it through. */
export interface AuthenticatedRequest extends Request {
  user?: SessionPrincipal;
}

/**
 * Turns `Authorization: Bearer <token>` into a `SessionPrincipal` on the
 * request, or refuses the request.
 *
 * **Applied per route with `@UseGuards(SessionGuard)`, not globally as an
 * `APP_GUARD`.** Exactly one endpoint is guarded today, so a global guard would
 * mean decorating four public routes with `@Public()` in order to protect one.
 * The switch point is when guarded routes become the majority (PET-45's profile
 * and preferences): flip to `APP_GUARD`, add a `@Public()` decorator, and mark
 * hello, register, login-link and verify with it. Until then this is the
 * cheaper direction to be wrong in - a forgotten `@UseGuards` leaves an
 * endpoint open, but there is only one to forget.
 *
 * Distinct messages per failure are fine here, unlike everywhere in the
 * register/login flow: a session token is the caller's own credential, so
 * telling them the header was missing rather than invalid reveals nothing about
 * anybody else.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException('Missing bearer credential.');
    }

    const principal = await this.sessions.validate(token);
    if (!principal) {
      throw new UnauthorizedException(
        'Session is invalid, expired or revoked.',
      );
    }

    request.user = principal;
    return true;
  }
}

/**
 * The token out of an Authorization header, or null.
 *
 * The scheme is matched case-insensitively because RFC 7235 says it is
 * case-insensitive and clients differ; anything but exactly two parts is
 * refused rather than guessed at.
 */
function bearerToken(header: string | undefined): string | null {
  const [scheme, token, ...rest] = header?.split(' ') ?? [];

  if (scheme?.toLowerCase() !== 'bearer' || !token || rest.length > 0) {
    return null;
  }

  return token;
}
