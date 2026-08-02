import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { newId } from '../common/ids';
import { loginLinks } from '../database/central/schema';
import { APP_DB } from '../database/database.constants';
import type { CentralDatabase } from '../database/database.types';

/** 256 bits. Long enough that guessing is not a threat model, only theft is. */
const TOKEN_BYTES = 32;

/** A34 specifies minutes; a magic link that outlives the tab is the risk. */
const DEFAULT_TTL_MINUTES = 15;

/**
 * Issues and consumes the single-use tokens behind the login links.
 *
 * The stored value is the SHA-256 of the raw token, and it is the *lookup key*
 * rather than a secret to compare against. That removes the timing-comparison
 * question entirely: verification is an indexed read of a hash the caller
 * supplied, so there is no branch on secret material to time.
 *
 * A single unsalted round is correct here, and bcrypt or argon2 would be wrong.
 * Those exist to make brute force expensive against secrets people chose; a
 * 256-bit random value has no such weakness, and per-row salting would make the
 * hash unusable as a key.
 */
@Injectable()
export class LoginTokenService {
  /**
   * Chains issue() transactions end to end. The embedded Turso driver runs one
   * connection per database and refuses overlapping transactions outright
   * ("cannot start a transaction within a transaction"), so two concurrent
   * resends would crash rather than merely interleave. In-process chaining is
   * enough: a single backend instance is this repo's standing assumption
   * (docs/TODO.md), and the queue only ever holds a handful of sub-millisecond
   * writes.
   */
  private issueQueue: Promise<unknown> = Promise.resolve();

  constructor(
    @Inject(APP_DB) private readonly centralDb: CentralDatabase,
    private readonly config: ConfigService,
  ) {}

  /**
   * Mints a link token for a user, invalidating any still-live one first: only
   * the newest link ever works, so a resend cannot leave two valid doors open.
   *
   * The supersede and the insert share one transaction, because as two
   * standalone statements a pair of concurrent issues could interleave
   * supersede-supersede-insert-insert and leave BOTH new links live - a
   * double-clicked "Resend link" would break the invariant above. The
   * issueQueue serializes the transactions themselves (see its comment), so
   * the later issue's supersede runs after the earlier one's insert and
   * catches it. The transaction also means a failed insert rolls the
   * supersede back with it, rather than leaving the user with zero live
   * links.
   *
   * @returns the raw token. This is the only place it exists - it is never
   * persisted, returned by an endpoint, or logged.
   */
  async issue(userId: string): Promise<string> {
    const now = new Date();
    const rawToken = randomBytes(TOKEN_BYTES).toString('base64url');

    const issued = this.issueQueue.then(() =>
      this.centralDb.transaction(async (tx) => {
        await tx
          .update(loginLinks)
          .set({ supersededAt: now })
          .where(
            and(
              eq(loginLinks.userId, userId),
              isNull(loginLinks.usedAt),
              isNull(loginLinks.supersededAt),
              isNull(loginLinks.deletedAt),
            ),
          );

        await tx.insert(loginLinks).values({
          id: newId(),
          userId,
          tokenHash: hashToken(rawToken),
          expiresAt: new Date(now.getTime() + this.ttlMinutes * 60_000),
        });
      }),
    );

    // The next issue must wait for this one, but not inherit its failure.
    this.issueQueue = issued.catch(() => undefined);

    await issued;
    return rawToken;
  }

  /**
   * Spends a token, if it is still spendable.
   *
   * Deliberately one conditional UPDATE rather than a read followed by a write.
   * A check-then-mark pair leaves an await between the two during which a
   * second consume of the same token passes the same check, and both succeed -
   * single use would then hold by luck rather than by construction. Letting the
   * database evaluate the conditions as part of the write makes it atomic:
   * whichever statement runs second matches zero rows.
   *
   * @returns the user the token belonged to, or null if it was unknown, already
   * used, superseded or expired. The caller cannot tell which, and does not
   * need to - the four cases share one screen.
   */
  async consume(rawToken: string): Promise<string | null> {
    const now = new Date();

    const [row] = await this.centralDb
      .update(loginLinks)
      .set({ usedAt: now })
      .where(
        and(
          eq(loginLinks.tokenHash, hashToken(rawToken)),
          isNull(loginLinks.usedAt),
          isNull(loginLinks.supersededAt),
          gt(loginLinks.expiresAt, now),
          isNull(loginLinks.deletedAt),
        ),
      )
      .returning({ userId: loginLinks.userId });

    return row?.userId ?? null;
  }

  /**
   * Public because the email says how long the link lasts, and the copy and the
   * expiry have to come from the same number or one of them is a lie.
   */
  get ttlMinutes(): number {
    return this.config.get<number>('LOGIN_LINK_TTL_M', DEFAULT_TTL_MINUTES);
  }
}

/** Hex SHA-256. See the class comment for why this is the whole scheme. */
function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
