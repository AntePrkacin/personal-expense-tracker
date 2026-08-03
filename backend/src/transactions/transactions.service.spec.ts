import { BadRequestException, NotFoundException } from '@nestjs/common';
import { argsOf, paramsOf, queryChain, toSql } from '../../test/query-chain';
import type { UserDatabaseService } from '../database/user-database.service';
import type { TransactionRow } from '../database/user/schema';
import { TransactionsService } from './transactions.service';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let getUserDb: jest.Mock;
  let select: jest.Mock;
  let insert: jest.Mock;
  let update: jest.Mock;

  const USER_ID = '0190c3f0-0000-7000-8000-000000000001';
  const TX_ID = '0190c3f0-0000-7000-8000-000000000002';
  const CATEGORY_ID = '0190c3f0-0000-7000-8000-000000000003';

  const createdAt = new Date('2026-08-03T10:00:00.000Z');
  const updatedAt = new Date('2026-08-03T11:00:00.000Z');

  const row: TransactionRow = {
    id: TX_ID,
    merchant: 'Konzum',
    categoryId: CATEGORY_ID,
    amountCents: 402,
    date: '2026-08-03',
    note: null,
    createdAt,
    updatedAt,
    deletedAt: null,
  };

  /** A live category, so the existence check passes. */
  const categoryFound = () => queryChain([{ id: CATEGORY_ID }]);

  const validCreate = {
    merchant: 'Konzum',
    categoryId: CATEGORY_ID,
    amount: 4.02,
    date: '2026-08-03',
  };

  beforeEach(() => {
    select = jest.fn().mockReturnValue(categoryFound());
    insert = jest.fn().mockReturnValue(queryChain([row]));
    update = jest.fn().mockReturnValue(queryChain([row]));
    getUserDb = jest.fn().mockResolvedValue({ select, insert, update });

    service = new TransactionsService({
      getUserDb,
    } as unknown as UserDatabaseService);
  });

  describe('create', () => {
    it('checks the category is live before inserting anything', async () => {
      await service.create(USER_ID, validCreate);

      const where = argsOf(select.mock.results[0].value as never, 'where')[0];
      // The tombstone filter matters here as much as the id: a soft-deleted
      // category must not accept new spending.
      expect(toSql(where)).toContain('is null');
      expect(paramsOf(where)).toContain(CATEGORY_ID);
    });

    it('404s an unknown category and never reaches the insert', async () => {
      select.mockReturnValue(queryChain([]));

      await expect(service.create(USER_ID, validCreate)).rejects.toThrow(
        NotFoundException,
      );
      expect(insert).not.toHaveBeenCalled();
    });

    it('converts the amount to cents, rounding float noise away', async () => {
      await service.create(USER_ID, { ...validCreate, amount: 4.02 });

      // 4.02 * 100 is 401.99999999999994 in binary floating point.
      expect(
        argsOf(insert.mock.results[0].value as never, 'values')[0],
      ).toEqual(expect.objectContaining({ amountCents: 402 }));
    });

    it('converts a larger amount without losing a cent', async () => {
      await service.create(USER_ID, { ...validCreate, amount: 2000.5 });

      expect(
        argsOf(insert.mock.results[0].value as never, 'values')[0],
      ).toEqual(expect.objectContaining({ amountCents: 200050 }));
    });

    it('generates a UUID id and stores the date verbatim', async () => {
      await service.create(USER_ID, { ...validCreate, date: '2025-11-05' });

      const values = argsOf(
        insert.mock.results[0].value as never,
        'values',
      )[0] as Record<string, unknown>;

      expect(values.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      // A backdated date is stored as the string it arrived as - no Date round
      // trip, which would shift the day in half the world's timezones.
      expect(values.date).toBe('2025-11-05');
    });

    it('writes an omitted note as null rather than undefined', async () => {
      await service.create(USER_ID, validCreate);

      expect(
        argsOf(insert.mock.results[0].value as never, 'values')[0],
      ).toEqual(expect.objectContaining({ note: null }));
    });

    it('answers in major units and ISO instants', async () => {
      await expect(service.create(USER_ID, validCreate)).resolves.toEqual({
        id: TX_ID,
        merchant: 'Konzum',
        categoryId: CATEGORY_ID,
        amount: 4.02,
        date: '2026-08-03',
        note: null,
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      });
    });
  });

  describe('update', () => {
    it('400s an empty body before it even opens the database', async () => {
      await expect(service.update(USER_ID, TX_ID, {})).rejects.toThrow(
        BadRequestException,
      );
      // The point of checking first: a bare UPDATE would still bump updated_at
      // through $onUpdateFn and record an edit that changed nothing.
      expect(getUserDb).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('sets exactly the fields provided, and nothing else', async () => {
      await service.update(USER_ID, TX_ID, { merchant: 'Spar' });

      expect(argsOf(update.mock.results[0].value as never, 'set')[0]).toEqual({
        merchant: 'Spar',
      });
    });

    it('never sets updatedAt by hand', async () => {
      await service.update(USER_ID, TX_ID, { merchant: 'Spar' });

      // drizzle's buildUpdateSet applies $onUpdateFn columns itself on every
      // UPDATE. Setting it here too would be a second source for one timestamp.
      expect(
        argsOf(update.mock.results[0].value as never, 'set')[0],
      ).not.toHaveProperty('updatedAt');
    });

    it('converts an updated amount to cents rather than passing majors through', async () => {
      await service.update(USER_ID, TX_ID, { amount: 2000.5 });

      const set = argsOf(update.mock.results[0].value as never, 'set')[0];

      expect(set).toEqual({ amountCents: 200050 });
      expect(set).not.toHaveProperty('amount');
    });

    it('keeps an explicit null note, because null clears it', async () => {
      await service.update(USER_ID, TX_ID, { note: null });

      expect(argsOf(update.mock.results[0].value as never, 'set')[0]).toEqual({
        note: null,
      });
    });

    it('checks the category only when one was sent', async () => {
      await service.update(USER_ID, TX_ID, { categoryId: CATEGORY_ID });
      expect(select).toHaveBeenCalledTimes(1);

      select.mockClear();
      await service.update(USER_ID, TX_ID, { merchant: 'Spar' });
      expect(select).not.toHaveBeenCalled();
    });

    it('404s an unknown category and never reaches the update', async () => {
      select.mockReturnValue(queryChain([]));

      await expect(
        service.update(USER_ID, TX_ID, { categoryId: CATEGORY_ID }),
      ).rejects.toThrow(NotFoundException);
      expect(update).not.toHaveBeenCalled();
    });

    it('excludes tombstoned rows from the WHERE', async () => {
      await service.update(USER_ID, TX_ID, { merchant: 'Spar' });

      const where = argsOf(update.mock.results[0].value as never, 'where')[0];

      // Without this a deleted transaction could be edited back into existence.
      expect(toSql(where)).toContain('is null');
      expect(paramsOf(where)).toContain(TX_ID);
    });

    it('404s when the conditional update matches no row', async () => {
      update.mockReturnValue(queryChain([]));

      await expect(
        service.update(USER_ID, TX_ID, { merchant: 'Spar' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('tombstones with an UPDATE rather than deleting the row', async () => {
      update.mockReturnValue(queryChain([{ id: TX_ID }]));

      await service.remove(USER_ID, TX_ID);

      expect(update).toHaveBeenCalledTimes(1);
      const set = argsOf(update.mock.results[0].value as never, 'set')[0] as {
        deletedAt?: Date;
      };
      expect(set.deletedAt).toBeInstanceOf(Date);
    });

    it('only tombstones a row that is not already tombstoned', async () => {
      update.mockReturnValue(queryChain([{ id: TX_ID }]));

      await service.remove(USER_ID, TX_ID);

      // One conditional UPDATE, never a read then a write: the await between a
      // check and a mark is where two concurrent deletes would both pass.
      const where = argsOf(update.mock.results[0].value as never, 'where')[0];
      expect(toSql(where)).toContain('is null');
      expect(paramsOf(where)).toContain(TX_ID);
    });

    it('404s when nothing was matched, which covers a repeat delete', async () => {
      update.mockReturnValue(queryChain([]));

      await expect(service.remove(USER_ID, TX_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  it('opens the caller’s own database for every operation', async () => {
    // This is the whole of cross-user isolation: there is no user column to
    // filter on because another user's rows are in another database.
    update.mockReturnValue(queryChain([row]));

    await service.create(USER_ID, validCreate);
    await service.update(USER_ID, TX_ID, { merchant: 'Spar' });
    await service.remove(USER_ID, TX_ID);

    expect(getUserDb).toHaveBeenCalledTimes(3);
    expect(getUserDb.mock.calls).toEqual([[USER_ID], [USER_ID], [USER_ID]]);
  });
});
