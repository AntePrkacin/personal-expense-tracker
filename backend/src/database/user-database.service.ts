import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNull } from 'drizzle-orm';
import { migrate as localMigrate } from 'drizzle-orm/tursodatabase/migrator';
import { migrate as syncMigrate } from 'drizzle-orm/tursodatabase-sync/migrator';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isUuid } from '../common/ids';
import { users } from './central/schema';
import {
  APP_DB,
  SYNC_ONLY_SIBLINGS,
  USER_DB_SUBDIR,
  USER_MIGRATIONS_DIR,
  userDbName,
} from './database.constants';
import type {
  CentralDatabase,
  DatabaseHandle,
  UserDatabase,
} from './database.types';
import { openCloudDatabase, openLocalDatabase } from './turso-client.factory';
import { TursoPlatformService } from './turso-platform.service';

/** What provisioning produced, ready to be written to the central users row. */
export interface ProvisionedUserDb {
  dbName: string;
  dbUrl: string | null;
  dbAuthToken: string | null;
}

/**
 * Owns the per-user databases: creating them, opening them, migrating them and
 * closing them.
 *
 * Together with turso-client.factory.ts this is the only place that knows how a
 * user database comes into being, which is what keeps the rest of the app free
 * of cloud-versus-local branching.
 */
@Injectable()
export class UserDatabaseService {
  private readonly logger = new Logger(UserDatabaseService.name);

  /**
   * Open connections, keyed by user id. Unbounded by design: this is a small
   * teaching app with few users. An LRU with idle eviction is the obvious next
   * step once the user count is real.
   */
  private readonly connections = new Map<string, DatabaseHandle>();

  /**
   * In-flight opens, so two concurrent requests for the same user share one
   * open instead of racing - which would otherwise run the migrations twice
   * against the same file.
   */
  private readonly opening = new Map<string, Promise<DatabaseHandle>>();

  constructor(
    @Inject(APP_DB) private readonly centralDb: CentralDatabase,
    private readonly config: ConfigService,
    private readonly platform: TursoPlatformService,
  ) {}

  /** True when the four Turso variables are set; see env.validation.ts. */
  private get isCloudMode(): boolean {
    return Boolean(this.config.get<string>('TURSO_ORG_TOKEN'));
  }

  private get databaseDir(): string {
    return this.config.get<string>('DATABASE_DIR', './databases');
  }

  /** Local file backing a user's database, in both modes. */
  private userDbPath(userId: string): string {
    return join(this.databaseDir, USER_DB_SUBDIR, `${userDbName(userId)}.db`);
  }

  /**
   * Creates the user's database before any row references it.
   *
   * In local mode there is nothing to create up front - the file appears on
   * first open - so this only settles on the name.
   */
  async provisionUserDb(userId: string): Promise<ProvisionedUserDb> {
    this.assertValidUserId(userId);
    const dbName = userDbName(userId);

    if (!this.isCloudMode) {
      return { dbName, dbUrl: null, dbAuthToken: null };
    }

    const { hostname } = await this.platform.createUserDatabase(dbName);
    const dbAuthToken = await this.platform.mintDbToken(dbName);

    return { dbName, dbUrl: hostname, dbAuthToken };
  }

  /**
   * Returns a connection to a user's database, opening and migrating it on
   * first use. Migrations run on every open, so a database created by an older
   * release is upgraded the next time someone touches it.
   */
  async getUserDb(userId: string): Promise<UserDatabase> {
    this.assertValidUserId(userId);

    const cached = this.connections.get(userId);
    if (cached) {
      return cached.db;
    }

    const inFlight = this.opening.get(userId);
    if (inFlight) {
      return (await inFlight).db;
    }

    const open = this.openUserDb(userId).finally(() =>
      this.opening.delete(userId),
    );
    this.opening.set(userId, open);

    const handle = await open;
    this.connections.set(userId, handle);
    return handle.db;
  }

