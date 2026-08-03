import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from './session.guard';
import type { SessionPrincipal } from './session.service';

/**
 * The authenticated caller, as `SessionGuard` resolved them.
 *
 * Only meaningful on a route the guard protects - it is what puts the principal
 * on the request - so the return type is non-optional deliberately: a handler
 * that reads this without `@UseGuards(SessionGuard)` above it is a bug worth
 * failing on rather than a possibly-undefined value to null-check forever.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionPrincipal => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user!;
  },
);
