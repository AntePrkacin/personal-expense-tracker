/**
 * What a demo hand-out gives back: a session on a pooled account, and when it
 * dies.
 *
 * **Byte-identical in shape to `VerifyResponseDto`, and deliberately its own
 * class.** The two are the same thing said by two routes - a session and its
 * expiry - and reusing the auth DTO here would publish one schema whose
 * description has to cover both a verified login link and an anonymous demo,
 * and would tie a change in one flow to the other. The duplication is two
 * fields; the coupling would be permanent.
 *
 * Nothing identifies which account was leased. The frontend has no use for it,
 * `GET /api/auth/session` already answers "who am I", and naming the pooled
 * account in a public response would publish the addresses of every account in
 * the pool to anybody who asked.
 */
export class DemoSessionResponseDto {
  /**
   * The raw session token, to be sent back as `Authorization: Bearer <token>`.
   *
   * The only place it ever appears in a response - the server keeps its hash.
   * The frontend puts it in an httpOnly, first-party cookie and forwards it
   * server-side; it must never reach client-side JavaScript.
   */
  token!: string;

  /**
   * ISO 8601. Fixed at issue: using the session does not extend it.
   *
   * **This is the session's life, not the lease's.** A session runs for
   * `SESSION_TTL_D` days while the lease runs for `DEMO_LEASE_TTL_M` minutes,
   * so a visitor who leaves a tab open keeps a working session onto an account
   * that has since been handed to somebody else and rewritten under them. That
   * is accepted rather than overlooked: shortening the session to the lease
   * would sign a visitor out mid-demo, and the data they would see afterwards is
   * the same fixture they started with.
   */
  expiresAt!: string;
}
