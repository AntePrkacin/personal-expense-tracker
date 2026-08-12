import { createParamDecorator, ExecutionContext } from '@nestjs/common';
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
 */
export const BearerToken = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return bearerToken(request.headers.authorization)!;
  },
);
