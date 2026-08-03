import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OnboardingPayload } from '../database/central/schema';
import { renderLoginLinkEmail } from '../mail/login-link.template';
import { MAILER, type Mailer } from '../mail/mailer';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginTokenService } from './login-token.service';

/** Provider-side label, so this stream stays separable from later mail. */
const LOGIN_LINK_TAG = 'login-link';

/**
 * Registration and login-link issuing, the two halves of a passwordless entry
 * (A31: there is no password field anywhere in the design).
 *
 * Both operations answer identically and tell the caller nothing about whether
 * an account exists (REG-6, LOG-6, A35). Two things make that true rather than
 * merely intended:
 *
 * - the response body is empty, so there is nothing to differ; the frontend
 *   already holds the submitted address to interpolate into screen 24;
 * - nothing past the directory lookup is awaited. An awaited send would make a
 *   known address cost a token insert plus an HTTPS round trip to the mail
 *   provider while an unknown one costs a single indexed read - hundreds of
 *   milliseconds apart and trivially measurable, which defeats the point.
 *
 * Floating the send buys a second thing: a mail failure cannot fail the
 * request. The account really was created, and the design's own recovery path
 * is "Resend link" (VER-2), so a 500 here would report a failure that did not
 * happen.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly loginTokens: LoginTokenService,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly config: ConfigService,
  ) {}

  /**
   * Creates the account if the address is new, then sends a link. Provisions
   * nothing: no Turso database is created here, which is what keeps an
   * unauthenticated endpoint from being able to spend money, and what keeps
   * "Finish setup" from needing the loading state A19 does not design.
   */
  async register(dto: RegisterDto): Promise<void> {
    const userId = await this.resolveRegistration(dto.email, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      currency: dto.currency ?? 'USD',
      monthlyBudget: dto.monthlyBudget,
      monthStartDay: dto.monthStartDay ?? 1,
      categories: dto.categories,
    });

    this.floatLoginLink(userId, dto.email);
  }

  /**
   * Sends a link to an address that already has an account, and does nothing
   * at all otherwise.
   *
   * An unknown address creates nothing and receives nothing; only the response
   * is identical. Mailing strangers because somebody typed their address into
   * a form is a worse outcome than the enumeration it would be defending
   * against, so every login_links row references a real user.
   */
  async requestLoginLink(email: string): Promise<void> {
    const existing = await this.users.findByEmail(email);
    if (!existing) {
      return;
    }

    this.floatLoginLink(existing.id, email);
  }

  /** @returns the id of the account this registration belongs to. */
  private async resolveRegistration(
    email: string,
    payload: OnboardingPayload,
  ): Promise<string> {
    let existing = await this.users.findByEmail(email);

    if (!existing) {
      try {
        return await this.users.createPending(email, payload);
      } catch (error) {
        if (!isUniqueEmailViolation(error)) {
          throw error;
        }
        // Lost the unique-index race to a concurrent registration of the same
        // address. That used to be a 409; now both submissions describe the
        // same account, so this converges on whichever row won instead of
        // failing one of two identical requests.
        existing = await this.users.findByEmail(email);
        if (!existing) {
          throw error;
        }
      }
    }

    // Registered but never verified. Overwrite what they last saw: the
    // realistic case is someone who lost the first email and resubmitted the
    // form, possibly with corrected values, and they have to verify into the
    // profile they were just looking at. Safe, because a payload only becomes a
    // profile when the address owner clicks the link - which also turns
    // squatting into a fix, since a genuine owner's registration replaces a
    // squatter's payload.
    //
    // A verified account (payload null) keeps everything it has and just gets
    // a link.
    if (existing.onboardingPayload) {
      await this.users.stashOnboardingPayload(existing.id, payload);
    }

    return existing.id;
  }

  /**
   * Issues and sends, off the request. Deliberately not awaited - see the class
   * comment for both reasons.
   *
   * Note the accepted cost: `issue()` supersedes the previous link before the
   * send, so a failed send leaves the user with zero live links where they had
   * one. "Resend link" recovers that too, and it is the design's only answer
   * (A36).
   */
  private floatLoginLink(userId: string, email: string): void {
    void this.issueAndSend(userId, email).catch((error: unknown) => {
      this.logger.error(
        `Sending a login link for user ${userId} failed: ${String(error)}`,
      );
    });
  }

  private async issueAndSend(userId: string, email: string): Promise<void> {
    const rawToken = await this.loginTokens.issue(userId);

    const message = renderLoginLinkEmail(
      this.config.get<string>('FRONTEND_URL', 'http://localhost:4200'),
      rawToken,
      this.loginTokens.ttlMinutes,
    );

    await this.mailer.send({ to: email, ...message, tags: [LOGIN_LINK_TAG] });
  }
}

/** SQLite reports this as `UNIQUE constraint failed: users.email`. */
function isUniqueEmailViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unique/i.test(message) && /email/i.test(message);
}
