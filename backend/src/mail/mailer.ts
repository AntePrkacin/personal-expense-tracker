/**
 * One outbound email.
 *
 * The body field names are MailPace's own (`htmlbody`, `textbody`) rather than
 * neutral ones. That is deliberate: there is exactly one transport and one
 * template, so a translation layer would be ceremony, and the names being
 * identical means the MailPace body is the message plus a `from`.
 *
 * Both bodies are required, not optional. A text alternative measurably helps
 * deliverability, and this is the one email in the product that has to arrive.
 */
export interface MailMessage {
  to: string;
  subject: string;
  htmlbody: string;
  textbody: string;
  /** Provider-side labels, for separating transactional streams later. */
  tags?: string[];
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** DI token; MailModule decides which implementation answers to it. */
export const MAILER = 'MAILER';
