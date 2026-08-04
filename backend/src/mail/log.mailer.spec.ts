import { Logger } from '@nestjs/common';
import { LogMailer } from './log.mailer';
import type { MailMessage } from './mailer';

const message: MailMessage = {
  to: 'marko@email.com',
  subject: 'Your Spendifico login link',
  htmlbody:
    '<p><a href="http://localhost:4200/auth/verify?token=abc">Log in</a></p>',
  textbody:
    'Open this link on this device:\n\nhttp://localhost:4200/auth/verify?token=abc\n',
};

describe('LogMailer', () => {
  let mailer: LogMailer;
  let log: jest.SpyInstance;

  beforeEach(() => {
    mailer = new LogMailer();
    log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('logs the recipient, the subject and a clickable link', async () => {
    await mailer.send(message);

    const lines = log.mock.calls.map(([line]) => String(line));
    expect(lines.join('\n')).toContain('to=marko@email.com');
    expect(lines.join('\n')).toContain('Your Spendifico login link');
    // On its own line, so it is one click in a terminal rather than buried in
    // the body. This is the whole developer experience with no .env set.
    expect(lines).toContain(
      'Link: http://localhost:4200/auth/verify?token=abc',
    );
  });

  it('still logs when there is no link to extract', async () => {
    await expect(
      mailer.send({ ...message, textbody: 'no link here' }),
    ).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledTimes(1);
  });
});
