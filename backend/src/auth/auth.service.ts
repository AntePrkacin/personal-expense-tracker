import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUniqueViolation } from '../common/unique-violation';
import type { OnboardingPayload } from '../database/central/schema';
import { renderLoginLinkEmail } from '../mail/login-link.template';
import { MAILER, type Mailer } from '../mail/mailer';
import { TemplatesService } from '../templates/templates.service';
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
    private readonly templates: TemplatesService,
  ) {}

  /**
   * Creates the account if the address is new, then sends a link. Provisions
   * nothing: no Turso database is created here, which is what keeps an
   * unauthenticated endpoint from being able to spend money, and what keeps
   * "Finish setup" from needing the loading state A19 does not design.
   */
  async register(dto: RegisterDto): Promise<void> {
    // Ahead of everything, and specifically ahead of the floated work below.
    // It is the membership check `RegisterDto.categories` cannot do for itself
    // now that the offered list is a table, and it must not move: after the
    // float, a 400 would arrive too late to be a 400 at all.
    await this.assertCategoryTemplatesExist(dto.categories);

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
   * Rejects a registration naming a category template that is not there.
   *
   * **One indexed read, and it says nothing about any account.** It runs before
   * the directory lookup, so it costs the same whether or not the address
   * exists and cannot become a second timing channel - the property the empty
   * 202 is built on. `@ArrayUnique` upstream means the counts compare directly.
   *
   * A 400 rather than dropping the unknown ids silently: a frontend sending an
   * id the API does not know is a frontend out of step with the templates, and
   * seeding whatever survived a filter would hand the user an account missing
   * categories they picked, with nothing anywhere saying so.
   */
  private async assertCategoryTemplatesExist(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    const found = await this.templates.resolve(ids);
    if (found.length === ids.length) {
      return;
    }

    const known = new Set(found.map((template) => template.id));
    const missing = ids.filter((id) => !known.has(id));

    throw new BadRequestException(
      `categories contains unknown category template ids: ${missing.join(', ')}`,
    );
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

/**
 * SQLite reports this as `UNIQUE constraint failed: users.email`, though never at
 * the top level of what Drizzle throws - see `isUniqueViolation`, which is where
 * this check lived as a local copy that only ever read `error.message` and so
 * silently never fired.
 */
function isUniqueEmailViolation(error: unknown): boolean {
  return isUniqueViolation(error, 'users.email');
}
