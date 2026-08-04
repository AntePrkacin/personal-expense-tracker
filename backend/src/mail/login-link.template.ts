/** What the template produces; the recipient and tags are the caller's. */
export interface RenderedEmail {
  subject: string;
  htmlbody: string;
  textbody: string;
}

/**
 * The login-link email, in both HTML and plain text.
 *
 * Copy follows screen 24's voice ("a secure login link", "Open the link on this
 * device") so the inbox and the app agree with each other - the user is looking
 * at that screen while they read this.
 *
 * The token travels in a query string, which puts it in server access logs,
 * browser history and potentially a Referer header. That is the accepted norm
 * for magic links and the short single-use window bounds it, but it does
 * constrain the verify page: it must load no third-party resources and must
 * consume the token immediately.
 */
export function renderLoginLinkEmail(
  frontendUrl: string,
  rawToken: string,
  ttlMinutes: number,
): RenderedEmail {
  const link = `${frontendUrl.replace(/\/+$/, '')}/auth/verify?token=${encodeURIComponent(rawToken)}`;
  const expiry = `This link works once and expires in ${ttlMinutes} minutes.`;

  return {
    subject: 'Your Spendifico login link',
    textbody: [
      'Open this link on this device to access your account:',
      '',
      link,
      '',
      expiry,
      "If you didn't ask for it, you can ignore this email.",
    ].join('\n'),
    htmlbody: [
      '<p>Open this link on this device to access your account:</p>',
      `<p><a href="${link}">Log in to Spendifico</a></p>`,
      `<p>${expiry}</p>`,
      "<p>If you didn't ask for it, you can ignore this email.</p>",
    ].join('\n'),
  };
}
