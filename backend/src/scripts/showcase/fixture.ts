/**
 * The shape of a generated showcase account.
 *
 * **No absolute dates anywhere, deliberately.** A transaction carries the month
 * it falls in (`monthsAgo`, counting back from whenever the seed is run) and the
 * day within that month, and the seeder resolves the pair against today. An
 * absolute date would age: a fixture generated in March would seed an account
 * whose "current month" was March forever.
 *
 * A fixture describes the account **completely** - the profile, the caps and the
 * transactions - so the seeder can be mechanical rather than having to know
 * anything about the model that produced it.
 *
 * PET-69 will add a committed `fixture.json` and a command that writes it. This
 * file carries only the type until then, which is what lets the generator, the
 * seeder and the checker already speak one language.
 */

/**
 * One transaction, positioned relative to the month the seed is run in.
 *
 * `monthsAgo` 0 is the month containing the seeding day; `day` is 1 to 28, for
 * the same reason the profile constrains `monthStartDay` to that range - every
 * month has those days, so there is no clamping case. The category is named
 * rather than identified, because ids belong to an account that does not exist
 * when this is generated.
 */
export type FixtureTransaction = {
  monthsAgo: number;
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
