declare const __loadEsm: (specifier: string) => unknown;

/**
 * Hands back an ESM-only package loaded by Node rather than by Jest.
 *
 * The global comes from test/esm-environment.cjs, which explains why this
 * indirection is needed at all. The sibling files in this directory are the
 * per-package shims the jest configs map onto.
 */
export function loadEsm(specifier: string): unknown {
  return __loadEsm(specifier);
}
