import { envValidationSchema } from './env.validation';

/**
 * These are not schema-shape tests for their own sake. Two properties here are
 * promised in README and CLAUDE.md and relied on elsewhere:
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
}

describe('envValidationSchema', () => {
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
  });
});
