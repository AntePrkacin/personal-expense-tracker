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

  // Break-glass credential for manual CLI/Studio access. Documented in
  // .env.example; deliberately never read by the application.
  TURSO_GROUP_TOKEN: Joi.string(),

  // Turso group holding the central database and every per-user one.
  TURSO_GROUP: Joi.string().default('decode-pet'),

  // How often a cloud-mode connection pushes and pulls, in seconds.
  TURSO_SYNC_INTERVAL_S: Joi.number().positive().default(60),

  // Outbound mail, over MailPace's HTTP API. Paired with `.and()` for the same
  // reason the Turso four are: unset means "log the link instead of sending
  // it", which is a supported mode, but half-set means a real login email
  // silently never leaves - the worst possible failure for this flow.
  // MAIL_FROM must be on a domain whose DKIM authorization MailPace has
  // completed, or every send is rejected.
  MAILPACE_API_TOKEN: Joi.string(),
  MAIL_FROM: Joi.string().email(),

  // Display name shown as the sender, e.g. Spendifico <login@spendifico.eu>.
  // Deliberately a separate variable rather than folding the name into
  // MAIL_FROM: that stays `.email()`, which rejects the `Name <addr>` form, and
  // keeping it a bare address is what makes "must be on the DKIM-authorized
  // domain" a check anyone can make by eye. Optional and unpaired - without it
  // the sender is just the address, which is the previous behaviour.
  MAIL_FROM_NAME: Joi.string(),

  // How long an emailed login link stays valid, in minutes. A34 specifies a
  // short expiry; minutes, not days.
  LOGIN_LINK_TTL_M: Joi.number().positive().default(15),

  // How long a session lasts, in days. Fixed expiry, not sliding: extending it
  // on every authenticated read would turn each one into a write against the
  // central database, and A34 asks only for a normal persistent session.
  SESSION_TTL_D: Joi.number().integer().positive().default(30),

  // Rate limits on the two auth routes: two independent limiters, one keyed on
  // the submitted address (whoever asks, from wherever) and one on the caller's
  // IP (whatever it types). A request is refused when either bucket is over.
  // The per-IP default is laxer because one NAT can hide a whole classroom.
  // Exposed as configuration mainly so the e2e suite can trip the limits
  // without waiting out the real window.
  AUTH_RATE_LIMIT: Joi.number().integer().positive().default(5),
  AUTH_RATE_IP_LIMIT: Joi.number().integer().positive().default(30),
  AUTH_RATE_TTL_S: Joi.number().integer().positive().default(900),
})
  .and(
    'TURSO_ORG',
    'TURSO_ORG_TOKEN',
    'TURSO_CENTRAL_DB_URL',
    'TURSO_CENTRAL_DB_TOKEN',
  )
  .and('MAILPACE_API_TOKEN', 'MAIL_FROM');

/** The four variables that together switch cloud mode on. */
export const CLOUD_MODE_KEYS = [
  'TURSO_ORG',
  'TURSO_ORG_TOKEN',
  'TURSO_CENTRAL_DB_URL',
  'TURSO_CENTRAL_DB_TOKEN',
] as const;
