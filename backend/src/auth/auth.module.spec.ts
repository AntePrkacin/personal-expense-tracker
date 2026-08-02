import { trackByEmail, trackByIp } from './auth.module';

/**
 * The trackers are unit-tested because the e2e suite cannot vary the caller's
 * IP: every supertest request arrives from 127.0.0.1, so the per-IP dimension
 * is only observable here.
 */
describe('auth throttle trackers', () => {
  describe('trackByIp', () => {
    it('keys on req.ip', () => {
      expect(trackByIp({ ip: '203.0.113.7' })).toBe('203.0.113.7');
    });

    it('tolerates a request with no ip at all', () => {
      expect(trackByIp({})).toBe('');
    });
  });

  describe('trackByEmail', () => {
    it('normalizes the raw-body address, so casing cannot split the bucket', () => {
      expect(
        trackByEmail({ ip: '203.0.113.7', body: { email: ' Foo@X.com ' } }),
      ).toBe('foo@x.com');
    });

    it('gives one address one bucket regardless of the caller', () => {
      const fromA = trackByEmail({
        ip: '203.0.113.7',
        body: { email: 'foo@x.com' },
      });
      const fromB = trackByEmail({
        ip: '198.51.100.9',
        body: { email: 'foo@x.com' },
      });

      expect(fromA).toBe(fromB);
    });

    it('falls back to the ip when the body has no usable address', () => {
      expect(trackByEmail({ ip: '203.0.113.7' })).toBe('no-email:203.0.113.7');
      expect(trackByEmail({ ip: '203.0.113.7', body: {} })).toBe(
        'no-email:203.0.113.7',
      );
      expect(trackByEmail({ ip: '203.0.113.7', body: { email: 42 } })).toBe(
        'no-email:203.0.113.7',
      );
    });
  });
});
