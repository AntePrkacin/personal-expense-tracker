import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { newId } from '../common/ids';
import { sessions, users } from '../database/central/schema';
import { APP_DB } from '../database/database.constants';
import type { CentralDatabase } from '../database/database.types';
import { hashToken } from './login-token.service';

/** 256 bits, like a login token. Guessing is not the threat model, theft is. */
const TOKEN_BYTES = 32;

/** A34 asks for a normal persistent session, not a short-lived one. */
const DEFAULT_TTL_DAYS = 30;

const MS_PER_DAY = 86_400_000;

/**
 * Who a valid bearer belongs to, as every guarded route sees it.
 *
 * Just the three fields central can answer: names and preferences live in the
 * per-user database and are the profile endpoint's job, not the guard's.
 */
export interface SessionPrincipal {
  userId: string;
  email: string;
  /** When this session dies. Fixed at issue; nothing extends it. */
  expiresAt: Date;
}

/**
 * Issues, validates and revokes the opaque bearer tokens behind a logged-in
 * session.
 *
 * The same hash-as-lookup-key scheme as the login links, deliberately reusing
 * `hashToken` so there is one answer to "how does a token become a key" - see
 * LoginTokenService's class comment for why a single unsalted round is right for
 * a 256-bit random value.
 *
 * Two differences from a login link, both intentional. Nothing is superseded:
 * concurrent sessions are legitimate (one per device), so issuing is a single
 * INSERT with no transaction and no queue. And validating never writes: the
 * expiry is absolute, so an authenticated read stays a read rather than
 * becoming an UPDATE against a sync-replicated central database on every
 * request.
 */
@Injectable()
export class SessionService {
  constructor(
    @Inject(APP_DB) private readonly centralDb: CentralDatabase,
    private readonly config: ConfigService,
  ) {}

  /**
   * Starts a session for a user who has just proved their address.
   *
   * @returns the raw token and when it expires. As with a login link, the raw
   * value exists only here and in the response it is handed back in; the row
   * keeps its hash.
   */
  async issue(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ttlDays * MS_PER_DAY);

    await this.centralDb.insert(sessions).values({
      id: newId(),
      userId,
      tokenHash: hashToken(token),
      expiresAt,
    });

    return { token, expiresAt };
  }

  /**
   * Resolves a bearer to its owner, in one indexed read.
   *
   * The join is what makes it one: the guard needs the caller's email, and
   * fetching it here rather than in a second query keeps an authenticated
   * request at a single round trip. Expiry sits in the WHERE clause for the
   * same reason `consume()` puts it there - the compared instant is
   * app-generated either way, and this way a dead session simply matches
   * nothing.
   *
   * @returns the principal, or null if the token is unknown, expired, revoked,
   * or belongs to a soft-deleted user.
   */
  async validate(rawToken: string): Promise<SessionPrincipal | null> {
    const [row] = await this.centralDb
      .select({
        userId: sessions.userId,
        email: users.email,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.tokenHash, hashToken(rawToken)),
          isNull(sessions.deletedAt),
          gt(sessions.expiresAt, new Date()),
          isNull(users.deletedAt),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  /**
   * Ends one session, by tombstoning the row whose token this is.
   *
   * `issue()`'s counterpart, and deliberately narrower than a revoke-all: it
   * keys on the token hash rather than on the user, so signing out on a laptop
   * leaves the phone signed in. Concurrent sessions are legitimate (one per
   * device), and `sessions_user_id_idx` is what a future "sign out everywhere"
   * would key on instead - offered as its own control, never as a side effect of
   * this one.
   *
   * `deletedAt` is the column `validate()` already filters on, so setting it is
   * the whole of revocation: the next request carrying this token matches
   * nothing and the guard answers 401. Nothing else about the auth path changes.
   *
   * Two things about the statement are deliberate. The `deletedAt` guard in the
   * WHERE keeps the **first** tombstone rather than overwriting its timestamp,
   * so "when was this session revoked" stays answerable from the row - the same
   * reason `login_links` invalidation uses distinct columns. And matching
   * **zero** rows is not an error: a token that is unknown, expired or already
   * revoked leaves nothing to do, and no caller can act on the difference, since
   * the guard has already refused anything it could report and the frontend
   * clears its cookie either way. So this resolves rather than throwing, and
   * reports no count nobody reads.
   */
  async revoke(rawToken: string): Promise<void> {
    await this.centralDb
      .update(sessions)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(sessions.tokenHash, hashToken(rawToken)),
          isNull(sessions.deletedAt),
        ),
      );
  }

  /** Days. Fixed, never extended by use; see the class comment. */
  private get ttlDays(): number {
    return this.config.get<number>('SESSION_TTL_D', DEFAULT_TTL_DAYS);
  }
}
