import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { normalizeEmail } from '../common/normalize-email';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginTokenService } from './login-token.service';
import { SessionService } from './session.service';
import { VerificationService } from './verification.service';

const DEFAULT_EMAIL_RATE_LIMIT = 5;
const DEFAULT_IP_RATE_LIMIT = 30;
const DEFAULT_RATE_TTL_S = 900;

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
 * Known limitation: behind a reverse proxy `req.ip` is the proxy's address
 * unless Express `trust proxy` is set, which would collapse the per-IP buckets
 * (the per-address ones are unaffected). See docs/TODO.md.
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
 * The passwordless access flow: register, request a login link, verify one, and
 * answer "who am I" for the session it created.
 *
 * ThrottlerModule is configured here rather than globally because these are the
 * only routes that need it - `AuthController` carries the guard, with named
 * skips per route - and because the limits are exposed as configuration so the
 * e2e suite can trip them without waiting out a fifteen-minute window.
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
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // v5+ takes ttl in MILLISECONDS. AUTH_RATE_TTL_S is seconds, and
        // getting this conversion wrong is silent: the window would become
        // 900ms instead of 900s and the limit would never be reached.
        const ttl = seconds(
          config.get<number>('AUTH_RATE_TTL_S', DEFAULT_RATE_TTL_S),
        );

        return {
          throttlers: [
            {
              name: 'email',
              limit: config.get<number>(
                'AUTH_RATE_LIMIT',
                DEFAULT_EMAIL_RATE_LIMIT,
              ),
              ttl,
              getTracker: trackByEmail,
            },
            {
              name: 'ip',
              limit: config.get<number>(
                'AUTH_RATE_IP_LIMIT',
                DEFAULT_IP_RATE_LIMIT,
              ),
              ttl,
              getTracker: trackByIp,
            },
          ],
        };
      },
    }),
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
