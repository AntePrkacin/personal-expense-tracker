import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { toCents } from '../common/money';
import type { OnboardingPayload } from '../database/central/schema';
import { userDbName } from '../database/database.constants';
import type { UserDatabase } from '../database/database.types';
import { UserDatabaseService } from '../database/user-database.service';
import { categories, profile } from '../database/user/schema';
import { seedStarterCategories } from '../database/user/starter-categories';
import { UsersService } from '../users/users.service';
import { LoginTokenService } from './login-token.service';
import { SessionService } from './session.service';

/** Both rejections, worded for a screen. See the class comment for 401 vs 409. */
const INVALID_LINK = 'This login link is invalid, expired or already used.';
const REPLACED_LINK =
  'This login link was replaced by a newer one. Open the most recent email.';

/**
 * Turns a clicked login link into a session, provisioning the account on the
 * way if this is its first verification.
 *
 * **Nothing here is floated, unlike AuthService.** That asymmetry is deliberate:
 * register and login-link answer before their work finishes because an awaited
 * mail send would leak whether the address exists, and the caller has proved
 * nothing at that point. Here the caller holds a token that was emailed to the
 * address owner, so there is no enumeration timing to defend, and the response
 * carries a session - it must not claim one that provisioning failed to earn.
 * Do not "fix" this to float like register does.
 *
 * **It is re-runnable, and that is what makes a single blocking call safe.** A
 * failure partway through answers 500 with the link already burned; the recovery
 * is the design's own "Resend link" (A36, VER-2), and the next verification
 * resumes whatever state was left behind rather than crashing or duplicating:
 *
 * - pointer already set (`dbUrl` non-null): provisioning is skipped;
 * - profile already inserted: the insert no-ops on conflict;
 * - categories already seeded: the seed is skipped;
 * - payload already cleared: the account is simply a returning user, and
 *   verification is one consume, one read and one session insert.
 *
 * The one state with no automatic recovery is a provisioning failure whose
 * compensation also failed: a cloud database exists that no row points at, and
 * every retry then collides on its name until an operator deletes it. It is
 * logged loudly and recorded in docs/TODO.md.
 */
@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private readonly loginTokens: LoginTokenService,
    private readonly users: UsersService,
    private readonly userDatabases: UserDatabaseService,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Spends the emailed token and returns a session for its owner.
   *
   * @throws UnauthorizedException if the token is unknown, expired or spent -
   * and equally if the account behind it has been soft-deleted, which must not
   * be distinguishable from an invalid link.
   * @throws ConflictException if a newer link superseded this one, which is the
   * one rejection the user can act on.
   */
  async verify(rawToken: string): Promise<{ token: string; expiresAt: Date }> {
    // First, because this IS the authentication: nothing below runs for a
    // caller who did not hold a live token.
    const consumed = await this.loginTokens.consume(rawToken);

    if (consumed.status === 'superseded') {
      throw new ConflictException(REPLACED_LINK);
    }
    if (consumed.status === 'invalid') {
      throw new UnauthorizedException(INVALID_LINK);
    }

    const user = await this.users.findById(consumed.userId);
    if (!user) {
      throw new UnauthorizedException(INVALID_LINK);
    }

    // A stashed payload means the account has never completed a verification -
    // possibly having failed partway through a previous attempt.
    if (user.onboardingPayload) {
      await this.provisionAccount(
        user.id,
        user.onboardingPayload,
        user.dbUrl === null,
      );
    }

    return this.sessions.issue(user.id);
  }

  /**
   * Everything registration deferred until the address was proven: the user's
   * own database, the profile the onboarding form becomes, and the starter
   * categories they picked.
   */
  private async provisionAccount(
    userId: string,
    payload: OnboardingPayload,
    needsDatabase: boolean,
  ): Promise<void> {
    if (needsDatabase) {
      await this.createDatabase(userId);
    }

    // Idempotent: creates the tables in a brand-new database, and applies any
    // migration added since an older one was last opened.
    const userDb = await this.userDatabases.getUserDb(userId);

    await this.insertProfile(userDb, userId, payload);
    await this.seedCategories(userDb, payload);

    // Strictly last. While it is set, the payload is both the profile's source
    // data and the "provisioning may be unfinished" marker, so clearing it any
    // earlier would lose the source with the work possibly incomplete.
    await this.users.clearOnboardingPayload(userId);
  }

  /**
   * Creates the database and records the pointer to it, as one unit.
   *
   * The two steps share a compensation path because they can half-succeed: in
   * cloud mode a created database whose token mint (or whose pointer write)
   * fails would otherwise be an orphan nothing ever reclaims, since the resume
   * logic keys on `dbUrl` being non-null and would provision a second one under
   * the same name. Deleting it and rethrowing the original error leaves the row
   * exactly as it was, so a resent link runs the whole step again.
   *
   * Nothing after this compensates: once the pointer is persisted, deleting the
   * database would strand a row that resume logic will never re-provision.
   * Forward-only from there, which the re-runnability list above relies on.
   */
  private async createDatabase(userId: string): Promise<void> {
    try {
      const provisioned = await this.userDatabases.provisionUserDb(userId);
      await this.users.persistProvisionedDb(userId, provisioned);
    } catch (error) {
      await this.userDatabases
        .deleteUserDb(userId)
        .catch((cleanup: unknown) => {
          this.logger.error(
            `Provisioning failed for user ${userId} and so did the cleanup: ` +
              `database ${userDbName(userId)} may exist in Turso with nothing pointing at it, ` +
              `and every retry will collide on that name until it is deleted by ` +
              `hand. Cleanup error: ${String(cleanup)}`,
          );
        });
      throw error;
    }
  }

  /**
   * Writes the profile the onboarding form described, converting money to minor
   * units at this boundary - the schema promises the conversion happens exactly
   * here, and nothing upstream of it stores cents.
   *
   * `onConflictDoNothing` because a previous attempt may have inserted it
   * already. The accepted consequence: an existing profile row wins over a
   * re-registered payload, so values corrected between a failed verification and
   * the next one are ignored. Reachable only through a mid-provisioning failure,
   * and the alternative - overwriting a profile the user may have since edited -
   * is worse.
   */
  private async insertProfile(
    userDb: UserDatabase,
    userId: string,
    payload: OnboardingPayload,
  ): Promise<void> {
    await userDb
      .insert(profile)
      .values({
        // The central id, not a second one for the same person.
        id: userId,
        firstName: payload.firstName,
        lastName: payload.lastName,
        currency: payload.currency,
        monthlyBudgetCents: toCents(payload.monthlyBudget),
        monthStartDay: payload.monthStartDay,
      })
      .onConflictDoNothing();
  }

  /**
   * Seeds the fallback category plus whichever starter categories were picked,
   * unless this database already has some.
   *
   * "Any row exists" is a safe skip condition because the seed is a single
   * multi-row INSERT and therefore atomic: a previous attempt either wrote all
   * of them or none. It got stronger when the fallback arrived - the seed now
   * always writes at least that row, so an empty table unambiguously means the
   * seed has not run, where it used to also be what picking no chips left
   * behind (A4).
   */
  private async seedCategories(
    userDb: UserDatabase,
    payload: OnboardingPayload,
  ): Promise<void> {
    const [existing] = await userDb
      .select({ id: categories.id })
      .from(categories)
      .limit(1);

    if (existing) {
      return;
    }

    await seedStarterCategories(userDb, payload.categories);
  }
}
