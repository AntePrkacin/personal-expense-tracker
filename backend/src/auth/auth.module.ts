import { Module } from '@nestjs/common';
import { normalizeEmail } from '../common/normalize-email';
import { MailModule } from '../mail/mail.module';
import { TemplatesModule } from '../templates/templates.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginTokenService } from './login-token.service';
import { SessionService } from './session.service';
import { VerificationService } from './verification.service';

/**
 * Two throttlers, deliberately NOT one composite `ip:email` key.
 *
 * A composite key hands every new (IP, address) pair a fresh bucket, so it
 * throttles only the intersection - one host hammering one address - and stops
 * neither attack that matters here. A botnet walking a single address arrives
 * from a new IP each time; one host walking a list submits a new address each
 * time. Both sail through a composite key with a full budget per request.
 *
 * So the two dimensions are limited independently, and a request is refused
 * when either bucket is over:
 *
 * - per-address: caps the mail one inbox can be sent, whoever asks from
 *   wherever;
 * - per-IP: caps total submissions from one host, whatever it types. Laxer by
 *   default, because a NAT can put a whole classroom behind one address.
 *
 * Both run in the guard, which Nest executes *before* pipes, so `req.body` is
 * the raw parsed JSON and not the validated DTO - hence normalizing the address
 * here rather than trusting the transform. Nest's default key also includes the
 * handler and the throttler name, so each route gets its own pair of buckets.
 *
 * `req.ip` is only the real caller if Express has been told how many proxies sit
 * in front, which is what `TRUST_PROXY_HOPS` configures in `main.ts`. Get it
 * wrong in either direction and this tracker breaks silently: too low behind a
 * proxy collapses every caller into one bucket and makes the limit global, too
 * high with nothing in front lets a caller pick a fresh bucket per request. The
 * per-address limiter is unaffected either way. See
 * `docs/guides/configuration.md` for the value.
 *
 * Getting that right is necessary and, as of PET-11, no longer sufficient - and
 * this is an active limitation rather than a future one. `req.ip` is now the
 * *frontend server*: register (and PET-12's login-link) reach this API from a Next
 * Server Action, so the real browser never connects here at all and every user
 * shares one per-IP bucket. This limiter therefore distinguishes nobody on those
 * two routes, and the per-address ones are what still protects the flow. Note the
 * two problems are separate: `TRUST_PROXY_HOPS` fixes reading the caller through a
 * proxy chain, while this needs the frontend to forward the browser's address
 * *and* a reason to trust that header, which is more than a config line. See
 * docs/TODO.md.
 *
 * These two trackers, and the module they register with, moved to `AppModule`
 * at PET-59: `ThrottlerModule` is `@Global()`, so a second `forRootAsync` call
 * in a feature module does not scope anything - it resolves the same
 * `THROTTLER_OPTIONS` token, and whichever registration loses that race is
 * silently absent, leaving its routes with no limit at all. One registration
 * now carries a third named throttler, `scan`, for `POST
 * /api/transactions/scan` - see `AppModule`. The functions stay here rather
 * than moving with it because they are exported for `auth.module.spec.ts`,
 * which cannot vary the caller's IP under supertest and so unit-tests these
 * directly.
 */
export function trackByIp(req: Record<string, unknown>): string {
  return typeof req.ip === 'string' ? req.ip : '';
}

/**
 * The submitted address, normalized so casing cannot split the bucket. A body
 * with no usable address (about to 400, but still needing a key) falls back to
 * the caller's IP, so garbage requests cost only their sender.
 */
export function trackByEmail(req: Record<string, unknown>): string {
  const body = req.body as { email?: unknown } | undefined;
  return normalizeEmail(body?.email) ?? `no-email:${trackByIp(req)}`;
}

/**
 * The signed-in caller, for the `scan` throttler `AppModule` registers.
 * `SessionGuard` is a global `APP_GUARD`, so it runs ahead of the
 * controller-scoped `ThrottlerGuard` on `/scan` and `request.user` is already
 * set by the time this reads it - the route carries no `@Public()`, so a
 * missing principal here would itself be a bug rather than a case to handle.
 * Keyed on the user id rather than on IP because the budget this throttler
 * protects is the project's shared Gemini quota, not a per-caller one, and IP
 * would let one NAT share a bucket across unrelated accounts.
 */
export function trackByUser(req: Record<string, unknown>): string {
  const user = req.user as { userId?: string } | undefined;
  return user?.userId ?? trackByIp(req);
}

/**
 * The passwordless access flow: register, request a login link, verify one, and
 * answer "who am I" for the session it created.
 *
 * `SessionService` is exported because AppModule's `APP_GUARD` registration of
 * `SessionGuard` resolves it from here. The guard itself is deliberately not a
 * provider of this module: it is global now, so a feature module protects its
 * routes by doing nothing at all. `DatabaseModule` is @Global, so nothing here
 * imports it for `APP_DB` or `UserDatabaseService`.
 */
@Module({
  imports: [
    MailModule,
    UsersModule,
    // Both halves of the access flow read it: register resolves the picked
    // template ids against central before stashing them, and verification reads
    // the same rows back to seed the account's categories.
    TemplatesModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    LoginTokenService,
    SessionService,
    VerificationService,
  ],
  exports: [SessionService],
})
export class AuthModule {}
