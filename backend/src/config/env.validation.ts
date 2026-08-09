import * as Joi from 'joi';

/**
 * Validates the environment at boot, so a typo or a missing half of a paired
 * setting fails immediately with a readable message instead of surfacing as an
 * odd runtime error later.
 *
 * Every variable has a default or is optional on purpose: the backend must
 * still start with no .env at all (see docs/guides/configuration.md), in which
 * case it runs in local mode against plain files under DATABASE_DIR.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),

  PORT: Joi.number().port().default(3000),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:4200'),

  // IANA zone the budgeting period is resolved in. Every month-scoped figure -
  // the transaction list's period, per-category month stats, the dashboard's
  // buckets and days-left - reads a YYYY-MM-DD date against the profile's
  // monthStartDay, and needs to know what day it is now to do it.
  //
  // Deliberately one server-wide zone rather than UTC or a per-user setting.
  // UTC is wrong for everybody: just after local midnight on the boundary day a
  // transaction falls into the previous period, so the whole dashboard shows
  // the wrong month for a few hours, twice a month. Per-user is correct and
  // unbuildable today, because no screen collects a timezone - docs/TODO.md
  // carries it.
  //
  // Validated against the runtime's own zone list, so a typo fails at boot. It
  // would otherwise fail silently: nothing crashes, the months are just off.
  APP_TIMEZONE: Joi.string()
    .custom((value: string, helpers) => {
      try {
        new Intl.DateTimeFormat('en-CA', { timeZone: value });
        return value;
      } catch {
        return helpers.error('any.invalid');
      }
    }, 'IANA time zone')
    .default('Europe/Zagreb'),

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

  // Google AI Studio API key for receipt-scanning extraction (gemini-3.6-flash
  // via @google/genai). Optional and unpaired: unlike the Turso and mail pairs,
  // there is nothing else to pair it with, and its absence has a defined
  // answer - POST /api/transactions/scan responds 503 - rather than a fallback
  // mode, so CI and the e2e suite (which have no key and no browser) boot
  // exactly as they do today.
  GEMINI_API_KEY: Joi.string(),

  // Rate limit on POST /api/transactions/scan, per session user id rather than
  // per IP: the budget it protects is this project's shared Gemini quota, not
  // the caller's own. Exposed as configuration for the same reason the auth
  // limits are, so a spec can trip it without waiting out the real window.
  SCAN_RATE_LIMIT: Joi.number().integer().positive().default(10),
  SCAN_RATE_TTL_S: Joi.number().integer().positive().default(3600),

  // How many reverse proxies sit in front of this process, which is what Express
  // needs to know before req.ip can mean the caller rather than the proxy. The
  // per-IP limiter above keys on req.ip, so this is not cosmetic in either
  // direction: left at 0 behind a proxy, every caller shares one bucket and
  // AUTH_RATE_IP_LIMIT silently becomes a global cap; set above 0 with nothing in
  // front, X-Forwarded-For is believed and a client can pick its own bucket per
  // request. Default 0 because local development, CI and the e2e suite have
  // nothing in front - only a proxied deployment raises it. `.min(0)` rather than
  // `.positive()`, because 0 is the default and has to validate.
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).default(0),
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
