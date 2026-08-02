import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { MailPaceMailer } from './mailpace.mailer';
import type { MailMessage } from './mailer';

const message: MailMessage = {
  to: 'marko@email.com',
  subject: 'Your Expensa login link',
  htmlbody: '<p>Log in</p>',
  textbody: 'Log in',
  tags: ['login-link'],
};

describe('MailPaceMailer', () => {
  let mailer: MailPaceMailer;
  let fetchMock: jest.Mock;
  let logError: jest.SpyInstance;

  const config = {
    getOrThrow: (key: string) =>
      key === 'MAILPACE_API_TOKEN' ? 'server-token' : 'hello@expensa.test',
  } as unknown as ConfigService;

  const requestInit = () =>
    (fetchMock.mock.calls[0] as [string, RequestInit])[1];
  const requestBody = () =>
    JSON.parse(requestInit().body as string) as Record<string, unknown>;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock;

    mailer = new MailPaceMailer(config);
    logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('posts to the MailPace send endpoint with the server token header', async () => {
    await mailer.send(message);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.mailpace.com/api/v1/send',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(requestInit().headers).toEqual({
      'Content-Type': 'application/json',
      // Without this MailPace answers 406: Node's fetch defaults to `*/*`.
      Accept: 'application/json',
      'MailPace-Server-Token': 'server-token',
    });
  });

  it('sends both bodies, the configured sender and the tags', async () => {
    await mailer.send(message);

    expect(requestBody()).toEqual({
      from: 'hello@expensa.test',
      to: 'marko@email.com',
      subject: 'Your Expensa login link',
      htmlbody: '<p>Log in</p>',
      textbody: 'Log in',
      tags: ['login-link'],
    });
  });

  it('omits tags rather than sending an empty field', async () => {
    await mailer.send({ ...message, tags: undefined });

    expect(requestBody()).not.toHaveProperty('tags');
  });

  it('never sends list_unsubscribe on a login link', async () => {
    await mailer.send(message);

    expect(requestBody()).not.toHaveProperty('list_unsubscribe');
  });

  it('bounds the call with a timeout', async () => {
    const timeout = jest.spyOn(AbortSignal, 'timeout');

    await mailer.send(message);

    expect(timeout).toHaveBeenCalledWith(10_000);
    expect(requestInit().signal).toBeInstanceOf(AbortSignal);
  });

  it('logs the failure body but throws something opaque', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      text: () => Promise.resolve('{"error":"to is invalid"}'),
    });

    await expect(mailer.send(message)).rejects.toThrow('MailPace send failed');

    // The body echoes the request, recipient included; it belongs in the log
    // and nowhere else.
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('to is invalid'),
    );
  });
});
