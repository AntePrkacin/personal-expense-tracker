import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { newId } from '../common/ids';
import type { OnboardingPayload } from '../database/central/schema';
import { users } from '../database/central/schema';
import { APP_DB, userDbName } from '../database/database.constants';
import type { CentralDatabase } from '../database/database.types';

/**
 * A row of the central directory, reduced to what the access flow needs.
 *
 * `onboardingPayload` doubles as the verification state: non-null means
 * registered but never verified, null means verified (or, before this branch,
 * created by an older code path).
 */
export interface CentralUser {
  id: string;
  onboardingPayload: OnboardingPayload | null;
}

/**
 * Reads and writes of the central `users` table. Nothing here touches a
 * per-user database.
 *
 * That is the whole point of the current design: registration no longer
 * provisions anything, so it is a single insert into a single database. The
 * cross-database compensation this service used to carry had nothing left to
 * compensate and is gone with it - the user's own database is created when the
 * emailed link is verified, which is also the first moment anyone has proved
 * the address is theirs.
 */
@Injectable()
export class UsersService {
  constructor(@Inject(APP_DB) private readonly centralDb: CentralDatabase) {}

  /** @returns the live row for an address, or null if there is none. */
  async findByEmail(email: string): Promise<CentralUser | null> {
    const [row] = await this.centralDb
      .select({
        id: users.id,
        onboardingPayload: users.onboardingPayload,
      })
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);

    return row ?? null;
  }

  /**
   * Creates an unverified account: the directory row plus the onboarding
   * payload it will become a profile from.
   *
   * `dbName` is set even though `dbUrl` and `dbAuthToken` stay null, because
   * the column is notNull and the name derives from the id alone - there is
   * nothing to wait for. The two nullable columns are filled at verification.
   *
   * @returns the new user's id.
   */
  async createPending(
    email: string,
    payload: OnboardingPayload,
  ): Promise<string> {
    const id = newId();

    await this.centralDb.insert(users).values({
      id,
      email,
      dbName: userDbName(id),
      onboardingPayload: payload,
    });

    return id;
  }

  /**
   * Replaces the stashed onboarding payload of an account that has not been
   * verified yet. See AuthService.register for why overwriting is the right
   * behavior rather than an error.
   */
  async stashOnboardingPayload(
    userId: string,
    payload: OnboardingPayload,
  ): Promise<void> {
    await this.centralDb
      .update(users)
      .set({ onboardingPayload: payload })
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));
  }
}
