/**
 * The global route prefix, so `health` is served at `GET /api/health`.
 *
 * Three places call `setGlobalPrefix` with it and all three have to agree:
 * `main.ts` for production, `src/openapi.ts` because the document's paths are
 * read from the registered routes (a spec generated without it would key every
 * path without `/api`, and the generated frontend types would then point at
 * URLs that 404), and `test/app.e2e-spec.ts` so e2e requests match production.
 * Hence a constant rather than the string literal repeated three times.
 */
export const API_PREFIX = 'api';
