import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { envValidationSchema } from './env.validation';

/**
 * These are not schema-shape tests for their own sake. Two properties here are
 * promised in docs/guides/configuration.md and relied on elsewhere:
 *
 * - the backend boots with no .env at all, which is what lets CI, the e2e suite
 *   and a fresh clone work without configuration;
 * - the four Turso variables are all-or-none, so a half-filled .env is a loud
 *   error instead of a silent fall back to local mode against the wrong data.
 */
/** What the schema produces once defaults are applied. Joi types it as `any`. */
interface ValidatedEnv {
  PORT: number;
  FRONTEND_URL: string;
  DATABASE_DIR: string;
  TURSO_ORG?: string;
  TURSO_ORG_TOKEN?: string;
  TURSO_CENTRAL_DB_URL?: string;
  TURSO_CENTRAL_DB_TOKEN?: string;
  TURSO_GROUP: string;
  TURSO_GROUP_TOKEN?: string;
  TURSO_SYNC_INTERVAL_S: number;
  MAILPACE_API_TOKEN?: string;
  MAIL_FROM?: string;
  MAIL_FROM_NAME?: string;
  LOGIN_LINK_TTL_M: number;
  SESSION_TTL_D: number;
  AUTH_RATE_LIMIT: number;
  AUTH_RATE_IP_LIMIT: number;
  AUTH_RATE_TTL_S: number;
  GEMINI_API_KEY?: string;
  SCAN_RATE_LIMIT: number;
  SCAN_RATE_TTL_S: number;
  TRUST_PROXY_HOPS: number;
}

