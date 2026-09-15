import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Mailer, MailMessage } from './mailer';

/** Pulls the login link out of the text body, so it is clickable in a terminal. */
const URL_PATTERN = /https?:\/\/\S+/;

/**
 * How much of a token is enough to correlate two log lines about one link, and
 * far too little to use one. A login token is 256 bits, base64url.
 */
const TOKEN_PREFIX_CHARS = 8;

/**
 * The default mailer: writes the email to the log instead of sending it.
 *
 * This is what keeps two properties of the repo true. The backend still runs
 * with no .env at all, so a fresh clone can register and follow the link
 * printed here. And the e2e suite never reaches the network, since without
 * MAILPACE_API_TOKEN there is no transport that could.
 *
 * **In production it logs no link, and that is not caution - it is the
 * deployment this app actually has.** With no domain and no mail service, this
 * mailer is not a development fallback here, it is the only mail path: every
 * login link is written to Cloud Logging and delivered to nobody. A full
 * tokenised link there is a **working credential** for the named account,
 * readable by anybody with log-read on the project, sitting in a store with its
 * own retention and its own export destinations. So `NODE_ENV=production` logs
 * the recipient and the first few characters of the token, which is enough to
 * tell two links apart while debugging and not enough to spend one.
 *
 * Local development keeps the whole link, which is the entire point of the
 * fallback: a fresh clone registers, reads the link out of the terminal and
 * follows it.
 */
@Injectable()
export class LogMailer implements Mailer {
  private readonly logger = new Logger(LogMailer.name);

  constructor(private readonly config: ConfigService) {}

  send(message: MailMessage): Promise<void> {
    const link = URL_PATTERN.exec(message.textbody)?.[0];

    this.logger.log(
      `Email not sent (no MAILPACE_API_TOKEN): to=${message.to} subject="${message.subject}"`,
    );

    if (link) {
      this.logger.log(
        this.config.get<string>('NODE_ENV') === 'production'
          ? `Link withheld from the log in production. Token starts ${tokenPrefixOf(link)}.`
          : `Link: ${link}`,
      );
    }

    return Promise.resolve();
  }
}

/**
 * The first few characters of the link's `token` parameter, or `?` when there is
 * no token to read.
 *
 * Parsed rather than sliced off the URL, so a change to the link's shape cannot
 * quietly start printing a different part of it - which, on the one path where
 * printing the wrong part means printing the credential, is worth a `URL`.
 */
function tokenPrefixOf(link: string): string {
  try {
    const token = new URL(link).searchParams.get('token');
    return token ? `${token.slice(0, TOKEN_PREFIX_CHARS)}...` : '?';
  } catch {
    return '?';
  }
}
