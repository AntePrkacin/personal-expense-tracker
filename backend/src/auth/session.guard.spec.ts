import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { SessionGuard, type AuthenticatedRequest } from './session.guard';
import type { SessionPrincipal, SessionService } from './session.service';

describe('SessionGuard', () => {
  let guard: SessionGuard;
  let validate: jest.Mock;
  let getAllAndOverride: jest.Mock;

  const principal: SessionPrincipal = {
    userId: 'user-id',
    email: 'marko@email.com',
    expiresAt: new Date(Date.now() + 86_400_000),
  };

  // Sentinels, so the reflector assertion can pin that it is handed exactly
  // this handler and this class rather than something merely shaped like them.
  const handler = function route() {};
  class SomeController {}

  /** A request carrying the given Authorization header, or none at all. */
  const contextWith = (authorization?: string) => {
    const request = { headers: authorization ? { authorization } : {} };
    return {
      request: request as AuthenticatedRequest,
      context: {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => handler,
        getClass: () => SomeController,
      } as unknown as ExecutionContext,
    };
  };

  beforeEach(() => {
    validate = jest.fn();
    // The default for every existing case: a route with no @Public() mark.
    getAllAndOverride = jest.fn().mockReturnValue(undefined);
    guard = new SessionGuard(
      { validate } as unknown as SessionService,
      { getAllAndOverride } as unknown as Reflector,
    );
  });

  it('refuses a request with no Authorization header, without a lookup', async () => {
    const { context } = contextWith();

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    // No header means nothing to look up: the database is never touched.
    expect(validate).not.toHaveBeenCalled();
  });

  it('refuses a scheme that is not Bearer', async () => {
    const { context } = contextWith('Basic dXNlcjpwYXNz');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(validate).not.toHaveBeenCalled();
  });

  it('refuses a header that is not exactly a scheme and a token', async () => {
    for (const header of ['Bearer', 'Bearer a b', 'token-only']) {
      await expect(
        guard.canActivate(contextWith(header).context),
      ).rejects.toThrow(UnauthorizedException);
    }
    expect(validate).not.toHaveBeenCalled();
  });

  it('refuses a bearer the service does not recognize', async () => {
    validate.mockResolvedValue(null);
    const { context, request } = contextWith('Bearer dead-token');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(validate).toHaveBeenCalledWith('dead-token');
    expect(request.user).toBeUndefined();
  });

  it('attaches the principal and lets a live session through', async () => {
    validate.mockResolvedValue(principal);
    const { context, request } = contextWith('Bearer live-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual(principal);
  });

  it('matches the scheme case-insensitively, as RFC 7235 specifies', async () => {
    validate.mockResolvedValue(principal);

    for (const header of ['bearer live-token', 'BEARER live-token']) {
      await expect(
        guard.canActivate(contextWith(header).context),
      ).resolves.toBe(true);
    }
  });

  // The guard is global, so these two are what keep the four unauthenticated
  // routes reachable at all.
  it('lets a public route through with no header and no session lookup', async () => {
    getAllAndOverride.mockReturnValue(true);
    const { context, request } = contextWith();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(validate).not.toHaveBeenCalled();
    // Nothing is attached: a public route has no principal to speak of.
    expect(request.user).toBeUndefined();
  });

  it('ignores a bearer entirely on a public route', async () => {
    getAllAndOverride.mockReturnValue(true);
    const { context } = contextWith('Bearer live-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(validate).not.toHaveBeenCalled();
  });

  it('reads the public mark from the handler and the class, in that order', async () => {
    getAllAndOverride.mockReturnValue(true);

    await guard.canActivate(contextWith().context);

    // Handler first: getAllAndOverride takes the first defined value, so this
    // order is what lets a single route override a class-level mark.
    expect(getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      handler,
      SomeController,
    ]);
  });
});
