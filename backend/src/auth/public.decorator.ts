import { SetMetadata } from '@nestjs/common';

/** Metadata key the globally registered `SessionGuard` reads. */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opts a route out of the global `SessionGuard`.
 *
 * Every route is guarded by default (see the `APP_GUARD` registration in
 * AppModule), so this is the only way to leave one open, and there are exactly
 * four: hello, register, login-link and verify. All four are unauthenticated by
 * design - the first is the liveness greeting, and the other three are how a
 * caller with no credential gets one.
 *
 * Readable on the handler or the whole controller; the guard checks handler
 * first, so a class-level mark can be overridden per route.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
