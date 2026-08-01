import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const PLATFORM_API_BASE = 'https://api.turso.tech/v1/organizations';

/**
 * Bounds every control-plane call. Registration provisions synchronously, so a
 * hung request here would otherwise stall it indefinitely with the client's
 * connection held open. Generous: creating a database is slow on a cold group.
 */
const PLATFORM_API_TIMEOUT_MS = 30_000;

interface CreateDatabaseResponse {
  database?: { Name?: string; Hostname?: string };
}

interface CreateTokenResponse {
  jwt?: string;
}

/**
 * Thin client for the Turso *Platform* (control plane) API.
 *
 * Creating databases and minting their tokens are control-plane operations and
 * accept only the organization API token - a group or database token will not
 * work here. That token therefore lives in exactly one place: this service,
 * used only at provisioning time. Data-plane traffic uses the per-database
 * tokens this service mints (see UserDatabaseService).
 *
 * Only meaningful in cloud mode; in local mode nothing calls it.
 */
@Injectable()
export class TursoPlatformService {
  private readonly logger = new Logger(TursoPlatformService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Creates one database for a user, in the same group as everything else.
   *
   * `use_tursodb` selects the Turso engine (the Rust rewrite of SQLite) rather
   * than the libSQL default, and is required rather than preferred: the local
   * side of `@tursodatabase/sync` is a real Turso database, so the remote it
   * replicates against has to be one too. The field is undocumented in the
   * public API reference - it comes from the CLI's own request struct, where
   * `--tursodb` serializes as `use_tursodb` - and is verified against the live
   * API, which reports `engine: "tursodb"` for databases created this way.
   *
   * The engine is fixed at creation. Getting this wrong is not a runtime error;
   * it silently produces a database that cannot be migrated to the right engine
   * later without recreating it.
   *
   * @returns the region-scoped hostname Turso assigned, which the caller must
   * persist: it cannot be reconstructed from the database name alone.
   */
  async createUserDatabase(
    dbName: string,
  ): Promise<{ dbName: string; hostname: string }> {
    const body = await this.request<CreateDatabaseResponse>(
      'POST',
      '/databases',
      {
        name: dbName,
        group: this.config.get<string>('TURSO_GROUP', 'decode-pet'),
        use_tursodb: true,
      },
    );

    const hostname = body.database?.Hostname;
    if (!hostname) {
      throw new InternalServerErrorException(
        `Turso did not return a hostname for database ${dbName}`,
      );
    }

    return { dbName, hostname };
  }

  /**
   * Mints a full-access, non-expiring data-plane token scoped to one database.
   *
   * Non-expiring is an MVP decision: no refresh logic anywhere, rotation is a
   * manual ops action (`turso db tokens invalidate <db>`).
   */
  async mintDbToken(dbName: string): Promise<string> {
    const body = await this.request<CreateTokenResponse>(
      'POST',
      `/databases/${encodeURIComponent(dbName)}/auth/tokens?authorization=full-access&expiration=never`,
    );

    if (!body.jwt) {
      throw new InternalServerErrorException(
        `Turso did not return a token for database ${dbName}`,
      );
    }

    return body.jwt;
  }

  /**
   * Deletes a user's database. Used as the compensation path when registration
   * fails partway through; a database that is already gone is not an error.
   */
  async deleteUserDatabase(dbName: string): Promise<void> {
    await this.request(
      'DELETE',
      `/databases/${encodeURIComponent(dbName)}`,
      undefined,
      {
        ignoreNotFound: true,
      },
    );
  }

  /**
   * Not implemented yet: the short-expiry variant of {@link mintDbToken}, for
   * handing a browser a token it can sync with directly. It arrives with the
   * auth feature, which is what makes "which user is asking" answerable.
   *
   *     mintUserDbToken(dbName: string, expiry: string): Promise<string>
   *     // POST /databases/{dbName}/auth/tokens?authorization=full-access&expiration=<expiry>
   */

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
    options?: { ignoreNotFound?: boolean },
  ): Promise<T> {
    const org = this.config.getOrThrow<string>('TURSO_ORG');
    const token = this.config.getOrThrow<string>('TURSO_ORG_TOKEN');

    const response = await fetch(`${PLATFORM_API_BASE}/${org}${path}`, {
      method,
      // A timeout rejects with a TimeoutError, which the global filter logs
      // and reduces to a 500 like any other infrastructure failure.
      signal: AbortSignal.timeout(PLATFORM_API_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    if (response.status === 404 && options?.ignoreNotFound) {
      return {} as T;
    }

    if (!response.ok) {
      // The response body can echo request details, so it is logged rather
      // than thrown: the caller gets a generic 500 and nothing leaks outward.
      const detail = await response.text().catch(() => '');
      this.logger.error(
        `Turso Platform API ${method} ${path} failed: ${response.status} ${detail}`,
      );
      throw new InternalServerErrorException(
        'Turso Platform API request failed',
      );
    }

    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  }
}
