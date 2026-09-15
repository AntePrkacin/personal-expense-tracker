import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * The header the frontend proves itself with, and the one it reports the real
 * caller in.
 *
 * **Both are `x-demo-*` rather than standard names, deliberately.** The obvious
 * alternative for the second is `X-Forwarded-For` with `TRUST_PROXY_HOPS` raised
 * to match, and `docs/TODO.md` explains why that is worse than the state it
 * would replace: Express would then believe the header on **every** request from
 * anywhere, including one crafted by the caller, so a limiter keyed on it would
 * hand an attacker a fresh bucket per request. A private name that is trusted
 * only after `DEMO_SHARED_SECRET` has been presented cannot do that.
 */
export const DEMO_SECRET_HEADER = 'x-demo-secret';
export const DEMO_CLIENT_IP_HEADER = 'x-demo-client-ip';

/**
 * Where `DemoSecretGuard` records the caller the frontend named, once it has
 * decided the frontend is who it says it is.
 *
 * A property on the request rather than a re-read of the header, because the
 * tracker below must not be able to reach an unauthenticated one: an absent
 * property is the only shape in which "the secret did not match" reaches it.
 */
export const DEMO_CLIENT_IP_KEY = 'demoClientIp';

/**
 * Whether two secrets match, without leaking how far they matched.
 *
 * Hashed first so the comparison is over two 32-byte buffers whatever the inputs
 * were: `timingSafeEqual` throws on a length mismatch, and catching that throw
 * would put the length back into the timing.
 */
export function secretsMatch(presented: unknown, expected: string): boolean {
  if (typeof presented !== 'string') {
    return false;
  }

  const digest = (value: string) => createHash('sha256').update(value).digest();

  return timingSafeEqual(digest(presented), digest(expected));
}

/**
 * The bucket the `demo` throttler counts against.
 *
 * **`req.ip` is the frontend's egress for every browser visitor**, which is what
 * this exists to fix. `/demo` is a route handler on Vercel that calls this API
 * server-side, so before PET-86's limiter could see a visitor at all it saw one
 * address for all of them - five hand-outs an hour shared by the entire
 * internet, while anybody calling the public Cloud Run URL directly got a bucket
 * of their own. The frontend now names the browser it is acting for and
 * `DemoSecretGuard` copies that onto the request **only** once the shared secret
 * has checked out.
 *
 * The fallback is `req.ip`, and it is not a hole: a caller who reaches this
 * route without the secret has already been refused by the guard, so the only
 * requests that fall back are ones the frontend sent without naming anybody.
 */
export function trackByDemoClient(req: Record<string, unknown>): string {
  const named = req[DEMO_CLIENT_IP_KEY];
  if (typeof named === 'string' && named.length > 0) {
    return named;
  }

  return typeof req.ip === 'string' ? req.ip : '';
}
