import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { newId } from '../common/ids';
import { fromCents, toCents } from '../common/money';
import { normalizeEmail } from '../common/normalize-email';
import { parseDate } from '../common/month-window';
import {
  periodFor,
  ruleInForceAt,
  transitionStartFor,
} from '../common/period-rules';
import { PeriodService } from '../periods/period.service';
import type { UserDatabase } from '../database/database.types';
import { UserDatabaseService } from '../database/user-database.service';
import {
  budgetHistory,
  periodRules,
  profile,
  type ProfileRow,
} from '../database/user/schema';
import { UsersService } from '../users/users.service';
import type { ChangeScheduleDto } from './dto/change-schedule.dto';
import type { ProfileResponseDto } from './dto/profile-response.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';

const NOTHING_TO_UPDATE = 'Provide at least one field to update.';
const EMAIL_TAKEN = 'That email address is already in use.';
const PAYCHECK_OFF_DAY = (date: string, day: number) =>
  `firstPaycheckDate ${date} is not day ${day} of its month; a pay schedule's first paycheck must fall on its own pay day.`;
const PAYCHECK_TOO_EARLY = (date: string, earliest: string) =>
  `firstPaycheckDate ${date} is earlier than this account's first pay schedule (${earliest}); a schedule change cannot predate the schedule it amends.`;
const PAYCHECK_BEHIND_LATER_RULE = (date: string, latest: string) =>
  `firstPaycheckDate ${date} is earlier than a pay-schedule change already anchored at ${latest}; a pay-day change cannot be anchored behind a later one. Pick a paycheck on or after ${latest}, or make another change from it.`;

/**
 * The sparse column set an UPDATE applies. Never includes `updatedAt`.
 *
 * **Two fields, down from five.** `monthlyBudgetCents` and `monthStartDay` left
 * this table at PET-72 - they are effective-dated history now, written by
 * `changeSchedule` rather than overwritten here - and `firstName`/`lastName`
 * became one `fullName`.
 */
type ProfileUpdate = Partial<Pick<ProfileRow, 'fullName' | 'currency'>>;

/**
 * The signed-in person's own profile: one read, one update.
 *
 * There is no `/profile/{id}`, so cross-user isolation needs no thought here -
 * every method is handed the principal's own id by the controller and opens that
 * user's own database.
 *
 * **The data is split across two databases, and only this service sees the
 * seam.** `email` is the login identifier and lives in central `users`;
 * everything else lives in the caller's single-row `profile` table. The read
 * never touches central at all - `SessionService.validate` already joins `users`
 * on every request, so the principal's address is as fresh as a query would be.
 * The update does touch both, and the write order is chosen for failure
 * semantics rather than convenience: see `update`.
 *
 * Money crosses units here and nowhere else in this feature: `toCents` in,
 * `fromCents` out.
 *
 * **The resource kept its shape while two of its fields stopped being columns.**
 * `monthlyBudget` and `monthStartDay` are still on the read, still single current
 * values, and a client cannot tell the difference - but they are now resolved from
 * `budget_history` and `period_rules` rather than selected. What did change is the
 * *write*: `PATCH /api/profile` no longer accepts either, because "set the budget"
 * is not a well-formed request any more. A budget applies from a date, and which
 * date is a question only the user can answer, which is what
 * `POST /api/profile/schedule` exists to ask.
 */
@Injectable()
export class ProfileService {
  constructor(
    private readonly userDatabases: UserDatabaseService,
    private readonly periods: PeriodService,
    private readonly users: UsersService,
  ) {}

  /**
   * @param email the principal's address, which central owns.
   * @throws Error - never a NotFoundException - if the profile row is missing.
   * A verified session guarantees it exists, so its absence is a broken
   * invariant rather than a state a client could act on. The global filter logs
   * it in full and answers the generic 500.
   */
  async get(userId: string, email: string): Promise<ProfileResponseDto> {
    const db = await this.userDatabases.getUserDb(userId);
    const row = await readProfile(db, userId);

    return this.toResponse(row, email);
  }

