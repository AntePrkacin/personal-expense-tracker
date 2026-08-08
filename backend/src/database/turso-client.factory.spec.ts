import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect as connectLocal } from '@tursodatabase/database';
import { openCloudDatabase, openLocalDatabase } from './turso-client.factory';

// Both opens reach the network on the way to a real connection, so every case
// here is expected to fail or throw before that point - the guard runs first.
const CLOUD_OPTIONS = {
  url: 'https://example.turso.io',
  authToken: 'unused',
  syncIntervalS: 60,
};

describe('turso-client.factory mixed-mode guard', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spendifico-guard-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('refuses to open a plain local file as a sync replica', async () => {
    const path = join(dir, 'app.db');
    const client = await connectLocal(path);
    await client.close();
    expect(existsSync(path)).toBe(true);
    expect(existsSync(`${path}-info`)).toBe(false);

    await expect(openCloudDatabase({ path, ...CLOUD_OPTIONS })).rejects.toThrow(
      /Refusing to open .*app\.db as a Turso sync replica/,
    );
  });

  it('allows cloud mode to open a fresh path with nothing at it yet', async () => {
    const path = join(dir, 'app.db');

    // No real client is reachable in a unit test, so a failure past the guard
    // (a network error from connectSync) is what proves the guard let it through.
    await expect(
      openCloudDatabase({ path, ...CLOUD_OPTIONS }),
    ).rejects.not.toThrow(/Refusing to open/);
  });

  it('refuses to open a sync replica as a plain local file', async () => {
    const path = join(dir, 'app.db');
    // A real replica needs a reachable Turso Cloud database, which the test
    // setup deliberately keeps every unit test away from (see
    // backend/src/database/CLAUDE.md, "What the test setup works around").
    // The guard only reads for the sibling a real `connect()` leaves behind,
    // so that sibling is created directly instead of a real replica. What
    // keeps this a faithful stand-in rather than a guess is
    // `openCloudDatabase`'s own runtime check, covered below: package.json
    // pins `@tursodatabase/sync` to the exact version this was observed
    // against, and every successful cloud connect re-asserts the sibling is
    // still there, so a version bump that changes this can only pass CI
    // silently if nothing ever opens a real replica - which the e2e suite,
    // running in local mode only, does not either.
    writeFileSync(`${path}-info`, '');

    await expect(openLocalDatabase({ path })).rejects.toThrow(
      /Refusing to open .*app\.db as a plain local database file/,
    );
  });

  it('throws if a successful cloud connect leaves no discriminator sibling behind', async () => {
    // Simulates the assumption breaking (a `connect()` that succeeds without
    // writing `-info`) by mocking the driver itself, isolated to this one
    // test so every other case here still exercises the real one.
    await jest.isolateModulesAsync(async () => {
      jest.doMock('@tursodatabase/sync', () => ({
        connect: jest.fn().mockResolvedValue({}),
      }));

      // `isolateModulesAsync` needs a fresh registry read back synchronously;
      // a dynamic `import()` fails here because this project's Jest config
      // runs ts-jest as CommonJS with no --experimental-vm-modules.
      /* eslint-disable @typescript-eslint/no-require-imports */
      const factory =
        require('./turso-client.factory') as typeof import('./turso-client.factory');
      /* eslint-enable @typescript-eslint/no-require-imports */
      const { openCloudDatabase: openCloudDatabaseWithMockedSync } = factory;
      const path = join(dir, 'app.db');

      await expect(
        openCloudDatabaseWithMockedSync({ path, ...CLOUD_OPTIONS }),
      ).rejects.toThrow(/without leaving a -info sibling beside it/);
    });
  });

  it('allows local mode to open a path with no replica sibling', async () => {
    const path = join(dir, 'app.db');

    const handle = await openLocalDatabase({ path });
    await handle.close();

    expect(existsSync(path)).toBe(true);
  });
});
