import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
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

/** A mailer reading whichever NODE_ENV a case is about. */
const mailerIn = (nodeEnv: string) =>
  new LogMailer({
    get: (key: string) => (key === 'NODE_ENV' ? nodeEnv : undefined),
  } as unknown as ConfigService);

describe('LogMailer', () => {
  let mailer: LogMailer;
  let log: jest.SpyInstance;

  beforeEach(() => {
    mailer = mailerIn('development');
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

  /**
   * The one line that must never reach Cloud Logging.
   *
   * This deployment has no domain and no mail service, so this class is not a
   * development fallback on it - it is the whole mail path, and a full
   * tokenised link in the log is a working credential for the named account,
   * readable by anybody with log-read on the project.
   */
  it('withholds the link in production, keeping only a token prefix', async () => {
    await mailerIn('production').send(message);

    const lines = log.mock.calls.map(([line]) => String(line)).join('\n');
    expect(lines).toContain('to=marko@email.com');
    expect(lines).not.toContain('token=abc');
    expect(lines).not.toContain('http://localhost:4200/auth/verify');
    // Enough to tell two links apart in a log, not enough to spend one.
    expect(lines).toContain('Token starts abc...');
  });

  it('says so rather than guessing when a production link carries no token', async () => {
    await mailerIn('production').send({
      ...message,
      textbody: 'Open this link:\n\nhttp://localhost:4200/auth/verify\n',
    });

    const lines = log.mock.calls.map(([line]) => String(line)).join('\n');
    expect(lines).toContain('Token starts ?');
    expect(lines).not.toContain('http://localhost:4200/auth/verify');
  });

  it('still logs when there is no link to extract', async () => {
    await expect(
      mailer.send({ ...message, textbody: 'no link here' }),
    ).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledTimes(1);
  });
});