  /**
   * Tears a user's database down completely.
   *
   * The name is derived from the id rather than read from the central row on
   * purpose: registration's compensation path calls this precisely when the
   * central insert is the thing that failed, so there may be no row to read.
   */
  async deleteUserDb(userId: string): Promise<void> {
    this.assertValidUserId(userId);

    // An open still in flight would settle after the teardown below and cache
    // a live handle to (in local mode, a fresh file of) the database this is
    // deleting. Wait it out instead. getUserDb attached to the promise first,
    // so by the time this resumes it has stored the handle in `connections`
    // and the close below finds it. A failed open left nothing to close.
    const inFlight = this.opening.get(userId);
    if (inFlight) {
      await inFlight.catch(() => undefined);
    }

    const handle = this.connections.get(userId);
    this.connections.delete(userId);
    if (handle) {
      await handle.close().catch((error) => {
        this.logger.warn(
          `Closing database for user ${userId} failed: ${String(error)}`,
        );
      });
    }

    if (this.isCloudMode) {
      await this.platform.deleteUserDatabase(userDbName(userId));
    }

    // Remove the local file and every sibling either engine leaves beside it:
    // '-wal'/'-shm' from the plain engine (harmless to attempt in cloud mode,
    // where they are not written), SYNC_ONLY_SIBLINGS from the sync one.
    const path = this.userDbPath(userId);
    await Promise.all(
      ['', '-wal', '-shm', ...SYNC_ONLY_SIBLINGS].map((suffix) =>
        rm(`${path}${suffix}`, { force: true }),
      ),
    );
  }

  /**
   * How many user databases are currently open.
   *
   * Only the shutdown log reads this, to say how much work the flush is about to
   * do. The count is also the size of the deliberately unbounded connection
   * cache, so a deployed instance reporting a large number here is the signal
   * that the LRU in `docs/TODO.md` has stopped being theoretical.
   */
  openCount(): number {
    return this.connections.size;
  }

  /** Closes every open connection. Called on application shutdown. */
  async closeAll(): Promise<void> {
    const handles = [...this.connections.values()];
    this.connections.clear();
    await Promise.all(
      handles.map((handle) =>
        handle.close().catch((error) => {
          this.logger.warn(`Closing a user database failed: ${String(error)}`);
        }),
      ),
    );
  }

  private async openUserDb(userId: string): Promise<DatabaseHandle> {
    const path = this.userDbPath(userId);
    await mkdir(dirname(path), { recursive: true });

    const handle = this.isCloudMode
      ? await this.openCloud(userId, path)
      : await openLocalDatabase({ path });

    // Idempotent: creates the tables in a brand-new database and applies any
    // migrations added since this one was last opened.
    await (this.isCloudMode ? syncMigrate : localMigrate)(handle.db as never, {
      migrationsFolder: USER_MIGRATIONS_DIR,
    });

    return handle;
  }

  private async openCloud(
    userId: string,
    path: string,
  ): Promise<DatabaseHandle> {
    const [row] = await this.centralDb
      .select({ dbUrl: users.dbUrl, dbAuthToken: users.dbAuthToken })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);

    if (!row) {
      throw new NotFoundException('User not found');
    }
    if (!row.dbUrl || !row.dbAuthToken) {
      // A row provisioned in local mode, now being opened in cloud mode.
      throw new NotFoundException(`User ${userId} has no cloud database`);
    }

    // Each user's database is reached with that user's own token, so a leaked
    // token exposes one person rather than everyone.
    return openCloudDatabase({
      path,
      url: row.dbUrl,
      authToken: row.dbAuthToken,
      syncIntervalS: this.config.get<number>('TURSO_SYNC_INTERVAL_S', 60),
    });
  }

  /**
   * User ids are interpolated into file paths and remote database names, so
   * anything that is not a plain UUID is rejected before it gets near either.
   */
  private assertValidUserId(userId: string): void {
    if (!isUuid(userId)) {
      throw new BadRequestException('Invalid user id');
    }
  }
}
