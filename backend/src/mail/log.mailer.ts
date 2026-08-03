import { Injectable, Logger } from '@nestjs/common';
import type { Mailer, MailMessage } from './mailer';

/** Pulls the login link out of the text body, so it is clickable in a terminal. */
const URL_PATTERN = /https?:\/\/\S+/;

/**
 * The default mailer: writes the email to the log instead of sending it.
 *
 * This is what keeps two properties of the repo true. The backend still runs
 * with no .env at all, so a fresh clone can register and follow the link
 * printed here. And the e2e suite never reaches the network, since without
 * MAILPACE_API_TOKEN there is no transport that could.
 */
@Injectable()
export class LogMailer implements Mailer {
  private readonly logger = new Logger(LogMailer.name);

  send(message: MailMessage): Promise<void> {
    const link = URL_PATTERN.exec(message.textbody)?.[0];

    this.logger.log(
      `Email not sent (no MAILPACE_API_TOKEN): to=${message.to} subject="${message.subject}"`,
    );
    if (link) {
      this.logger.log(`Link: ${link}`);
    }

    return Promise.resolve();
  }
}
