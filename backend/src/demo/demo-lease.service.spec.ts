import type { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { argsOf, queryChain, toSql } from '../../test/query-chain';
import type { SessionService } from '../auth/session.service';
import type { DemoSeedService } from './demo-seed.service';
import { DemoLeaseService } from './demo-lease.service';

/**
 * The hand-out's ordering, as the pool's isolation depends on it.
 *
 * Deliberately not a test of who ends up holding which account - that is
 * `test/demo.e2e-spec.ts`'s job, against real databases. What is pinned here is
 * the sequence of calls a mocked database can see and a real one cannot
 * conveniently prove: that every previous holder's bearer is revoked before a
 * single row is rewritten, and that the session minted afterwards dies with the
 * lease rather than in thirty days.
 */
describe('DemoLeaseService', () => {
  let service: DemoLeaseService;
  let update: jest.Mock;
  let revokeAllForUser: jest.Mock;
  let issue: jest.Mock;
  let reseed: jest.Mock;
  const calls: string[] = [];

  /** A pool row as `claim()`'s RETURNING yields it. */
  const claimed = (over: Record<string, unknown> = {}) => ({
    id: 'pool-row-id',
    userId: 'demo-user-id',
    leasedAt: new Date(),
    leaseExpiresAt: new Date(Date.now() + 60 * 60_000),
    seededAt: null,
    ...over,
  });

  beforeEach(() => {
    calls.length = 0;
    update = jest.fn();
    revokeAllForUser = jest.fn(() => {
      calls.push('revoke');
      return Promise.resolve();
    });
    issue = jest.fn(() =>
      Promise.resolve({ token: 'raw-token', expiresAt: new Date() }),
    );
    reseed = jest.fn(() => {
      calls.push('reseed');
      return Promise.resolve(2_000);
    });

    service = new DemoLeaseService(
      { update } as never,
      {
        get: jest.fn((_key: string, fallback: unknown) => fallback),
      } as unknown as ConfigService,
      { revokeAllForUser, issue } as unknown as SessionService,
      { reseed } as unknown as DemoSeedService,
    );
  });

  /** Queues the chains `handOut` consumes, in the order it consumes them. */
  const stubHandOut = ({
    reclaimed = [] as { userId: string }[],
    row = claimed(),
  } = {}) => {
    update
      .mockReturnValueOnce(queryChain(reclaimed)) // expireElapsed
      .mockReturnValueOnce(queryChain(row ? [row] : [])) // claim
      .mockReturnValue(queryChain([])); // markSeeded / release
  };

  describe('handOut', () => {
    it('revokes every session on the account before rewriting a row of it', async () => {
      stubHandOut();

      await service.handOut();

      expect(revokeAllForUser).toHaveBeenCalledWith('demo-user-id');
      // Order, not merely presence. A kept bearer that survives into the
      // restore can write into the account while the fixture is landing, and a
      // kept bearer that survives the hand-out reads the next visitor's data
      // for as long as it lives.
      expect(calls).toEqual(['revoke', 'reseed']);
    });

    it('mints a session that dies with the lease, not in SESSION_TTL_D days', async () => {
      const leaseExpiresAt = new Date(Date.now() + 60 * 60_000);
      stubHandOut({ row: claimed({ leaseExpiresAt }) });

      await service.handOut();

      expect(issue).toHaveBeenCalledWith('demo-user-id', {
        expiresAt: leaseExpiresAt,
      });
    });

    it('revokes nothing when the pool is exhausted', async () => {
      stubHandOut({ row: null as never });

      await expect(service.handOut()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );

      // Nobody's account was claimed, so nobody's session may be ended.
      expect(revokeAllForUser).not.toHaveBeenCalled();
      expect(issue).not.toHaveBeenCalled();
    });

    it('revokes the holder of every lease it reclaims', async () => {
      stubHandOut({
        reclaimed: [{ userId: 'lapsed-one' }, { userId: 'lapsed-two' }],
      });

      await service.handOut();

      // The sweep frees accounts nobody is about to claim, and a token on one of
      // those has to die when its lease does rather than when somebody
      // eventually asks for the account.
      expect(revokeAllForUser).toHaveBeenCalledWith('lapsed-one');
      expect(revokeAllForUser).toHaveBeenCalledWith('lapsed-two');
    });

    it('reads the lease expiry back from the row it wrote', async () => {
      stubHandOut();

      await service.handOut();

      // The claim is one conditional UPDATE ... RETURNING, and the expiry the
      // session takes has to be the one the pool actually recorded.
      const chain = update.mock.results[1].value as never;
      expect(toSql(argsOf(chain, 'where')[0])).toContain('"lease_expires_at"');
      expect(Object.keys(argsOf(chain, 'returning')[0] as object)).toContain(
        'leaseExpiresAt',
      );
    });
  });
});
