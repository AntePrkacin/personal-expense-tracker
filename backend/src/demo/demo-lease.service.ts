import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { SessionService } from '../auth/session.service';
import { newId } from '../common/ids';
import { todayIn } from '../common/month-window';
import { demoAccounts } from '../database/central/schema';
import { APP_DB } from '../database/database.constants';
import type { CentralDatabase } from '../database/database.types';
import { DemoSeedService } from './demo-seed.service';

/** Answered when every pooled account is in somebody else's hands. */
export const POOL_EXHAUSTED =
  'Every demo account is in use right now. Try again in a few minutes.';

/** How long a visitor keeps an account, when nothing configures it. */
const DEFAULT_LEASE_TTL_M = 60;

/**
 * How long a hand-out waits for the insight run it starts.
 *
 * Far below the CLI's 15s, because this budget is paid by a visitor watching a
 * blank page. The dashboard renders a `generating` state perfectly well, so
 * overrunning this costs a few cards filling in a moment later, and waiting
 * longer costs the first impression the whole feature exists to make.
 */
const HANDOUT_INSIGHT_BUDGET_MS = 4_000;

/**
 * Hands one pooled demo account to one visitor, and takes it back.
 *
 * ## Why a lease rather than an account per visitor
 *
 * `src/database/CLAUDE.md` carries the argument in full; the short version is
 * that Turso's starter plan caps the organization at 100 databases with
 * overages disabled and this is a database-per-user app, so provisioning per
 * visitor spends a hard cap from an unauthenticated public route and fails
 * **registration** when it runs out, not just demos.
 *
 * ## Why there is no queue here, and why that is not an oversight
 *
 * `LoginTokenService` chains its writes through an `issueQueue` because the
 * embedded driver refuses overlapping **transactions**, and `issue()` needs one.
 * Nothing here does. Expiring is one `UPDATE`, claiming is one conditional
 * `UPDATE ... RETURNING` whose subquery picks the row, and releasing is one
 * more - and the driver runs one connection per database, so those statements
 * are serialized by the connection itself. Two simultaneous hand-outs therefore
 * cannot claim one account: the second statement's subquery runs after the
 * first has committed and no longer sees the row it took.
 *
 * That is worth stating because the obvious defensive move - wrapping the pair
 * in `db.transaction()` - is the one thing that would actually break it, by
 * putting two overlapping transactions on a connection that refuses them.
 */
@Injectable()
export class DemoLeaseService {
  private readonly logger = new Logger(DemoLeaseService.name);

  constructor(
    @Inject(APP_DB) private readonly centralDb: CentralDatabase,
    private readonly config: ConfigService,
    private readonly sessions: SessionService,
    private readonly demoSeed: DemoSeedService,
  ) {}

  /**
   * Leases an account and issues a session for it.
   *
   * The order is the whole design: expire first so a pool that looks full is
   * reclaimed before anybody is turned away, claim second so the account is
   * exclusively ours before a single row of it is rewritten, revoke third,
   * restore fourth, and issue the session strictly last so a session never
   * names an account whose restore failed half way.
   *
   * **Revoking before the restore rather than merely before the issue.** Every
   * bearer any previous holder of this account still has is dead from this
   * statement onward, which is the property the pool's isolation rests on - and
   * placing it here rather than beside `issue()` also means no kept token can
   * write into the account while the fixture is being written under it.
   */
  async handOut(): Promise<{ token: string; expiresAt: Date }> {
    await this.expireElapsed();

    const claimed = await this.claim();
    if (!claimed) {
      throw new ServiceUnavailableException(POOL_EXHAUSTED);
    }

    await this.sessions.revokeAllForUser(claimed.userId);

    try {
      if (this.needsReseed(claimed)) {
        const written = await this.demoSeed.reseed(claimed.userId, {
          insightPollMs: HANDOUT_INSIGHT_BUDGET_MS,
        });
        await this.markSeeded(claimed.id);
        this.logger.log(
          `Restored demo account ${claimed.userId} with ${written} transactions.`,
        );
      }
    } catch (error) {
      // **Releasing is not optional here.** The write phase wraps only the
      // transactions table, so a failure part way through leaves an account
      // holding the fixture's histories and somebody else's spending - and a
      // lease that survived it would hand exactly that to the next visitor and
      // then to nobody else, because a claimed account is invisible to the
      // claim below until its lease elapses.
      await this.release(claimed.id);
      throw error;
    }

    // **Bounded by the lease, not by `SESSION_TTL_D`.** A pooled account belongs
    // to this visitor until the lease elapses and to somebody else afterwards,
    // so a 30-day session on it is a 30-day read of whatever the next visitors
    // type in. The frontend derives its cookie `maxAge` from this same value, so
    // the browser stops presenting the token at the same instant the backend
    // stops honouring it.
    return this.sessions.issue(claimed.userId, {
      expiresAt: claimed.leaseExpiresAt,
    });
  }

