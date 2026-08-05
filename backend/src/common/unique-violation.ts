/**
 * Whether an error is SQLite's UNIQUE constraint failure for one named column.
 *
 * Three things make this less obvious than matching a string, and all three were
 * found by a test that forces a real collision rather than asserting a
 * hand-written message.
 *
 * **Drizzle wraps every driver error**, so `error.message` is the failed SQL
 * (`Failed query: insert into "insight_sets" ...`) and the constraint text is only
 * reachable through `cause`. Reading the top-level message alone silently never
 * matches: the wrapper does happen to contain the table and the column names,
 * being the SQL, so a predicate looking for those finds them and then fails on the
 * word "unique" that only the inner error carries. The caller's intended 409 then
 * becomes a generic 500 with no symptom short of racing the endpoint - which is
 * exactly how this shipped, in two places.
 *
 * **`@tursodatabase/database` wraps SQLite's wording rather than replacing it**, so
 * the payload underneath reads `step failed: Runtime error: UNIQUE constraint
 * failed: <table>.<column> (19)`.
 *
 * **Nothing here may use `instanceof Error`.** The driver constructs its error
 * inside its own ESM module, and under Jest's module registry that is a different
 * realm with a different `Error` global, so `cause instanceof Error` is `false` for
 * an object that is plainly an Error and prints as one. The walk is duck-typed on
 * `message` and `cause` instead, which is correct in both realms and needs no test
 * environment carve-out.
 *
 * The column is matched and not just the table, because a primary-key collision on
 * the same table is a broken invariant rather than the conflict the caller means to
 * translate: `insight_sets.id` must not read as `insight_sets.status`.
 *
 * @param qualifiedColumn the column SQLite names, as `table.column`.
 */
export function isUniqueViolation(
  error: unknown,
  qualifiedColumn: string,
): boolean {
  const column = qualifiedColumn.replace(/\./g, '\\.');
  const constraint = new RegExp(`unique constraint failed:.*${column}`, 'i');

  // Depth-capped rather than while-truthy: `cause` is attacker-free but a cycle
  // would still hang the request, and no real chain is more than two deep.
  let cursor: unknown = error;
  for (let depth = 0; cursor != null && depth < 5; depth++) {
    const message = messageOf(cursor);

    if (message !== undefined && constraint.test(message)) {
      return true;
    }

    cursor = propertyOf(cursor, 'cause');
  }

  return false;
}

/** A string error, or anything carrying a string `message`. */
function messageOf(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  const message = propertyOf(value, 'message');

  return typeof message === 'string' ? message : undefined;
}

function propertyOf(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;
}
