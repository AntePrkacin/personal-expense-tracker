import { redirect } from 'next/navigation';

import { ACCESS_ROUTES } from '@/lib/routes';
import { authorizedGet } from '@/lib/session';
import type { operations } from '@/types/api';

// The dashboard read. One request, always: the endpoint takes no filters at all, so unlike
// `lib/transactions.ts` there is no ambiguous-empty case and no probe.

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
export async function readDashboard(): Promise<DashboardSummary> {
  const result = await authorizedGet<DashboardSummary>('/api/dashboard');

  if (result.ok) {
    return result.data;
  }

  if (result.reason === 'unauthenticated') {
    redirect(ACCESS_ROUTES.login);
  }

  throw new Error('Could not load your dashboard: the backend did not answer.');
}
