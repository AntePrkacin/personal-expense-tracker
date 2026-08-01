import {
  Global,
  Inject,
  Logger,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { migrate as localMigrate } from 'drizzle-orm/tursodatabase/migrator';
import { migrate as syncMigrate } from 'drizzle-orm/tursodatabase-sync/migrator';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  APP_DB,
  CENTRAL_DB_FILE,
  CENTRAL_MIGRATIONS_DIR,
} from './database.constants';
import type { CentralDatabase, DatabaseHandle } from './database.types';
import { openCloudDatabase, openLocalDatabase } from './turso-client.factory';
import { TursoPlatformService } from './turso-platform.service';
import { UserDatabaseService } from './user-database.service';

/** Internal token for the central connection's lifecycle handle. */
const CENTRAL_DB_HANDLE = 'CENTRAL_DB_HANDLE';

/**
 * Opens the central database and brings its schema up to date.
 *
 * Nest resolves async factories before the server starts listening, so the
 * central database is migrated before any consumer can query it.
 */
async function openCentralDatabase(
  config: ConfigService,
): Promise<DatabaseHandle> {
  const databaseDir = config.get<string>('DATABASE_DIR', './databases');
  await mkdir(databaseDir, { recursive: true });

  const path = join(databaseDir, CENTRAL_DB_FILE);
  const orgToken = config.get<string>('TURSO_ORG_TOKEN');

  if (orgToken) {
    const handle = await openCloudDatabase({
      path,
      url: config.getOrThrow<string>('TURSO_CENTRAL_DB_URL'),
      authToken: config.getOrThrow<string>('TURSO_CENTRAL_DB_TOKEN'),
      syncIntervalS: config.get<number>('TURSO_SYNC_INTERVAL_S', 60),
    });
    await syncMigrate(handle.db as never, {
      migrationsFolder: CENTRAL_MIGRATIONS_DIR,
    });
    return handle;
  }

  const handle = await openLocalDatabase({ path });
  await localMigrate(handle.db as never, {
    migrationsFolder: CENTRAL_MIGRATIONS_DIR,
  });
  return handle;
}

/**
 * Persistence wiring. Global because every feature module needs the central
 * database and the per-user connections, and re-importing this everywhere adds
 * nothing.
 *
 * TursoPlatformService is deliberately not exported: the organization API token
 * it holds should only ever be used from UserDatabaseService's provisioning
 * path.
 */
@Global()
@Module({
  providers: [
    {
      provide: CENTRAL_DB_HANDLE,
      inject: [ConfigService],
      useFactory: openCentralDatabase,
    },
    {
      provide: APP_DB,
      inject: [CENTRAL_DB_HANDLE],
      useFactory: (handle: DatabaseHandle): CentralDatabase => handle.db,
    },
    TursoPlatformService,
    UserDatabaseService,
  ],
  exports: [APP_DB, UserDatabaseService],
})
export class DatabaseModule implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(
    @Inject(CENTRAL_DB_HANDLE) private readonly centralHandle: DatabaseHandle,
    private readonly userDatabases: UserDatabaseService,
  ) {}

  /** Requires `app.enableShutdownHooks()` in main.ts to fire on SIGINT/SIGTERM. */
  async onApplicationShutdown(): Promise<void> {
    await this.userDatabases.closeAll();
    await this.centralHandle.close().catch((error) => {
      this.logger.warn(`Closing the central database failed: ${String(error)}`);
    });
  }
}