  /**
   * Enrols an account into the pool, or leaves an existing entry alone.
   *
   * Called by `src/scripts/seed-showcase.ts` after it has provisioned and
   * seeded a pooled account. Idempotent on purpose: re-running the pool seed is
   * the ordinary way to refresh it, and that must not accumulate entries or
   * silently steal an account back from a visitor holding it. An existing entry
   * therefore keeps its lease and only has `seeded_at` moved forward, which is
   * true - the seed just ran - and is what stops the next hand-out redoing work
   * the terminal has already done.
   */
  async enrol(userId: string): Promise<void> {
    const [existing] = await this.centralDb
      .select({ id: demoAccounts.id })
      .from(demoAccounts)
      .where(
        and(eq(demoAccounts.userId, userId), isNull(demoAccounts.deletedAt)),
      )
      .limit(1);

    if (existing) {
      await this.markSeeded(existing.id);
      return;
    }

    await this.centralDb.insert(demoAccounts).values({
      id: newId(),
      userId,
      seededAt: new Date(),
    });
  }

  /** How many accounts the pool holds, and how many are free right now. */
  async size(): Promise<{ total: number; free: number }> {
    const rows = await this.centralDb
      .select({ leaseExpiresAt: demoAccounts.leaseExpiresAt })
      .from(demoAccounts)
      .where(isNull(demoAccounts.deletedAt));

    return {
      total: rows.length,
      free: rows.filter((row) => row.leaseExpiresAt === null).length,
    };
  }

  /**
   * Frees every lease that has run out.
   *
   * Lazy, on the request path, rather than on a timer. Cloud Run throttles CPU
   * between requests and scales to zero, so a `setInterval` sweep would run on
   * no schedule anybody could describe - and the only moment a free account is
   * actually needed is the moment somebody asks for one.
   *
   * **The sessions die with the leases, here and not only at the next
   * hand-out.** A session is minted with the lease's own expiry, so this is
   * belt and braces for the ordinary case - but only for the ordinary case. An
   * account whose lease is extended, or whose session was minted before this
   * was true, would otherwise stay readable by its last holder for as long as
   * nobody happened to claim it, which is precisely the window an account
   * sitting free is in.
   */
  private async expireElapsed(): Promise<void> {
    const reclaimed = await this.centralDb
      .update(demoAccounts)
      .set({ leaseExpiresAt: null, seededAt: null })
      .where(
        and(
          isNotNull(demoAccounts.leaseExpiresAt),
          lte(demoAccounts.leaseExpiresAt, new Date()),
          isNull(demoAccounts.deletedAt),
        ),
      )
      .returning({ userId: demoAccounts.userId });

    // Serially rather than in parallel, and the loop is bounded by the pool:
    // ten accounts is the whole of it, and the usual count here is zero.
    for (const { userId } of reclaimed) {
      await this.sessions.revokeAllForUser(userId);
    }
  }

