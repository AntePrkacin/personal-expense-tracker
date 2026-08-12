import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { bearerToken, type AuthenticatedRequest } from './session.guard';

/**
 * The raw bearer this request was authenticated with.
 *
 * `CurrentUser`'s counterpart, for the one route that needs the credential
 * itself rather than who it belongs to: logout revokes a session by token hash,
 * and `SessionPrincipal` carries no token and no session id by design, so
 * something has to read the header a second time.
 *
 * **It exists rather than `@Headers('authorization')` in the controller because
 * of what that does to the published contract.** The Swagger plugin introspects
 * `@Headers()` and emits a required `in: header` parameter, so logout documented
 * `Authorization` twice - once as the `bearer` security scheme and once as an
 * explicit input a caller must pass - and it was the only operation in the spec
 * that did. A `createParamDecorator` is invisible to the plugin, which is
 * exactly why `CurrentUser` is one too. Caught by reading the `api:sync` diff
 * rather than by any gate: both forms build, both pass every suite, and both
 * answer 204.
 *
 * It reuses the guard's own `bearerToken`, so "how does a header become a token"
 * keeps a single answer. And the return type is non-optional for `CurrentUser`'s
 * reason, restated for a credential: only a guarded route can use this
 * meaningfully, the guard has already refused anything without a usable bearer,
 * so an absent value is a bug to fail on rather than a branch to carry forever.
 *
 * **It throws rather than asserting non-null, which a code review asked for and
 * is worth the one line.** `CurrentUser` spells the same idea `request.user!`,
 * and there being wrong costs a property access on `undefined`; here the value
 * flows into `hashToken`, so a `null` would surface as a **500** where the guard
 * would have answered 401. That is reachable only by misusing this decorator -
 * putting it on a `@Public()` route, or making logout public, which the removed
 * idempotence criterion would have wanted - and the point is that misuse should
 * fail legibly rather than as a server fault. The message mirrors the guard's own
 * so the two cannot read as different problems.
 */
export const BearerToken = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException('Missing bearer credential.');
    }

    return token;
  },
);
