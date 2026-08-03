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
  let transaction: jest.Mock;
  let configGet: jest.Mock;

  beforeEach(() => {
    select = jest.fn();
    insert = jest.fn();
    update = jest.fn();
    // The callback receives a tx wired to the same mocks, so assertions on
    // update/insert see the statements regardless of the transaction wrapper.
    transaction = jest.fn((run: (tx: unknown) => Promise<unknown>) =>
      run({ insert, update }),
    );
    // Mirrors ConfigService.get(key, defaultValue).
    configGet = jest.fn((_key: string, fallback: unknown) => fallback);

    service = new LoginTokenService(
      { select, insert, update, transaction } as never,
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

    it('runs the supersede and the insert in one transaction', async () => {
      insert.mockReturnValue(queryChain([]));

      await service.issue('user-id');

      // Two standalone statements would let concurrent issues interleave and
      // leave two live links; the wrapper is what makes the invariant hold.
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledTimes(1);
      expect(insert).toHaveBeenCalledTimes(1);
    });
  });

  describe('consume', () => {
    beforeEach(() => {
      // The default diagnostic answer: no row at all, i.e. an unknown token.
      // Individual tests override it to describe a specific dead link.
      select.mockReturnValue(queryChain([]));
    });

    it('rejects used, superseded and expired tokens in the write itself', async () => {
      const chain = queryChain([]);
      update.mockReturnValue(chain);

      await expect(service.consume('raw-token')).resolves.toEqual({
        status: 'invalid',
      });

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

      await expect(service.consume('raw-token')).resolves.toEqual({
        status: 'consumed',
        userId: 'user-id',
      });
    });

    it('asks the row nothing when the write matched it', async () => {
      update.mockReturnValue(queryChain([{ userId: 'user-id' }]));

      await service.consume('raw-token');

      // The success path must stay exactly one statement: the diagnostic read
      // exists for rejections and pays for itself only there.
      expect(select).not.toHaveBeenCalled();
    });

    it('reports a superseded link, so the caller can point at the newer email', async () => {
      const spend = queryChain([]);
      update.mockReturnValue(spend);
      const diagnose = queryChain([{ usedAt: null, supersededAt: new Date() }]);
      select.mockReturnValue(diagnose);

      await expect(service.consume('raw-token')).resolves.toEqual({
        status: 'superseded',
      });

      // Nothing was spent: the write matched no row, and the read is a read.
      // Both statements key on the hash, never on the raw value.
      const params = paramsOf(argsOf(diagnose, 'where')[0]);
      expect(params).toContain(sha256('raw-token'));
      expect(params).not.toContain('raw-token');
      expect(toSql(argsOf(diagnose, 'where')[0])).toContain(
        '"deleted_at" is null',
      );
      expect(paramsOf(argsOf(spend, 'where')[0])).not.toContain('raw-token');
    });

    it('still reports superseded when that link has also expired', async () => {
      update.mockReturnValue(queryChain([]));
      select.mockReturnValue(
        queryChain([{ usedAt: null, supersededAt: new Date() }]),
      );

      await expect(service.consume('raw-token')).resolves.toEqual({
        status: 'superseded',
      });

      // Expiry cannot change that answer, because the diagnostic read does not
      // even fetch it: "a newer link was issued" is the useful thing to say,
      // and if the newest is expired too its click degrades into the generic
      // rejection.
      const [projection] = select.mock.calls[0] as [Record<string, unknown>];
      expect(Object.keys(projection).sort()).toEqual([
        'supersededAt',
        'usedAt',
      ]);
    });

    it('reports a used link as invalid, never as superseded', async () => {
      update.mockReturnValue(queryChain([]));
      select.mockReturnValue(
        queryChain([{ usedAt: new Date(), supersededAt: null }]),
      );

      await expect(service.consume('raw-token')).resolves.toEqual({
        status: 'invalid',
      });
    });

    it('reports an unknown token as invalid, so a probe learns nothing', async () => {
      update.mockReturnValue(queryChain([]));
      select.mockReturnValue(queryChain([]));

      await expect(service.consume('never-issued')).resolves.toEqual({
        status: 'invalid',
      });
    });

    it('diagnoses only after the write missed, never before it', async () => {
      update.mockReturnValue(queryChain([]));

      await service.consume('raw-token');

      // The order is the single-use guarantee. A read that ran first would be
      // a check-then-act, whatever the conditions on the write said.
      expect(select.mock.invocationCallOrder[0]).toBeGreaterThan(
        update.mock.invocationCallOrder[0],
      );
    });

    it('lets exactly one of two concurrent consumes win', async () => {
      // Models what the database does: each statement evaluates its own
      // conditions when it runs, and writes are serialized. The second one
      // therefore matches zero rows.
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

      expect(results.filter((result) => result.status === 'consumed')).toEqual([
        { status: 'consumed', userId: 'user-id' },
      ]);
      // Only the loser diagnoses, and it does so after both writes have run -
      // no read precedes a write anywhere in this race.
      expect(select).toHaveBeenCalledTimes(1);
      expect(select.mock.invocationCallOrder[0]).toBeGreaterThan(
        Math.max(...update.mock.invocationCallOrder),
      );
    });
  });
});