  /**
   * Changes the pay schedule, the budget, or both, anchored to a paycheck date.
   *
   * **Why this is a POST to its own path and not part of the PATCH.** A budget is
   * not a property of the account, it is a property of a span of time, so a
   * request setting one is incomplete without saying from when. `PATCH /profile`
   * has no room for that question and no way to refuse a body that omits it; this
   * endpoint requires `firstPaycheckDate` and therefore cannot be sent by accident.
   * It is a POST rather than a PATCH because it **appends** - two rows in the
   * ordinary case, replacing nothing.
   *
   * **Two ordered writes, no `db.transaction()`.** The rule first, the budget
   * second, for the reason `backend/CLAUDE.md` gives for keeping transactional call
   * sites on a user database countable. The order is chosen so a failure between
   * them is the recoverable direction: a rule with no budget row resolves to the
   * previous budget, which is a period boundary that moved without the money
   * changing - visibly wrong on the Dashboard and fixed by saving again. The
   * reverse would apply the new budget to a period that still ends on the old
   * boundary, which looks correct and is not.
   *
   * **Retrying converges rather than duplicating.** The rule insert is
   * `onConflictDoNothing` against the unique index on `effective_from`, so a
   * repeat of the same anchor is a no-op; the budget insert is an ordinary append,
   * and a duplicate row for the same date resolves to the newest by
   * `created_at DESC` - the same value. So the identical payload sent twice leaves
   * the account in the same state as sending it once.
   *
   * @throws BadRequestException if `firstPaycheckDate` is not day
   * `monthStartDay` of its own month. A period starts on every paycheck, so an
   * anchor off its own pay day would describe a first period beginning on a day no
   * later period ever begins on. Also thrown for an anchor earlier than the
   * account's first rule, and for a pay-day change anchored behind a later
   * pay-day change - see the two guards below.
   */
  async changeSchedule(
    userId: string,
    email: string,
    dto: ChangeScheduleDto,
  ): Promise<ProfileResponseDto> {
    const anchor = dto.firstPaycheckDate;

    if (parseDate(anchor).day !== dto.monthStartDay) {
      throw new BadRequestException(
        PAYCHECK_OFF_DAY(anchor, dto.monthStartDay),
      );
    }

    // One read of the rules serves every decision below: the rule in force at
    // the anchor, the newest rule, and the budget-only period resolution.
    const rules = await this.periods.rules(userId);
    const active = ruleInForceAt(rules, anchor);
    // `rules` is ordered ascending, so the newest rule is last.
    const latest = rules[rules.length - 1];

    // **A retroactive anchor must land at or after the rule it is amending.**
    // Provisioning anchors the first rule a year back precisely so this is
    // unreachable from the Settings modal, which offers four months either way -
    // but an API caller reaching further back would otherwise insert a rule
    // *before* the earliest one, leaving two rules claiming the same stretch and a
    // walk that cannot say which pay day was in force. A 400 naming the boundary
    // beats silently producing that.
    if (anchor < active.effectiveFrom) {
      throw new BadRequestException(
        PAYCHECK_TOO_EARLY(anchor, active.effectiveFrom),
      );
    }

    // **A body re-asserting the newest schedule with an earlier anchor is a
    // budget-only change, not a request to re-anchor the last pay-day change.**
    // The Settings form always sends the *configured* day - GET /api/profile
    // reports the newest rule's - so a user backdating only their budget across
    // a recent pay-day change sends a day that differs from the rule in force at
    // the anchor. Reading that as a schedule change wrote a boundary move the
    // user never asked for; and read literally it could only be refused anyway,
    // by the guard below.
    const reassertsLatest =
      dto.monthStartDay === latest.monthStartDay &&
      anchor < latest.effectiveFrom;

    // **Only a genuine pay-day change writes a rule**, and this branch is the
    // whole of "a budget-only change gets the same question". Writing a rule for
    // an unchanged pay day would still remove a boundary - arrears applies to
    // every rule insert - so a user who only raised their budget would silently
    // lose a period. Compared against the rule in force *at the anchor* rather
    // than the newest rule, so anchoring a change inside an earlier schedule is
    // judged against the schedule that was actually running then - except for
    // the re-assertion case above, which no comparison at the anchor can see.
    const scheduleChanged =
      !reassertsLatest && dto.monthStartDay !== active.monthStartDay;

    // **A pay-day change cannot be anchored behind a later pay-day change.**
    // Inserting a rule *between* two existing ones would leave the later rule's
    // stored `transitionStart` computed against a predecessor that no longer
    // governs that span - a bridge landing on no boundary of the new rule's, and
    // periods that end on a day nobody was ever paid. Correcting history is
    // recorded as not built (`backend/CLAUDE.md`, Not built here); until it is,
    // the honest answer is a 400 naming the rule in the way.
    if (scheduleChanged && anchor < latest.effectiveFrom) {
      throw new BadRequestException(
        PAYCHECK_BEHIND_LATER_RULE(anchor, latest.effectiveFrom),
      );
    }

    const db = await this.userDatabases.getUserDb(userId);

    if (scheduleChanged) {
      await db
        .insert(periodRules)
        .values({
          id: newId(),
          effectiveFrom: anchor,
          monthStartDay: dto.monthStartDay,
          transitionStart: transitionStartFor(active, anchor),
        })
        .onConflictDoNothing();
    }

    // A schedule change dates the budget at T, because T opens a period by
    // construction. A budget-only change dates it at the start of the period the
    // anchor falls in - the anchor is a paycheck date the user picked from a
    // month list, and the period it belongs to is the one they meant. The walk
    // runs over the rules already in hand rather than a second read.
    const effectiveFrom = scheduleChanged
      ? anchor
      : periodFor(rules, anchor).start;

    await db.insert(budgetHistory).values({
      id: newId(),
      effectiveFrom,
      budgetCents: toCents(dto.monthlyBudget),
    });

    return this.get(userId, email);
  }

