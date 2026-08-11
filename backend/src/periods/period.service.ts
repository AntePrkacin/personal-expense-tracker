import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, desc, isNull, lte, min } from 'drizzle-orm';
import { todayIn } from '../common/month-window';
import {
  periodFor,
  periodsBetween,
  previousPeriod,
  type Period,
  type PeriodRule,
} from '../common/period-rules';
import type { UserDatabase } from '../database/database.types';
import { UserDatabaseService } from '../database/user-database.service';
import {
  budgetHistory,
  periodRules,
  transactions,
} from '../database/user/schema';

const NO_RULES = (userId: string) =>
  `No period rule for user ${userId}; verification seeds one for every account.`;
const NO_BUDGET = (userId: string) =>
  `No budget history for user ${userId}; verification seeds one for every account.`;
const NOT_A_PERIOD_START = (start: string) =>
  `"${start}" is not the start of any budgeting period for this account.`;
const FUTURE_PERIOD_START = (start: string) =>
  `"${start}" starts a period in the future; the newest period you can read is the current one.`;

/**
 * The current period and the `today` it was resolved from.
 *
 * The pairing is the point. `DashboardService` used to take the window from
 * `CategoriesService.currentWindow` and `today` from its own `todayIn` call, and
 * `backend/CLAUDE.md` recorded the consequence as an accepted edge: at the
 * midnight boundary the two could land on either side of it, so `daysLeft` could
 * read 0 where its DTO promises at least 1. Resolving both in one place removes
 * the window in which they can disagree, which is one of the things this service
 * exists for.
 */
export interface CurrentPeriod extends Period {
  /** `YYYY-MM-DD` in `APP_TIMEZONE`, the date this period was resolved from. */
  today: string;
}

/**
 * The one place that reads `period_rules`, and the app's single answer to "which
 * period is this, and what was the budget then".
 *
 * **This is the promotion `docs/TODO.md` has been asking for since PET-20.** The
 * period used to be resolved by a private `CategoriesService.period()`, which
 * three other features reached for through two public wrappers; the dashboard
 * paid for the profile read up to three times per request and the trade was
 * documented rather than fixed. PET-72 forced the issue - a period is now a walk
 * over history rather than one column - so the walk lives in
 * `common/period-rules.ts` and the reading of rows lives here.
 *
 * **Pure walk, impure service.** Every calendar decision is in `period-rules.ts`
 * and is testable with literals; everything in this file is a database read, the
 * clock, or the translation of a caller's `?period=` into one of them. Nothing
 * here does arithmetic on a date.
 *
 * **Nothing here aggregates spend.** Sums stay in `CategoriesService` and
 * `TransactionsService`, which now ask this service for the window instead of
 * resolving one. The single exception is the `min(date)` read in `all()`, which is
 * a lower bound for enumeration rather than a figure any screen shows.
 */
