import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { SQLiteDialect } from 'drizzle-orm/sqlite-core';
import type { UserDatabaseService } from '../database/user-database.service';
import { UsersService } from './users.service';

interface RecordedCall {
  method: string;
  args: unknown[];
}

interface QueryChain {
  __calls: RecordedCall[];
}

/**
 * Drizzle query builders are chainable and thenable: the whole
 * `select().from().where().limit()` expression is awaited as one value. This
 * stands in for that - every method returns the same object and records its
 * arguments, and awaiting it produces `result` (or throws, if `result` is an
 * Error).
 */
function queryChain(result: unknown): QueryChain {
  const calls: RecordedCall[] = [];

  const proxy = new Proxy({} as QueryChain, {
    get(_target, property) {
      if (property === '__calls') return calls;
      if (typeof property !== 'string') return undefined;
      if (property === 'then') {
        return (
          resolve: (v: unknown) => unknown,
          reject: (e: unknown) => unknown,
        ) =>
          result instanceof Error
            ? Promise.reject(result).then(resolve, reject)
            : Promise.resolve(result).then(resolve, reject);
      }
      return (...args: unknown[]) => {
        calls.push({ method: property, args });
        return proxy;
      };
    },
  });

  return proxy;
}

/** The arguments a chain received for one builder method, e.g. `values`. */
const argsOf = (chain: QueryChain, method: string): unknown[] =>
  chain.__calls.find((call) => call.method === method)?.args ?? [];

/** Renders a Drizzle condition to SQL text, so filters can be asserted for real. */
const toSql = (condition: unknown): string =>
  new SQLiteDialect().sqlToQuery(condition as never).sql;

const CREATED_AT = new Date('2026-08-01T10:00:00.000Z');

const dto = {
  firstName: 'Marko',
  lastName: 'Kovac',
  email: 'marko@email.com',
  monthlyBudget: 2000.5,
};

const userRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-id',
  email: 'marko@email.com',
  dbName: 'expensa-user-user-id',
  dbUrl: 'expensa-user-x.aws.turso.io',
  dbAuthToken: 'super-secret-token',
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  deletedAt: null,
  ...overrides,
});

const profileRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-id',
  firstName: 'Marko',
  lastName: 'Kovac',
  currency: 'USD',
  monthlyBudgetCents: 200050,
  monthStartDay: 1,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  deletedAt: null,
  ...overrides,
});

