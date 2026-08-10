import { redirect } from 'next/navigation';

import { ACCESS_ROUTES } from '@/lib/routes';
import { authorizedGet } from '@/lib/session';
import type { operations } from '@/types/api';

// The dashboard read. One request, always: there is no ambiguous-empty case and no probe, unlike
// `lib/transactions.ts`.
//
// **It takes a period as of PET-72**, which is the one filter the endpoint has. The sentence above used
// to say it "takes no filters at all" - still the reason there is no probe, since a period is not a
// filter that can match nothing: it either names one of the caller's periods or answers 400.

/** `GET /api/dashboard`'s 200, read from the contract rather than declared. */
export type DashboardSummary =
  operations['DashboardController_get']['responses'][200]['content']['application/json'];

/**
 * The dashboard's one read, or the access flow.
 *
 * The failure policy is `lib/profile.ts`'s and `lib/transactions.ts`'s, deliberately
 * identical: only a 401 or a missing cookie means signed out, and everything else throws so
 * Next's error boundary renders something a reload retries. This read sits inside the same
 * shell that read the profile a moment earlier, so redirecting an unreachable backend to
 * `/login` is the loop those two files already document.
 */
export async function readDashboard(period?: string): Promise<DashboardSummary> {
  // The absent key is the current period, which is `transactions/filters.ts`'s rule and
  // `lib/periods.ts`'s: one view has one URL, and the URL meaning "now" is the one with nothing in it.
  const query = period === undefined ? '' : `?period=${period}`;
  const result = await authorizedGet<DashboardSummary>(`/api/dashboard${query}`);

  if (result.ok) {
    return result.data;
  }

  if (result.reason === 'unauthenticated') {
    redirect(ACCESS_ROUTES.login);
  }

  throw new Error('Could not load your dashboard: the backend did not answer.');
}
