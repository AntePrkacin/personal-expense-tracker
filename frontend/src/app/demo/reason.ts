// Why a demo hand-out did not sign anybody in, shared by the handler that decides it
// and the screen that renders it.
//
// Its own module for the reason `auth/verify/failed/reason.ts` is one: neither side
// imports the other, so `route.ts` does not pull in a React component to name a string
// and `page.tsx` does not pull in a route handler. It is also what stops the two
// drifting - the handler cannot redirect to a reason the screen has no copy for,
// because `npm run build` would reject it.

/**
 * The three outcomes, keyed to what the backend answered.
 *
 * Three rather than one because the advice genuinely differs, and one of them is not
 * really a failure at all: `busy` means every account is in use and coming back in a
 * minute will work, `disabled` means this deployment never had a demo, and `failed` is
 * everything else.
 *
 * **`busy` and `failed` must stay distinct**, which is the lesson
 * `docs/agents/api-contract.md` draws from the assistant's 502: the backend answers a
 * real, meaningful 503 for an exhausted pool, and a network fault that never reached it
 * also looks like "no response". Collapsing them would tell a visitor that ten people
 * are ahead of them when the truth is that nothing answered at all - a specific,
 * confident claim built out of no information.
 */
export const DEMO_FAILURE_REASONS = ['busy', 'disabled', 'failed'] as const;

export type DemoFailureReason = (typeof DEMO_FAILURE_REASONS)[number];

/**
 * The reason a URL is claiming, or `failed` for anything else.
 *
 * **Validated rather than trusted**, the same call `parseReason` makes one route over:
 * a query parameter is typed by whoever is holding the address bar and this value
 * chooses the heading and copy. `failed` is the safe fallback because it claims the
 * least - it says something went wrong without promising that waiting will help.
 */
export function parseDemoReason(value: string | undefined): DemoFailureReason {
  return DEMO_FAILURE_REASONS.includes(value as DemoFailureReason)
    ? (value as DemoFailureReason)
    : 'failed';
}
