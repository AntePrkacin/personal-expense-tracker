/**
 * What a verified link hands back: a session, and when it dies.
 *
 * Nothing about the user is in here. `GET /api/auth/session` exists precisely to
 * answer "who am I", so duplicating the identity into this response would give
 * the frontend two sources for it and no reason to prefer either.
 */
export class VerifyResponseDto {
  /**
   * The raw session token, to be sent back as `Authorization: Bearer <token>`.
   *
   * The only place it ever appears in a response - the server keeps its hash.
   * The frontend puts it in an httpOnly, first-party cookie and forwards it
   * server-side; it must never reach client-side JavaScript.
   */
  token!: string;

  /** ISO 8601. Fixed at issue: using the session does not extend it. */
  expiresAt!: string;
}
