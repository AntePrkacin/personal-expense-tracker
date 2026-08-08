import { SetMetadata } from '@nestjs/common';

/** Metadata key the globally registered `SessionGuard` reads. */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opts a route out of the global `SessionGuard`.
 *
 * Every route is guarded by default (see the `APP_GUARD` registration in
 * AppModule), so this is the only way to leave one open, and there are exactly
 * five: health, register, login-link, verify and the category templates. All
 * five are unauthenticated by design - the first is the liveness check, the
 * next three are how a caller with no credential gets one, and the fifth is the
 * list of chips onboarding step 2 draws before an account exists at all.
 *
 * Readable on the handler or the whole controller; the guard checks handler
 * first, so a class-level mark can be overridden per route.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