describe('envValidationSchema', () => {
  // The schema is the single source of truth for which variables exist. This
  // derives the list from it rather than restating it, because a restated copy
  // is exactly what went wrong: a skill claimed the backend read "exactly two"
  // variables for days while it read eighteen.
  it('is documented by .env.example, key for key', () => {
    const template = readFileSync(
      join(__dirname, '..', '..', '.env.example'),
      'utf8',
    );
    // Commented-out entries count: the paired cloud and mail blocks ship
    // commented on purpose, because .env.example is copied verbatim.
    const templated = new Set(
      [...template.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]),
    );
    // `describe()` is typed loosely, so narrow it rather than passing `any` on.
    const description = envValidationSchema.describe() as {
      keys?: Record<string, unknown>;
    };
    const declared = new Set(Object.keys(description.keys ?? {}));
    // NODE_ENV is set by Nest and by Jest, never written into .env, so it is
    // validated without being templated. It is the only such exception.
    declared.delete('NODE_ENV');

    expect([...declared].filter((k) => !templated.has(k))).toEqual([]);
    expect([...templated].filter((k) => !declared.has(k))).toEqual([]);
  });

  // Mirrors how ConfigModule calls Joi: process.env carries hundreds of
  // unrelated keys, so unknown ones must pass through.
  const validate = (env: Record<string, string>) => {
    const result = envValidationSchema.validate(env, {
      allowUnknown: true,
      abortEarly: false,
    });
    return { error: result.error, value: result.value as ValidatedEnv };
  };

  const CLOUD = {
    TURSO_ORG: 'acme',
    TURSO_ORG_TOKEN: 'org-token',
    TURSO_CENTRAL_DB_URL: 'libsql://central.turso.io',
    TURSO_CENTRAL_DB_TOKEN: 'central-token',
  };

  describe('with no configuration at all', () => {
    it('accepts an empty environment', () => {
      expect(validate({}).error).toBeUndefined();
    });

    it('applies every default the app relies on', () => {
      expect(validate({}).value).toMatchObject({
        PORT: 3000,
        FRONTEND_URL: 'http://localhost:4200',
        DATABASE_DIR: './databases',
        TURSO_GROUP: 'decode-pet',
        TURSO_SYNC_INTERVAL_S: 60,
        LOGIN_LINK_TTL_M: 15,
        SESSION_TTL_D: 30,
        AUTH_RATE_LIMIT: 5,
        AUTH_RATE_IP_LIMIT: 30,
        AUTH_RATE_TTL_S: 900,
        SCAN_RATE_LIMIT: 10,
        SCAN_RATE_TTL_S: 3600,
        // 0, not 1: the default has to be safe with nothing in front, because
        // trusting X-Forwarded-For unproxied lets a caller pick its own per-IP
        // rate-limit bucket. The deployment opts in.
        TRUST_PROXY_HOPS: 0,
      });
    });

    it('leaves the cloud variables unset, which is what selects local mode', () => {
      const { value } = validate({});

      expect(value.TURSO_ORG_TOKEN).toBeUndefined();
      expect(value.TURSO_CENTRAL_DB_URL).toBeUndefined();
    });
  });

  describe('cloud mode is all-or-none', () => {
    it('accepts all four together', () => {
      expect(validate({ ...CLOUD }).error).toBeUndefined();
    });

    it.each(Object.keys(CLOUD))(
      'rejects the set with %s missing',
      (missing) => {
        const partial = { ...CLOUD };
        delete partial[missing as keyof typeof CLOUD];

        const { error } = validate(partial);

        expect(error).toBeDefined();
        expect(error!.message).toContain(missing);
      },
    );

    it('rejects a single variable set on its own', () => {
      expect(validate({ TURSO_ORG: 'acme' }).error).toBeDefined();
    });
  });

  describe('the break-glass token is independent', () => {
    // It is documented in .env.example and never read by the app, so setting
    // it must not drag in the cloud-mode requirement.
    it('does not trigger the cloud-mode pairing on its own', () => {
      expect(
        validate({ TURSO_GROUP_TOKEN: 'group-token' }).error,
      ).toBeUndefined();
    });
  });

  describe('the mail pair is all-or-none', () => {
    // Half-set would mean a real login email silently never leaves, which is
    // why the two are tied with `.and()` while unset-both is a supported mode.
    it('accepts both together', () => {
      expect(
        validate({
          MAILPACE_API_TOKEN: 'server-token',
          MAIL_FROM: 'login@spendifico.eu',
        }).error,
      ).toBeUndefined();
    });

    it('rejects the token without the sender, and the reverse', () => {
      expect(
        validate({ MAILPACE_API_TOKEN: 'server-token' }).error,
      ).toBeDefined();
      expect(
        validate({ MAIL_FROM: 'login@spendifico.eu' }).error,
      ).toBeDefined();
    });

    it('rejects a MAIL_FROM that is not a bare address', () => {
      expect(
        validate({
          MAILPACE_API_TOKEN: 'server-token',
          MAIL_FROM: 'Spendifico <login@spendifico.eu>',
        }).error,
      ).toBeDefined();
    });

    it('leaves MAIL_FROM_NAME unpaired', () => {
      expect(validate({ MAIL_FROM_NAME: 'Spendifico' }).error).toBeUndefined();
    });
  });

  describe('the Gemini key is optional and unpaired', () => {
    it('accepts an environment with no key at all', () => {
      expect(validate({}).error).toBeUndefined();
      expect(validate({}).value.GEMINI_API_KEY).toBeUndefined();
    });

    it('accepts a key set on its own', () => {
      expect(validate({ GEMINI_API_KEY: 'test-key' }).error).toBeUndefined();
    });
  });

  describe('value constraints', () => {
    it('coerces a numeric PORT from its string form', () => {
      expect(validate({ PORT: '4000' }).value.PORT).toBe(4000);
    });

    it('rejects a PORT that is not a port', () => {
      expect(validate({ PORT: 'not-a-port' }).error).toBeDefined();
    });

    it('rejects a FRONTEND_URL that is not a URL', () => {
      expect(validate({ FRONTEND_URL: 'nonsense' }).error).toBeDefined();
    });

    it('rejects a non-positive sync interval', () => {
      expect(validate({ TURSO_SYNC_INTERVAL_S: '0' }).error).toBeDefined();
    });

    it('rejects a fractional or non-positive session lifetime', () => {
      // Days, and whole ones: half a day of session is nobody's intent, and a
      // zero would expire every session at the moment it was issued.
      expect(validate({ SESSION_TTL_D: '0' }).error).toBeDefined();
      expect(validate({ SESSION_TTL_D: '2.5' }).error).toBeDefined();
    });

    it('rejects fractional and non-positive rate limits', () => {
      expect(validate({ AUTH_RATE_LIMIT: '2.5' }).error).toBeDefined();
      expect(validate({ AUTH_RATE_IP_LIMIT: '0' }).error).toBeDefined();
      expect(validate({ AUTH_RATE_TTL_S: '90.5' }).error).toBeDefined();
    });

    it('rejects fractional and non-positive scan rate limits', () => {
      expect(validate({ SCAN_RATE_LIMIT: '0' }).error).toBeDefined();
      expect(validate({ SCAN_RATE_TTL_S: '90.5' }).error).toBeDefined();
    });

    it('accepts zero proxy hops but rejects a negative or fractional count', () => {
      // Zero has to validate: it is the default, and it is what "nothing in
      // front" means. A count of hops cannot be negative or partial.
      expect(validate({ TRUST_PROXY_HOPS: '0' }).value.TRUST_PROXY_HOPS).toBe(
        0,
      );
      expect(validate({ TRUST_PROXY_HOPS: '1' }).value.TRUST_PROXY_HOPS).toBe(
        1,
      );
      expect(validate({ TRUST_PROXY_HOPS: '-1' }).error).toBeDefined();
      expect(validate({ TRUST_PROXY_HOPS: '1.5' }).error).toBeDefined();
    });
  });
});
