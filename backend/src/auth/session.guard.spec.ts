import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { SessionGuard, type AuthenticatedRequest } from './session.guard';
import type { SessionPrincipal, SessionService } from './session.service';

describe('SessionGuard', () => {
  let guard: SessionGuard;
  let validate: jest.Mock;

  const principal: SessionPrincipal = {
    userId: 'user-id',
    email: 'marko@email.com',
    expiresAt: new Date(Date.now() + 86_400_000),
  };

  /** A request carrying the given Authorization header, or none at all. */
  const contextWith = (authorization?: string) => {
    const request = { headers: authorization ? { authorization } : {} };
    return {
      request: request as AuthenticatedRequest,
      context: {
        switchToHttp: () => ({ getRequest: () => request }),
      } as ExecutionContext,
    };
  };

  beforeEach(() => {
    validate = jest.fn();
    guard = new SessionGuard({ validate } as unknown as SessionService);
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
});
