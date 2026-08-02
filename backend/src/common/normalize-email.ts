/**
 * The one definition of "the same address".
 *
 * Shared rather than repeated because two places have to agree exactly: the
 * DTOs, whose normalization is what makes the partial unique index on
 * `users.email` hold (SQLite could do it with `COLLATE NOCASE`, but Drizzle's
 * column builder cannot express that), and the rate-limit tracker, which runs
 * in a guard - before pipes - and therefore sees the raw body rather than the
 * transformed DTO. If those two diverged, `Foo@x.com` and `foo@x.com` would
 * land in separate throttle buckets and the per-email half of the defense would
 * quietly stop working.
 *
 * @returns the normalized address, or undefined if the value was not a string.
 * Callers in a DTO pass non-strings through untouched so `@IsEmail` reports the
 * type error itself.
 */
export function normalizeEmail(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim().toLowerCase() : undefined;
}
