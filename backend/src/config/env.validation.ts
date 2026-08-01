import * as Joi from 'joi';

/**
 * Validates the environment at boot, so a typo or a missing half of a paired
 * setting fails immediately with a readable message instead of surfacing as an
 * odd runtime error later.
 *
 * Every variable has a default or is optional on purpose: the backend must
 * still start with no .env at all (see README), in which case it runs in local
 * mode against plain files under DATABASE_DIR.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),

  PORT: Joi.number().port().default(3000),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:4200'),

  // Where local database files live. Gitignored; the e2e suite points it at a
  // temp directory.
  DATABASE_DIR: Joi.string().default('./databases'),

  // Turso Cloud. These four switch the app from local files to synced cloud
  // databases, and `.and()` makes them all-or-none: a half-filled .env is a
  // configuration mistake, not a fallback to local mode.
  TURSO_ORG: Joi.string(),
  TURSO_ORG_TOKEN: Joi.string(),
  TURSO_CENTRAL_DB_URL: Joi.string(),
  TURSO_CENTRAL_DB_TOKEN: Joi.string(),

  // Break-glass credentials for manual CLI/Studio access. Documented in
  // .env.example; deliberately never read by the application.
  TURSO_ADMIN_GROUP_TOKEN: Joi.string(),
  TURSO_USERS_GROUP_TOKEN: Joi.string(),

  // Turso group the per-user databases are created in.
  TURSO_USERS_GROUP: Joi.string().default('decode-pet-users'),

  // How often a cloud-mode connection pushes and pulls, in seconds.
  TURSO_SYNC_INTERVAL_S: Joi.number().positive().default(60),
}).and(
  'TURSO_ORG',
  'TURSO_ORG_TOKEN',
  'TURSO_CENTRAL_DB_URL',
  'TURSO_CENTRAL_DB_TOKEN',
);

/** The four variables that together switch cloud mode on. */
export const CLOUD_MODE_KEYS = [
  'TURSO_ORG',
  'TURSO_ORG_TOKEN',
  'TURSO_CENTRAL_DB_URL',
  'TURSO_CENTRAL_DB_TOKEN',
] as const;
