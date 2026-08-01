import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException, Logger } from '@nestjs/common';
import { TursoPlatformService } from './turso-platform.service';

describe('TursoPlatformService', () => {
  const env: Record<string, string> = {
    TURSO_ORG: 'acme',
    TURSO_ORG_TOKEN: 'org-token',
    TURSO_GROUP: 'decode-pet',
  };

  const config = {
    get: (key: string, fallback?: string) => env[key] ?? fallback,
    getOrThrow: (key: string) => env[key],
  } as unknown as ConfigService;

  let service: TursoPlatformService;
  let fetchMock: jest.Mock;

  const respond = (body: unknown, init: { status?: number } = {}) =>
    fetchMock.mockResolvedValueOnce({
      ok: (init.status ?? 200) < 400,
      status: init.status ?? 200,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    });

  const lastCall = () => fetchMock.mock.calls[0] as [string, RequestInit];

  beforeEach(() => {
    service = new TursoPlatformService(config);
    fetchMock = jest.fn();
    global.fetch = fetchMock;

    // Failed API calls are logged server-side by design; keep them out of the
    // test output.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('createUserDatabase', () => {
    it('posts to the organization scoped endpoint with the configured group', async () => {
      respond({
        database: {
          Name: 'expensa-user-1',
          Hostname: 'expensa-user-1-acme.aws.turso.io',
        },
      });

      const result = await service.createUserDatabase('expensa-user-1');

      const [url, init] = lastCall();
      expect(url).toBe(
        'https://api.turso.tech/v1/organizations/acme/databases',
      );
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({ Authorization: 'Bearer org-token' });
      expect(JSON.parse(init.body as string)).toEqual({
        name: 'expensa-user-1',
        group: 'decode-pet',
      });
      expect(result).toEqual({
        dbName: 'expensa-user-1',
        hostname: 'expensa-user-1-acme.aws.turso.io',
      });
    });

    it('fails loudly when Turso returns no hostname', async () => {
      respond({ database: { Name: 'expensa-user-1' } });

      await expect(
        service.createUserDatabase('expensa-user-1'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('mintDbToken', () => {
    it('requests a full-access token that never expires', async () => {
      respond({ jwt: 'db-token' });

      await expect(service.mintDbToken('expensa-user-1')).resolves.toBe(
        'db-token',
      );

      const [url, init] = lastCall();
      expect(url).toBe(
        'https://api.turso.tech/v1/organizations/acme/databases/expensa-user-1/auth/tokens?authorization=full-access&expiration=never',
      );
      expect(init.method).toBe('POST');
    });
  });

  describe('deleteUserDatabase', () => {
    it('deletes by name', async () => {
      respond({}, { status: 204 });

      await service.deleteUserDatabase('expensa-user-1');

      const [url, init] = lastCall();
      expect(url).toBe(
        'https://api.turso.tech/v1/organizations/acme/databases/expensa-user-1',
      );
      expect(init.method).toBe('DELETE');
    });

    it('treats an already-missing database as success', async () => {
      respond({ error: 'not found' }, { status: 404 });

      await expect(service.deleteUserDatabase('gone')).resolves.toBeUndefined();
    });
  });

  it('turns an API error into a generic 500 rather than leaking the response', async () => {
    respond({ error: 'token xyz is invalid' }, { status: 401 });

    await expect(service.createUserDatabase('expensa-user-1')).rejects.toThrow(
      InternalServerErrorException,
    );
  });
});
