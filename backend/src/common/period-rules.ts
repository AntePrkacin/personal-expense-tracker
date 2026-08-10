import {
  addDays,
  addMonths,
  formatDate,
  parseDate,
  type MonthWindow,
} from './month-window';

/**
 * The period walk: how an append-only list of `period_rules` rows becomes the
 * sequence of budgeting periods the whole app buckets by.
 *
 * **Pure, and deliberately so.** Nothing here reads a database, a clock or a
 * config value; every function takes the rules and a date and returns a value.
 * `PeriodService` is the only thing that loads rows and the only thing that
 * knows what "today" is, which is what lets every case below be pinned by a
 * spec with no fixtures and no faked timers.
 *
 * ## What a rule means
 *
 * A rule is anchored to **T** (`effectiveFrom`), the first paycheck date under
 * the schedule it describes, and it tiles plain month arithmetic forward from
 * there on its own `monthStartDay`. The **earliest** rule also extends backward
 * without limit, so an account has a period for any date it can hold a
 * transaction on, including one backdated before it existed. The **latest** rule
 * extends forward without limit, so there is always a current period and always
 * a next one.
 *
 * ## Why there is a transition period
 *
 * Salaries are paid in arrears, so a schedule change makes one paycheck simply
 * never arrive: the old rule's boundary immediately before T is removed. Keeping
 * it would open a period no money was ever paid into, and the user would see a
 * budget they never received. So between two rules' segments sits exactly one
 * **stretched transition period**, from the last kept old boundary to T. It is
 * longer than a month, it keeps the **old** budget (the money that had to last
 * through it was paid under the old schedule), and its start is read from the
 * newer rule's stored `transitionStart` rather than re-derived here.
 *
 * That storage choice is what keeps this walk dumb, and it is the reason the
 * walk can be pure. Deciding which old boundary survived is a **write-time**
 * question - it depends on the schedule the user was actually on when they
 * submitted the change - and `transitionStartFor` below answers it once, at the
 * write. Re-deriving it on every read would mean re-litigating that decision
 * forever, against rules that may since have been corrected.
 *
 * ## The invariant every rule carries
 *
 * `effectiveFrom`'s day-of-month always equals `monthStartDay`. T *is* a
 * paycheck date and a period starts on every paycheck, so a rule whose anchor
 * fell on some other day would describe a first period that starts on a day no
 * later period ever starts on. It is asserted rather than assumed, because a
 * violation would otherwise surface as periods that quietly fail to tile.
 */

/** A budgeting period: a half-open window plus the name a screen shows for it. */
export interface Period extends MonthWindow {
  /** Human label, e.g. `October 2025` or `December 2025 / January 2026`. */
  label: string;
}

/**
 * One `period_rules` row, narrowed to what the walk reads.
 *
 * Structural rather than the drizzle row type, so a spec can write a rule as a
 * literal and the walk cannot come to depend on a column it has no business
 * reading.
 */
export interface PeriodRule {
  /** T, `YYYY-MM-DD`. Its day-of-month equals `monthStartDay`. */
  effectiveFrom: string;
  /** Day of month each period under this rule starts on, 1-28. */
  monthStartDay: number;
  /**
   * Start of the stretched transition period leading into `effectiveFrom`.
   * NULL on the earliest rule, which has no predecessor to bridge from.
   */
  transitionStart: string | null;
}

/**
 * Highest `monthStartDay` a rule may carry.
 *
 * 28 so every month has the day and there is no clamping case: a period
 * starting on the 31st would have to mean the 28th in February and the 30th in
 * April, and "the same day next month" would stop being a function.
 */
export const MAX_MONTH_START_DAY = 28;

const MONTH_NAMES = [
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
] as const;

/**
 * The period containing `date`, under whichever rule was in force for it.
 *
 * This is the whole walk: `nextPeriod`, `previousPeriod` and `periodsBetween`
 * are all defined in terms of it, so there is exactly one implementation of
 * "which period does this day belong to" and no second copy to disagree with.
 *
 * @param rules Every rule the account has, in any order. Must not be empty -
 * provisioning seeds one, so an account with none is a broken invariant rather
 * than a state to render.
 */
