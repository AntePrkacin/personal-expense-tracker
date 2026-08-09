/**
 * The shape of a generated showcase account.
 *
 * **No absolute dates anywhere, deliberately.** A transaction carries the
 * calendar month it falls in (`month`, 0-11) and which recurrence of that
 * month it is (`occurrence`, 0 is the most recent), plus the day within the
 * month. The seeder turns the pair into `monthsAgo` against today via
 * `monthsAgoFor` and then into a date. An absolute date would age: a fixture
 * generated in March would seed an account whose "current month" was March
 * forever. Keying on the calendar rather than on a raw `monthsAgo` is what
 * lets `MONTH_TARGETS` give December the same band every time it recurs,
 * rather than whichever `monthsAgo` the dice happened to land it on.
 *
 * A fixture describes the account **completely** - the profile, the caps and the
 * transactions - so the seeder can be mechanical rather than having to know
 * anything about the model that produced it.
 *
 * `fixture.data.json` is the committed artifact `load()` and `save()` read and
 * write; both live here so the generator, the seeder and the checker keep
 * speaking one language about the file as well as the type.
 *
 * **Named `fixture.data.json`, not `fixture.json`, and that is load-bearing.**
 * A bare `import ... from './fixture'` anywhere in this directory - which
 * `seed-showcase.ts` does for real, at runtime, to reach `load()` - resolves
 * through Node's CommonJS algorithm, which tries `./fixture.js` **then
 * `./fixture.json`** before it tries the compiled `./fixture.ts` output. With
 * a same-named `fixture.json` sitting right here, every one of those imports
 * silently receives the JSON data instead of this module's exports - `load`
 * and `save` come back `undefined`, and nothing catches it until something
 * calls them. Confirmed by hand: `import * as m from './fixture'` printed
 * `['seed', 'months', 'profile', 'categories', 'transactions', 'default']`
 * once a same-named `fixture.json` existed alongside this file - the fixture's
 * own keys, not this module's. The `.data` segment is the whole fix, because
 * Node only appends known extensions to the exact specifier given; it never
 * matches a longer filename that merely starts the same way.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * One transaction, positioned relative to the calendar month it falls in.
 *
 * `month` is 0-11 (January is 0, matching `parseDate`); `occurrence` is which
 * recurrence of that month this is, 0 being the most recent. `day` is 1 to 28,
 * for the same reason the profile constrains `monthStartDay` to that range -
 * every month has those days, so there is no clamping case. The category is
 * named rather than identified, because ids belong to an account that does
 * not exist when this is generated.
 */
export type FixtureTransaction = {
  month: number;
  occurrence: number;
  day: number;
  merchant: string;
  category: string;
  amountCents: number;
};

/** The profile the account is provisioned with, in minor units. */
export type FixtureProfile = {
  firstName: string;
  lastName: string;
  currency: string;
  monthlyBudgetCents: number;
  monthStartDay: number;
};

/** One category and the cap it carries. Named, for the reason above. */
export type FixtureCategory = {
  name: string;
  capCents: number;
};

export type Fixture = {
  /** The faker seed that produced this, so a run can be reproduced. */
  seed: number;
  /** Months of history, the one containing the seeding day included. */
  months: number;
  profile: FixtureProfile;
  categories: readonly FixtureCategory[];
  transactions: readonly FixtureTransaction[];
};

/** Where the committed fixture lives, relative to this file rather than to `cwd`. */
const FIXTURE_PATH = join(__dirname, 'fixture.data.json');

/**
 * Transactions ordered so a regeneration diff is local rather than scattered
 * across the file.
 *
 * Descending `occurrence` first: the most recent cycle of the calendar (the
 * one most likely to change when a band or a cap is tuned) sorts to the top,
 * rather than being interleaved with the same twelve months three years back.
 */
function sortedTransactions(
  transactions: readonly FixtureTransaction[],
): FixtureTransaction[] {
  return [...transactions].sort(
    (a, b) =>
      b.occurrence - a.occurrence ||
      a.month - b.month ||
      a.day - b.day ||
      a.merchant.localeCompare(b.merchant),
  );
}

/**
 * Writes a fixture as one transaction per line.
 *
 * `JSON.stringify(fixture, null, 2)` turns ~2,200 transactions into ~13,000
 * lines of nested indentation, where a regeneration diff has to be read
 * bracket by bracket. One transaction per line keeps the diff at roughly one
 * line per changed row instead.
 */
export function save(fixture: Fixture, path: string = FIXTURE_PATH): void {
  const transactions = sortedTransactions(fixture.transactions);
  const lines = [
    '{',
    `  "seed": ${JSON.stringify(fixture.seed)},`,
    `  "months": ${JSON.stringify(fixture.months)},`,
    `  "profile": ${JSON.stringify(fixture.profile)},`,
    `  "categories": ${JSON.stringify(fixture.categories)},`,
    '  "transactions": [',
    transactions
      .map(
        (transaction, index) =>
          `    ${JSON.stringify(transaction)}${index < transactions.length - 1 ? ',' : ''}`,
      )
      .join('\n'),
    '  ]',
    '}',
    '',
  ];
  writeFileSync(path, lines.join('\n'));
}

/** Reads the committed fixture. No validation here - the seeder's is the check that matters. */
export function load(path: string = FIXTURE_PATH): Fixture {
  return JSON.parse(readFileSync(path, 'utf-8')) as Fixture;
}