  /**
   * Takes the least recently leased free account, in one statement.
   *
   * A single conditional `UPDATE ... RETURNING`, never a read followed by a
   * write, for the reason `LoginTokenService.consume()` gives one table over:
   * the await between a select and an update is exactly where two callers both
   * claim the same row.
   *
   * **`ORDER BY leased_at` sorts nulls first in SQLite**, which is load-bearing
   * rather than incidental: a never-leased account is handed out before any
   * reused one, and a never-leased account is also the one case that skips the
   * restore. So a fresh pool answers the first ten visitors instantly, and only
   * an eleventh pays for a re-seed.
   */
  private async claim(): Promise<Claimed | undefined> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.leaseTtlMinutes * 60_000);

    const [row] = await this.centralDb
      .update(demoAccounts)
      .set({ leaseExpiresAt: expiresAt, leasedAt: now })
      .where(
        eq(
          demoAccounts.id,
          sql`(select ${demoAccounts.id} from ${demoAccounts} where ${and(
            isNull(demoAccounts.leaseExpiresAt),
            isNull(demoAccounts.deletedAt),
          )} order by ${demoAccounts.leasedAt} asc limit 1)`,
        ),
      )
      .returning({
        id: demoAccounts.id,
        userId: demoAccounts.userId,
        leasedAt: demoAccounts.leasedAt,
        leaseExpiresAt: demoAccounts.leaseExpiresAt,
        seededAt: demoAccounts.seededAt,
      });

    // **`seeded_at` survives this statement and `leased_at` does not**, which is
    // why the restore decision below reads only the former. SQLite's `RETURNING`
    // yields the row as written, so the `leased_at` that comes back is always
    // the one just set and carries no information about what came before. Rather
    // than read it back a second time, freeing a lease is what clears
    // `seeded_at` - see `expireElapsed` and `release`.
    return row
      ? {
          id: row.id,
          userId: row.userId,
          // Read back from the row rather than reusing the local `expiresAt`,
          // so the session's expiry is the one the pool actually recorded.
          leaseExpiresAt: row.leaseExpiresAt ?? expiresAt,
          seededAt: row.seededAt,
        }
      : undefined;
  }

  /**
   * Whether this account has to be restored before it is handed over.
   *
   * **Narrow on purpose**, and `seeded_at` carries both halves of it. A `null`
   * means somebody has had this account since it was last written - freeing a
   * lease clears the column precisely so that a visitor's edits cannot be
   * mistaken for the fixture. A date that is not today means the fixture is
   * stale even if untouched: it places rows by (month, occurrence) and resolves
   * them against the day it was written, so a pool seeded in September hands
   * out an empty current period in November.
   *
   * Erring toward re-seeding is deliberate. The cost of an unnecessary restore
   * is a few seconds; the cost of a skipped one is a recruiter's first
   * impression being the empty state, or somebody else's deletions.
   */
  private needsReseed(claimed: Claimed): boolean {
    if (claimed.seededAt === null) {
      return true;
    }

    const timeZone = this.config.get<string>('APP_TIMEZONE')!;
    return todayIn(timeZone, claimed.seededAt) !== todayIn(timeZone);
  }

  private async markSeeded(id: string): Promise<void> {
    await this.centralDb
      .update(demoAccounts)
      .set({ seededAt: new Date() })
      .where(eq(demoAccounts.id, id));
  }

  private async release(id: string): Promise<void> {
    await this.centralDb
      .update(demoAccounts)
      .set({ leaseExpiresAt: null, seededAt: null })
      .where(eq(demoAccounts.id, id));
  }

  private get leaseTtlMinutes(): number {
    return this.config.get<number>('DEMO_LEASE_TTL_M', DEFAULT_LEASE_TTL_M);
  }
}

interface Claimed {
  id: string;
  userId: string;
  /** When this lease elapses, and therefore when its session expires. */
  leaseExpiresAt: Date;
  seededAt: Date | null;
}
