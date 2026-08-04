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
 * What verification needs of a row it has already authenticated: the address to
 * put in the session principal, the payload to turn into a profile, and whether
 * a database has been provisioned yet.
 *
 * A second interface rather than widening `CentralUser`, because `dbAuthToken`
 * is deliberately absent: verification never needs the token itself - opening
 * the database is `UserDatabaseService`'s job - and a secret that is not fetched
 * cannot be leaked into a log line or a response.
 */
export interface VerifiableUser {
  id: string;
  email: string;
  /** Non-null means a database was already provisioned for this row. */
  dbUrl: string | null;
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
   * The live row for an id, as verification needs it.
   *
   * Soft-deleted rows are invisible here like everywhere else, which is what
   * lets verification answer a deleted account's link with the same 401 as an
   * invalid token rather than disclosing the deletion.
   */
  async findById(id: string): Promise<VerifiableUser | null> {
    const [row] = await this.centralDb
      .select({
        id: users.id,
        email: users.email,
        dbUrl: users.dbUrl,
        onboardingPayload: users.onboardingPayload,
      })
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
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

  /**
   * Records the database verification just provisioned for this user.
   *
   * Only the two nullable pointer columns: `dbName` was written at registration
   * and derives from the id, so there is nothing to update about it. Both values
   * are null in local mode, which is the correct pointer for a file the name
   * alone locates.
   *
   * A non-null `dbUrl` afterwards is also what makes a retried verification skip
   * provisioning instead of colliding on the remote name - see
   * VerificationService.
   */
  async persistProvisionedDb(
    userId: string,
    pointer: { dbUrl: string | null; dbAuthToken: string | null },
  ): Promise<void> {
    await this.centralDb
      .update(users)
      .set({ dbUrl: pointer.dbUrl, dbAuthToken: pointer.dbAuthToken })
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));
  }

  /**
   * Changes the login identifier of a live account.
   *
   * Expects an **already-normalized** address: normalizing is the DTO's job
   * everywhere in this repo (see normalize-email.ts), and doing it a second time
   * here would put a second definition of "the same address" in the codebase.
   *
   * No uniqueness check of its own. ProfileService pre-checks and answers 409,
   * which is what gives the Settings form something to say; the partial unique
   * index `users_email_live_unique` is the backstop for the race that pre-check
   * cannot close, and it surfaces as a logged 500 rather than a corrupt
   * directory.
   */
  async updateEmail(userId: string, email: string): Promise<void> {
    await this.centralDb
      .update(users)
      .set({ email })
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));
  }

  /**
   * Drops the stashed onboarding payload, which is what marks an account
   * verified.
   *
   * Called last in verification on purpose: while it is set, the payload is both
   * the profile's source data and the "provisioning may be unfinished" marker,
   * so clearing it early would lose the source with nothing having consumed it.
   */
  async clearOnboardingPayload(userId: string): Promise<void> {
    await this.centralDb
      .update(users)
      .set({ onboardingPayload: null })
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));
  }
}