export function periodFor(rules: readonly PeriodRule[], date: string): Period {
  const sorted = assertRules(rules);
  parseDate(date);

  // The last rule already in force on `date`, or -1 when `date` predates them
  // all. A plain scan: an account has a handful of rules, so an ordered walk is
  // cheaper to read than a binary search and impossible to get wrong.
  let index = -1;
  for (let k = 0; k < sorted.length; k += 1) {
    if (sorted[k].effectiveFrom <= date) index = k;
  }

  // Earlier than the earliest rule, which extends backward without limit. Its
  // boundaries land exactly on `effectiveFrom` walking back, because that date's
  // day-of-month *is* the rule's `monthStartDay` - the asserted invariant - so
  // there is no seam here to clamp.
  if (index === -1) {
    return labelled(tile(sorted[0].monthStartDay, date));
  }

  const rule = sorted[index];
  const next = sorted[index + 1];

  // The latest rule extends forward without limit.
  if (!next) {
    return labelled(tile(rule.monthStartDay, date));
  }

  const bridge = bridgeInto(rule, next);

  // At or past the bridge: inside the one stretched transition period. Reached
  // only when a transition really exists - `index` is the *last* rule at or
  // before `date`, so `date` is always earlier than `next.effectiveFrom`, and a
  // zero-length transition (bridge === T) therefore matches nothing here.
  if (date >= bridge) {
    return labelled({ start: bridge, end: next.effectiveFrom });
  }

  // Ordinary tiling, with the final period of the segment ending at the bridge
  // rather than a month later. A stored bridge always falls on one of this
  // rule's own boundaries, in which case the clamp changes nothing; it is
  // written as a clamp anyway so a hand-written or corrected row cannot produce
  // a period that overlaps the transition.
  const window = tile(rule.monthStartDay, date);
  return labelled({
    start: window.start,
    end: window.end < bridge ? window.end : bridge,
  });
}

/** The period immediately after `period`. */
export function nextPeriod(
  rules: readonly PeriodRule[],
  period: MonthWindow,
): Period {
  // `end` is exclusive, so it is the next period's first day by construction.
  return periodFor(rules, period.end);
}

/**
 * The period immediately before `period`.
 *
 * "The period containing the day before this one starts", never "one month
 * earlier": across a transition the previous period is longer than a month, and
 * fixed arithmetic would land inside it rather than on its start.
 */
export function previousPeriod(
  rules: readonly PeriodRule[],
  period: MonthWindow,
): Period {
  return periodFor(rules, addDays(period.start, -1));
}

/**
 * Every period from the one containing `from` to the one containing `to`,
 * oldest first.
 *
 * Both ends are inclusive of their *containing* period, so a `from` in the
 * middle of a period yields that whole period rather than a fragment of it.
 */
export function periodsBetween(
  rules: readonly PeriodRule[],
  from: string,
  to: string,
): Period[] {
  if (to < from) {
    throw new Error(
      `periodsBetween needs from <= to, received "${from}" to "${to}".`,
    );
  }

  const periods: Period[] = [];
  let period = periodFor(rules, from);

  while (period.start <= to) {
    periods.push(period);
    const following = nextPeriod(rules, period);
    // Every period is non-empty, so this cannot fail - and if a future edit
    // makes it fail, it must not do so by hanging the request.
    if (following.start <= period.start) {
      throw new Error(
        `Period walk failed to advance past "${period.start}"; rules are inconsistent.`,
      );
    }
    period = following;
  }

  return periods;
}

/**
 * How far back provisioning anchors an account's first rule.
 *
 * **The anchor of the earliest rule is a floor, not a claim**, which is what makes
 * this number free to choose: the earliest rule extends backward without limit, so
 * moving its anchor earlier produces byte-identical periods. What it changes is
 * what a *retroactive* schedule change can reach. Anchored at the current period,
 * as it was first written, every retroactive change landed **before** the seed rule
 * and left the account claiming the old pay day for a span the user had just said
 * was on the new one - two rules governing one stretch, which the walk cannot
 * resolve coherently.
 *
 * A year, because the Settings modal offers four months either way and an API
 * caller reaching further back is rare enough to be worth a clear 400 rather than
 * an unbounded floor. `PeriodService.changeSchedule` refuses an anchor earlier than
 * the earliest rule, so the boundary is explicit rather than silently wrong, and
 * `PeriodService.all()` bounds the period list by the account's transactions rather
 * than by this date - so a generous floor costs nothing in the period select.
 */
