import type { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';
import type { ThrottlerRequest } from '@nestjs/throttler';
import type { DemoMembershipService } from './demo-membership.service';
import { DemoTierThrottlerGuard } from './demo-tier-throttler.guard';

/**
 * Which ceiling a caller gets, which is the whole of what this class adds.
 *
 * The parent's own behaviour is not re-tested here - it is the library's - so
 * `handleRequest` is stubbed on the prototype and every case asserts the
 * `limit` it was handed. That is the one thing a pooled caller and a real one
 * must differ by, and nothing else about the request may.
 */
describe('DemoTierThrottlerGuard', () => {
  let guard: DemoTierThrottlerGuard;
  let isPooled: jest.Mock;
  let handled: ThrottlerRequest[];

  const requestFor = (name: string, userId?: string): ThrottlerRequest =>
    ({
      context: {
        switchToHttp: () => ({
          getRequest: () => (userId ? { user: { userId } } : {}),
          getResponse: () => ({}),
        }),
      },
      limit: 20,
      ttl: 3_600_000,
      throttler: { name },
    }) as unknown as ThrottlerRequest;

  beforeEach(() => {
    handled = [];
    isPooled = jest.fn(() => Promise.resolve(true));

    jest
      .spyOn(
        Object.getPrototypeOf(
          DemoTierThrottlerGuard.prototype,
        ) as DemoTierThrottlerGuard,
        // The parent's method, reached through the prototype chain.
        'handleRequest' as never,
      )
      .mockImplementation(((request: ThrottlerRequest) => {
        handled.push(request);
        return Promise.resolve(true);
      }) as never);

    guard = new DemoTierThrottlerGuard(
      { throttlers: [] },
      { increment: jest.fn() },
      {} as Reflector,
      { isPooled } as unknown as DemoMembershipService,
      {
        get: jest.fn((_key: string, fallback: unknown) => fallback),
      } as unknown as ConfigService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  /** `handleRequest` is protected, and these cases are what it exists for. */
  const handle = (request: ThrottlerRequest) =>
    (
      guard as unknown as {
        handleRequest: (r: ThrottlerRequest) => Promise<boolean>;
      }
    ).handleRequest(request);

  it('lowers the chat ceiling for a pooled account', async () => {
    await handle(requestFor('chat', 'demo-user-id'));

    expect(isPooled).toHaveBeenCalledWith('demo-user-id');
    expect(handled[0].limit).toBe(5);
  });

  it('lowers the scan ceiling for a pooled account', async () => {
    await handle(requestFor('scan', 'demo-user-id'));

    expect(handled[0].limit).toBe(3);
  });

  it('leaves a real account on the configured limit', async () => {
    isPooled.mockResolvedValue(false);

    await handle(requestFor('chat', 'real-user-id'));

    expect(handled[0].limit).toBe(20);
  });

  it('touches no throttler but chat and scan, and asks about no other', async () => {
    // Every route in this app runs every configured throttler, so this guard
    // sees `email`, `ip` and `demo` too - and lowering one of those would be a
    // limit applied where nothing was measured.
    await handle(requestFor('ip', 'demo-user-id'));

    expect(handled[0].limit).toBe(20);
    expect(isPooled).not.toHaveBeenCalled();
  });

  it('leaves the limit alone when the request carries no principal', async () => {
    // `SessionGuard` is about to refuse this; there is no account to look up.
    await handle(requestFor('chat'));

    expect(handled[0].limit).toBe(20);
    expect(isPooled).not.toHaveBeenCalled();
  });

  it('takes the lowered ceilings from configuration', async () => {
    guard = new DemoTierThrottlerGuard(
      { throttlers: [] },
      { increment: jest.fn() },
      {} as Reflector,
      { isPooled } as unknown as DemoMembershipService,
      {
        get: jest.fn((key: string, fallback: unknown) =>
          key === 'DEMO_CHAT_RATE_LIMIT' ? 2 : fallback,
        ),
      } as unknown as ConfigService,
    );

    await handle(requestFor('chat', 'demo-user-id'));

    expect(handled[0].limit).toBe(2);
  });
});
