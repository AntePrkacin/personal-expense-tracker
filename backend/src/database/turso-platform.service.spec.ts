import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException, Logger } from '@nestjs/common';
import { TursoPlatformService } from './turso-platform.service';

describe('TursoPlatformService', () => {
  // Rebuilt in beforeEach: one test deletes a key to exercise a fallback, and
  // a shared object would leak that into everything after it.
  let env: Record<string, string>;

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
    env = {
      TURSO_ORG: 'acme',
      TURSO_ORG_TOKEN: 'org-token',
      TURSO_GROUP: 'decode-pet',
    };
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
          Name: 'spendifico-user-1',
          Hostname: 'spendifico-user-1-acme.aws.turso.io',
        },
      });

      const result = await service.createUserDatabase('spendifico-user-1');

      const [url, init] = lastCall();
      expect(url).toBe(
        'https://api.turso.tech/v1/organizations/acme/databases',
      );
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({ Authorization: 'Bearer org-token' });
      expect(JSON.parse(init.body as string)).toEqual({
        name: 'spendifico-user-1',
        group: 'decode-pet',
        use_tursodb: true,
      });
      expect(result).toEqual({
        dbName: 'spendifico-user-1',
        hostname: 'spendifico-user-1-acme.aws.turso.io',
      });
    });

    // Worth its own case rather than only the assertion above: dropping this
    // flag is silent. The API accepts the request, the app runs, and the
    // mistake only shows up as a libSQL database that @tursodatabase/sync
    // should never have been pointed at - and the engine cannot be changed
    // afterwards.
    it('always requests the Turso engine, never the libSQL default', async () => {
      respond({
        database: {
          Name: 'spendifico-user-1',
          Hostname: 'spendifico-user-1-acme.aws.turso.io',
        },
      });

      await service.createUserDatabase('spendifico-user-1');

      const [, init] = lastCall();
      expect(JSON.parse(init.body as string)).toHaveProperty(
        'use_tursodb',
        true,
      );
    });

    it('fails loudly when Turso returns no hostname', async () => {
      respond({ database: { Name: 'spendifico-user-1' } });

      await expect(
        service.createUserDatabase('spendifico-user-1'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('falls back to the default group when TURSO_GROUP is unset', async () => {
      delete env.TURSO_GROUP;
      respond({
        database: {
          Name: 'spendifico-user-1',
          Hostname: 'spendifico-user-1-acme.aws.turso.io',
        },
      });

      await service.createUserDatabase('spendifico-user-1');

      const [, init] = lastCall();
      expect(JSON.parse(init.body as string)).toHaveProperty(
        'group',
        'decode-pet',
      );
    });
  });

  describe('mintDbToken', () => {
    it('requests a full-access token that never expires', async () => {
      respond({ jwt: 'db-token' });

      await expect(service.mintDbToken('spendifico-user-1')).resolves.toBe(
        'db-token',
      );

      const [url, init] = lastCall();
      expect(url).toBe(
        'https://api.turso.tech/v1/organizations/acme/databases/spendifico-user-1/auth/tokens?authorization=full-access&expiration=never',
      );
      expect(init.method).toBe('POST');
    });

    it('fails loudly when Turso returns no token', async () => {
      respond({});

      await expect(service.mintDbToken('spendifico-user-1')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('deleteUserDatabase', () => {
    it('deletes by name', async () => {
      respond({}, { status: 204 });

      await service.deleteUserDatabase('spendifico-user-1');

      const [url, init] = lastCall();
      expect(url).toBe(
        'https://api.turso.tech/v1/organizations/acme/databases/spendifico-user-1',
      );
      expect(init.method).toBe('DELETE');
    });

    it('treats an already-missing database as success', async () => {
      respond({ error: 'not found' }, { status: 404 });

      await expect(service.deleteUserDatabase('gone')).resolves.toBeUndefined();
    });
  });

  it('bounds every request with a timeout, so a hung call cannot stall registration', async () => {
    respond({ jwt: 'db-token' });

    await service.mintDbToken('spendifico-user-1');

    const [, init] = lastCall();
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('turns an API error into a generic 500 rather than leaking the response', async () => {
    respond({ error: 'token xyz is invalid' }, { status: 401 });

    await expect(
      service.createUserDatabase('spendifico-user-1'),
    ).rejects.toThrow(InternalServerErrorException);
  });
});
