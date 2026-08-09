import { redirect } from 'next/navigation';

import { ACCESS_ROUTES } from '@/lib/routes';
import { authorizedGet, type AuthorizedResult } from '@/lib/session';
import type { operations } from '@/types/api';

// The AI Insights read. One request, always: `GET /api/insights` serves the whole screen -
// the state the page renders from and the latest ready set's content beside it - so there is
// no ambiguous-empty case and no probe, the same as `lib/dashboard.ts`.
//
// **It has two exports because it has two callers, and they answer a dead session
// differently.** `readInsights` returns `AuthorizedResult` the way `lib/categories.ts` does,
// leaving the policy to the call site; `requireInsights` applies the Server Component's
// policy on top. The route handler beside it in `app/api/insights/route.ts` cannot use the
// second: a `redirect()` there hands the browser's poll an HTML login page with a 200 on it,
// which is exactly the failure that keeps `lib/categories.ts` from redirecting internally.
//
// **The generate half is deliberately not here**, and could not be. `'use server'` makes
// every export of a module a Server Action and an action must be an async function, so a
// single `lib/insights.ts` holding both the read and the trigger is not buildable - the same
// fact `lib/createTransaction.ts` records about why it is not inside `lib/transactions.ts`.
// `lib/generateInsights.ts` is the other half.

/** `GET /api/insights`'s 200, read from the contract rather than declared. */
export type InsightSet =
  operations['InsightsController_get']['responses'][200]['content']['application/json'];

/**
 * The lifecycle the page renders from: `empty`, `generating` or `ready`.
 *
 * Pulled out because three components and the poll all branch on it, and because a bare
 * `InsightSet['state']` at four call sites reads as four unrelated string unions.
 */
export type InsightState = InsightSet['state'];

/** One card, for the components that draw them. */
export type InsightCard = InsightSet['insights'][number];

/**
 * Reads the insight set, leaving the failure policy to the caller.
 *
 * `AuthorizedResult` reused rather than a result type of its own, for the reason
 * `lib/categories.ts` gives: the two failures are exactly `authorizedGet`'s two and nothing
 * here can add a third. The endpoint answers no 404 - an account with nothing generated is a
 * 200 carrying `state: 'empty'` - so the `missing` arm is unreachable and collapses into
 * `unavailable` at every caller.
 */
export async function readInsights(): Promise<AuthorizedResult<InsightSet>> {
  return authorizedGet<InsightSet>('/api/insights');
}

/**
 * The Server Component's read: the set, or the access flow.
 *
 * The failure policy is `lib/dashboard.ts`'s and `lib/profile.ts`'s, deliberately identical:
 * only a 401 or a missing cookie means signed out, and everything else throws so
 * `app/error.tsx` renders something a reload retries. This read sits inside the same shell
 * that read the profile a moment earlier, so redirecting an unreachable backend to `/login`
 * is the loop those two files already document.
 */
export async function requireInsights(): Promise<InsightSet> {
  const result = await readInsights();

  if (result.ok) {
    return result.data;
  }

  if (result.reason === 'unauthenticated') {
    redirect(ACCESS_ROUTES.login);
  }

  throw new Error('Could not load your insights: the backend did not answer.');
}
