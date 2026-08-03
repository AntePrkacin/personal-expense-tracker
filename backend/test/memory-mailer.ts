import type { Mailer, MailMessage } from './../src/mail/mailer';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Collects what would have been sent, and lets a test wait for it.
 *
 * The waiting is the point. AuthService deliberately does not await the send -
 * that is what keeps a known and an unknown address answering in the same time
 * - so by the time the HTTP response arrives the email has usually not been
 * handed over yet. Asserting "exactly one email" without waiting would race the
 * floated work and pass or fail on machine speed.
 *
 * Shared by the auth and verify suites rather than duplicated, like
 * query-chain.ts: both need the same waiting semantics, and the verify suite
 * additionally has to read a real token out of a real email.
 */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }

  to(email: string): MailMessage[] {
    return this.sent.filter((message) => message.to === email);
  }

  /** Resolves once `email` has received `count` messages, or throws. */
  async waitFor(email: string, count: number, timeoutMs = 2000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (this.to(email).length < count) {
      if (Date.now() > deadline) {
        throw new Error(
          `timed out waiting for ${count} email(s) to ${email}, saw ${this.to(email).length}`,
        );
      }
      await sleep(5);
    }
  }

  /**
   * For the negative case. Nothing can be waited *for*, so this waits out the
   * window in which a send would have happened and then lets the caller assert
   * that none did.
   */
  quiesce(): Promise<unknown> {
    return sleep(100);
  }
}
