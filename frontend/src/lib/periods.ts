import { redirect } from 'next/navigation';

import { ACCESS_ROUTES } from '@/lib/routes';
import { authorizedGet } from '@/lib/session';
import type { operations } from '@/types/api';

// The period select's data source. One request, no filters, no probe - `lib/dashboard.ts`'s shape
// exactly, and for the same reason: the endpoint takes no parameters, so there is no ambiguous-empty
// case for a second request to resolve.
//
// **The `?period=` half of this lives in `lib/periodParams.ts`, and the split is a build constraint
// rather than a preference.** `periodHref` is called by `(app)/PeriodSelect.tsx`, a Client Component,
// and this module imports `authorizedGet` - which reads `next/headers`, which `next build` refuses to
// pull into a client bundle. So the pure URL functions sit in a module that imports nothing, exactly
// as `transactions/filters.ts` holds that screen's URL half beside `lib/transactions.ts`'s read.
//
// **This read exists because a period is no longer derivable on the frontend, which is the whole of
// what PET-72 changed here.** `lib/format.ts`'s `periodOverline` and `periodLabel` compute a period's
// name from `monthStartDay` and today - correct while every period was one calendar month offset by a
// fixed day, and wrong the moment a pay-day change stretches one period across the gap. There is no
// arithmetic over `monthStartDay` that produces "December 2025 / January 2026", because the fact that
// makes it two months is a `period_rules` row this app cannot see. So the list of periods and each
// one's label are the backend's to answer.

/** `GET /api/periods`'s 200, read from the contract rather than declared. */
export type PeriodsView =
  operations['PeriodsController_list']['responses'][200]['content']['application/json'];

/** One period, as the select's options are built from. */
export type Period = PeriodsView['periods'][number];

/**
 * Every period the account has, newest first, or the access flow.
 *
 * The failure policy is `lib/dashboard.ts`'s and `lib/profile.ts`'s, deliberately identical: only a
 * 401 or a missing cookie means signed out, and everything else throws so Next's error boundary
 * renders something a reload retries.
 *
 * **It throws rather than degrading to an empty list**, which is the opposite of
 * `lib/categoryTemplates.ts`'s policy and worth the contrast. That read backs a *selection* on a step
 * whose Continue is unconditional, so losing it costs the user their starter categories rather than
 * the flow. This one backs the control that says which period every figure on the screen belongs to:
 * an empty list would render a header naming no period over figures that are all scoped to one, which
 * is a screen that lies rather than a screen with a gap.
 */
export async function readPeriods(): Promise<PeriodsView> {
  const result = await authorizedGet<PeriodsView>('/api/periods');

  if (result.ok) {
    return result.data;
  }

  if (result.reason === 'unauthenticated') {
    redirect(ACCESS_ROUTES.login);
  }

  throw new Error('Could not load your budgeting periods: the backend did not answer.');
}

// **`currentPeriod(view)` used to sit here and PET-76 deleted it**, which is worth a line because
// what it did looks like something this module should still offer. It answered "the period
// containing today" by finding the entry the backend flags `current`, falling back to the first -
// and its only two callers were the assistant's two page headers, which named the current period
// over a conversation that belongs to no period. Both are fixed literals now, so the function had
// zero callers. It is deleted rather than left available, because the two screens that legitimately
// want a period - the dashboard and the categories tab - read the one their **own** response
// resolved, and a helper that derives it from a second request is how those two figures come to
// disagree. A screen that needs the current period should take it off the read whose figures it is
// labelling.
