import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { migrate as localMigrate } from 'drizzle-orm/tursodatabase/migrator';
import { migrate as syncMigrate } from 'drizzle-orm/tursodatabase-sync/migrator';
import type { CentralDatabase, DatabaseHandle } from './database.types';
import { openCloudDatabase, openLocalDatabase } from './turso-client.factory';
import type { TursoPlatformService } from './turso-platform.service';
import { UserDatabaseService } from './user-database.service';

// The factory is the seam between cloud and local mode, so mocking it is what
// makes both modes testable without a Turso account or a real file.
jest.mock('./turso-client.factory');
jest.mock('drizzle-orm/tursodatabase/migrator');
jest.mock('drizzle-orm/tursodatabase-sync/migrator');
jest.mock('node:fs/promises');

const USER_ID = '019fbd57-ca52-7509-bc0d-fee63ffc5294';
const USER_DB_PATH = `/tmp/expensa-test/users/expensa-user-${USER_ID}.db`;

const openLocalMock = jest.mocked(openLocalDatabase);
const openCloudMock = jest.mocked(openCloudDatabase);
const localMigrateMock = jest.mocked(localMigrate);
const syncMigrateMock = jest.mocked(syncMigrate);

describe('UserDatabaseService', () => {
  let env: Record<string, string>;
  let config: ConfigService;
  let platform: TursoPlatformService;
  let createUserDatabase: jest.Mock;
  let mintDbToken: jest.Mock;
  let deleteUserDatabase: jest.Mock;
  let centralDb: CentralDatabase;
  let centralRows: unknown[];
  let closes: jest.Mock[];

  const newHandle = (): DatabaseHandle => {
    const close = jest.fn().mockResolvedValue(undefined);
    closes.push(close);
    return { db: {} as DatabaseHandle['db'], close };
  };

  const build = () => new UserDatabaseService(centralDb, config, platform);

  beforeEach(() => {
    jest.clearAllMocks();
    closes = [];

    env = { DATABASE_DIR: '/tmp/expensa-test' };
    config = {
      get: (key: string, fallback?: unknown) => env[key] ?? fallback,
      getOrThrow: (key: string) => env[key],
    } as unknown as ConfigService;

    createUserDatabase = jest.fn();
    mintDbToken = jest.fn();
    deleteUserDatabase = jest.fn().mockResolvedValue(undefined);
    platform = {
      createUserDatabase,
      mintDbToken,
      deleteUserDatabase,
    } as unknown as TursoPlatformService;

    centralRows = [];
    // Minimal stand-in for `select(...).from(...).where(...).limit(1)`.
    const chain = {
      select: () => chain,
      from: () => chain,
      where: () => chain,
      limit: () => Promise.resolve(centralRows),
    };
    centralDb = chain as unknown as CentralDatabase;

    openLocalMock.mockImplementation(() => Promise.resolve(newHandle()));
    openCloudMock.mockImplementation(() => Promise.resolve(newHandle()));
  });

  it('rejects a user id that is not a uuid, before it reaches a path or a database name', async () => {
    await expect(build().getUserDb('../../etc/passwd')).rejects.toThrow(
      BadRequestException,
    );
    expect(openLocalMock).not.toHaveBeenCalled();
  });

  describe('local mode', () => {
    it('opens the file once and migrates it once, even for concurrent callers', async () => {
      const service = build();

      const [a, b, c] = await Promise.all([
        service.getUserDb(USER_ID),
        service.getUserDb(USER_ID),
        service.getUserDb(USER_ID),
      ]);

      expect(openLocalMock).toHaveBeenCalledTimes(1);
      expect(localMigrateMock).toHaveBeenCalledTimes(1);
      expect(a).toBe(b);
      expect(b).toBe(c);
    });

    it('reuses the cached connection on later calls', async () => {
      const service = build();

      await service.getUserDb(USER_ID);
      await service.getUserDb(USER_ID);

      expect(openLocalMock).toHaveBeenCalledTimes(1);
    });

    it('names the file after the user id and puts it under DATABASE_DIR', async () => {
      await build().getUserDb(USER_ID);

      expect(openLocalMock).toHaveBeenCalledWith({ path: USER_DB_PATH });
    });

    it('provisions without touching the Platform API', async () => {
      await expect(build().provisionUserDb(USER_ID)).resolves.toEqual({
        dbName: `expensa-user-${USER_ID}`,
        dbUrl: null,
        dbAuthToken: null,
      });
      expect(createUserDatabase).not.toHaveBeenCalled();
    });
  });

  describe('cloud mode', () => {
    beforeEach(() => {
      Object.assign(env, {
        TURSO_ORG: 'acme',
        TURSO_ORG_TOKEN: 'org-token',
        TURSO_CENTRAL_DB_URL: 'libsql://central.turso.io',
        TURSO_CENTRAL_DB_TOKEN: 'central-token',
      });
    });

    it("connects with that one user's stored url and token, not a shared one", async () => {
      centralRows = [
        { dbUrl: 'expensa-user-x.aws.turso.io', dbAuthToken: 'per-user-token' },
      ];

      await build().getUserDb(USER_ID);

      expect(openCloudMock).toHaveBeenCalledWith({
        path: USER_DB_PATH,
        url: 'expensa-user-x.aws.turso.io',
        authToken: 'per-user-token',
        syncIntervalS: 60,
      });
      expect(syncMigrateMock).toHaveBeenCalledTimes(1);
    });

    it('refuses to open a user that has no central row', async () => {
      centralRows = [];

      await expect(build().getUserDb(USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('creates the database and mints its token when provisioning', async () => {
      createUserDatabase.mockResolvedValue({
        dbName: `expensa-user-${USER_ID}`,
        hostname: 'expensa-user-x.aws.turso.io',
      });
      mintDbToken.mockResolvedValue('per-user-token');

      await expect(build().provisionUserDb(USER_ID)).resolves.toEqual({
        dbName: `expensa-user-${USER_ID}`,
        dbUrl: 'expensa-user-x.aws.turso.io',
        dbAuthToken: 'per-user-token',
      });
    });

    it('derives the name from the id when deleting, without reading the central row', async () => {
      // The compensation path calls this exactly when the central insert
      // failed, so there may be no row to read.
      centralRows = [];

      await build().deleteUserDb(USER_ID);

      expect(deleteUserDatabase).toHaveBeenCalledWith(
        `expensa-user-${USER_ID}`,
      );
    });
  });

  it('closes every open connection on shutdown', async () => {
    const service = build();
    await service.getUserDb(USER_ID);

    await service.closeAll();

    expect(closes).toHaveLength(1);
    expect(closes[0]).toHaveBeenCalled();
  });
});
