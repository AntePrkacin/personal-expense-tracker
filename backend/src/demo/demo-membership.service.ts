import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { demoAccounts } from '../database/central/schema';
import { APP_DB } from '../database/database.constants';
import type { CentralDatabase } from '../database/database.types';

/**
 * How many answers one instance keeps. Ten of them are the pool; the rest are
 * real accounts, and evicting the whole map at the ceiling costs one indexed
 * read each the next time they call.
 */
const CACHE_LIMIT = 500;

/**
 * Whether a user id belongs to the demo pool.
 *
 * Its own tiny service rather than a method on `DemoLeaseService`, and the
 * reason is the import graph rather than tidiness: the callers are
 * `AssistantModule` and `TransactionsModule`, and `DemoModule` imports
 * `InsightsModule`, which imports `TransactionsModule` - so a Gemini route
 * reaching into the lease service would close a cycle. `DemoMembershipModule`
 * imports nothing at all, which is what keeps this safe to depend on from
 * anywhere.
 *
 * **Cached per instance, and the answer is treated as permanent.** Enrolling
 * happens once, from the terminal, when the pool is built; nothing turns a
 * pooled account into a real one or the reverse, and a tombstoned entry is a
 * pool being dismantled rather than a user changing state. So a stale `false`
 * would need an account to be enrolled while the instance that answered was
 * still running - the pool seed's own restart is what clears it, and the cost
 * in the window is a demo account getting a real account's budget for one hour.
 */
@Injectable()
export class DemoMembershipService {
  private readonly pooled = new Map<string, boolean>();

  constructor(@Inject(APP_DB) private readonly centralDb: CentralDatabase) {}

  async isPooled(userId: string): Promise<boolean> {
    const cached = this.pooled.get(userId);
    if (cached !== undefined) {
      return cached;
    }

    const [row] = await this.centralDb
      .select({ id: demoAccounts.id })
      .from(demoAccounts)
      .where(
        and(eq(demoAccounts.userId, userId), isNull(demoAccounts.deletedAt)),
      )
      .limit(1);

    const answer = row !== undefined;

    // Cleared wholesale rather than evicted one at a time: there is no
    // recency to track here and a map that grows without bound in a
    // long-running instance is the failure worth avoiding.
    if (this.pooled.size >= CACHE_LIMIT) {
      this.pooled.clear();
    }
    this.pooled.set(userId, answer);

    return answer;
  }
}