@Injectable()
export class PeriodService {
  constructor(
    private readonly userDatabases: UserDatabaseService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Today's date in the configured zone.
   *
   * `APP_TIMEZONE`, never UTC: just after local midnight on a boundary day a
   * transaction would otherwise fall into the previous period, and the whole
   * screen would show the wrong period for a few hours, twice a month. One
   * configured zone is right for every user this project has; the per-user fix is
   * in `docs/TODO.md`.
   */
  today(): string {
    return todayIn(this.config.get<string>('APP_TIMEZONE', 'Europe/Zagreb'));
  }

  /**
   * The period containing today, with the date it was resolved from.
   *
   * @param rules The account's rules when the caller already holds them, so a
   * request resolving several periods reads the rows once. Read fresh when
   * omitted.
   */
  async current(
    userId: string,
    rules?: readonly PeriodRule[],
  ): Promise<CurrentPeriod> {
    const loaded = rules ?? (await this.rules(userId));
    const today = this.today();

    return { ...periodFor(loaded, today), today };
  }

  /**
   * The period immediately before the current one.
   *
   * Stepped off the current period rather than derived from a start day and a
   * month subtraction: across a schedule change the previous period is a
   * stretched transition longer than a month, and fixed arithmetic would land
   * inside it rather than on its start.
   *
   * @param rules Preloaded rules, on `current`'s terms.
   */
  async previous(
    userId: string,
    rules?: readonly PeriodRule[],
  ): Promise<Period> {
    const loaded = rules ?? (await this.rules(userId));

    return previousPeriod(loaded, periodFor(loaded, this.today()));
  }

  /**
   * The period a caller named by its start date.
   *
   * **A date that is not a period start is a 400, not the period containing
   * it.** `?period=2026-01-05` on an account paid on the 14th names no period at
   * all, and quietly answering with the period around it would render a screen
   * whose overline disagreed with the URL that produced it - and would make two
   * different query strings return the same page, which no client could cache or
   * link to sensibly. The frontend only ever sends starts it was given by
   * `GET /api/periods`.
   *
   * **A future period start is a 400 too.** The latest rule tiles forward
   * without limit, so `2027-03-01` can genuinely start a period of the walk's -
   * but `all()` never offers one past the current period, and a read for a
   * period that has not begun would classify it as *finished*: zero days left,
   * a full complement of days elapsed, an average over days that have not
   * happened. The guard keeps this method's answers inside the same range the
   * period list publishes.
   *
   * @throws BadRequestException if `start` is not the start of a real period,
   * or starts one later than the current period.
   */
  async startingAt(userId: string, start: string): Promise<Period> {
    const rules = await this.rules(userId);
    const period = periodFor(rules, start);

    if (period.start !== start) {
      throw new BadRequestException(NOT_A_PERIOD_START(start));
    }
    // A period start after today can only be a future period's: the current
    // period's own start is at or before today by construction.
    if (start > this.today()) {
      throw new BadRequestException(FUTURE_PERIOD_START(start));
    }
    return period;
  }

  /**
   * Every period the account has, newest first.
   *
   * **Bounded below by the account's spending, not by its rules.** The lower
   * bound is the oldest transaction the database holds, or the current period for
   * an account that has logged nothing. It is deliberately **not** the earliest
   * rule's anchor: that anchor is a floor a year before provisioning
   * (`SEED_ANCHOR_MONTHS_BACK`) rather than a statement about the account, so
   * bounding on it would offer a year of empty periods to every new user. An
   * expense backdated before the account existed still gets a period, because the
   * bound follows the transaction.
   *
   * Upper bound is the current period: there is no reason to offer navigation into
   * a future nothing can have been spent in, even though the walk would happily
   * produce it.
   *
   * **Tombstoned transactions count toward the lower bound**, which looks odd and
   * is deliberate. A user who deleted their oldest expense has not changed which
   * periods their account spans, and letting the range shrink would make the
   * period list flicker between requests as rows are deleted and restored by a
   * future sync. The cost of being wrong in this direction is one extra empty
   * period in a select.
   */
  async all(userId: string): Promise<Period[]> {
    const db = await this.userDatabases.getUserDb(userId);
    const rules = await this.rulesIn(db, userId);
    const today = this.today();

    // Tombstones included on purpose: no `isNull(deletedAt)` filter here.
    const [oldest] = await db
      .select({ date: min(transactions.date) })
      .from(transactions);

    // A transaction dated in the future would otherwise make `periodsBetween`
    // throw on a backwards range. Clamped rather than rejected: a future-dated
    // expense is legal input, and it simply has no period list of its own.
    const from = oldest?.date && oldest.date < today ? oldest.date : today;

    return periodsBetween(rules, from, today).reverse();
  }

  /**
   * The monthly budget in force for a period, in cents.
   *
   * **Resolved against the period's start, so a budget change never re-prices a
   * period that has already begun** - the whole point of PET-72. The greatest
   * `effective_from` at or before the start wins, and ties break on
   * `created_at DESC, id DESC`, which is what makes a correction an append rather
   * than an update.
   *
   * A period older than the account's earliest budget row resolves to that
   * earliest row. A transaction backdated before the first budget was ever set
   * still has to be shown against some budget, and the first one the user chose
   * is the only honest answer available - the alternative is a screen reporting a
   * budget of zero and every category over cap.
   */
  async budgetCentsFor(userId: string, period: Period): Promise<number> {
    const db = await this.userDatabases.getUserDb(userId);

    const [inForce] = await db
      .select({ budgetCents: budgetHistory.budgetCents })
      .from(budgetHistory)
      .where(
        and(
          isNull(budgetHistory.deletedAt),
          lte(budgetHistory.effectiveFrom, period.start),
        ),
      )
      .orderBy(
        desc(budgetHistory.effectiveFrom),
        desc(budgetHistory.createdAt),
        desc(budgetHistory.id),
      )
      .limit(1);

    if (inForce) {
      return inForce.budgetCents;
    }

    const [earliest] = await db
      .select({ budgetCents: budgetHistory.budgetCents })
      .from(budgetHistory)
      .where(isNull(budgetHistory.deletedAt))
      .orderBy(
        asc(budgetHistory.effectiveFrom),
        desc(budgetHistory.createdAt),
        desc(budgetHistory.id),
      )
      .limit(1);

    // Verification seeds one row for every account, so absence is a broken
    // invariant rather than a state to render - the shape `CategoriesService`
    // uses for a missing profile row.
    if (!earliest) {
      throw new Error(NO_BUDGET(userId));
    }
    return earliest.budgetCents;
  }

  /**
   * The schedule as configured: the newest rule's pay day and the newest budget
   * row, in one pair of reads.
   *
   * Only `GET /api/profile` needs this, to serve `monthlyBudget` and
   * `monthStartDay` as the account's settings now that no column holds either.
   * **The newest rows rather than the ones in force for the current period**,
   * deliberately: Settings is a form, and a form must round-trip - the value it
   * loads has to be the value a save would leave unchanged. Reporting the
   * current period's values instead breaks that exactly when a change is
   * pending at a future paycheck: the form would load the *old* day, and a
   * faithful budget-only re-submit of it would write a rule reverting the
   * change the user had just scheduled. What a period was actually lived under
   * stays per-period everywhere else, resolved by `budgetCentsFor` and the
   * walk.
   */
  async configured(
    userId: string,
  ): Promise<{ monthStartDay: number; budgetCents: number }> {
    const db = await this.userDatabases.getUserDb(userId);
    const rules = await this.rulesIn(db, userId);
    // `rulesIn` orders ascending, so the newest rule is last.
    const latest = rules[rules.length - 1];

    const [newest] = await db
      .select({ budgetCents: budgetHistory.budgetCents })
      .from(budgetHistory)
      .where(isNull(budgetHistory.deletedAt))
      .orderBy(
        desc(budgetHistory.effectiveFrom),
        desc(budgetHistory.createdAt),
        desc(budgetHistory.id),
      )
      .limit(1);

    if (!newest) {
      throw new Error(NO_BUDGET(userId));
    }

    return {
      monthStartDay: latest.monthStartDay,
      budgetCents: newest.budgetCents,
    };
  }

  /**
   * Every rule the account has.
   *
   * Public because the schedule write needs the rule in force to compute the new
   * one's `transitionStart`, and because a caller resolving several periods in
   * one request should read the rows once.
   */
  async rules(userId: string): Promise<PeriodRule[]> {
    const db = await this.userDatabases.getUserDb(userId);

    return this.rulesIn(db, userId);
  }

  /**
   * The same read against a database the caller already holds.
   *
   * Ordered ascending, which the walk does not require - it sorts a copy itself -
   * but which makes a logged query and a debugger session read in the order the
   * rules apply.
   */
  private async rulesIn(
    db: UserDatabase,
    userId: string,
  ): Promise<PeriodRule[]> {
    const rows = await db
      .select({
        effectiveFrom: periodRules.effectiveFrom,
        monthStartDay: periodRules.monthStartDay,
        transitionStart: periodRules.transitionStart,
      })
      .from(periodRules)
      .where(isNull(periodRules.deletedAt))
      .orderBy(asc(periodRules.effectiveFrom));

    // Verification seeds one, so an account with none cannot be rendered at all -
    // a broken invariant rather than a 404 a client could act on.
    if (rows.length === 0) {
      throw new Error(NO_RULES(userId));
    }
    return rows;
  }
}
