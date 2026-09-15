import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import {
  DEMO_CLIENT_IP_HEADER,
  DEMO_CLIENT_IP_KEY,
  DEMO_SECRET_HEADER,
  secretsMatch,
} from './demo-headers';

/**
 * Lets the frontend through to the hand-out, and nobody else.
 *
 * ## Why the route needed closing at all
 *
 * `POST /api/demo/session` mints a session for anybody who asks, and the API is
 * on a public Cloud Run URL. The frontend's `/demo` handler is the only caller
 * anybody is meant to have, so before this guard a visitor could skip it, call
 * the API directly and drain the pool from as many addresses as they had -
 * while every real visitor shared the frontend's single egress bucket. A shared
 * secret both closes that and makes the per-visitor bucket possible, because a
 * client address is only worth reading once you know who is reporting it.
 *
 * ## Three things about it that are decisions
 *
 * **It answers 404, not 401**, which is `DemoController`'s own rule rather than
 * a new one: a deployment whose demo cannot be reached has no such route, and
 * 401 would confirm the endpoint exists and invite a guess at the credential.
 * The cost is that a **misconfigured** deployment looks exactly like a disabled
 * one to a visitor, so a mismatch is logged at `warn` with no secret in it -
 * that log line is the only way to tell the two apart.
 *
 * **It runs before `ThrottlerGuard`**, which is the ordering the whole feature
 * rests on: controller guards execute in the order they are listed, and the
 * `demo` throttler's tracker reads a request property this guard sets. Reverse
 * them and the tracker runs first, sees nothing, and every visitor is back in
 * the frontend's one bucket. Nothing fails, nothing logs.
 *
 * **A disabled demo is not this guard's business.** `DEMO_ENABLED` is checked in
 * the handler, deliberately first among its own statements, and this returns
 * `true` when the feature is off so that answer stays the handler's to give.
 * Both are 404 anyway; keeping one owner for the sentence is the point.
 */
@Injectable()
export class DemoSecretGuard implements CanActivate {
  private readonly logger = new Logger(DemoSecretGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.config.get<boolean>('DEMO_ENABLED') !== true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();

    // Present whenever the demo is enabled: Joi requires the pair together, so
    // a deployment cannot open this route and forget the credential for it.
    const expected = this.config.get<string>('DEMO_SHARED_SECRET')!;

    if (!secretsMatch(request.headers[DEMO_SECRET_HEADER], expected)) {
      this.logger.warn(
        `Refused a demo hand-out with no valid ${DEMO_SECRET_HEADER}. ` +
          `Either somebody called this API directly, or the frontend's ` +
          `DEMO_SHARED_SECRET does not match this deployment's.`,
      );
      throw new NotFoundException();
    }

    // Trusted **only** here, on the far side of the check above, which is the
    // whole difference between this and raising `TRUST_PROXY_HOPS` over
    // `X-Forwarded-For`. A caller who could set this header could pick a fresh
    // rate-limit bucket per request, and they cannot reach this line.
    const named = request.headers[DEMO_CLIENT_IP_HEADER];
    if (typeof named === 'string' && named.length > 0) {
      (request as unknown as Record<string, unknown>)[DEMO_CLIENT_IP_KEY] =
        named;
    }

    return true;
  }
}
