import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { CategoriesService } from '../categories/categories.service';
import type { CategoryResponseDto } from '../categories/dto/category-response.dto';
import { fromCents, toCents } from '../common/money';
import { daysBetween, daysLeftInWindow, todayIn } from '../common/month-window';
import { UserDatabaseService } from '../database/user-database.service';
import { profile } from '../database/user/schema';
import type { TransactionResponseDto } from '../transactions/dto/transaction-response.dto';
import { TransactionsService } from '../transactions/transactions.service';
import type {
  GeneratedCard,
  GeneratedSet,
  InsightGenerator,
} from './insight-generator';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** How many distinct months a merchant must appear in to count as recurring. */
const RECURRING_MONTHS = 3;

/**
 * How far a month's charge may stray from the merchant's mean and still read as
 * the same subscription. A subscription bills the same amount every month; a
 * habit does not.
 */
const RECURRING_TOLERANCE = 0.15;

/**
 * How many are named before the rest are merely counted.
 *
 * Without a cap the card is a wall of merchant names - the showcase seed put 26
 * in one sentence. The count in the title still covers all of them.
 */
const RECURRING_NAMED = 5;

/**
 * The deterministic generator: the four designed content rules over the user's
 * real data, filling templated copy. No external API, no key, no
 * non-determinism - which is what lets the specs assert AC-exact strings.
 *
 * It **composes `CategoriesService` and `TransactionsService`** rather than
 * querying `categories` or `transactions` itself, the same discipline the
 * dashboard keeps: the window, the per-category stats and the budget are
 * `CategoriesService`'s, the period's transactions and the cross-month history
 * are `TransactionsService`'s. The one thing it reads directly is
 * `profile.currency`, a static presentational field neither service surfaces and
 * not the month arithmetic the "don't re-query" rule is about.
 *
 * Each rule yields at most one card and a rule with nothing to say is omitted,
 * so an account can generate fewer than four cards. Only a genuinely empty
 * account - no transactions at all - yields `null` and no set (AC7).
 */
@Injectable()
export class RuleBasedInsightGenerator implements InsightGenerator {
  constructor(
    private readonly categories: CategoriesService,
    private readonly transactions: TransactionsService,
    private readonly userDatabases: UserDatabaseService,
    private readonly config: ConfigService,
  ) {}

  async generate(userId: string): Promise<GeneratedSet | null> {
    const allTransactions = (
      await this.transactions.list(userId, { period: 'all' })
    ).transactions;

    // AC7: no transactions means nothing to generate and the empty state stands.
    if (allTransactions.length === 0) {
      return null;
    }

    const window = await this.categories.currentWindow(userId);
    const previousWindow = await this.categories.previousWindow(userId);
    const today = todayIn(
      this.config.get<string>('APP_TIMEZONE', 'Europe/Zagreb'),
    );

    const { categories: categoryRows, allocation } =
      await this.categories.list(userId);
    const currentTransactions = (
      await this.transactions.list(userId, { period: 'current' })
    ).transactions;
    const previousTransactions = (
      await this.transactions.list(userId, { period: 'previous' })
    ).transactions;
    const currency = await this.currencyOf(userId);

    const spentCents = sumCents(currentTransactions);
    const budget = allocation.monthlyBudget;
    const daysElapsed = daysBetween(window.start, today) + 1;
    const totalDays = daysBetween(window.start, window.end);
    const daysLeft = daysLeftInWindow(window, today);
    const projectedCents =
      spentCents === 0 ? 0 : (spentCents / daysElapsed) * totalDays;

    const money = (major: number) => formatMoney(major, currency);

    const cards = [
      overCapCard(categoryRows, money),
      monthOverMonthCard(
        categoryRows,
        currentTransactions,
        previousTransactions,
        previousWindow.start,
        money,
      ),
      projectionCard(spentCents, projectedCents, budget, money),
      recurringMerchantCard(allTransactions, money),
    ].filter((card): card is GeneratedCard => card !== null);

    return {
      monthLabel: monthLabelOf(window.start),
      summary: summaryOf(
        fromCents(spentCents),
        fromCents(projectedCents),
        budget,
        daysLeft,
        money,
      ),
      cards,
    };
  }

  /** The user's ISO currency, for rendering money into the prose. */
  private async currencyOf(userId: string): Promise<string> {
    const db = await this.userDatabases.getUserDb(userId);
    const [row] = await db
      .select({ currency: profile.currency })
      .from(profile)
      .where(eq(profile.id, userId))
      .limit(1);

    // categories.list has already run and would have thrown on a missing
    // profile, so this is defensive rather than a real branch.
    return row?.currency ?? 'USD';
  }
}

