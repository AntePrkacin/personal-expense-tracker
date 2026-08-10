import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { newId } from '../common/ids';
import { toCents } from '../common/money';
import { todayIn } from '../common/month-window';
import {
  mostRecentAnchor,
  SEED_ANCHOR_MONTHS_BACK,
} from '../common/period-rules';
import type { OnboardingPayload } from '../database/central/schema';
import { userDbName } from '../database/database.constants';
import type { UserDatabase } from '../database/database.types';
import { UserDatabaseService } from '../database/user-database.service';
import {
  budgetHistory,
  categories,
  periodRules,
  profile,
} from '../database/user/schema';
import { seedStarterCategories } from '../database/user/starter-categories';
import { TemplatesService } from '../templates/templates.service';
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
    private readonly templates: TemplatesService,
    // Read directly rather than through `PeriodService`, deliberately: that
    // service resolves periods for an account that already *has* a rule, and this
    // is the code that writes the first one. Injecting it here would make
    // provisioning depend on the invariant it is establishing.
    private readonly config: ConfigService,
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
   * own database, the profile the onboarding form becomes, the pay schedule and
   * budget it opens with, and the starter categories they picked.
   *
   * **Every step is written to resume**, because a mid-flight failure answers 500
   * with the login link already burned and "Resend link" (VER-2, A36) is the
   * designed recovery. The two history seeds added by PET-72 follow the same rule
   * as the rest: each is skipped when its table already holds a row, so a resend
   * completes a half-provisioned account rather than duplicating it.
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

    // One anchor, computed once and handed to both seeds. The budget used to
    // read the rule back to find it, which was a round trip for a value already
    // in hand - and made the two seeds order-dependent in a way neither needed.
    //
    // **Anchored a year back, not at today's boundary**, which is `mostRecentAnchor`
    // and `SEED_ANCHOR_MONTHS_BACK`'s whole subject: the earliest rule extends
    // backward without limit either way, so the periods are identical, but a floor
    // is what lets a *retroactive* schedule change land after it rather than before
    // it. Anchored at the current period, every retroactive change produced two
    // rules claiming one stretch.
    const anchor = mostRecentAnchor(
      payload.monthStartDay,
      todayIn(this.config.get<string>('APP_TIMEZONE', 'Europe/Zagreb')),
      SEED_ANCHOR_MONTHS_BACK,
    );

    await this.seedPeriodRule(userDb, payload, anchor);
    await this.seedBudget(userDb, payload, anchor);
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
        fullName: payload.fullName,
        currency: payload.currency,
      })
      .onConflictDoNothing();
  }

  /**
   * The account's first pay schedule, from the pay day onboarding asked for.
   *
   * **The anchor is the caller's, and this docblock used to describe a different
   * one.** It said "anchored to the most recent occurrence of that day, not to
   * today ... the most recent one is the start of the period the user is in right
   * now, so their first period opens where they would expect rather than a month
   * later" - true of `mostRecentAnchor(monthStartDay, today)`, and false of what
   * `provisionAccount` passes, which is that call with `SEED_ANCHOR_MONTHS_BACK`:
   * **twelve months back**. A code review of PR #84 caught it. The reasoning for the
   * floor is at the call site and at the constant, and it is the opposite of what
   * was written here - the first rule extends backward without limit either way, so
   * the periods are identical, and the floor exists so a *retroactive* schedule
   * change sorts after this rule rather than before it. Reading this comment as
   * authority would say a retroactive change further back than one period must be
   * refused, which is exactly what the floor makes legal.
   *
   * What this method requires of any anchor is the invariant, and only that: it has
   * to be a paycheck date, because `period_rules` promises `effective_from` falls
   * on its own `month_start_day`. `mostRecentAnchor` is what guarantees it.
   *
   * `transition_start` is NULL: the first rule has no predecessor to bridge from,
   * and it extends backward without limit, so an expense backdated to before the
   * account existed still lands in a period.
   *
   * Skipped when any rule already exists, the `seedCategories` shape: one row, so
   * a previous attempt either wrote it or did not, and the data is its own record
   * of having run.
   */
  private async seedPeriodRule(
    userDb: UserDatabase,
    payload: OnboardingPayload,
    anchor: string,
  ): Promise<void> {
    const [existing] = await userDb
      .select({ id: periodRules.id })
      .from(periodRules)
      .limit(1);

    if (existing) {
      return;
    }

    await userDb.insert(periodRules).values({
      id: newId(),
      effectiveFrom: anchor,
      monthStartDay: payload.monthStartDay,
      transitionStart: null,
    });
  }

  /**
   * The account's first budget, effective from its first period.
   *
   * Dated at the same anchor as the seed rule rather than at today, so the period
   * the user is currently in is budgeted rather than starting at zero. Any period
   * older than this row resolves back to it - see `PeriodService.budgetCentsFor` -
   * so a backdated expense is measured against the only budget the account has
   * ever had, which is the honest answer.
   *
   * The `toCents` conversion happens here, at the service boundary the schema
   * promises: the payload holds major units exactly as submitted.
   */
  private async seedBudget(
    userDb: UserDatabase,
    payload: OnboardingPayload,
    anchor: string,
  ): Promise<void> {
    const [existing] = await userDb
      .select({ id: budgetHistory.id })
      .from(budgetHistory)
      .limit(1);

    if (existing) {
      return;
    }

    await userDb.insert(budgetHistory).values({
      id: newId(),
      effectiveFrom: anchor,
      budgetCents: toCents(payload.monthlyBudget),
    });
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
   *
   * **The payload holds template ids, so the copy comes out of central here.**
   * Registration already rejected an unknown id, but a template can be
   * tombstoned between then and the click, so `resolve()` simply returns fewer
   * rows and the account is seeded with what still exists. That is the right
   * failure: refusing to verify a live login link over a category the user can
   * no longer be given would strand the account, and the alternative - seeding
   * a name from a row that is gone - is not available, because the name is not
   * in the payload.
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

    const picked = await this.templates.resolve(payload.categories);

    if (picked.length !== payload.categories.length) {
      this.logger.warn(
        `Seeding ${picked.length} of ${payload.categories.length} picked ` +
          `categories: the rest are no longer live category templates.`,
      );
    }

    await seedStarterCategories(userDb, picked);
  }
}
