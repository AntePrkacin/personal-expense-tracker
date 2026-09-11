import { newId } from '../common/ids';
import {
  TURSO_MAX_DB_NAME_LENGTH,
  USER_DB_NAME_PREFIX,
  userDbName,
} from './database.constants';

/**
 * The one property of a database name that no other gate in this repository can
 * see.
 *
 * `userDbName` is built here, stored in `users.db_name` at registration, and
 * sent to Turso only when an account is verified for the first time. A build, a
 * lint and a type check all pass on a name of any length, and **both test
 * suites run in local mode**, where the name becomes a filename and no limit
 * applies. So a name one character too long is green everywhere and fails on
 * the first real provisioning call - which is exactly what happened: every
 * attempt to create an account answered
 * `invalid database name: name must contain between 1 and 51 characters`,
 * because the prefix at the time, `spendifico-user-` (16), plus a UUIDv7 (36)
 * is 52. The prefix is `expenso-user-` now, which is shorter - the stripping
 * stays for the headroom, and this guard is what makes either safe.
 *
 * This file is the cheap half of the guard. The expensive half is provisioning
 * against real Turso, which neither CI nor the e2e suite does by design.
 */
describe('userDbName', () => {
  it('fits inside Turso’s name limit, with the real id length', () => {
    // A generated id rather than a literal, so the assertion tracks whatever
    // `newId` actually produces. A hand-written fixture is how a length check
    // ends up measuring the fixture instead of the thing.
    const name = userDbName(newId());

    expect(name.length).toBeLessThanOrEqual(TURSO_MAX_DB_NAME_LENGTH);
  });

  it('holds for every id the generator makes, not just a lucky one', () => {
    const longest = Array.from({ length: 200 }, () => userDbName(newId()))
      .map((name) => name.length)
      .reduce((a, b) => Math.max(a, b), 0);

    expect(longest).toBeLessThanOrEqual(TURSO_MAX_DB_NAME_LENGTH);
  });

  it('keeps the prefix and carries the id with its hyphens removed', () => {
    const id = '01a0909f-d772-77a8-9829-17d8f12b8108';

    // Both halves matter. The prefix is what namespaces these databases inside a
    // shared Turso organization, and stripping the hyphens is the four
    // characters that buy the name its headroom.
    expect(userDbName(id)).toBe(
      `${USER_DB_NAME_PREFIX}01a0909fd77277a8982917d8f12b8108`,
    );
    expect(userDbName(id)).not.toContain('01a0909f-');
  });

  it('is deterministic, because a delete recomputes it rather than reading it', () => {
    const id = newId();

    expect(userDbName(id)).toBe(userDbName(id));
  });
});
