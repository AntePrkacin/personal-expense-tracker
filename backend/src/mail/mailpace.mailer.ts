import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Mailer, MailMessage } from './mailer';

const MAILPACE_SEND_URL = 'https://app.mailpace.com/api/v1/send';

/**
 * Bounds the call. The send is floated off the request, so a hang costs nobody
 * a response - but an unbounded fetch would hold a socket and a closure open
 * indefinitely, and a link that is going to fail should fail promptly enough to
 * appear in the logs next to the request that triggered it.
 */
const SEND_TIMEOUT_MS = 10_000;

/**
 * Sends over MailPace's HTTP API rather than SMTP.
 *
 * SMTP is routinely blocked in production - port 25 permanently on GCP,
 * throttled on EC2, blocked on Azure and on new DigitalOcean accounts - and
 * 587/465 are not guaranteed either. HTTPS on 443 always works, returns
 * structured JSON errors instead of SMTP status codes, and needs no connection
 * handling.
 *
 * Called with `fetch` rather than `@mailpace/mailpace.js`, which is at 0.1.3
 * with two releases ever and declares axios 0.21 (CVE-2023-45857), ts-node and
 * Node 14 typings as *runtime* dependencies - to wrap a single POST. This
 * mirrors TursoPlatformService, which is the same shape: zero new
 * dependencies, and no ESM/Jest interop risk, which this repo has real pain
 * with.
 */
@Injectable()
export class MailPaceMailer implements Mailer {
  private readonly logger = new Logger(MailPaceMailer.name);

  constructor(private readonly config: ConfigService) {}

  async send(message: MailMessage): Promise<void> {
    const response = await fetch(MAILPACE_SEND_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        // Required, not decorative. Node's fetch sends `Accept: */*` by
        // default and MailPace answers that with 406 "Invalid request format
        // or content type" - a confusing message, because the body and the
        // Content-Type are both fine. Verified against the live API.
        Accept: 'application/json',
        // MailPace's own header name; not an Authorization bearer.
        'MailPace-Server-Token':
          this.config.getOrThrow<string>('MAILPACE_API_TOKEN'),
      },
      body: JSON.stringify({
        // Must be on a domain whose DKIM authorization MailPace has completed,
        // or the API rejects the send outright.
        from: this.config.getOrThrow<string>('MAIL_FROM'),
        to: message.to,
        subject: message.subject,
        htmlbody: message.htmlbody,
        textbody: message.textbody,
        ...(message.tags ? { tags: message.tags } : {}),
        // Deliberately no `list_unsubscribe`: that header belongs on bulk mail,
        // and offering to unsubscribe from the one email that has to arrive
        // would be actively harmful.
      }),
    });

    if (!response.ok) {
      // The body echoes the request, recipient included, so it is logged rather
      // than thrown. Callers get an opaque failure and nothing leaks outward.
      const detail = await response.text().catch(() => '');
      this.logger.error(
        `MailPace send failed: ${response.status} ${detail} (to=${message.to})`,
      );
      throw new Error('MailPace send failed');
    }
  }
}
