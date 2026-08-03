import type { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { argsOf, paramsOf, queryChain, toSql } from '../../test/query-chain';
import { SessionService } from './session.service';

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

const DAY_MS = 86_400_000;

describe('SessionService', () => {
  let service: SessionService;
  let select: jest.Mock;
  let insert: jest.Mock;
  let update: jest.Mock;
  let configGet: jest.Mock;

  beforeEach(() => {
    select = jest.fn();
    insert = jest.fn();
    update = jest.fn();
    // Mirrors ConfigService.get(key, defaultValue).
    configGet = jest.fn((_key: string, fallback: unknown) => fallback);

    service = new SessionService(
      { select, insert, update } as never,
      {
        get: configGet,
      } as unknown as ConfigService,
    );
  });

  describe('issue', () => {
    it('stores only the hash of the token it returns', async () => {
      const chain = queryChain([]);
      insert.mockReturnValue(chain);

      const { token } = await service.issue('user-id');

      const values = argsOf(chain, 'values')[0] as Record<string, unknown>;
      expect(values.tokenHash).toBe(sha256(token));
      // The raw bearer must exist nowhere but the verify response.
      expect(JSON.stringify(values)).not.toContain(token);
    });

    it('returns 256 bits of entropy, base64url encoded', async () => {
      insert.mockReturnValue(queryChain([]));

      const { token } = await service.issue('user-id');

      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    });

    it('defaults to a 30-day expiry, and returns the same instant it stores', async () => {
      const chain = queryChain([]);
      insert.mockReturnValue(chain);

      const before = Date.now();
      const { expiresAt } = await service.issue('user-id');

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 30 * DAY_MS);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 30 * DAY_MS);
      // The response and the row have to agree, or the frontend's cookie
      // outlives the session it stands for.
      expect(
        (argsOf(chain, 'values')[0] as { expiresAt: Date }).expiresAt,
      ).toBe(expiresAt);
    });

    it('takes the expiry from SESSION_TTL_D', async () => {
      configGet.mockImplementation((key: string, fallback: unknown) =>
        key === 'SESSION_TTL_D' ? 7 : fallback,
      );
      insert.mockReturnValue(queryChain([]));

      const before = Date.now();
      const { expiresAt } = await service.issue('user-id');

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 7 * DAY_MS);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 7 * DAY_MS);
    });

    it('supersedes nothing: concurrent sessions are one per device', async () => {
      insert.mockReturnValue(queryChain([]));

      await service.issue('user-id');

      expect(insert).toHaveBeenCalledTimes(1);
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('validate', () => {
    it('filters on the hash, expiry and both tombstones in one read', async () => {
      const chain = queryChain([]);
      select.mockReturnValue(chain);

      await service.validate('raw-token');

      const where = toSql(argsOf(chain, 'where')[0]);
      expect(where).toContain('"token_hash" = ?');
      expect(where).toContain('"expires_at" > ?');
      // Two tombstones: the session's own (revocation) and the user's.
      expect(where.match(/"deleted_at" is null/g)).toHaveLength(2);
      // The email comes from the join rather than a second query, which is what
      // keeps an authenticated request at one round trip.
      expect(argsOf(chain, 'innerJoin')).toHaveLength(2);
      expect(select).toHaveBeenCalledTimes(1);
    });

    it('looks the bearer up by hash, never by the raw value', async () => {
      const chain = queryChain([]);
      select.mockReturnValue(chain);

      await service.validate('raw-token');

      const params = paramsOf(argsOf(chain, 'where')[0]);
      expect(params).toContain(sha256('raw-token'));
      expect(params).not.toContain('raw-token');
    });

    it('returns the principal for a live session', async () => {
      const expiresAt = new Date(Date.now() + DAY_MS);
      select.mockReturnValue(
        queryChain([
          { userId: 'user-id', email: 'marko@email.com', expiresAt },
        ]),
      );

      await expect(service.validate('raw-token')).resolves.toEqual({
        userId: 'user-id',
        email: 'marko@email.com',
        expiresAt,
      });
    });

    it('returns null when nothing matches', async () => {
      select.mockReturnValue(queryChain([]));

      await expect(service.validate('raw-token')).resolves.toBeNull();
    });

    it('performs no write', async () => {
      select.mockReturnValue(
        queryChain([
          {
            userId: 'user-id',
            email: 'marko@email.com',
            expiresAt: new Date(),
          },
        ]),
      );

      await service.validate('raw-token');

      // Pinned so switching to a sliding expiry has to be a deliberate act:
      // extending on use would make every authenticated read a write against
      // the sync-replicated central database.
      expect(update).not.toHaveBeenCalled();
      expect(insert).not.toHaveBeenCalled();
    });
  });
});