export const SEED_ANCHOR_MONTHS_BACK = 12;

/**
 * The occurrence of `monthStartDay` `monthsBack` months before `date`'s own.
 *
 * With the default `monthsBack` of 0 this is the most recent occurrence at or
 * before `date` - which is the anchor a **schedule change** uses, since T is a real
 * paycheck date. Provisioning passes `SEED_ANCHOR_MONTHS_BACK`; see that constant
 * for why the first rule wants a floor rather than today's boundary.
 *
 * A rule's `effectiveFrom` has to fall on its own `monthStartDay`, so "today" is
 * never a legal anchor unless today happens to be pay day - and anchoring forward
 * to the *next* pay day would leave the period the user is standing in governed by
 * nothing.
 *
 * Exported so provisioning does not have to reimplement the tiling, or reach for
 * the walk with a bootstrap rule it has not written yet.
 */
export function mostRecentAnchor(
  monthStartDay: number,
  date: string,
  monthsBack = 0,
): string {
  assertMonthStartDay(monthStartDay);

  const recent = tile(monthStartDay, date).start;
  if (monthsBack === 0) {
    return recent;
  }

  const { year, month } = parseDate(recent);
  const shifted = addMonths(year, month, -monthsBack);

  return formatDate(shifted.year, shifted.month, monthStartDay);
}

/**
 * The rule that governs `date`: the latest one anchored at or before it.
 *
 * Falls back to the **earliest** rule for a date before them all, matching the
 * walk's own backward extension - the first rule is what shaped every period
 * older than itself, so it is the rule in force there too.
 *
 * Two callers, and they want it for opposite reasons. The schedule write needs
 * the rule a user is actually on before it can work out which of its boundaries a
 * change removes; the profile read needs it to report `monthStartDay` as the day
 * the user is being paid on right now rather than one a future rule will impose.
 */
export function ruleInForceAt(
  rules: readonly PeriodRule[],
  date: string,
): PeriodRule {
  const sorted = assertRules(rules);
  parseDate(date);

  let inForce = sorted[0];
  for (const rule of sorted) {
    if (rule.effectiveFrom <= date) inForce = rule;
  }

  return inForce;
}

/**
 * Where the stretched transition period into `firstPaycheckDate` starts, given
 * the rule the user is on now. **Write-time only**; the result is stored on the
 * new rule and the walk reads it back.
 *
 * The rule, worked through the concrete case: on a 1st-of-month schedule
 * changing to a 14th, with T = 2026-01-14, the old boundary immediately before T
 * is 2026-01-01 and that paycheck never arrives, so the last kept boundary is
 * 2025-12-01 and December stretches to 14 January.
 *
 * @param activeRule The rule in force at `firstPaycheckDate`.
 * @param firstPaycheckDate T, the first paycheck date under the new schedule.
 * May be in the past or the future.
 */
export function transitionStartFor(
  activeRule: PeriodRule,
  firstPaycheckDate: string,
): string {
  assertRule(activeRule);
  parseDate(firstPaycheckDate);

  // The latest old boundary strictly before T. Taken from the day *before* T
  // rather than from T itself, because T may fall exactly on an old boundary and
  // that boundary is one of the ones arrears removes.
  const removed = tile(
    activeRule.monthStartDay,
    addDays(firstPaycheckDate, -1),
  ).start;
  const { year, month } = parseDate(removed);
  const kept = addMonths(year, month, -1);
  const start = formatDate(kept.year, kept.month, activeRule.monthStartDay);

  // Clamped at the active rule's own anchor, for the account that changes
  // schedule twice inside two periods: the boundary a month before the removed
  // one may predate this rule entirely, and reaching past the anchor would
  // delete the previous change's own T. Clamping instead makes the whole of the
  // short-lived rule one transition period, which is what it factually was.
  return start > activeRule.effectiveFrom ? start : activeRule.effectiveFrom;
}

