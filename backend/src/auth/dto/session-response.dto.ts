/**
 * Who the bearer belongs to, and how long it has left.
 *
 * Deliberately just these three fields: the central directory holds an email and
 * a database pointer, and the name, currency and budget live in the user's own
 * database. The full profile is its own endpoint (PET-45), not a widening of
 * this one.
 */
export class SessionResponseDto {
  userId!: string;

  email!: string;

  /** ISO 8601, the same instant verification returned. */
  expiresAt!: string;
}
