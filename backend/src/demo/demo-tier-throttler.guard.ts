import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  getOptionsToken,
  getStorageToken,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { DemoMembershipService } from './demo-membership.service';

/** Chat turns per window for a pooled account, when nothing configures it. */
const DEFAULT_DEMO_CHAT_RATE_LIMIT = 5;

/** Receipt scans per window for a pooled account, when nothing configures it. */
const DEFAULT_DEMO_SCAN_RATE_LIMIT = 3;

/** Which env var lowers which throttler, and what it falls back to. */
const DEMO_LIMITS: Record<string, { key: string; fallback: number }> = {
  chat: { key: 'DEMO_CHAT_RATE_LIMIT', fallback: DEFAULT_DEMO_CHAT_RATE_LIMIT },
  scan: { key: 'DEMO_SCAN_RATE_LIMIT', fallback: DEFAULT_DEMO_SCAN_RATE_LIMIT },
};

/**
 * `ThrottlerGuard` with a lower budget for the demo pool, on the two routes
 * that spend the project's Gemini quota.
 *
 * ## What it is defending
 *
 * Not a bill: the key this deployment uses is an AI Studio key on a project with
 * billing **disabled**, so it is on the free tier and the thing that runs out is
 * the shared quota rather than money. What that costs is worse than a charge in
 * one way - when it is gone, receipt scanning and the assistant are broken for
 * the owner and for every real visitor, and nothing announces it. Ten pooled
 * accounts at the ordinary budget are 20 chats and 10 scans an hour **each**,
 * around the clock, from anybody who keeps a session.
 *
 * ## Why it substitutes a limit rather than adding two throttlers
 *
 * The obvious shape is a second pair of named throttlers, `demoChat` and
 * `demoScan`, with the guard skipping whichever pair does not apply. This is one
 * bucket per user per route with the **ceiling** chosen per caller instead, and
 * it is both less code and harder to get wrong: two named pairs mean two
 * `@SkipThrottle` entries on every route in the app that is not named by them -
 * the mistake `backend/CLAUDE.md` records as silent - and two separate buckets
 * for one user, which a caller switching pool membership mid-window could spend
 * both of.
 *
 * A pooled caller is therefore rate-limited on exactly the key an ordinary one
 * is, `chat` or `scan` against their user id, and only the number differs.
 *
 * ## What it deliberately is not
 *
 * **Not an aggregate cap.** The store is in-memory and the key is per user, so
 * this bounds one visitor rather than the sum of them - the same honest claim
 * `AppModule`'s throttler block already makes about `chat` and `scan`. A hard
 * ceiling on total spend is a quota override on the Generative Language API, in
 * the console, and `docs/guides/deployment.md` carries it.
 *
 * **Not per lease.** The window is `CHAT_RATE_TTL_S` / `SCAN_RATE_TTL_S`, which
 * defaults to the hour a lease also defaults to but is not tied to it: a pooled
 * account handed to a second visitor inside the window inherits what the first
 * one spent. That is the safer direction - it bounds the account rather than the
 * session - and it is why the copy a throttled visitor sees must not promise a
 * fresh budget on a new demo.
 */
@Injectable()
export class DemoTierThrottlerGuard extends ThrottlerGuard {
  constructor(
    @Inject(getOptionsToken()) options: ThrottlerModuleOptions,
    @Inject(getStorageToken()) storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly membership: DemoMembershipService,
    private readonly config: ConfigService,
  ) {
    super(options, storageService, reflector);
  }

  protected async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    const limit = await this.demoLimitFor(requestProps);

    return super.handleRequest(
      limit === null ? requestProps : { ...requestProps, limit },
    );
  }

  /**
   * The lowered ceiling for this request, or `null` to leave it alone.
   *
   * Reads the principal off the request rather than taking a tracker's word for
   * it: `SessionGuard` is a global `APP_GUARD`, so it has already run and
   * neither of these routes is `@Public()`. A request with no principal is one
   * the session guard is about to refuse, and it keeps the ordinary limit
   * because there is no account to look up.
   */
  private async demoLimitFor(
    requestProps: ThrottlerRequest,
  ): Promise<number | null> {
    const demo = DEMO_LIMITS[requestProps.throttler.name ?? ''];
    if (!demo) {
      return null;
    }

    const { req } = this.getRequestResponse(requestProps.context);
    const userId = (req.user as { userId?: string } | undefined)?.userId;
    if (!userId || !(await this.membership.isPooled(userId))) {
      return null;
    }

    return this.config.get<number>(demo.key, demo.fallback);
  }
}
