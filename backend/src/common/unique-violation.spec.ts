import { isUniqueViolation } from './unique-violation';

/**
 * The shape here is not invented: it is what `@tursodatabase/database` under
 * Drizzle really throws, captured from a forced collision. The wrapped case is the
 * whole reason this helper exists - both call sites previously read only
 * `error.message`, which is the failed SQL, so neither ever matched and both
 * translated a conflict into a generic 500.
 */
const drizzleWrapped = (constraint: string) => {
  const error = new Error(
    'Failed query: insert into "insight_sets" ("id", "status") values (?, ?)\nparams: b,generating',
  );
  error.cause = new Error(
    `step failed: Runtime error: UNIQUE constraint failed: ${constraint} (19)`,
  );
  return error;
};

describe('isUniqueViolation', () => {
  it('sees through the wrapper Drizzle puts around the driver error', () => {
    expect(
      isUniqueViolation(
        drizzleWrapped('insight_sets.status'),
        'insight_sets.status',
      ),
    ).toBe(true);
  });

  it('still matches an unwrapped driver error', () => {
    const bare = new Error('UNIQUE constraint failed: users.email');

    expect(isUniqueViolation(bare, 'users.email')).toBe(true);
  });

  it('does not match a different column on the same table', () => {
    // A `newId()` primary-key clash is a broken invariant, not the conflict the
    // caller is translating, so it must reach the generic 500.
    expect(
      isUniqueViolation(
        drizzleWrapped('insight_sets.id'),
        'insight_sets.status',
      ),
    ).toBe(false);
  });

  it('does not match an unrelated write failure', () => {
    const locked = new Error('Failed query: insert into "insight_sets" ...');
    locked.cause = new Error('database is locked');

    expect(isUniqueViolation(locked, 'insight_sets.status')).toBe(false);
  });

  it('matches a cause from another realm, where instanceof Error is false', () => {
    // Not hypothetical: the driver builds its error inside its own ESM module, and
    // under Jest's module registry `cause instanceof Error` is false for an object
    // that prints as an Error and carries the constraint text. An instanceof-based
    // walk passes every hand-written test and then fails against the real driver.
    const foreign = {
      name: 'Error',
      message:
        'step failed: Runtime error: UNIQUE constraint failed: insight_sets.status (19)',
    };
    const wrapper = new Error('Failed query: insert into "insight_sets" ...');
    wrapper.cause = foreign;

    expect(foreign instanceof Error).toBe(false);
    expect(isUniqueViolation(wrapper, 'insight_sets.status')).toBe(true);
  });

  it('tolerates a non-Error and a cause cycle', () => {
    const looped = new Error('Failed query');
    looped.cause = looped;

    expect(isUniqueViolation('not an error', 'users.email')).toBe(false);
    expect(isUniqueViolation(looped, 'users.email')).toBe(false);
  });
});