describe('UsersService', () => {
  let service: UsersService;

  // Held as standalone mocks rather than reached through the objects below, so
  // assertions never pass an unbound method around.
  let centralSelect: jest.Mock;
  let centralInsert: jest.Mock;
  let centralDelete: jest.Mock;
  let userSelect: jest.Mock;
  let userInsert: jest.Mock;
  let provisionUserDb: jest.Mock;
  let getUserDb: jest.Mock;
  let deleteUserDb: jest.Mock;

  beforeEach(() => {
    centralSelect = jest.fn();
    centralInsert = jest.fn();
    centralDelete = jest.fn();
    userSelect = jest.fn();
    userInsert = jest.fn();

    const centralDb = {
      select: centralSelect,
      insert: centralInsert,
      delete: centralDelete,
    };
    const userDb = { select: userSelect, insert: userInsert };

    provisionUserDb = jest.fn().mockResolvedValue({
      dbName: 'expensa-user-user-id',
      dbUrl: 'expensa-user-x.aws.turso.io',
      dbAuthToken: 'super-secret-token',
    });
    getUserDb = jest.fn().mockResolvedValue(userDb);
    deleteUserDb = jest.fn().mockResolvedValue(undefined);

    const userDatabases = {
      provisionUserDb,
      getUserDb,
      deleteUserDb,
    } as unknown as UserDatabaseService;

    service = new UsersService(centralDb as never, userDatabases);

    // The rollback path logs by design; keep the test output readable.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('create', () => {
    it('writes the central row and the profile, and returns neither the db pointer nor its token', async () => {
      centralSelect.mockReturnValue(queryChain([]));
      centralInsert.mockReturnValue(queryChain([userRow()]));
      userInsert.mockReturnValue(queryChain([profileRow()]));

      const result = await service.create({ ...dto });

      expect(result).toEqual({
        id: 'user-id',
        email: 'marko@email.com',
        firstName: 'Marko',
        lastName: 'Kovac',
        currency: 'USD',
        monthlyBudget: 2000.5,
        monthStartDay: 1,
        createdAt: CREATED_AT.toISOString(),
      });
      expect(result).not.toHaveProperty('dbName');
      expect(result).not.toHaveProperty('dbUrl');
      expect(result).not.toHaveProperty('dbAuthToken');
    });

    it('stores the database pointer that provisioning returned', async () => {
      centralSelect.mockReturnValue(queryChain([]));
      const insertChain = queryChain([userRow()]);
      centralInsert.mockReturnValue(insertChain);
      userInsert.mockReturnValue(queryChain([profileRow()]));

      await service.create({ ...dto });

      expect(argsOf(insertChain, 'values')[0]).toMatchObject({
        dbName: 'expensa-user-user-id',
        dbUrl: 'expensa-user-x.aws.turso.io',
        dbAuthToken: 'super-secret-token',
      });
    });

    it('converts the budget to integer cents', async () => {
      centralSelect.mockReturnValue(queryChain([]));
      centralInsert.mockReturnValue(queryChain([userRow()]));
      const profileChain = queryChain([profileRow()]);
      userInsert.mockReturnValue(profileChain);

      await service.create({ ...dto, monthlyBudget: 19.99 });

      expect(argsOf(profileChain, 'values')[0]).toMatchObject({
        monthlyBudgetCents: 1999,
      });
    });

    it('rejects a duplicate email with 409 without provisioning anything', async () => {
      centralSelect.mockReturnValue(queryChain([{ id: 'existing' }]));

      await expect(service.create({ ...dto })).rejects.toThrow(
        ConflictException,
      );
      expect(provisionUserDb).not.toHaveBeenCalled();
      expect(centralInsert).not.toHaveBeenCalled();
    });

    it('compensates when the profile write fails, leaving nothing orphaned', async () => {
      centralSelect.mockReturnValue(queryChain([]));
      centralInsert.mockReturnValue(queryChain([userRow()]));
      centralDelete.mockReturnValue(queryChain([]));
      userInsert.mockReturnValue(queryChain(new Error('disk full')));

      await expect(service.create({ ...dto })).rejects.toThrow('disk full');

      expect(deleteUserDb).toHaveBeenCalledTimes(1);
      expect(centralDelete).toHaveBeenCalledTimes(1);
    });

    it('surfaces a lost unique-index race as 409 rather than 500', async () => {
      centralSelect.mockReturnValue(queryChain([]));
      centralInsert.mockReturnValue(
        queryChain(new Error('UNIQUE constraint failed: users.email')),
      );
      centralDelete.mockReturnValue(queryChain([]));

      await expect(service.create({ ...dto })).rejects.toThrow(
        ConflictException,
      );
      expect(deleteUserDb).toHaveBeenCalledTimes(1);
    });
  });

  describe('findById', () => {
    it('merges the central row with the profile from the user database', async () => {
      centralSelect.mockReturnValue(queryChain([userRow()]));
      userSelect.mockReturnValue(
        queryChain([profileRow({ currency: 'EUR', monthStartDay: 15 })]),
      );

      await expect(service.findById('user-id')).resolves.toEqual({
        id: 'user-id',
        email: 'marko@email.com',
        firstName: 'Marko',
        lastName: 'Kovac',
        currency: 'EUR',
        monthlyBudget: 2000.5,
        monthStartDay: 15,
        createdAt: CREATED_AT.toISOString(),
      });
    });

    it('404s when the central row is missing, without opening a user database', async () => {
      centralSelect.mockReturnValue(queryChain([]));

      await expect(service.findById('user-id')).rejects.toThrow(
        NotFoundException,
      );
      expect(getUserDb).not.toHaveBeenCalled();
    });

    it('404s when the central row exists but the profile does not', async () => {
      centralSelect.mockReturnValue(queryChain([userRow()]));
      userSelect.mockReturnValue(queryChain([]));

      await expect(service.findById('user-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('filters out soft-deleted rows in both databases', async () => {
      const centralChain = queryChain([userRow()]);
      centralSelect.mockReturnValue(centralChain);
      const profileChain = queryChain([profileRow()]);
      userSelect.mockReturnValue(profileChain);

      await service.findById('user-id');

      expect(toSql(argsOf(centralChain, 'where')[0])).toContain(
        '"deleted_at" is null',
      );
      expect(toSql(argsOf(profileChain, 'where')[0])).toContain(
        '"deleted_at" is null',
      );
    });
  });
});