/**
 * The name a screen shows for a period, from the months it actually covers.
 *
 * A period is named after every month it touches, decided on its **last
 * included day** rather than its exclusive end - so a 1st-to-1st period reads
 * "October 2025" while the same account paid on the 25th reads "October /
 * November 2025", which is what those five weeks genuinely are. A stretched
 * transition period is what makes this worth having: labelling by start month
 * alone would print "December 2025" over a window running to 14 January.
 *
 * The year is written once when both months share it, twice when they do not.
 * Month names are a frozen English list rather than `Intl`: formatting a month
 * name through `Intl` needs a `Date`, and constructing one from a calendar date
 * is the timezone shift this whole module exists to avoid.
 */
export function periodLabel(start: string, end: string): string {
  if (end <= start) {
    throw new Error(
      `A period must be non-empty, received "${start}" to "${end}".`,
    );
  }

  const first = parseDate(start);
  const last = parseDate(addDays(end, -1));

  if (first.year === last.year) {
    return first.month === last.month
      ? `${MONTH_NAMES[first.month]} ${first.year}`
      : `${MONTH_NAMES[first.month]} / ${MONTH_NAMES[last.month]} ${first.year}`;
  }

  return `${MONTH_NAMES[first.month]} ${first.year} / ${MONTH_NAMES[last.month]} ${last.year}`;
}

/**
 * One rule's plain month tiling: the window containing `date` on that rule's
 * `monthStartDay`, ignoring every other rule.
 *
 * This is `month-window.ts`'s old `monthWindow`, moved here because it is now
 * one step inside the walk rather than the app's answer to "which month is
 * this". Bounds are `YYYY-MM-DD`, `start` inclusive and `end` exclusive, so a
 * query reads `date >= start and date < end`: text compared against the text
 * column the schema stores, served as a range scan by `transactions_date_idx`,
 * with no last-day-of-month arithmetic anywhere.
 */
function tile(monthStartDay: number, date: string): MonthWindow {
  const { year, month, day } = parseDate(date);

  // Before the start day, the period began in the previous month.
  const start =
    day >= monthStartDay ? { year, month } : addMonths(year, month, -1);
  const end = addMonths(start.year, start.month, 1);

  return {
    start: formatDate(start.year, start.month, monthStartDay),
    end: formatDate(end.year, end.month, monthStartDay),
  };
}

/**
 * Where `next`'s transition period starts, as the walk should treat it.
 *
 * Falls back to `next.effectiveFrom` for a missing `transitionStart`, which
 * yields no transition period at all rather than a guess, and clamps at `rule`'s
 * own anchor so a bridge cannot reach back past the rule it bridges from.
 */
function bridgeInto(rule: PeriodRule, next: PeriodRule): string {
  const stored = next.transitionStart ?? next.effectiveFrom;
  return stored > rule.effectiveFrom ? stored : rule.effectiveFrom;
}

/** Attaches the label, so no caller has to remember to. */
function labelled(window: MonthWindow): Period {
  return { ...window, label: periodLabel(window.start, window.end) };
}

/**
 * Sorts a copy and checks every rule, returning the order the walk relies on.
 *
 * Sorting here rather than trusting the caller makes every function total: the
 * service reads rows ordered, and a walk that silently produced overlapping
 * periods for an unordered array would be a bug nothing would catch.
 */
function assertRules(rules: readonly PeriodRule[]): PeriodRule[] {
  if (rules.length === 0) {
    throw new Error(
      'An account must have at least one period rule; provisioning seeds one.',
    );
  }
  rules.forEach(assertRule);
  return [...rules].sort((a, b) =>
    a.effectiveFrom < b.effectiveFrom
      ? -1
      : a.effectiveFrom > b.effectiveFrom
        ? 1
        : 0,
  );
}

function assertMonthStartDay(monthStartDay: number): void {
  if (
    !Number.isInteger(monthStartDay) ||
    monthStartDay < 1 ||
    monthStartDay > MAX_MONTH_START_DAY
  ) {
    throw new Error(
      `monthStartDay must be an integer between 1 and ${MAX_MONTH_START_DAY}, received ${monthStartDay}.`,
    );
  }
}

function assertRule(rule: PeriodRule): void {
  assertMonthStartDay(rule.monthStartDay);

  const { day } = parseDate(rule.effectiveFrom);
  if (day !== rule.monthStartDay) {
    throw new Error(
      `A rule's effectiveFrom must fall on its own monthStartDay, received "${rule.effectiveFrom}" for day ${rule.monthStartDay}.`,
    );
  }
}
