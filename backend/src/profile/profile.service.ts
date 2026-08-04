import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { fromCents, toCents } from '../common/money';
import { normalizeEmail } from '../common/normalize-email';
import type { UserDatabase } from '../database/database.types';
import { UserDatabaseService } from '../database/user-database.service';
import { profile, type ProfileRow } from '../database/user/schema';
import { UsersService } from '../users/users.service';
import type { ProfileResponseDto } from './dto/profile-response.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';

const NOTHING_TO_UPDATE = 'Provide at least one field to update.';
const EMAIL_TAKEN = 'That email address is already in use.';

/** The sparse column set an UPDATE applies. Never includes `updatedAt`. */
type ProfileUpdate = Partial<
  Pick<
    ProfileRow,
    | 'firstName'
    | 'lastName'
    | 'currency'
    | 'monthlyBudgetCents'
    | 'monthStartDay'
  >
>;

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
 */
@Injectable()
export class ProfileService {
  constructor(
    private readonly userDatabases: UserDatabaseService,
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

    return toResponse(row, email);
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

    return toResponse(row, emailChanged ? requestedEmail : currentEmail);
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

  if (dto.firstName !== undefined) set.firstName = dto.firstName;
  if (dto.lastName !== undefined) set.lastName = dto.lastName;
  if (dto.currency !== undefined) set.currency = dto.currency;
  if (dto.monthlyBudget !== undefined) {
    set.monthlyBudgetCents = toCents(dto.monthlyBudget);
  }
  if (dto.monthStartDay !== undefined) set.monthStartDay = dto.monthStartDay;

  return set;
}

/** A stored row plus the address central holds, as the API describes them. */
function toResponse(row: ProfileRow, email: string): ProfileResponseDto {
  return {
    firstName: row.firstName,
    lastName: row.lastName,
    email,
    currency: row.currency,
    monthlyBudget: fromCents(row.monthlyBudgetCents),
    monthStartDay: row.monthStartDay,
  };
}