  /**
   * Applies a partial update and answers the whole profile.
   *
   * The order is: reject an empty body, pre-check the address, write the profile
   * row, write central. No cross-database transaction exists to make that atomic,
   * so each step is placed where a failure does least harm. The 409 pre-check
   * runs before either write, so a conflict leaves both stores untouched; the
   * operationally riskier write - opening and possibly migrating a per-user
   * database - happens before the login-critical central one, so a profile that
   * saved is never contradicted by a directory that did not.
   *
   * The residual is one race: two concurrent PATCHes claiming the same new
   * address both pass the pre-check, and the loser violates the partial unique
   * index after its profile fields have persisted, answering a logged 500. It is
   * retry-safe - the retry gets an honest 409 or succeeds - and closing it means
   * sniffing driver-specific constraint errors, which is recorded in
   * docs/TODO.md rather than done here.
   *
   * @param sessionEmail the address the caller is currently known by.
   * @throws BadRequestException if the body changes nothing.
   * @throws ConflictException if the requested address belongs to someone else.
   * This deliberately makes Settings an email-existence oracle for authenticated
   * callers, unlike the public auth routes: the form cannot tell a typo from a
   * taken address without it.
   */
  async update(
    userId: string,
    sessionEmail: string,
    dto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    const set = buildUpdate(dto);

    // Both sides normalized, so `Marko@Email.com` against a stored
    // `marko@email.com` is correctly "unchanged" rather than a self-conflict.
    const currentEmail = normalizeEmail(sessionEmail) ?? sessionEmail;
    const requestedEmail = normalizeEmail(dto.email) ?? dto.email;
    const emailChanged =
      requestedEmail !== undefined && requestedEmail !== currentEmail;

    // First, and ahead of even opening a database. A bare UPDATE would still
    // bump `updated_at` through $onUpdateFn, so an empty body would record an
    // edit that changed nothing. Sending only the address you already have is
    // not empty - it is a no-op the form is entitled to make.
    if (Object.keys(set).length === 0 && dto.email === undefined) {
      throw new BadRequestException(NOTHING_TO_UPDATE);
    }

    if (emailChanged) {
      const existing = await this.users.findByEmail(requestedEmail);
      // `!== userId` rather than a bare existence check: the address could
      // legitimately be the caller's own under a different normalization.
      if (existing && existing.id !== userId) {
        throw new ConflictException(EMAIL_TAKEN);
      }
    }

    const db = await this.userDatabases.getUserDb(userId);
    const row = await this.writeProfile(db, userId, set);

    // Strictly last, so nothing above can fail after the login identifier has
    // already moved.
    if (emailChanged) {
      await this.users.updateEmail(userId, requestedEmail);
    }

    return this.toResponse(row, emailChanged ? requestedEmail : currentEmail);
  }

