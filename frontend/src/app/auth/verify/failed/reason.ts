// Why a verify did not sign anybody in, shared by the handler that decides it and the
// screen that renders it.
//
// Its own module so neither of those imports the other: `route.ts` would otherwise pull
// in a React component to name a string, and `page.tsx` would pull in a route handler.
// It is also the reason the two cannot drift - the handler cannot redirect to a reason
// the screen has no copy for, because `npm run build` would reject it.

/**
 * The four outcomes, keyed to what the backend answered.
 *
 * A38 designs nothing for any of them, so this list is ours. It is four rather than one
 * because the advice genuinely differs: a replaced link means open the newest email, a
 * throttled one means wait, and a fault means try the same link again - which is still
 * live, unlike the other two.
 */
export const VERIFY_FAILURE_REASONS = ['invalid', 'superseded', 'busy', 'failed'] as const;

export type VerifyFailureReason = (typeof VERIFY_FAILURE_REASONS)[number];

/**
 * The reason a URL is claiming, or `failed` for anything else.
 *
 * **Validated rather than trusted**, the same call `parseDraft` makes about
 * sessionStorage and `readPendingEmail` makes about its cookie, and for the same reason:
 * a query parameter is typed by whoever is holding the address bar, and this value is
 * interpolated straight into the screen's heading and copy. `failed` is the safe
 * fallback because its wording claims the least - it says something went wrong without
 * telling the user their link is dead when it may not be.
 */
export function parseReason(value: string | undefined): VerifyFailureReason {
  return VERIFY_FAILURE_REASONS.includes(value as VerifyFailureReason)
    ? (value as VerifyFailureReason)
    : 'failed';
}