/** Sum of major-unit amounts, added in cents so repeated float sums cannot drift. */
function sumCents(transactions: TransactionResponseDto[]): number {
  return transactions.reduce(
    (total, transaction) => total + toCents(transaction.amount),
    0,
  );
}

/**
 * The single category furthest over its cap, in the warning tone. Omitted when
 * nothing is over.
 */
function overCapCard(
  categories: CategoryResponseDto[],
  money: (major: number) => string,
): GeneratedCard | null {
  const over = categories
    .filter((category) => category.status === 'over' && category.over !== null)
    .sort((a, b) => (b.over ?? 0) - (a.over ?? 0))[0];

  if (!over || over.monthlyCap === null || over.over === null) {
    return null;
  }

  return {
    tone: 'warning',
    title: `${over.name} is over budget`,
    body: `${money(over.spent)} of ${money(over.monthlyCap)} - ${money(over.over)} over`,
  };
}

/**
 * The category whose spend moved most against last month, reporting direction
 * and size. Positive tone for a decrease, neutral for an increase. Needs a
 * nonzero previous figure for the percentage, and is omitted when no category
 * qualifies.
 */
function monthOverMonthCard(
  categories: CategoryResponseDto[],
  currentTransactions: TransactionResponseDto[],
  previousTransactions: TransactionResponseDto[],
  previousWindowStart: string,
  money: (major: number) => string,
): GeneratedCard | null {
  const currentByCategory = sumCentsByCategory(currentTransactions);
  const previousByCategory = sumCentsByCategory(previousTransactions);

  let winner: {
    name: string;
    changeCents: number;
    previousCents: number;
  } | null = null;

  for (const category of categories) {
    const previousCents = previousByCategory.get(category.id) ?? 0;
    if (previousCents === 0) {
      continue;
    }
    const currentCents = currentByCategory.get(category.id) ?? 0;
    const changeCents = currentCents - previousCents;
    if (
      winner === null ||
      Math.abs(changeCents) > Math.abs(winner.changeCents)
    ) {
      winner = { name: category.name, changeCents, previousCents };
    }
  }

  if (winner === null || winner.changeCents === 0) {
    return null;
  }

  const decreased = winner.changeCents < 0;
  const percent = Math.round(
    (Math.abs(winner.changeCents) / winner.previousCents) * 100,
  );
  const magnitude = money(fromCents(Math.abs(winner.changeCents)));

  return {
    tone: decreased ? 'positive' : 'neutral',
    title: `${winner.name} is ${decreased ? 'down' : 'up'} ${percent}%`,
    body: `You spent ${magnitude} ${decreased ? 'less' : 'more'} than ${monthNameOf(previousWindowStart)}`,
  };
}

/**
 * End-of-month projection against the budget, in the info tone. Uses the
 * elapsed-days pace the dashboard already defines. Omitted before any spend this
 * period, when there is no pace to extrapolate.
 */
function projectionCard(
  spentCents: number,
  projectedCents: number,
  budget: number,
  money: (major: number) => string,
): GeneratedCard | null {
  if (spentCents === 0) {
    return null;
  }

  const projected = fromCents(projectedCents);
  const underBudget = projected <= budget;

  return {
    tone: 'info',
    title: underBudget
      ? 'On track to stay under budget'
      : 'Trending over budget',
    body: `At your current pace you'll land around ${money(projected)} - ${underBudget ? 'just under' : 'over'} your ${money(budget)} target`,
  };
}

/**
 * Subscriptions, named with their combined monthly total (each merchant's mean
 * monthly charge), in the neutral tone. Reads the whole history, not one
 * period. Omitted when nothing recurs.
 *
 * **Appearing in three months is necessary and nowhere near sufficient**, and
 * treating it as sufficient is what this rule used to do. Anywhere a person
 * shops regularly clears that bar just as easily as Netflix does, so a
 * supermarket, a petrol station and a café were all reported as subscriptions.
 * The showcase seed made it unmissable by naming all 26 of its merchants in one
 * sentence, but real data trips it too - the bug was never the seed's.
 *
 * Two further conditions separate a subscription from a habit. It bills **once
 * a month**, where somewhere you shop is visited whenever you need something.
 * And it bills **the same amount**, where a shop's total is whatever was in the
 * basket. Both are cheap to check and neither needs a category or a keyword
 * list, which is what keeps this rule about behaviour rather than about
 * guessing brands.
 */
