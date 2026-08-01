import { v7 as uuidv7 } from 'uuid';

/**
 * Primary keys are UUIDv7: time-ordered (better B-tree locality than v4) and
 * generatable on a client, which matters once offline sync lands.
 *
 * Everything goes through this helper rather than importing `uuid` directly so
 * the generator stays swappable and easy to stub in tests.
 */
export function newId(): string {
  return uuidv7();
}

/**
 * Guard for values that are interpolated into filesystem paths and Turso
 * database names (see UserDatabaseService). Any UUID version is accepted: the
 * point is to reject path traversal and injection, not to police the version.
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
