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
    // A real replica needs Turso Cloud; the guard only needs the sibling it
    // leaves behind, so the sibling is created directly instead.
    writeFileSync(`${path}-info`, '');

    await expect(openLocalDatabase({ path })).rejects.toThrow(
      /Refusing to open .*app\.db as a plain local database file/,
    );
  });

  it('allows local mode to open a path with no replica sibling', async () => {
    const path = join(dir, 'app.db');

    const handle = await openLocalDatabase({ path });
    await handle.close();

    expect(existsSync(path)).toBe(true);
  });
});
