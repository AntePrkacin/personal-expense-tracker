import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { newId } from '../common/ids';
import { users } from '../database/central/schema';
import { APP_DB } from '../database/database.constants';
import type { CentralDatabase } from '../database/database.types';
import { profile } from '../database/user/schema';
import { UserDatabaseService } from '../database/user-database.service';
import { CreateUserDto } from './dto/create-user.dto';

/**
 * What the API returns for a user: identity from the central database merged
 * with the profile from the user's own database. The database pointer columns
 * (`dbName`, `dbUrl`, `dbAuthToken`) never appear here - `dbAuthToken` in
 * particular is a credential.
 */
export interface UserResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  currency: string;
  monthlyBudget: number;
  monthStartDay: number;
  createdAt: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @Inject(APP_DB) private readonly centralDb: CentralDatabase,
    private readonly userDatabases: UserDatabaseService,
  ) {}

  /**
   * Registers a user: one row in the central directory, one database of their
   * own, one profile row inside it.
   *
   * Those three writes span two databases, so no single transaction covers
   * them. Failure is handled by compensation instead (see `rollback`), which
   * leaves a client retry able to converge with no orphans.
   */
  async create(dto: CreateUserDto): Promise<UserResponse> {
    const [existing] = await this.centralDb
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, dto.email), isNull(users.deletedAt)))
      .limit(1);

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const id = newId();
    const provisioned = await this.userDatabases.provisionUserDb(id);

    try {
      const [userRow] = await this.centralDb
        .insert(users)
        .values({
          id,
          email: dto.email,
          dbName: provisioned.dbName,
          dbUrl: provisioned.dbUrl,
          dbAuthToken: provisioned.dbAuthToken,
        })
        .returning();

      // First open runs the user-scope migrations, creating `profile`.
      const userDb = await this.userDatabases.getUserDb(id);

      const [profileRow] = await userDb
        .insert(profile)
        .values({
          id,
          firstName: dto.firstName,
          lastName: dto.lastName,
          currency: dto.currency ?? 'USD',
          monthlyBudgetCents: toCents(dto.monthlyBudget),
          monthStartDay: dto.monthStartDay ?? 1,
        })
        .returning();

      return toResponse(userRow, profileRow);
    } catch (error) {
      await this.rollback(id);

      // The duplicate check above is not atomic, so a registration can still
      // lose the race and trip the unique index. Surface that as the
      // documented 409 rather than letting it become a generic 500.
      if (isUniqueEmailViolation(error)) {
        throw new ConflictException('Email already registered');
      }
      throw error;
    }
  }

  /**
   * Reads one user. Touches both databases, which makes it the smallest thing
   * that proves the whole two-database stack works.
   */
  async findById(id: string): Promise<UserResponse> {
    const [userRow] = await this.centralDb
      .select()
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);

    if (!userRow) {
      throw new NotFoundException('User not found');
    }

    const userDb = await this.userDatabases.getUserDb(id);
    const [profileRow] = await userDb
      .select()
      .from(profile)
      .where(and(eq(profile.id, id), isNull(profile.deletedAt)))
      .limit(1);

    if (!profileRow) {
      throw new NotFoundException('User not found');
    }

    return toResponse(userRow, profileRow);
  }

  /**
   * Undoes a partial registration: drops the user's database and removes the
   * central row. Deleting by id is a no-op when the insert never landed, which
   * is exactly the case this has to survive.
   */
  private async rollback(id: string): Promise<void> {
    this.logger.error(`Registration failed for user ${id}; rolling back`);

    try {
      await this.userDatabases.deleteUserDb(id);
      await this.centralDb.delete(users).where(eq(users.id, id));
    } catch (error) {
      // Nothing useful to do here: the original failure is about to be
      // rethrown and is the more informative one.
      this.logger.error(`Rollback for user ${id} failed: ${String(error)}`);
    }
  }
}

/** Money is stored in minor units; the API speaks major units. */
function toCents(majorUnits: number): number {
  return Math.round(majorUnits * 100);
}

function toResponse(
  userRow: typeof users.$inferSelect,
  profileRow: typeof profile.$inferSelect,
): UserResponse {
  return {
    id: userRow.id,
    email: userRow.email,
    firstName: profileRow.firstName,
    lastName: profileRow.lastName,
    currency: profileRow.currency,
    monthlyBudget: profileRow.monthlyBudgetCents / 100,
    monthStartDay: profileRow.monthStartDay,
    createdAt: userRow.createdAt.toISOString(),
  };
}

/** SQLite reports this as `UNIQUE constraint failed: users.email`. */
function isUniqueEmailViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unique/i.test(message) && /email/i.test(message);
}
