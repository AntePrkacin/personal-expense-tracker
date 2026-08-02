import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { normalizeEmail } from '../common/normalize-email';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginTokenService } from './login-token.service';

const DEFAULT_RATE_LIMIT = 5;
const DEFAULT_RATE_TTL_S = 900;

/**
 * Throttle bucket key: one caller hammering one address.
 *
 * Both halves are needed. Per-IP alone lets a botnet walk a single address;
 * per-email alone lets one host walk a list of addresses.
 *
 * This runs in a guard, which Nest executes *before* pipes, so `req.body` is
 * the raw parsed JSON and not the validated DTO - hence normalizing the address
 * here rather than trusting the transform, and tolerating a body with no
 * `email` at all (that request is about to 400, but it still needs a key).
 *
 * Known limitation: behind a reverse proxy `req.ip` is the proxy's address
 * unless Express `trust proxy` is set, which would collapse every caller into
 * one bucket. See docs/TODO.md.
 */
function trackByIpAndEmail(req: Record<string, unknown>): string {
  const ip = typeof req.ip === 'string' ? req.ip : '';
  const body = req.body as { email?: unknown } | undefined;
  return `${ip}:${normalizeEmail(body?.email) ?? ''}`;
}

/**
 * The passwordless access flow: register, and request a login link.
 *
 * ThrottlerModule is configured here rather than globally because these are the
 * only two routes that need it - `AuthController` carries the guard - and
 * because the limits are exposed as configuration so the e2e suite can trip
 * them without waiting out a fifteen-minute window.
 */
@Module({
  imports: [
    MailModule,
    UsersModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            limit: config.get<number>('AUTH_RATE_LIMIT', DEFAULT_RATE_LIMIT),
            // v5+ takes ttl in MILLISECONDS. AUTH_RATE_TTL_S is seconds, and
            // getting this conversion wrong is silent: the window would become
            // 900ms instead of 900s and the limit would never be reached.
            ttl: seconds(
              config.get<number>('AUTH_RATE_TTL_S', DEFAULT_RATE_TTL_S),
            ),
          },
        ],
        getTracker: trackByIpAndEmail,
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, LoginTokenService],
})
export class AuthModule {}