  /**
   * A stored row plus the address central holds and the two settings that are no
   * longer columns.
   *
   * A method rather than the free function it used to be, because two of the six
   * fields now need a database read of their own. `monthlyBudget` and
   * `monthStartDay` are the **configured** values - the newest rows of their
   * histories, a future-anchored change included - because this response is what
   * the Settings form loads and a form must round-trip: the value it loads has to
   * be the value a save would leave unchanged. This read used to report the
   * values in force for the *current* period instead, and that broke exactly
   * when a change was pending at a future paycheck - the form loaded the old
   * day, and a faithful budget-only re-submit wrote a rule reverting the change
   * the user had just scheduled. `PeriodService.configured` carries the rest of
   * the argument; what a period was actually lived under stays per-period on
   * every other read.
   */
  private async toResponse(
    row: ProfileRow,
    email: string,
  ): Promise<ProfileResponseDto> {
    const configured = await this.periods.configured(row.id);

    return {
      fullName: row.fullName,
      email,
      currency: row.currency,
      monthlyBudget: fromCents(configured.budgetCents),
      monthStartDay: configured.monthStartDay,
    };
  }

  /**
   * The updated row, or the current one when the body carried nothing but an
   * address.
   *
   * An email-only PATCH deliberately selects rather than issuing an empty
   * UPDATE: drizzle's `$onUpdateFn` would bump the profile's `updated_at` for a
   * change that happened in another database entirely.
   */
  private async writeProfile(
    db: UserDatabase,
    userId: string,
    set: ProfileUpdate,
  ): Promise<ProfileRow> {
    if (Object.keys(set).length === 0) {
      return readProfile(db, userId);
    }

    const [row] = await db
      .update(profile)
      .set(set)
      .where(and(eq(profile.id, userId), isNull(profile.deletedAt)))
      .returning();

    if (!row) {
      throw missingProfile(userId);
    }

    return row;
  }
}

/** The caller's live profile row, or the invariant failure that it is missing. */
async function readProfile(
  db: UserDatabase,
  userId: string,
): Promise<ProfileRow> {
  const [row] = await db
    .select()
    .from(profile)
    .where(and(eq(profile.id, userId), isNull(profile.deletedAt)))
    .limit(1);

  if (!row) {
    throw missingProfile(userId);
  }

  return row;
}

/**
 * A plain Error, so the global filter logs it and answers 500.
 *
 * Not a NotFoundException: verification inserts the profile before it clears the
 * onboarding payload, so a session cannot exist without one. A documented 404
 * would invite the frontend to build a "create your profile" flow that has
 * nothing behind it.
 */
function missingProfile(userId: string): Error {
  return new Error(
    `Profile row missing for user ${userId}: a verified session implies one exists.`,
  );
}

/**
 * The provided fields only, so absent ones are left alone.
 *
 * `email` is absent by design - it is not a column of this table. `updatedAt` is
 * absent for the transaction service's reason: drizzle v1's `buildUpdateSet`
 * applies every `$onUpdateFn` column itself on any UPDATE, so setting it here
 * would be a second source of truth for one timestamp.
 */
function buildUpdate(dto: UpdateProfileDto): ProfileUpdate {
  const set: ProfileUpdate = {};

  if (dto.fullName !== undefined) set.fullName = dto.fullName;
  if (dto.currency !== undefined) set.currency = dto.currency;

  return set;
}
