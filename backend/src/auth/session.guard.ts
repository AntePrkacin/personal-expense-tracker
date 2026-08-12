import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { SessionService, type SessionPrincipal } from './session.service';

/** An authenticated request, once this guard has let it through. */
export interface AuthenticatedRequest extends Request {
  user?: SessionPrincipal;
}

/**
 * Turns `Authorization: Bearer <token>` into a `SessionPrincipal` on the
 * request, or refuses the request.
 *
 * **Registered globally as an `APP_GUARD` in AppModule**, so every route is
 * guarded unless it carries `@Public()`. It arrived here per-route, back when
 * one endpoint was guarded and marking four public ones to protect it would
 * have been absurd; the transaction endpoints tipped the balance, and this is
 * now the direction that fails safely. A forgotten `@Public()` 401s a public
 * route loudly on the first request, where a forgotten `@UseGuards` used to
 * leave an endpoint silently open for anyone to find.
 *
 * The public check is first and is a pure metadata read - no header parsed, no
 * body touched, no database hit - which is what lets it sit ahead of the
 * controller-level `ThrottlerGuard` without changing what the rate-limit
 * trackers see.
 *
 * Distinct messages per failure are fine here, unlike everywhere in the
 * register/login flow: a session token is the caller's own credential, so
 * telling them the header was missing rather than invalid reveals nothing about
 * anybody else.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Handler first, then the controller, so a class-level mark can be
    // overridden on a single route.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

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
 *
 * **Exported for `POST /api/auth/logout`, which is the one route that needs the
 * token itself rather than the principal.** This guard validates the bearer and
 * then discards it, and `SessionPrincipal` deliberately carries no token and no
 * session id, so the logout handler re-reads the header. Exporting this is what
 * keeps "how does a header become a token" a single answer: the alternatives
 * were a second parser in the controller, which drifts, or widening the
 * principal with a credential-derived value on every authenticated request in
 * the app to serve one route.
 */
export function bearerToken(header: string | undefined): string | null {
  const [scheme, token, ...rest] = header?.split(' ') ?? [];

  if (scheme?.toLowerCase() !== 'bearer' || !token || rest.length > 0) {
    return null;
  }

  return token;
}