function recurringMerchantCard(
  allTransactions: TransactionResponseDto[],
  money: (major: number) => string,
): GeneratedCard | null {
  const byMerchant = new Map<
    string,
    { charges: number; monthlyCents: Map<string, number> }
  >();

  for (const transaction of allTransactions) {
    const entry = byMerchant.get(transaction.merchant) ?? {
      charges: 0,
      monthlyCents: new Map<string, number>(),
    };
    const month = transaction.date.slice(0, 7);
    entry.charges += 1;
    entry.monthlyCents.set(
      month,
      (entry.monthlyCents.get(month) ?? 0) + toCents(transaction.amount),
    );
    byMerchant.set(transaction.merchant, entry);
  }

  const recurring = [...byMerchant.entries()]
    .filter(([, entry]) => {
      if (entry.monthlyCents.size < RECURRING_MONTHS) {
        return false;
      }
      // Once a month, every month it appears in.
      if (entry.charges !== entry.monthlyCents.size) {
        return false;
      }
      const totals = [...entry.monthlyCents.values()];
      const mean =
        totals.reduce((sum, cents) => sum + cents, 0) / totals.length;
      return totals.every(
        (cents) => Math.abs(cents - mean) <= mean * RECURRING_TOLERANCE,
      );
    })
    .map(([merchant, entry]) => {
      const totals = [...entry.monthlyCents.values()];
      return {
        merchant,
        monthlyCents:
          totals.reduce((sum, cents) => sum + cents, 0) / totals.length,
      };
    })
    .sort((a, b) => b.monthlyCents - a.monthlyCents);

  if (recurring.length === 0) {
    return null;
  }

  const combined = money(
    fromCents(recurring.reduce((total, item) => total + item.monthlyCents, 0)),
  );

  // The title counts them all, so the total does too - only the naming is
  // capped.
  const named = recurring.slice(0, RECURRING_NAMED).map((it) => it.merchant);
  const unnamed = recurring.length - named.length;
  const names = joinNames(unnamed > 0 ? [...named, `${unnamed} more`] : named);
  const plural = recurring.length !== 1;

  return {
    tone: 'neutral',
    title: `${recurring.length} recurring subscription${plural ? 's' : ''}`,
    body: `${names} ${plural ? 'total' : 'totals'} ${combined}/mo`,
  };
}

/** The summary banner: a headline that reflects the projection, and a body. */
function summaryOf(
  spent: number,
  projected: number,
  budget: number,
  daysLeft: number,
  money: (major: number) => string,
): { headline: string; body: string } {
  const headline =
    spent > budget
      ? "You're over budget this month"
      : projected > budget
        ? "You're trending over budget"
        : "You're on track this month";

  return {
    headline,
    body: `You've spent ${money(spent)} of your ${money(budget)} budget with ${daysLeft} day${daysLeft === 1 ? '' : 's'} to go.`,
  };
}

/** Sums major-unit amounts to cents, keyed by category id. */
function sumCentsByCategory(
  transactions: TransactionResponseDto[],
): Map<string, number> {
  const byCategory = new Map<string, number>();
  for (const transaction of transactions) {
    byCategory.set(
      transaction.categoryId,
      (byCategory.get(transaction.categoryId) ?? 0) +
        toCents(transaction.amount),
    );
  }
  return byCategory;
}

/**
 * Money as rendered prose: whole units with the user's currency symbol, since
 * every designed example is a whole figure (`$312`, `$1,980`, `$37/mo`). Parsed
 * from the ISO code rather than assuming a symbol, and rounded to whole units for
 * readability - the teaser is not an accounting line.
 */
function formatMoney(major: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(major);
}

/** `2025-10-15` -> `October 2025`, without constructing a Date. */
function monthLabelOf(date: string): string {
  const [year, month] = date.split('-');
  return `${MONTHS[Number(month) - 1]} ${year}`;
}

/** `2025-09-15` -> `September`, without constructing a Date. */
function monthNameOf(date: string): string {
  return MONTHS[Number(date.split('-')[1]) - 1];
}

/** `[a]` -> `a`, `[a, b]` -> `a and b`, `[a, b, c]` -> `a, b and c`. */
function joinNames(names: string[]): string {
  if (names.length === 1) {
    return names[0];
  }
  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
