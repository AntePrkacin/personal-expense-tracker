import type { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { argsOf, paramsOf, queryChain, toSql } from '../../test/query-chain';
import { LoginTokenService } from './login-token.service';

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

describe('LoginTokenService', () => {
  let service: LoginTokenService;
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

    service = new LoginTokenService(
      { select, insert, update } as never,
      {
        get: configGet,
      } as unknown as ConfigService,
    );
  });

  describe('issue', () => {
    beforeEach(() => {
      update.mockReturnValue(queryChain([]));
    });

    it('stores only the hash of the token it returns', async () => {
      const chain = queryChain([]);
      insert.mockReturnValue(chain);

      const rawToken = await service.issue('user-id');

      const values = argsOf(chain, 'values')[0] as Record<string, unknown>;
      expect(values.tokenHash).toBe(sha256(rawToken));
      // The raw value must exist nowhere but the return and the email.
      expect(JSON.stringify(values)).not.toContain(rawToken);
    });

    it('returns 256 bits of entropy, base64url encoded', async () => {
      insert.mockReturnValue(queryChain([]));

      const rawToken = await service.issue('user-id');

      expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(rawToken, 'base64url')).toHaveLength(32);
    });

    it('takes the expiry from LOGIN_LINK_TTL_M', async () => {
      configGet.mockImplementation((key: string, fallback: unknown) =>
        key === 'LOGIN_LINK_TTL_M' ? 30 : fallback,
      );
      const chain = queryChain([]);
      insert.mockReturnValue(chain);

      const before = Date.now();
      await service.issue('user-id');

      const { expiresAt } = argsOf(chain, 'values')[0] as { expiresAt: Date };
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 30 * 60_000);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 30 * 60_000);
    });

    it('defaults to a 15-minute expiry', async () => {
      const chain = queryChain([]);
      insert.mockReturnValue(chain);

      const before = Date.now();
      await service.issue('user-id');

      const { expiresAt } = argsOf(chain, 'values')[0] as { expiresAt: Date };
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 15 * 60_000);
      expect(service.ttlMinutes).toBe(15);
    });

    it('supersedes the user’s live tokens first, so only the newest works', async () => {
      const supersede = queryChain([]);
      update.mockReturnValue(supersede);
      insert.mockReturnValue(queryChain([]));

      await service.issue('user-id');

      expect(argsOf(supersede, 'set')[0]).toEqual({
        supersededAt: expect.any(Date) as Date,
      });

      const where = toSql(argsOf(supersede, 'where')[0]);
      expect(where).toContain('"user_id" = ?');
      expect(where).toContain('"used_at" is null');
      expect(where).toContain('"superseded_at" is null');

      // Before the insert, or the new token would supersede itself.
      expect(update.mock.invocationCallOrder[0]).toBeLessThan(
        insert.mock.invocationCallOrder[0],
      );
    });
  });

  describe('consume', () => {
    it('rejects used, superseded and expired tokens in the write itself', async () => {
      const chain = queryChain([]);
      update.mockReturnValue(chain);

      await expect(service.consume('raw-token')).resolves.toBeNull();

      const where = toSql(argsOf(chain, 'where')[0]);
      expect(where).toContain('"token_hash" = ?');
      expect(where).toContain('"used_at" is null');
      expect(where).toContain('"superseded_at" is null');
      expect(where).toContain('"expires_at" > ?');
      expect(argsOf(chain, 'set')[0]).toEqual({
        usedAt: expect.any(Date) as Date,
      });
    });

    it('looks the token up by hash, never by the raw value', async () => {
      const chain = queryChain([]);
      update.mockReturnValue(chain);

      await service.consume('raw-token');

      const params = paramsOf(argsOf(chain, 'where')[0]);
      expect(params).toContain(sha256('raw-token'));
      expect(params).not.toContain('raw-token');
    });

    it('returns the user the token belonged to', async () => {
      update.mockReturnValue(queryChain([{ userId: 'user-id' }]));

      await expect(service.consume('raw-token')).resolves.toBe('user-id');
    });

    it('lets exactly one of two concurrent consumes win', async () => {
      // Models what the database does: each statement evaluates its own
      // conditions when it runs, and writes are serialized. The second one
      // therefore matches zero rows. A check-then-mark implementation could not
      // pass this together with the assertion below that nothing is selected -
      // its read would happen before either write.
      let spent = false;
      update.mockImplementation(() => {
        const rows = spent ? [] : [{ userId: 'user-id' }];
        spent = true;
        return queryChain(rows);
      });

      const results = await Promise.all([
        service.consume('raw-token'),
        service.consume('raw-token'),
      ]);

      expect(results.filter((userId) => userId !== null)).toEqual(['user-id']);
      expect(select).not.toHaveBeenCalled();
    });
  });
});
