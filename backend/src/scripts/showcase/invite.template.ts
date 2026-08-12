import type { RenderedEmail } from '../../mail/login-link.template';

/**
 * The showcase invitation, in both HTML and plain text.
 *
 * **Deliberately not `renderLoginLinkEmail`**, which is the app's transactional
 * login mail. That one is addressed to somebody who just asked for a link to
 * their own account and says so ("If you didn't ask for it, you can ignore this
 * email"); this one arrives unrequested, points at a **shared demo account**
 * somebody else owns, and lasts 24 hours rather than 15 minutes. Every sentence
 * of the copy is different, so sharing the function would mean parameterising
 * all of it.
 *
 * The one paragraph that is not politeness is the "do not use the login form"
 * warning, and it is here rather than in a README because it is the only place
 * the person who can actually cause the damage will read.
 * `LoginTokenService.issue()` supersedes **every** unused link for an account in
 * one statement, so a single participant who mislays this mail and helpfully
 * requests a fresh one from the site silently kills the link of everybody who
 * has not clicked yet. Telling them to reply instead costs one sentence and is
 * the entire prevention.
 */
export function renderShowcaseInviteEmail(
  frontendUrl: string,
  rawToken: string,
  hoursValid: number,
): RenderedEmail {
  const link = `${frontendUrl.replace(/\/+$/, '')}/auth/verify?token=${encodeURIComponent(rawToken)}`;

  const lines = {
    intro:
      'You are invited to explore Spendifico, a personal expense tracker built ' +
      'as a Decode Academy final project.',
    action: 'Open this link to go straight in - there is no password to type:',
    expiry: `The link logs you in once and works for the next ${hoursValid} hours.`,
    warning:
      'Please do not use the login form on the site. Requesting a link there ' +
      'cancels the links of everyone who has not opened theirs yet.',
    help: 'If your link does not work, just reply to this email and we will send a new one.',
    account:
      'You are signing in to a shared demo account filled with example spending, ' +
      'so nothing you do affects anybody real.',
  };

  return {
    subject: 'Your Spendifico showcase login link',
    textbody: [
      lines.intro,
      '',
      lines.action,
      '',
      link,
      '',
      lines.expiry,
      '',
      lines.warning,
      '',
      lines.help,
      '',
      lines.account,
    ].join('\n'),
    htmlbody: [
      `<p>${lines.intro}</p>`,
      `<p>${lines.action}</p>`,
      `<p><a href="${link}">Open Spendifico</a></p>`,
      `<p>${lines.expiry}</p>`,
      `<p><strong>${lines.warning}</strong></p>`,
      `<p>${lines.help}</p>`,
      `<p>${lines.account}</p>`,
    ].join('\n'),
  };
}
